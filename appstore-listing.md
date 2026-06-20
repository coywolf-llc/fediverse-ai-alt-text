# Mac App Store listing — AI Alt Text for the Fediverse

Ready-to-paste copy for App Store Connect. The macOS app hosts the Safari
extension. Bundle ID `com.coywolf.AIAltTextForTheFediverse`.

> ⚠️ **Two blockers to resolve before submitting (see bottom):**
> 1. The repo is PRIVATE, so the support + privacy URLs must point to a PUBLIC
>    page (not the GitHub repo). Need public URLs hosted somewhere (coywolf.com).
> 2. App Review must be able to test a bring-your-own-key feature — include a
>    temporary Anthropic API key in the review notes.

## App information
- **Name** (≤30): `AI Alt Text for the Fediverse`  (29 chars — fits)
- **Subtitle** (≤30): `AI alt text for Mastodon`
- **Primary category**: Utilities  (matches the app's LSApplicationCategoryType)
- **Secondary category**: Social Networking
- **Copyright**: `© 2026 Coywolf`
- **Age rating**: 4+

## Promotional text (≤170, editable anytime without review)
Adds a "Generate with Claude" button to Mastodon's alt-text field. Uses your own Anthropic API key — no developer key, no tracking, nothing sent to us. You review before posting.

## Description (≤4000)
Make your Mastodon posts accessible to everyone.

AI Alt Text for the Fediverse adds a "Generate with Claude" button to the image-description (alt-text) field in the Mastodon web composer. Click it, and your image is described by Anthropic's Claude — using your own API key — producing a concise, screen-reader-friendly description that's filled in for you. Review and edit it, then post.

Works on any Mastodon instance, including self-hosted ones.

BRING YOUR OWN KEY — PRIVACY FIRST
• You use your own Anthropic API key. There is no developer key in the app.
• It collects nothing and sends nothing to us — no analytics, no telemetry, no tracking.
• Your API key is stored only on your device and is never synced to the cloud.
• The only external service it contacts is Anthropic's API (api.anthropic.com), and only to describe an image or validate your key.

ACCESSIBILITY BEST PRACTICES BUILT IN
Claude is guided by established alt-text principles, aligned with W3C WAI image guidance. Descriptions are written for screen-reader and braille-display users — not for search engines. The model classifies the image, front-loads the key information, transcribes any visible text verbatim, expands abbreviations, skips "image of…" lead-ins, and never invents details it can't see. You always review and edit before posting.

COST TRANSPARENCY
• See a per-image cost estimate before you generate, and the exact cost afterward, with a running session total.
• Pricing is editable so you can keep it current with Anthropic's rates.

CHOOSE YOUR MODEL
• Claude Haiku (default — fast and inexpensive) or Claude Sonnet (higher quality).

You'll need an Anthropic API key from console.anthropic.com. Open source and MIT licensed, by Coywolf.

## Keywords (≤100, comma-separated)
mastodon,accessibility,a11y,screen reader,claude,anthropic,ai,image description,wcag,blind,low vision

## URLs
- **Support URL**: ⚠️ needs a PUBLIC page (repo is private) — e.g. a coywolf.com page
- **Marketing URL** (optional): https://coywolf.com
- **Privacy Policy URL**: ⚠️ needs a PUBLIC page — host the PRIVACY.md text at a public URL

## App Privacy (nutrition label)
The developer (Coywolf) collects nothing, but the app sends the user's image to a
third party (Anthropic) to generate the description — which Apple counts as
"collected." Honest, conservative disclosure:
- **Data type**: User Content → "Photos or Videos" (the image being described)
- **Purpose**: App Functionality
- **Linked to the user's identity**: No
- **Used for tracking**: No
- Do NOT declare the API key (it is the user's own credential, stored only on
  device and sent only to authenticate with Anthropic). Optional conservative
  alternative: also list "Other Data" / App Functionality, not linked, no tracking.

## App Review notes (IMPORTANT — reviewer needs a key to test)
This is a Safari extension for Mastodon that uses a bring-your-own-key model and
contains NO developer API key, so testing the core feature requires an Anthropic
API key.

TEST CREDENTIALS: [PASTE A TEMPORARY ANTHROPIC API KEY HERE — set a low spend
limit; you can revoke it after review.]

STEPS:
1. In Safari: Settings → Extensions → enable "AI Alt Text for the Fediverse," and
   allow it to run on your Mastodon instance.
2. Click the extension's toolbar icon to open its settings; paste the provided
   API key, and add a Mastodon instance domain (e.g. mastodon.social).
3. On Mastodon, start a post, attach an image, and open its "Add alt text"
   dialog — a "Generate with Claude" button appears.
4. Click it; the alt-text field is filled with an AI-generated description.

The extension sends the image only to api.anthropic.com using the provided key,
stores the key only locally, and sends nothing to the developer.

## Screenshots to capture (macOS: 1280×800, 1440×900, 2560×1600, or 2880×1800)
1. Mastodon's "Add alt text" dialog with the "Generate with Claude" button.
2. The dialog after generation — alt-text field filled with a description.
3. The extension's settings: API key field, model choice, cost estimate.
4. (Optional) The per-image cost estimate / running session total.

## Pre-submission blockers (resolve first)
1. **Public support + privacy URLs.** The App Store requires both to be publicly
   reachable; the GitHub repo is private. Host the PRIVACY.md text and a short
   support page on coywolf.com (or another public location) and use those URLs.
2. **Reviewer API key.** Without it, App Review can't exercise the feature and
   will likely reject. Generate a temporary, spend-limited Anthropic key and put
   it in the review notes; revoke after approval.
3. (Optional) **Seller name.** Your Apple account appears to be an individual
   account (team "Jonathan Henshaw"), so the App Store seller shows as Jonathan
   Henshaw, not Coywolf LLC. Fine to ship; an Organization account is needed for
   a "Coywolf LLC" seller name.
