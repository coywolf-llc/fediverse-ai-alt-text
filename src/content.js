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
  const PROMPT_TOKENS = 120; // ALT_PROMPT + message overhead
  const EST_OUTPUT_TOKENS = 70; // ~one short sentence

  // ---- Settings cache -------------------------------------------------------

  let settings = { model: DEFAULT_MODEL, pricing: null };

  async function loadSettings() {
    const { model, pricing } = await chrome.storage.local.get(['model', 'pricing']);
    settings.model = model || DEFAULT_MODEL;
    settings.pricing = pricing || null;
  }

  function pricingFor(model) {
    if (settings.pricing && settings.pricing[model]) return settings.pricing[model];
    if (MODELS[model]) return { input: MODELS[model].input, output: MODELS[model].output };
    return { input: MODELS[DEFAULT_MODEL].input, output: MODELS[DEFAULT_MODEL].output };
  }

  function modelLabel(model) {
    return (MODELS[model] && MODELS[model].label) || model;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.model) settings.model = changes.model.newValue || DEFAULT_MODEL;
    if (changes.pricing) settings.pricing = changes.pricing.newValue || null;
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

  async function imageToBase64(imgEl) {
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

  function preCallEstimate(imgEl, model) {
    const w = imgEl.naturalWidth || imgEl.width || 0;
    const h = imgEl.naturalHeight || imgEl.height || 0;
    const imageTokens = w && h ? Math.round((w * h) / 750) : 0;
    const p = pricingFor(model);
    const cost =
      ((imageTokens + PROMPT_TOKENS) / 1e6) * p.input + (EST_OUTPUT_TOKENS / 1e6) * p.output;
    return cost;
  }

  function actualCost(usage, model) {
    if (!usage) return null;
    const p = pricingFor(model);
    return ((usage.input_tokens || 0) / 1e6) * p.input + ((usage.output_tokens || 0) / 1e6) * p.output;
  }

  async function addToSessionTotal(cost) {
    const { sessionCost = 0, sessionCount = 0 } = await chrome.storage.local.get([
      'sessionCost',
      'sessionCount',
    ]);
    await chrome.storage.local.set({
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

  function buildButton(widget) {
    const wrap = document.createElement('div');
    wrap.className = 'atc-wrap';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'atc-button';
    button.textContent = '✨ Generate with Claude';

    const status = document.createElement('span');
    status.className = 'atc-status';

    wrap.appendChild(button);
    wrap.appendChild(status);

    const showEstimate = () => {
      const est = preCallEstimate(widget.img, settings.model);
      status.textContent = `~${formatUsd(est)} with ${modelLabel(settings.model)}`;
      status.classList.remove('atc-status--error');
    };
    showEstimate();

    button.addEventListener('click', async () => {
      const model = settings.model;
      button.disabled = true;
      const original = button.textContent;
      button.textContent = 'Generating…';
      status.textContent = '';
      status.classList.remove('atc-status--error');

      try {
        // Re-read the live preview src at click time.
        const img = pickPreviewImage(widget.container) || widget.img;
        const { data, mediaType } = await imageToBase64(img);
        const resp = await chrome.runtime.sendMessage({ type: 'generate', data, mediaType, model });

        if (!resp || !resp.ok) {
          const msg = (resp && resp.error) || 'Something went wrong.';
          status.textContent = msg;
          status.classList.add('atc-status--error');
          if (resp && /api key/i.test(resp.error || '')) {
            chrome.runtime.sendMessage({ type: 'openOptions' });
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
        status.textContent = 'Could not read the image preview.';
        status.classList.add('atc-status--error');
      } finally {
        button.disabled = false;
        button.textContent = original;
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

  loadSettings().then(() => {
    scan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
})();
