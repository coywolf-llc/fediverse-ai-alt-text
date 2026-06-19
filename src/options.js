// Options page logic.
//
// Manages the API key, model choice, editable pricing, session-cost display,
// and per-instance host-permission grants + dynamic content-script registration
// (delegated to the background worker).

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';

const DEFAULT_PRICING = {
  [HAIKU]: { input: 1.0, output: 5.0 },
  [SONNET]: { input: 3.0, output: 15.0 },
};
const DEFAULT_PRICING_AS_OF = '2026-06-19';

// Per-image estimate inputs — mirror the content script so this figure matches
// what you'll see in the composer. A typical posted photo is capped by
// Anthropic's image resize at ~1.15 MP ≈ 1550 image tokens.
const EST_IMAGE_TOKENS = 1550;
const EST_PROMPT_TOKENS = 120;
const EST_OUTPUT_TOKENS = 70;

const $ = (id) => document.getElementById(id);

function setStatus(el, message, kind) {
  el.textContent = message || '';
  el.classList.remove('atc-statusline--ok', 'atc-statusline--error', 'atc-statusline--warn');
  if (kind) el.classList.add('atc-statusline--' + kind);
}

function formatUsd(n) {
  return '$' + Number(n || 0).toFixed(5);
}

function formatPerImage(n) {
  return '~$' + Number(n || 0).toFixed(4);
}

function perImageCost(input, output) {
  return ((EST_IMAGE_TOKENS + EST_PROMPT_TOKENS) / 1e6) * input + (EST_OUTPUT_TOKENS / 1e6) * output;
}

// Recompute the "≈ Cost / image" column from whatever is currently in the rate
// fields (live as the user types, before saving).
function updatePerImageEstimates() {
  const num = (id) => parseFloat($(id).value) || 0;
  $('haikuPerImage').textContent = formatPerImage(perImageCost(num('haikuInput'), num('haikuOutput')));
  $('sonnetPerImage').textContent = formatPerImage(perImageCost(num('sonnetInput'), num('sonnetOutput')));
}

function selectedModel() {
  const checked = document.querySelector('input[name="model"]:checked');
  return checked ? checked.value : DEFAULT_MODEL;
}

// ---- Load & render ----------------------------------------------------------

async function init() {
  const data = await chrome.storage.local.get([
    'apiKey',
    'model',
    'pricing',
    'pricingAsOf',
    'lastValidated',
    'sessionCost',
    'sessionCount',
    'instances',
  ]);

  $('apiKey').value = data.apiKey || '';

  const model = data.model || DEFAULT_MODEL;
  const radio = document.querySelector(`input[name="model"][value="${model}"]`);
  if (radio) radio.checked = true;
  else document.querySelector(`input[name="model"][value="${DEFAULT_MODEL}"]`).checked = true;

  renderPricing(data.pricing, data.pricingAsOf);
  renderSession(data.sessionCost, data.sessionCount);
  renderLastValidated(data.lastValidated);
  renderSites(Array.isArray(data.instances) ? data.instances : []);
}

function renderPricing(pricing, asOf) {
  const p = pricing || DEFAULT_PRICING;
  const h = p[HAIKU] || DEFAULT_PRICING[HAIKU];
  const s = p[SONNET] || DEFAULT_PRICING[SONNET];
  $('haikuInput').value = h.input;
  $('haikuOutput').value = h.output;
  $('sonnetInput').value = s.input;
  $('sonnetOutput').value = s.output;
  $('pricingAsOf').textContent = asOf || DEFAULT_PRICING_AS_OF;
  updatePerImageEstimates();
}

function renderSession(cost, count) {
  $('sessionCost').textContent = formatUsd(cost || 0);
  $('sessionCount').textContent = String(count || 0);
}

function renderLastValidated(ts) {
  if (!ts) return;
  const d = new Date(ts);
  setStatus($('keyStatus'), `Last validated: ${d.toLocaleString()}`, 'ok');
}

function renderSites(instances) {
  renderInstances(instances);
  renderBuiltins(instances);
}

