// Background service worker.
//
// Responsibilities:
//   - Make all network requests to the Anthropic API (keeps the API key out of
//     the Mastodon page context and avoids page CSP / CORS issues).
//   - Validate the user's API key with a minimal real request.
//   - Register/unregister the content script per Mastodon instance as the user
//     grants/revokes host permissions.
//
// The ONLY external network destination in this extension is
// https://api.anthropic.com. There is no telemetry, analytics, or remote config.

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const ALT_TEXT_MAX_TOKENS = 300;

// Abort a hung request so the composer button never sticks on "Generating…".
// Generous ceiling — a vision call can legitimately take tens of seconds.
const REQUEST_TIMEOUT_MS = 60000;

// fetch() with an AbortController timeout. Rejects with an AbortError if the
// request outlives the deadline; the caller distinguishes that from a network
// failure.
function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Instructions for the model. Two modes, selected per request by the composer's
// "Detailed" checkbox. Both return ONLY the description text. Accessibility
// principles align with established alt-text best practices (e.g. W3C WAI image
// guidance), limited to the parts that apply to a single alt-text field.
//
// CONCISE is the DEFAULT (checkbox unchecked): one sentence where possible, two at
// most. DETAILED (checkbox checked) is the fuller, image-adaptive description.

const ALT_PROMPT_CONCISE = `You write alternative text (alt text) for one image a person is attaching to a Mastodon post. It will be read aloud by screen readers, shown on refreshable braille displays, and displayed if the image fails to load. Write for those readers — never for search engines or keywords.

Return ONLY the description text: no preamble, no surrounding quotation marks, no labels, and no commentary.

Be brief: aim for ONE sentence, and never more than two. Front-load the single most important thing so the first words carry the essential meaning on their own, then stop — include only what a reader needs to understand the image in context, and omit purely decorative detail.

- Write a complete sentence in sentence case with terminal punctuation.
- Do not begin with "image of", "photo of", "picture of", or "graphic of" — assistive technology already announces it as an image. You MAY name the medium when it matters (e.g. "Screenshot of…").
- If the image is mostly text (a sign, quote card, meme), give the key visible text briefly, using curly quotation marks and apostrophes (" " ' '); don't describe styling unless it is the point.
- Describe only what is visible. Never guess at names, places, or wording you cannot see.`;

const ALT_PROMPT_DETAILED = `You write alternative text (alt text) for one image a person is attaching to a Mastodon post. It will be read aloud by screen readers, rendered character-by-character on refreshable braille displays, and shown if the image fails to load. Write for those readers — never for search engines or keywords.

Return ONLY the description text: no preamble, no surrounding quotation marks, no labels, and no commentary.

First decide what kind of image this is, then describe it accordingly:
- Functional (a screenshot of a button or control, an icon that does something): describe its function or destination, not its appearance.
- Text-bearing (a sign, screenshot, quote card, meme, poster): transcribe the visible text verbatim, using curly quotation marks and apostrophes (" " ' '). If the visual design is itself the point, also describe the design — colors, materials, layout, typeface.
- Complex (chart, graph, infographic, diagram, data-dense screenshot): lead with the single main takeaway, then give the key figures or structure that support it.
- Informative (most photos): describe what matters in this context.

How to write it:
- Front-load the most important thing. The first clause must carry the essential meaning on its own; add secondary details after it, in descending order of importance.
- Use complete sentences, sentence case, and terminal punctuation. Screen readers use punctuation for pacing and braille users read it literally.
- Match depth to the image: one tight sentence for a simple photo; more detail when the image is rich or is itself the subject. Keep it well under 1500 characters.
- Expand anything normally abbreviated, because braille renders it literally and speech mispronounces it. Write units, measurements, and addresses in full — for example "5 gigabytes" not "5GB", "100 pounds" not "100lbs", "Street" not "St." Spell out acronyms unless the audience knows the acronym better than the words.
- Do not begin with "image of", "photo of", "picture of", or "graphic of" — assistive technology already announces it as an image. You MAY name the medium when it matters, e.g. "Watercolor painting of…" or "Screenshot of…".
- Use proper typographic characters (curly quotes and apostrophes) when quoting text shown in the image.
- Describe only what is visible. Never guess at names, places, wording, or details you cannot see, and don't describe purely decorative flourishes that carry no information.`;

// ---- Anthropic API calls ----------------------------------------------------

