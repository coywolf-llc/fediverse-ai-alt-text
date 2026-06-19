# Privacy Policy — AI Alt Text for the Fediverse

_Last updated: 2026-06-19_

This extension is built privacy-first and bring-your-own-key. In plain terms:
**it collects nothing, and it sends nothing to its developer.**

## What the extension collects

Nothing is collected by, or transmitted to, the developer (Coywolf LLC). There is
no analytics, no telemetry, no crash reporting, no remote configuration, and no
"phone home" of any kind.

## Where your data lives

- **Your Anthropic API key** is stored only on your own device, using the
  browser's `chrome.storage.local` API, scoped to this extension. It is **not**
  stored in `chrome.storage.sync`, so it is never replicated to Google's servers.
  It never leaves your device except as the `x-api-key` header on requests you
  initiate to Anthropic (see below).
- **Your settings** (selected model, editable pricing table, the list of sites
  you've enabled — Mastodon instances and Bluesky — and a running session-cost
  total) are also stored only in `chrome.storage.local` on your device.

The key is not encrypted at rest. Any decryption key would have to ship inside
the same extension bundle, which would be security theater rather than real
protection. Instead, the key is never logged, is masked in the options UI, and
is stored only in extension-scoped local storage.

## The only external service

When you click **Generate with Claude** on an image, the image data and a short
text prompt are sent to **Anthropic's Claude API** at `https://api.anthropic.com`
so that Claude can generate a description. When you validate your key, a tiny
test request is sent to the same endpoint. That is the **only** external network
destination the extension ever contacts. Your use of the Anthropic API is
governed by [Anthropic's privacy policy and terms](https://www.anthropic.com/legal/privacy).

No data is sent to any third party other than Anthropic, and none is sent to the
developer.

## Permissions

- **storage** — to save your API key and settings locally on your device.
- **scripting** — to add the alt-text button to the sites (Mastodon instances
  and Bluesky) you explicitly approve.
- **Host access to the sites you enable** — requested per-site, only when you
  enable a network on the options page, so the button can appear in that site's
  composer.
- **Host access to `api.anthropic.com`** — so the extension can send your image
  to Claude to generate a description.

## Removing your data

Uninstalling the extension removes everything it stored on your device. You can
also clear your API key at any time from the options page using **Clear**.

## Contact

Questions: open an issue on the project's GitHub repository.
