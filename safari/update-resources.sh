#!/usr/bin/env bash
#
# Sync the latest runtime files into the Safari extension's Resources, then
# rebuild in Xcode. Run after changing the extension source so the Safari copy
# stays in step with the Chrome build.
#
set -euo pipefail
cd "$(dirname "$0")/.." # repo root

DEST="safari/AI Alt Text for the Fediverse/AI Alt Text for the Fediverse Extension/Resources"
rm -rf "$DEST"
mkdir -p "$DEST"

# Safari only surfaces its native per-site permission prompt for content scripts
# DECLARED in the manifest; it ignores Chrome's dynamic registerContentScripts()
# for that purpose. So the Safari manifest gets a declared content_scripts entry
# (matching all https sites — instances are user-configurable, so we can't
# hardcode them). content.js self-gates on the saved instance list, and the
# background worker skips dynamic registration when it detects Safari. The Chrome
# manifest stays declaration-free to preserve its optional-permission model.
jq '.content_scripts = [{"matches":["https://*/*"],"js":["src/content.js"],"css":["src/styles.css"],"run_at":"document_idle"}]' \
  manifest.json > "$DEST/manifest.json"
cp -R src "$DEST/"
cp -R icons "$DEST/"
find "$DEST" -name '.DS_Store' -delete

echo "Synced manifest(+declared content_scripts)/src/icons -> $DEST"
echo "Now rebuild (or re-archive) the app in Xcode."
