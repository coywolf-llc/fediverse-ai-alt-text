#!/usr/bin/env bash
#
# Build a clean, Chrome-Web-Store-ready zip containing only the runtime files.
# Version is read from manifest.json so the artifact is versioned.
#
# Usage: ./build.sh   ->   dist/alt-text-ai-for-mastodon-<version>.zip

set -euo pipefail

cd "$(dirname "$0")"

NAME="alt-text-ai-for-mastodon"

# Read "version": "x.y.z" from manifest.json without extra dependencies.
VERSION="$(grep -m1 '"version"' manifest.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
if [ -z "$VERSION" ]; then
  echo "error: could not read version from manifest.json" >&2
  exit 1
fi

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

# Copy only the runtime files (manifest, src/, icons/).
cp manifest.json "$STAGING/"
cp -R src "$STAGING/"
cp -R icons "$STAGING/"

# Strip stray macOS metadata.
find "$STAGING" -name '.DS_Store' -delete

mkdir -p dist
ZIP="dist/${NAME}-${VERSION}.zip"
rm -f "$ZIP"

( cd "$STAGING" && zip -r -X "$OLDPWD/$ZIP" manifest.json src icons >/dev/null )

echo "Built $ZIP"
unzip -l "$ZIP"
