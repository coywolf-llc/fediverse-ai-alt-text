#!/usr/bin/env bash
#
# Build a Firefox (AMO-ready) zip from the same source as the Chrome build.
# Firefox MV3 differences handled here (the JS is unchanged — chrome.* works in
# Firefox, and navigator.vendor is "" there so the Safari branches stay off):
#   - background.service_worker  ->  background.scripts   (Firefox MV3 = event page)
#   - options_page               ->  options_ui           (Firefox has no options_page)
#   - add browser_specific_settings.gecko.id              (required by AMO)
#   - declare data_collection_permissions                 (the image is sent to Anthropic)
#
# Usage: ./build-firefox.sh   ->   dist/fediverse-ai-alt-text-firefox-<version>.zip
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

NAME="fediverse-ai-alt-text"
GECKO_ID="ai-alt-text-fediverse@coywolf.com"

VERSION="$(grep -m1 '"version"' manifest.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
if [ -z "$VERSION" ]; then echo "error: no version in manifest.json" >&2; exit 1; fi

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

jq --arg id "$GECKO_ID" '
    .background = { scripts: ["src/background.js"] }
  | .options_ui = { page: .options_page, open_in_tab: true }
  | del(.options_page)
  | . + { browser_specific_settings: { gecko: {
        id: $id,
        data_collection_permissions: { required: ["websiteContent"] }
    } } }
' manifest.json > "$STAGING/manifest.json"

cp -R src "$STAGING/"
cp -R icons "$STAGING/"
find "$STAGING" -name '.DS_Store' -delete

mkdir -p dist
ZIP="dist/${NAME}-firefox-${VERSION}.zip"
rm -f "$ZIP"
( cd "$STAGING" && zip -r -X "$ROOT/$ZIP" manifest.json src icons >/dev/null )

echo "Built $ROOT/$ZIP"
unzip -l "$ROOT/$ZIP"
echo "--- Firefox manifest ---"
cat "$STAGING/manifest.json"