// The free-form list shows only user-added Mastodon instances — built-in
// networks (Bluesky) have their own toggle.
function renderInstances(instances) {
  const custom = (instances || []).filter((d) => !BUILTIN_DOMAINS.includes(d));
  const list = $('instanceList');
  list.textContent = '';
  if (!custom.length) {
    const li = document.createElement('li');
    li.className = 'atc-list__empty';
    li.textContent = 'No instances added yet.';
    list.appendChild(li);
    return;
  }
  for (const domain of custom) {
    const li = document.createElement('li');
    li.className = 'atc-list__item';

    const name = document.createElement('span');
    name.textContent = domain;
    li.appendChild(name);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'atc-btn atc-btn--quiet atc-btn--small';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${domain}`);
    remove.addEventListener('click', () => removeInstance(domain));
    li.appendChild(remove);

    list.appendChild(li);
  }
}

function renderBuiltins(instances) {
  const enabled = (instances || []).includes('bsky.app');
  const btn = $('toggleBluesky');
  if (!btn) return;
  btn.textContent = enabled ? 'Disable' : 'Enable';
  btn.classList.toggle('atc-btn--primary', !enabled);
  btn.classList.toggle('atc-btn--quiet', enabled);
  btn.setAttribute('aria-label', `${enabled ? 'Disable' : 'Enable'} Bluesky (bsky.app)`);
}

// ---- API key ----------------------------------------------------------------

async function saveKey() {
  const key = $('apiKey').value.trim();
  await chrome.storage.local.set({ apiKey: key });
  if (!key) {
    setStatus($('keyStatus'), 'Key cleared.', 'warn');
    return;
  }
  setStatus($('keyStatus'), 'Saved. Validating…');
  await validateKey();
}

async function validateKey() {
  const key = $('apiKey').value.trim();
  if (!key) {
    setStatus($('keyStatus'), 'Enter a key first.', 'warn');
    return;
  }
  setStatus($('keyStatus'), 'Validating…');

  const result = await chrome.runtime.sendMessage({
    type: 'validate',
    apiKey: key,
    model: selectedModel(),
  });

  if (!result) {
    setStatus($('keyStatus'), 'No response from extension. Try again.', 'error');
    return;
  }
  if (result.networkError) {
    setStatus($('keyStatus'), "Couldn't reach api.anthropic.com — check your connection.", 'warn');
    return;
  }

  const detail = result.errorType
    ? ` (${result.errorType}${result.errorMessage ? ': ' + result.errorMessage : ''})`
    : '';

  if (result.ok) {
    await chrome.storage.local.set({ lastValidated: Date.now() });
    setStatus($('keyStatus'), 'Valid — your key works.', 'ok');
    return;
  }

  switch (result.status) {
    case 401:
      setStatus($('keyStatus'), 'Key rejected — check the key.' + detail, 'error');
      break;
    case 403:
      setStatus($('keyStatus'), 'Key lacks access (billing or region).' + detail, 'error');
      break;
    case 429:
      // Rate-limited means the key itself is valid.
      await chrome.storage.local.set({ lastValidated: Date.now() });
      setStatus($('keyStatus'), 'Key is valid but currently rate-limited.' + detail, 'warn');
      break;
    default:
      setStatus($('keyStatus'), `Validation failed (HTTP ${result.status})` + detail, 'error');
  }
}

async function clearKey() {
  $('apiKey').value = '';
  await chrome.storage.local.remove(['apiKey', 'lastValidated']);
  setStatus($('keyStatus'), 'Key cleared.', 'warn');
}

// ---- Model ------------------------------------------------------------------

async function onModelChange() {
  await chrome.storage.local.set({ model: selectedModel() });
}

// ---- Pricing ----------------------------------------------------------------

async function savePricing() {
  const pricing = {
    [HAIKU]: {
      input: parseFloat($('haikuInput').value) || 0,
      output: parseFloat($('haikuOutput').value) || 0,
    },
    [SONNET]: {
      input: parseFloat($('sonnetInput').value) || 0,
      output: parseFloat($('sonnetOutput').value) || 0,
    },
  };
  await chrome.storage.local.set({ pricing });
  setStatus($('pricingStatus'), 'Pricing saved.', 'ok');
}

async function resetPricing() {
  await chrome.storage.local.set({ pricing: DEFAULT_PRICING, pricingAsOf: DEFAULT_PRICING_AS_OF });
  renderPricing(DEFAULT_PRICING, DEFAULT_PRICING_AS_OF);
  setStatus($('pricingStatus'), 'Reset to default rates.', 'ok');
}

// ---- Session ----------------------------------------------------------------

async function resetSession() {
  await chrome.storage.local.set({ sessionCost: 0, sessionCount: 0 });
  renderSession(0, 0);
}

// ---- Sites (built-in networks + Mastodon instances) -------------------------

// Known single-domain networks that get a one-click toggle instead of the
// free-form instance adder.
const BUILTIN_DOMAINS = ['bsky.app'];

async function getInstances() {
  const { instances } = await chrome.storage.local.get('instances');
  return Array.isArray(instances) ? instances : [];
}

async function refreshSites() {
  renderSites(await getInstances());
}

function normalizeDomain(raw) {
  let d = (raw || '').trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\s+/g, '');
  return d;
}

function isValidDomain(d) {
  // Simple hostname check: labels of letters/digits/hyphens, at least one dot.
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d);
}

// Request the host permission (must run in a user gesture, so call this before
// any awaits the caller adds) and record the domain. Returns whether granted.
async function enableDomain(domain) {
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [`https://${domain}/*`] });
  } catch (e) {
    granted = false;
  }
  if (!granted) return false;
  const list = await getInstances();
  if (!list.includes(domain)) {
    list.push(domain);
    await chrome.storage.local.set({ instances: list });
  }
  await chrome.runtime.sendMessage({ type: 'reconcile' });
  return true;
}

