# AI Alt Text for Mastodon

A privacy-first Chrome extension (Manifest V3) that adds an **AI alt-text button**
to the Mastodon web composer. When you open the image description modal, the
extension can send the image to Anthropic's Claude API — **using your own API
key** — and autofill a concise, screen-reader-friendly description.

- **Bring-your-own-key.** You enter your own Anthropic API key. There is no
  developer key anywhere in the code.
- **Nothing leaves your device except the image you choose to describe**, which
  goes only to `api.anthropic.com`. No analytics, no telemetry, no "phone home."
- **Minimal permissions.** Host access is requested per-instance, only for the
  Mastodon sites you add.

## How it works

1. A **content script** runs only on the Mastodon instances you approve. It
   watches for the image description (alt-text) modal, injects a
   **"Generate with Claude"** button, reads the preview image, and autofills the
   description field with Claude's reply.
2. A **background service worker** makes the actual API calls (keeping your key
   out of the page and avoiding the page's CSP/CORS). It is the only place that
   reads the key and the only thing that contacts `api.anthropic.com`.
3. An **options page** holds your API key, model choice, an editable pricing
   table, a session cost readout, and your list of Mastodon instances.

## Install (development / load unpacked)

1. Clone this repository.
2. Open `chrome://extensions` in Chrome (or any Chromium browser).
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select this project folder (the one containing
   `manifest.json`).
5. Click the extension's icon (or open its **Options**) to configure it.

## Get an Anthropic API key

1. Go to <https://console.anthropic.com/settings/keys>.
2. Create a key (it starts with `sk-ant-`).
3. Paste it into the extension's options page and click **Save & validate**.

Your key is stored only in `chrome.storage.local` on your device and is sent
only to `api.anthropic.com`.

## Configure a Mastodon instance

On the options page, under **Mastodon instances**, type your instance domain
(e.g. `mastodon.social`) and click **Add instance**. Chrome will ask for
permission to run on that site. After granting it, reload the Mastodon tab — the
**Generate with Claude** button will appear when you open an image's description
field. Add as many instances as you use; remove one to revoke its access.

## Validating your key

Use **Validate key** (or **Save & validate**) on the options page. The extension
makes the smallest possible real request (`max_tokens: 1`, no image) and reports:

- **Valid** — your key works.
- **Key rejected** — the key is invalid or revoked (HTTP 401).
- **Lacks access** — billing/region issue (HTTP 403).
- **Rate-limited** — the key is valid but currently throttled (HTTP 429).
- **Couldn't reach api.anthropic.com** — a network problem (not a bad key).

Validation costs only a few input tokens — well under a thousandth of a cent.

## Cost estimates

The extension shows two figures:

- A **pre-call estimate** next to the button, before you generate. Image input
  tokens are approximated from the preview's dimensions
  (`tokens ≈ width × height / 750`), plus the small fixed prompt and a short
  expected output. Rendered as a rough range, e.g. `~$0.0004 with Haiku`.
- The **actual cost** after the call, computed from the real `usage` returned by
  the API, e.g. `This image: $0.00038`, plus a **running session total**.

Because the Mastodon preview is downscaled, real token counts stay low. The
estimates depend on Anthropic's current rates — the options page has an editable
pricing table (labeled with a "rates as of" date) so you can keep it accurate.

The session total resets when the browser restarts and is stored only locally —
never transmitted.

## Models

- **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) — default; fastest and
  cheapest, and more than capable for alt text.
- **Claude Sonnet 4.6** (`claude-sonnet-4-6`) — higher quality at higher cost.

## Build a Web-Store zip

```bash
./build.sh
```

This reads the version from `manifest.json` and produces
`dist/alt-text-ai-for-mastodon-<version>.zip` containing only the runtime files
(`manifest.json`, `src/`, `icons/`) — no docs, build scripts, or dev tooling.

## Project layout

```
manifest.json          MV3 manifest
src/background.js       service worker — API calls, key validation, registration
src/content.js         injected into Mastodon — button + autofill
src/options.html/.js    settings UI
src/styles.css          shared styles (injected button + options page)
icons/                  16 / 48 / 128 px icons
tools/generate-icons.mjs  dev-only placeholder icon generator
build.sh               produces the Web-Store zip
PRIVACY.md             privacy policy
store-listing.md       Web Store copy + permission justifications
```

## Privacy

See [PRIVACY.md](PRIVACY.md). Short version: the extension collects nothing,
transmits nothing to the developer, stores your key only in
`chrome.storage.local`, and sends image data only to `api.anthropic.com`.

## License

[MIT](LICENSE) © Coywolf LLC.
