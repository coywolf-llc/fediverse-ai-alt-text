// Content script injected into the user's configured Mastodon instance(s).
//
// Watches for the image description (alt-text) modal mounting, injects a
// "Generate with Claude" button, sends the preview image to the background
// worker, and autofills the React-controlled textarea with the result.
//
// It never talks to the network itself — all API traffic goes through the
// background service worker.

(() => {
  'use strict';

  const BTN_FLAG = 'data-atc-attached';
  const MODELS = {
    'claude-haiku-4-5-20251001': { label: 'Haiku', input: 1.0, output: 5.0 },
    'claude-sonnet-4-6': { label: 'Sonnet', input: 3.0, output: 15.0 },
  };
  const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
  // Rough fixed cost inputs for the pre-call estimate (see README §cost).
  const PROMPT_TOKENS = 120; // prompt + message overhead
  // Output size differs by mode; the actual cost is shown after the call.
  const EST_OUTPUT_TOKENS_CONCISE = 55; // ~one short sentence (default)
  const EST_OUTPUT_TOKENS_DETAILED = 190; // a fuller, multi-clause description
  // Anthropic resizes large images (~1.15 MP / 1568px long edge) before billing,
  // so cap the token estimate to match what you'll actually be charged.
  const MAX_IMAGE_TOKENS = 1600;

  // ---- Settings cache -------------------------------------------------------

  // `detailed` is the persisted state of the composer's "Detailed" checkbox
  // (default false = concise). Remembered across modals, tabs, and sessions.
  let settings = { model: DEFAULT_MODEL, pricing: null, detailed: false };

  async function loadSettings() {
    const { model, pricing, detailed } = await browser.storage.local.get(['model', 'pricing', 'detailed']);
    settings.model = model || DEFAULT_MODEL;
    settings.pricing = pricing || null;
    settings.detailed = detailed === true;
  }

  function pricingFor(model) {
    if (settings.pricing && settings.pricing[model]) return settings.pricing[model];
    if (MODELS[model]) return { input: MODELS[model].input, output: MODELS[model].output };
    return { input: MODELS[DEFAULT_MODEL].input, output: MODELS[DEFAULT_MODEL].output };
  }

  function modelLabel(model) {
    return (MODELS[model] && MODELS[model].label) || model;
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.model) settings.model = changes.model.newValue || DEFAULT_MODEL;
    if (changes.pricing) settings.pricing = changes.pricing.newValue || null;
    if (changes.detailed) settings.detailed = changes.detailed.newValue === true;
  });

  // ---- React-controlled textarea autofill -----------------------------------

  function setReactValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---- Image extraction -----------------------------------------------------

  // Anthropic resizes anything larger to ~this long edge, so cap the canvas to it.
  const MAX_IMAGE_EDGE = 1568;

  async function imageToBase64(imgEl) {
    // Read the preview from a CANVAS first. The image is already decoded in the page,
    // so this needs no network request — which avoids the two things that break
    // fetch(imgEl.src): a blob: URL Mastodon has already revoked after processing the
    // upload, and a cross-origin media URL without CORS. It also re-encodes to JPEG, so
    // the source format (webp, avif, …) no longer matters. Falls back to fetch only if
    // the canvas can't be read (a cross-origin preview taints it) or isn't decoded yet.
    const w = imgEl.naturalWidth || imgEl.width || 0;
    const h = imgEl.naturalHeight || imgEl.height || 0;
    if (w && h) {
      try {
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        // White matte so transparent areas don't turn black when flattened to JPEG.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(imgEl, 0, 0, cw, ch);
        const data = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
        if (data) return { data, mediaType: 'image/jpeg' };
      } catch (e) {
        // Tainted (cross-origin) canvas or a draw failure — fall through to fetch.
        console.warn('[alt-text] canvas read failed, trying fetch:', e && e.message);
      }
    }
    const res = await fetch(imgEl.src);
    const blob = await res.blob();
    const data = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1]);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    return { data, mediaType: blob.type || 'image/jpeg' };
  }

  // ---- Cost helpers ---------------------------------------------------------

  function formatUsd(n) {
    if (n < 0.01) return '$' + n.toFixed(5);
    return '$' + n.toFixed(4);
  }

  function preCallEstimate(imgEl, model, detailed) {
    const w = imgEl.naturalWidth || imgEl.width || 0;
    const h = imgEl.naturalHeight || imgEl.height || 0;
    const rawTokens = w && h ? Math.round((w * h) / 750) : MAX_IMAGE_TOKENS;
    const imageTokens = Math.min(rawTokens, MAX_IMAGE_TOKENS);
    const outputTokens = detailed ? EST_OUTPUT_TOKENS_DETAILED : EST_OUTPUT_TOKENS_CONCISE;
    const p = pricingFor(model);
    const cost =
      ((imageTokens + PROMPT_TOKENS) / 1e6) * p.input + (outputTokens / 1e6) * p.output;
    return cost;
  }

  function actualCost(usage, model) {
    if (!usage) return null;
    const p = pricingFor(model);
    return ((usage.input_tokens || 0) / 1e6) * p.input + ((usage.output_tokens || 0) / 1e6) * p.output;
  }

  async function addToSessionTotal(cost) {
    const { sessionCost = 0, sessionCount = 0 } = await browser.storage.local.get([
      'sessionCost',
      'sessionCount',
    ]);
    await browser.storage.local.set({
      sessionCost: sessionCost + cost,
      sessionCount: sessionCount + 1,
    });
    return { total: sessionCost + cost, count: sessionCount + 1 };
  }

  // ---- Modal detection ------------------------------------------------------

  // A description widget is a container holding both the preview image and the
  // alt-text textarea. We target by structure/role rather than hashed class
  // names so it survives Mastodon UI reshuffles (e.g. 4.6).
  function findWidgets() {
    const widgets = [];
    const seen = new Set();

    const consider = (container) => {
      if (!container || seen.has(container)) return;
      const textarea = container.querySelector('textarea');
      if (!textarea || textarea.getAttribute(BTN_FLAG)) return;
      const img = pickPreviewImage(container);
      if (!img) return;
      if (!looksLikeDescriptionField(textarea, container)) return;
      seen.add(container);
      widgets.push({ container, textarea, img });
    };

    // Primary: the alt-text modal (role="dialog").
    document.querySelectorAll('[role="dialog"]').forEach(consider);
    // Fallback: an inline editor that pairs a preview image with a textarea.
    if (!widgets.length) {
      document.querySelectorAll('textarea').forEach((ta) => {
        if (ta.getAttribute(BTN_FLAG)) return;
        const container = ta.closest('form, .modal-root__modal, [class*="modal"], [class*="upload"]') || ta.parentElement;
        consider(container);
      });
    }
    return widgets;
  }

  function pickPreviewImage(container) {
    const imgs = Array.from(container.querySelectorAll('img'));
    // Prefer the uploaded preview, which is a blob:/data: URL.
    const preview = imgs.find((i) => /^(blob:|data:)/.test(i.src));
    return preview || imgs.find((i) => i.src) || null;
  }

  function looksLikeDescriptionField(textarea, container) {
    const hints = [
      textarea.getAttribute('placeholder'),
      textarea.getAttribute('aria-label'),
      textarea.getAttribute('title'),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (/describ|description|alt text|alternative text|caption/.test(hints)) return true;
    // Inside a dialog that also has an image preview, a textarea is very likely
    // the description field even without a recognizable label.
    return !!container.closest('[role="dialog"]') || !!container.matches('[role="dialog"]');
  }

  // ---- Button + UI ----------------------------------------------------------

  const BTN_LABEL = 'Generate with Claude';

  function buildButton(widget) {
    const wrap = document.createElement('div');
    wrap.className = 'atc-wrap';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'atc-button';
    // Emoji is decorative — keep it out of the accessible name.
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✨';
    const label = document.createElement('span');
    label.className = 'atc-label';
    label.textContent = BTN_LABEL;
    button.append(icon, document.createTextNode(' '), label);

    const status = document.createElement('span');
    status.className = 'atc-status';
    // Announce results/errors to screen-reader users.
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    // "Detailed" toggle, to the right of the button. Unchecked = concise (the new
    // default); checked = the fuller prompt. The choice is persisted to
    // storage.local and restored on every modal/tab/session (settings.detailed).
    const detailedLabel = document.createElement('label');
    detailedLabel.className = 'atc-detailed';
    const detailedInput = document.createElement('input');
    detailedInput.type = 'checkbox';
    detailedInput.className = 'atc-detailed__input';
    detailedInput.checked = settings.detailed === true;
    const detailedText = document.createElement('span');
    detailedText.textContent = 'Detailed';
    detailedLabel.append(detailedInput, detailedText);

    wrap.appendChild(button);
    wrap.appendChild(detailedLabel);
    wrap.appendChild(status);

    const showEstimate = () => {
      const est = preCallEstimate(widget.img, settings.model, detailedInput.checked);
      status.textContent = `~${formatUsd(est)} with ${modelLabel(settings.model)}`;
      status.classList.remove('atc-status--error');
    };
    showEstimate();

    // Remember the choice; refresh the estimate to match the selected depth.
    detailedInput.addEventListener('change', () => {
      settings.detailed = detailedInput.checked;
      browser.storage.local.set({ detailed: detailedInput.checked });
      if (!button.disabled) showEstimate();
    });

    button.addEventListener('click', async () => {
      const model = settings.model;
      const detailed = detailedInput.checked;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      label.textContent = 'Generating…';
      status.textContent = '';
      status.classList.remove('atc-status--error');

      try {
        // Re-read the live preview src at click time.
        const img = pickPreviewImage(widget.container) || widget.img;
        const { data, mediaType } = await imageToBase64(img);
        const resp = await browser.runtime.sendMessage({ type: 'generate', data, mediaType, model, detailed });

        if (!resp || !resp.ok) {
          const msg = (resp && resp.error) || 'Something went wrong.';
          status.textContent = msg;
          status.classList.add('atc-status--error');
          if (resp && /api key/i.test(resp.error || '')) {
            browser.runtime.sendMessage({ type: 'openOptions' });
          }
          return;
        }

        setReactValue(widget.textarea, resp.text);

        const cost = actualCost(resp.usage, model);
        if (cost != null) {
          const { total, count } = await addToSessionTotal(cost);
          status.textContent = `This image: ${formatUsd(cost)} · session: ${formatUsd(total)} (${count})`;
        } else {
          status.textContent = 'Description added.';
        }
      } catch (e) {
        console.error('[alt-text] could not read the image preview:', e);
        status.textContent = 'Could not read the image preview.';
        status.classList.add('atc-status--error');
      } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        label.textContent = BTN_LABEL;
      }
    });

    return wrap;
  }

  function attach(widget) {
    widget.textarea.setAttribute(BTN_FLAG, '1');
    const ui = buildButton(widget);
    const wrapper = widget.textarea.parentElement;
    if (wrapper) {
      wrapper.insertBefore(ui, widget.textarea);
    } else {
      widget.textarea.before(ui);
    }
  }

  // ---- Observe the DOM ------------------------------------------------------

  let scheduled = false;
  function scan() {
    scheduled = false;
    try {
      findWidgets().forEach(attach);
    } catch (e) {
      /* never break the host page */
    }
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  // The content script is registered dynamically (scripting.registerContentScripts)
  // only for instances the user has added, so it only runs where it should.
  loadSettings().then(() => {
    scan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
})();