async function disableDomain(domain) {
  const list = (await getInstances()).filter((d) => d !== domain);
  await chrome.storage.local.set({ instances: list });
  try {
    await chrome.permissions.remove({ origins: [`https://${domain}/*`] });
  } catch (e) {
    /* ignore */
  }
  await chrome.runtime.sendMessage({ type: 'reconcile' });
  await refreshSites();
}

async function addInstance() {
  const domain = normalizeDomain($('instanceInput').value);
  if (!isValidDomain(domain)) {
    setStatus($('instanceStatus'), 'Enter a valid domain, e.g. mastodon.social', 'error');
    return;
  }
  if (BUILTIN_DOMAINS.includes(domain)) {
    setStatus($('instanceStatus'), 'Use the Bluesky toggle above for bsky.app.', 'warn');
    return;
  }
  if ((await getInstances()).includes(domain)) {
    setStatus($('instanceStatus'), `${domain} is already added.`, 'warn');
    return;
  }

  const granted = await enableDomain(domain);
  if (!granted) {
    setStatus($('instanceStatus'), `Permission to run on ${domain} was not granted.`, 'error');
    return;
  }
  $('instanceInput').value = '';
  await refreshSites();
  setStatus($('instanceStatus'), `Added ${domain}. Reload its tab to see the button.`, 'ok');
}

async function removeInstance(domain) {
  await disableDomain(domain);
  setStatus($('instanceStatus'), `Removed ${domain}.`, 'warn');
}

async function toggleBluesky() {
  const domain = 'bsky.app';
  if ((await getInstances()).includes(domain)) {
    await disableDomain(domain);
    setStatus($('builtinStatus'), 'Bluesky disabled.', 'warn');
    return;
  }
  const granted = await enableDomain(domain);
  if (!granted) {
    setStatus($('builtinStatus'), 'Permission to run on bsky.app was not granted.', 'error');
    return;
  }
  await refreshSites();
  setStatus($('builtinStatus'), 'Bluesky enabled. Reload bsky.app to see the button.', 'ok');
}

// ---- Wiring -----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  init();

  $('showKey').addEventListener('change', (e) => {
    $('apiKey').type = e.target.checked ? 'text' : 'password';
  });
  $('saveKey').addEventListener('click', saveKey);
  $('validateKey').addEventListener('click', validateKey);
  $('clearKey').addEventListener('click', clearKey);

  document.querySelectorAll('input[name="model"]').forEach((r) =>
    r.addEventListener('change', onModelChange)
  );

  $('savePricing').addEventListener('click', savePricing);
  $('resetPricing').addEventListener('click', resetPricing);
  ['haikuInput', 'haikuOutput', 'sonnetInput', 'sonnetOutput'].forEach((id) =>
    $(id).addEventListener('input', updatePerImageEstimates)
  );
  $('resetSession').addEventListener('click', resetSession);

  $('toggleBluesky').addEventListener('click', toggleBluesky);
  $('addInstance').addEventListener('click', addInstance);
  $('instanceInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addInstance();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.sessionCost || changes.sessionCount) {
      chrome.storage.local.get(['sessionCost', 'sessionCount']).then((d) =>
        renderSession(d.sessionCost, d.sessionCount)
      );
    }
  });
});