async function getApiKey() {
  const { apiKey } = await browser.storage.local.get('apiKey');
  return apiKey || '';
}

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// An image origin (e.g. https://cdn.masto.host) we still need host permission for. Set when
// a cross-origin image fetch is blocked; consumed by the next toolbar-icon click, which is a
// user gesture and so may call permissions.request(). Kept in memory (not storage) so the
// request is invoked synchronously in the gesture; a rare background restart just falls back
// to opening options, and the user re-triggers by clicking Generate again.
let pendingGrantOrigin = null;

// Fetch a cross-origin image URL and return { data (base64), mediaType }. Runs in the
// background, which — unlike the page/content script — can read a cross-origin response
// once the extension holds host permission for its origin (the content script requests
// that permission before sending the URL). Content-Type drives media_type, falling back
// to the file extension so a webp isn't mislabeled. Chunked base64 avoids blowing the
// call stack on a large image.
async function fetchImageAsBase64(url) {
  const resp = await fetchWithTimeout(url, {}, REQUEST_TIMEOUT_MS);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const blob = await resp.blob();
  let mediaType = blob.type;
  if (!SUPPORTED_IMAGE_TYPES.includes(mediaType)) {
    const ext = ((url.split(/[?#]/)[0].match(/\.(jpe?g|png|gif|webp)$/i) || [])[1] || '').toLowerCase();
    mediaType = ext ? (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`) : 'image/jpeg';
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return { data: btoa(binary), mediaType };
}

// Generate alt text for an image, given either base64 `data` + `mediaType` (read by the
// content script) OR an `imageUrl` to fetch here (a cross-origin preview the page can't
// read). `detailed` selects the fuller prompt; the default (falsy) is the concise one.
// Returns { ok: true, text, usage } or { ok: false, error }.
async function generateAltText({ data, mediaType, model, detailed, imageUrl }) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { ok: false, error: 'No API key set. Open the extension options to add your Anthropic API key.' };
  }

  if (!data && imageUrl) {
    let origin = null;
    try {
      origin = new URL(imageUrl).origin;
    } catch (e) {
      /* not a parseable URL */
    }
    // The background can only read a cross-origin image once the extension holds host
    // permission for its origin. If we don't yet, remember it and tell the user to grant it
    // by clicking the toolbar icon — a content script can't request a permission, but the
    // action-click gesture can (see browser.action.onClicked).
    if (origin && !(await browser.permissions.contains({ origins: [origin + '/*'] }))) {
      pendingGrantOrigin = origin;
      return {
        ok: false,
        error: `Click the extension's icon in your browser toolbar to allow images from ${new URL(imageUrl).host}, then Generate again.`,
      };
    }
    try {
      const fetched = await fetchImageAsBase64(imageUrl);
      data = fetched.data;
      mediaType = fetched.mediaType;
    } catch (e) {
      return {
        ok: false,
        error: e && e.name === 'AbortError'
          ? 'Fetching the image timed out. Try again.'
          : "Couldn't fetch the image from its host.",
      };
    }
  }
  if (!data) {
    return { ok: false, error: 'No image to describe.' };
  }

  const prompt = detailed ? ALT_PROMPT_DETAILED : ALT_PROMPT_CONCISE;

  let resp;
  try {
    resp = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: ALT_TEXT_MAX_TOKENS,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    }, REQUEST_TIMEOUT_MS);
  } catch (e) {
    return {
      ok: false,
      error: e && e.name === 'AbortError'
        ? 'The request to Claude timed out. Try again.'
        : "Couldn't reach api.anthropic.com. Check your connection and try again.",
    };
  }

  let body;
  try {
    body = await resp.json();
  } catch (e) {
    body = null;
  }

  if (!resp.ok) {
    const apiMsg = body && body.error && body.error.message;
    return { ok: false, error: apiMsg ? `Claude API error: ${apiMsg}` : `Claude API error (HTTP ${resp.status}).` };
  }

  if (body && body.stop_reason === 'refusal') {
    return { ok: false, error: 'Claude declined to describe this image.' };
  }

  const text = body && body.content && body.content[0] && body.content[0].text
    ? body.content[0].text.trim()
    : '';
  if (!text) {
    return { ok: false, error: 'Claude returned an empty description.' };
  }

  return { ok: true, text, usage: (body && body.usage) || null };
}

// Validate an API key with the smallest possible real request.
// Returns { ok, status, errorType, errorMessage } or { networkError: true }.
async function validateApiKey({ apiKey, model }) {
  const key = apiKey || (await getApiKey());
  if (!key) {
    return { ok: false, status: 0, errorType: 'no_key', errorMessage: 'No API key entered.' };
  }

  let resp;
  try {
    resp = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ok' }],
      }),
    }, REQUEST_TIMEOUT_MS);
  } catch (e) {
    return { networkError: true };
  }

  let body = null;
  try {
    body = await resp.json();
  } catch (e) {
    /* ignore */
  }

  const errorType = body && body.error && body.error.type;
  const errorMessage = body && body.error && body.error.message;
  return { ok: resp.ok, status: resp.status, errorType: errorType || null, errorMessage: errorMessage || null };
}

