# Chrome Web Store listing

## Store title

AI Alt Text for Mastodon

## Summary (≤ 132 chars)

Generate accessible, best-practice image alt text in the Mastodon composer with your own Claude API key. Privacy-first.

## Category

Accessibility / Social & Communication

## Full description

Make your Mastodon posts more accessible. This extension adds a
"Generate with Claude" button to the image description (alt-text) field in the
Mastodon web composer. Click it, and your image is sent to Anthropic's Claude
API — using your own API key — to produce a concise, screen-reader-friendly
description that's filled in for you. Review and edit before you post.

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

## Permission justifications

Chrome Web Store review requires a justification for each requested permission.

**storage**
Used to save the user's Anthropic API key and preferences (selected model,
editable pricing table, list of approved Mastodon instances, and a running
session-cost total) locally on the user's device. No data is transmitted to the
developer.

**scripting**
Used to dynamically register the content script on the specific Mastodon
instance domains the user adds on the options page, so the alt-text button
appears in that site's composer. The extension does not inject scripts into any
site the user has not explicitly approved.

**Optional host permissions (the user's Mastodon instance domains)**
Requested per-instance, only when the user adds a domain on the options page.
Required so the content script can detect the description modal and inject the
"Generate with Claude" button on that Mastodon site. No instance is accessed
until the user grants permission for it.

**Host permission: https://api.anthropic.com/**
Required so the background service worker can send the selected image and prompt
to Anthropic's Claude API to generate the alt text (and to validate the user's
API key). This is the only external destination the extension contacts.

## Single purpose

The extension has one purpose: to generate alternative text for images in the
Mastodon web composer using the user's own Anthropic Claude API key.

## Data usage disclosures

- Does the extension collect user data? Only the user's own API key and
  settings, stored locally on the device; nothing is sent to the developer.
- Is data sold to third parties? No.
- Is data used for purposes unrelated to the single purpose? No.
- Is data used for creditworthiness / lending? No.

Image data is sent only to Anthropic (api.anthropic.com) to generate the
requested description, at the user's explicit action.
