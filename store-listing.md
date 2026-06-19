# Chrome Web Store listing

## Store title

AI Alt Text for the Fediverse

## Summary (≤ 132 chars)

Generate accessible, best-practice image alt text for Mastodon with your own Claude API key. Privacy-first.

## Category

Accessibility / Social & Communication

## Full description

Make your Mastodon posts more accessible. This extension adds a
"Generate with Claude" button to the image description (alt-text) field in the
Mastodon web composer. Click it, and your image is sent to Anthropic's Claude
API — using your own API key — to produce a concise, screen-reader-friendly
description that's filled in for you. Review and edit before you post.

Works on any Mastodon instance, including self-hosted ones.

PRIVACY FIRST, BRING YOUR OWN KEY
• You use your own Anthropic API key. There is no developer key in the code.
• The extension collects nothing and sends nothing to its developer. No
  analytics, no telemetry, no tracking, no "phone home."
• Your API key is stored only on your device (chrome.storage.local) and is
  never synced to the cloud.
• The ONLY external service the extension contacts is api.anthropic.com, and
  only to generate a description (or to validate your key).

MINIMAL PERMISSIONS
• It runs only on the Mastodon instances you explicitly add, granting host
  access per-instance from the options page.

COST TRANSPARENCY
• See a per-image cost estimate before you generate and the exact cost
  afterward, with a running session total. Pricing is editable so you can keep
  it current with Anthropic's rates.

ACCESSIBILITY BEST PRACTICES BUILT IN
• Claude is prompted with established alt-text principles — aligned with W3C WAI
  image guidance — so descriptions are written for screen-reader and
  braille-display users, not for search engines. It classifies
  the image, front-loads the key information, transcribes any visible text
  verbatim, expands abbreviations, skips "image of…" lead-ins, and never invents
  details. You review and edit before posting.

CHOOSE YOUR MODEL
• Claude Haiku 4.5 (default — fast and inexpensive) or Claude Sonnet 4.6
  (higher quality).

You'll need an Anthropic API key from console.anthropic.com. Open source and
MIT licensed.

## Chrome Web Store form — Permission justifications

These map 1:1 to the fields in the Web Store submission form (each ≤ 1,000 chars).

**storage justification**
The "storage" permission persists the user's own settings on their device via chrome.storage.local: their Anthropic API key, the selected Claude model, an editable per-million-token pricing table used for local cost estimates, the list of Mastodon instance domains they have enabled, and a running session-cost total. This data never leaves the device — it is not sent to the developer or any third party — and is stored so the user does not have to re-enter their key and preferences each session. chrome.storage.sync is intentionally not used, so the API key is never replicated off-device.

**scripting justification**
The "scripting" permission is used with chrome.scripting.registerContentScripts to inject the content script only on the specific Mastodon instance domains the user explicitly adds and approves on the options page. The content script detects the image alt-text (description) dialog and adds a "Generate with Claude" button that fills the description field. Scripts are never injected into a site the user has not approved. Registering dynamically per instance — rather than declaring broad static content_scripts — keeps host access to the minimum the user opts into, because Mastodon instances live on arbitrary, user-chosen domains.

**Host permission justification**
Two host permissions are declared:
(1) https://api.anthropic.com/* (required): the background service worker calls Anthropic's Claude API at this endpoint to generate the image's alt text and to validate the user's API key. This is the only server the extension contacts.
(2) https://*/* (optional_host_permissions — NOT granted at install): Mastodon is decentralized and runs on arbitrary, user-chosen domains, including self-hosted instances, so the exact hosts cannot be known in advance. The extension requests access to one instance origin at a time, only after the user adds that instance on the options page and accepts Chrome's per-site permission prompt, then registers the content script for that single origin. The broad pattern is never used to read or act on sites automatically — host access is granted per-instance by the user.

**Are you using remote code? → No.**
All scripts are bundled in the package (background.js, content.js, and options.js loaded via a local `<script src="options.js">`). There is no eval(), no Function constructor, no importScripts, no external `<script>` tags, and no remotely-loaded modules or Wasm. The extension's only network calls are fetch() requests to the Anthropic REST API that return JSON data (the generated description) — data, not executable code.

## Single purpose

The extension has one purpose: to generate alternative text for images in the
Mastodon web composer using the user's own Anthropic Claude API key.

## Chrome Web Store form — Data usage

Note: the Web Store counts "collect" as transmitting data off the device,
including to a third party (here, Anthropic) — not only to the developer. The
developer collects nothing, but the user's image is sent to Anthropic, which
must be disclosed.

What user data is collected (checkboxes):
- [x] **Website content** — the user's image is transmitted to api.anthropic.com
  to be described (Chrome's example for this category includes "images").
- [ ] All other categories — Personally identifiable information, Health,
  Financial and payment, Personal communications, Location, Web history, User
  activity — are not collected.
- Judgment call — **Authentication information** (the user's API key): left
  unchecked. The key is the user's own credential, supplied by them, stored only
  in chrome.storage.local, and transmitted only to the one service it
  authenticates (Anthropic) for the user's own requests — never profiled or
  shared. Checking it is the more conservative alternative if preferred.

Certifications (all true — must check all three):
- [x] I do not sell or transfer user data to third parties, outside of the
  approved use cases. (Sending the image to Anthropic to fulfill the
  user-requested feature is the approved "providing the service" use case.)
- [x] I do not use or transfer user data for purposes unrelated to the item's
  single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for
  lending purposes.
