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

// Instruction for the model. Returns only the description text.
const ALT_PROMPT = [
  'You write alternative text (alt text) for an image, to be read aloud by screen readers.',
  'Look at the image and write a description following these rules:',
  '- Return ONLY the description text — no preamble, quotes, labels, or explanation.',
  '- Write one concise sentence, ideally under 125 characters.',
  '- Describe the content and function of the image, not decorative detail.',
  '- If the image contains text, transcribe it verbatim.',
  "- Do not begin with \"image of\", \"photo of\", \"a picture of\", or similar lead-ins.",
  '- Never invent details that are not visible in the image.',
].join('\n');

// ---- Anthropic API calls ----------------------------------------------------

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  return apiKey || '';
}

// Generate alt text for a base64-encoded image.
// Returns { ok: true, text, usage } or { ok: false, error }.
async function generateAltText({ data, mediaType, model }) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { ok: false, error: 'No API key set. Open the extension options to add your Anthropic API key.' };
  }

  let resp;
  try {
    resp = await fetch(API_URL, {
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
              { type: 'text', text: ALT_PROMPT },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    return { ok: false, error: "Couldn't reach api.anthropic.com. Check your connection and try again." };
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
    resp = await fetch(API_URL, {
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
    });
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
    return await chrome.permissions.contains({ origins: [matchPatternForDomain(domain)] });
  } catch (e) {
    return false;
  }
}

// Bring registered content scripts in line with the stored instance list and
// the host permissions actually granted. Safe to call repeatedly.
async function reconcileContentScripts() {
  const { instances } = await chrome.storage.local.get('instances');
  const domains = Array.isArray(instances) ? instances : [];

  const desired = [];
  for (const domain of domains) {
    if (await hasPermission(domain)) desired.push(domain);
  }
  const desiredIds = new Set(desired.map(scriptIdForDomain));

  let existing = [];
  try {
    existing = await chrome.scripting.getRegisteredContentScripts();
  } catch (e) {
    existing = [];
  }
  const existingIds = new Set(existing.filter((s) => s.id.startsWith('atc-content-')).map((s) => s.id));

  // Unregister content scripts whose instance/permission is gone.
  const toUnregister = [...existingIds].filter((id) => !desiredIds.has(id));
  if (toUnregister.length) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: toUnregister });
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
      await chrome.scripting.registerContentScripts(toRegister);
    } catch (e) {
      /* ignore — reconcile will retry on next trigger */
    }
  }
}

// ---- Session cost (in-memory across the browser session) --------------------

async function resetSessionCost() {
  await chrome.storage.local.set({ sessionCost: 0, sessionCount: 0 });
}

// ---- Lifecycle & messaging --------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  reconcileContentScripts();
});

chrome.runtime.onStartup.addListener(() => {
  // Session total resets on browser restart (never transmitted anywhere).
  resetSessionCost();
  reconcileContentScripts();
});

// Re-sync registrations whenever host permissions change.
chrome.permissions.onAdded.addListener(() => reconcileContentScripts());
chrome.permissions.onRemoved.addListener(() => reconcileContentScripts());

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return false;
    default:
      return false;
  }
});
