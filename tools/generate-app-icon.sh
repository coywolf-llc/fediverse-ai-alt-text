#!/usr/bin/env bash
# Regenerate the macOS Safari app icon from tools/icon-source.svg.
# Requires: rsvg-convert (brew install librsvg) + ImageMagick (magick).
#
# WHY THIS EXISTS: `xcrun safari-web-extension-converter` seeds a placeholder AppIcon that
# floats a SQUARE tile inside Apple's white "app card" template. On macOS the artwork must
# instead BE the rounded shape (Apple applies no mask), inset with a margin + shadow. The
# source SVG is a full icon with its OWN rounded bg + margin (x=6 y=6 w=116 h=116 rx=30 on a
# 128 viewBox); we flatten that to a FULL-BLEED square, render it crisp with rsvg-convert,
# then reshape to Apple's Big Sur grid — an 824x824 rounded body (radius 185 ≈ 22.4%)
# centered on a 1024 canvas (100px margin) with a soft drop shadow — and emit every
# mac-icon-* size. Re-run after editing the SVG, then rebuild/re-archive in Xcode.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
SVG="$here/icon-source.svg"
DIR="$(find "$root/safari" -type d -name AppIcon.appiconset | head -1)"
[ -n "$DIR" ] || { echo "no AppIcon.appiconset found under safari/"; exit 1; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

# 1. Full-bleed the two background rects (gradient + sheen) so the color fills the square.
sed 's/x="6" y="6" width="116" height="116" rx="30"/x="0" y="0" width="128" height="128"/g' \
  "$SVG" > "$tmp/fb.svg"
# 2. Crisp vector render at the 824 body size.
rsvg-convert -w 824 -h 824 "$tmp/fb.svg" -o "$tmp/body.png"
# 3. Round via CopyOpacity + an OPAQUE b/w mask (DstIn leaves black corners on RGBA input).
magick -size 824x824 xc:black -fill white \
  -draw 'roundrectangle 0,0,823,823,185,185' -alpha off "$tmp/mask.png"
magick "$tmp/body.png" "$tmp/mask.png" -alpha off -compose CopyOpacity -composite "$tmp/rounded.png"
# 4. Soft drop shadow, centered on a 1024 transparent canvas → the mac master.
magick "$tmp/rounded.png" \
  \( +clone -background black -shadow 35x14+0+14 \) \
  +swap -background none -layers merge +repage \
  -gravity center -background none -extent 1024x1024 "$tmp/master.png"
# 5. Emit every mac-icon-* size (filename:pixels).
for m in 16@1x:16 16@2x:32 32@1x:32 32@2x:64 128@1x:128 128@2x:256 \
         256@1x:256 256@2x:512 512@1x:512 512@2x:1024; do
  magick "$tmp/master.png" -resize "${m##*:}x${m##*:}" "$DIR/mac-icon-${m%%:*}.png"
done
echo "Regenerated $(ls "$DIR"/mac-icon-*.png | wc -l | tr -d ' ') mac app-icon PNGs in:"
echo "  $DIR"
