# AI Alt Text for the Fediverse

A privacy-first Chrome extension (Manifest V3) that adds an **AI alt-text button**
to the **Mastodon** web composer (any instance, including self-hosted). When you
open the image description (alt-text) modal, the extension can send the image to
Anthropic's Claude API — **using your own API key** — and autofill a concise,
screen-reader-friendly description that follows established alt-text accessibility
best practices.

- **Accessibility best practices built in.** Claude is prompted with established
  alt-text best practices (aligned with W3C WAI image guidance), so the output is
  written for real assistive-technology users (see
  [Accessibility-first descriptions](#accessibility-first-descriptions)).
- **Bring-your-own-key.** You enter your own Anthropic API key. There is no
  developer key anywhere in the code.
- **Nothing leaves your device except the image you choose to describe**, which
  goes only to `api.anthropic.com`. No analytics, no telemetry, no "phone home."
- **Minimal permissions.** Host access is requested per-instance, only for the
  Mastodon sites you add.

## How it works

1. A **content script** runs only on the Mastodon instances you approve. It
   watches for the image description (alt-text) modal — detected by structure
   (`role="dialog"` + a textarea + an image preview), not hashed class names —
   injects a **"Generate with Claude"** button, reads the preview image, and
   autofills the description with Claude's reply.
2. A **background service worker** makes the actual API calls (keeping your key
   out of the page and avoiding the page's CSP/CORS). It is the only place that
   reads the key and the only thing that contacts `api.anthropic.com`.
3. An **options page** holds your API key, model choice, an editable pricing
   table, a session cost readout, and your list of Mastodon instances.

## Accessibility-first descriptions

The generated text is written for people who rely on it — screen-reader and
braille-display users, and anyone who sees alt text when an image fails to load —
not for search engines. The prompt encodes widely recognized alt-text best
practices, aligned with [W3C WAI image guidance](https://www.w3.org/WAI/tutorials/images/).
Specifically, Claude is instructed to:

- **Classify the image first** and describe accordingly — a functional image (a
  control or icon) by its function, a text-bearing image by transcribing its text
  verbatim, a chart/diagram by leading with its takeaway, a photo by what matters
  in context.
- **Front-load the essential meaning** so the first clause stands on its own.
- **Write complete sentences** in sentence case with real punctuation (screen
  readers use it for pacing; braille renders it literally).
- **Expand abbreviations, units, and addresses** ("5 gigabytes," not "5GB"),
  because braille shows them literally and speech mispronounces them.
- **Skip "image of" / "photo of" openers** (assistive tech already announces it
  as an image), but name the medium when it matters ("Screenshot of…").
- **Use proper typographic quotes** when transcribing text, and **never invent
  details** that aren't visible.
- **Match depth to the image** — one tight sentence for a simple photo, more when
  the image is detailed or is itself the point.

You always review and edit the result before posting — the extension fills the
field, you stay in control.

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

Mastodon runs on any domain, and so does this extension — it works on **any
instance**, including self-hosted ones. On the options page, under **Mastodon
instances**, type your instance domain (e.g. `mastodon.social`, `henshaw.social`,
`coywolf.social`) and click **Add instance**. Chrome will ask for permission to
run on that site. After granting it, **reload that tab once** — the **Generate
with Claude** button appears when you open an image's description field. Add as
many instances as you use; remove one to revoke its access.

Host access is requested per-instance (not "all sites") so the extension only
runs where you've explicitly approved it — the privacy-first default.

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

Because the composer preview is downscaled, real token counts stay low. The
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
`dist/fediverse-ai-alt-text-<version>.zip` containing only the runtime files
(`manifest.json`, `src/`, `icons/`) — no docs, build scripts, or dev tooling.

**Or just grab it from Releases:** every PR merged to `main` automatically
publishes a [GitHub Release](https://github.com/coywolf-llc/fediverse-ai-alt-text/releases)
with a versioned, ready-to-upload zip (the patch version auto-bumps when the
merged PR didn't change it). See
[`.github/workflows/release.yml`](.github/workflows/release.yml).

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
