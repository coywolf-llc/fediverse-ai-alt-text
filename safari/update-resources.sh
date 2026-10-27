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

# Keep the Mac App Store version in step with the extension: MARKETING_VERSION
# (CFBundleShortVersionString) = manifest version. App Store Connect rejects an
# upload whose version isn't higher than the last approved one, and every upload
# needs a build number (CURRENT_PROJECT_VERSION) higher than any uploaded before,
# so the build is a timestamp (YYYYMMDDHHMM): set whenever the version changes,
# or on demand with BUMP_BUILD=1 (re-uploading the same version after a
# rejected or failed upload).
PBX="safari/AI Alt Text for the Fediverse/AI Alt Text for the Fediverse.xcodeproj/project.pbxproj"
VERSION="$(jq -r .version manifest.json)"
CURRENT="$(grep -m1 -o 'MARKETING_VERSION = [^;]*' "$PBX" | sed 's/MARKETING_VERSION = //')"
if [ "$CURRENT" != "$VERSION" ] || [ "${BUMP_BUILD:-0}" = "1" ]; then
  BUILD="$(date +%Y%m%d%H%M)"
  sed -i '' -e "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $VERSION;/" \
    -e "s/CURRENT_PROJECT_VERSION = [0-9]*;/CURRENT_PROJECT_VERSION = $BUILD;/" "$PBX"
  echo "Xcode version $CURRENT -> $VERSION, build $BUILD"
fi

echo "Synced manifest(+declared content_scripts)/src/icons -> $DEST"
echo "Now rebuild (or re-archive) the app in Xcode."