// ---- Per-instance content-script registration -------------------------------

function scriptIdForDomain(domain) {
  return 'atc-content-' + domain.replace(/[^a-z0-9]/gi, '_');
}

function matchPatternForDomain(domain) {
  return `https://${domain}/*`;
}

async function hasPermission(domain) {
  try {
    return await browser.permissions.contains({ origins: [matchPatternForDomain(domain)] });
  } catch (e) {
    return false;
  }
}

// Bring registered content scripts in line with the stored instance list and
// the host permissions actually granted. Safe to call repeatedly.
async function reconcileContentScripts() {
  const { instances } = await browser.storage.local.get('instances');
  const domains = Array.isArray(instances) ? instances : [];

  const desired = [];
  for (const domain of domains) {
    if (await hasPermission(domain)) desired.push(domain);
  }
  const desiredIds = new Set(desired.map(scriptIdForDomain));

  let existing = [];
  try {
    existing = await browser.scripting.getRegisteredContentScripts();
  } catch (e) {
    existing = [];
  }
  const existingIds = new Set(existing.filter((s) => s.id.startsWith('atc-content-')).map((s) => s.id));

  // Unregister content scripts whose instance/permission is gone.
  const toUnregister = [...existingIds].filter((id) => !desiredIds.has(id));
  if (toUnregister.length) {
    try {
      await browser.scripting.unregisterContentScripts({ ids: toUnregister });
    } catch (e) {
      /* ignore */
    }
  }

  // Register content scripts for newly granted instances.
  const toRegister = desired
    .filter((domain) => !existingIds.has(scriptIdForDomain(domain)))
    .map((domain) => ({
      id: scriptIdForDomain(domain),
      matches: [matchPatternForDomain(domain)],
      js: ['src/content.js'],
      css: ['src/styles.css'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    }));
  if (toRegister.length) {
    try {
      await browser.scripting.registerContentScripts(toRegister);
    } catch (e) {
      /* ignore — reconcile will retry on next trigger */
    }
  }
}

// ---- Session cost (in-memory across the browser session) --------------------

async function resetSessionCost() {
  await browser.storage.local.set({ sessionCost: 0, sessionCount: 0 });
}

// ---- Lifecycle & messaging --------------------------------------------------

browser.runtime.onInstalled.addListener(() => {
  reconcileContentScripts();
});

browser.runtime.onStartup.addListener(() => {
  // Session total resets on browser restart (never transmitted anywhere).
  resetSessionCost();
  reconcileContentScripts();
});

// Re-sync registrations whenever host permissions change.
browser.permissions.onAdded.addListener(() => reconcileContentScripts());
browser.permissions.onRemoved.addListener(() => reconcileContentScripts());

browser.action.onClicked.addListener(() => {
  // If a cross-origin image needed host permission, request it now: the toolbar click is a
  // user gesture, so permissions.request() is allowed here (it isn't from a content script).
  // Call it SYNCHRONOUSLY — awaiting first would spend the gesture. Otherwise open options.
  if (pendingGrantOrigin) {
    const origin = pendingGrantOrigin;
    pendingGrantOrigin = null;
    browser.permissions.request({ origins: [origin + '/*'] }).catch(() => {});
    return;
  }
  browser.runtime.openOptionsPage();
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  switch (message.type) {
    case 'generate':
      generateAltText(message).then(sendResponse);
      return true; // async
    case 'validate':
      validateApiKey(message).then(sendResponse);
      return true; // async
    case 'reconcile':
      reconcileContentScripts().then(() => sendResponse({ ok: true }));
      return true; // async
    case 'openOptions':
      browser.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return false;
    default:
      return false;
  }
});
