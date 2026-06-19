// Placeholder icon generator for "AI Alt Text for Mastodon".
//
// Draws a white speech bubble with an indigo AI "sparkle" on a rounded
// indigo background, then writes 16/48/128 px PNGs into ../icons/.
//
// Pure Node — no native deps. Renders at 4x and box-downsamples for
// anti-aliasing. Dev tool only; excluded from the published build.
//
// Run: node tools/generate-icons.mjs

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'icons');

// Official Mastodon brand palette.
const BLURPLE = [99, 100, 255]; // #6364FF (Pantone 2715 C)
const PURPLE = [86, 58, 204]; //   #563ACC (Pantone 2725 C)
const DEEP = [47, 12, 122]; //     #2F0C7A (Pantone 2685 C)
const WHITE = [255, 255, 255];

// ---- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Drawing canvas (opaque-paint, transparent default) ---------------------

function makeCanvas(size) {
  const buf = new Uint8Array(size * size * 4); // all zero = transparent
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  };
  return { size, buf, set };
}

function fillRoundedRect(c, x0, y0, w, h, radius, color) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      // distance into the nearest corner
      const dx = x < x0 + radius ? x0 + radius - x : x > x1 - radius ? x - (x1 - radius) : 0;
      const dy = y < y0 + radius ? y0 + radius - y : y > y1 - radius ? y - (y1 - radius) : 0;
      if (dx * dx + dy * dy <= radius * radius) c.set(x, y, color);
    }
  }
}

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function fillRoundedRectVGradient(c, x0, y0, w, h, radius, top, bottom) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    const t = h > 1 ? Math.max(0, Math.min(1, (y - y0) / (h - 1))) : 0;
    const color = lerp(top, bottom, t);
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const dx = x < x0 + radius ? x0 + radius - x : x > x1 - radius ? x - (x1 - radius) : 0;
      const dy = y < y0 + radius ? y0 + radius - y : y > y1 - radius ? y - (y1 - radius) : 0;
      if (dx * dx + dy * dy <= radius * radius) c.set(x, y, color);
    }
  }
}

function fillDiamond(c, cx, cy, ax, ay, color) {
  for (let y = Math.floor(cy - ay); y <= Math.ceil(cy + ay); y++) {
    for (let x = Math.floor(cx - ax); x <= Math.ceil(cx + ax); x++) {
      if (Math.abs((x - cx) / ax) + Math.abs((y - cy) / ay) <= 1) c.set(x, y, color);
    }
  }
}

function fillTriangle(c, p0, p1, p2, color) {
  const minX = Math.floor(Math.min(p0[0], p1[0], p2[0]));
  const maxX = Math.ceil(Math.max(p0[0], p1[0], p2[0]));
  const minY = Math.floor(Math.min(p0[1], p1[1], p2[1]));
  const maxY = Math.ceil(Math.max(p0[1], p1[1], p2[1]));
  const area = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = [x + 0.5, y + 0.5];
      const d0 = area(p0, p1, p);
      const d1 = area(p1, p2, p);
      const d2 = area(p2, p0, p);
      const hasNeg = d0 < 0 || d1 < 0 || d2 < 0;
      const hasPos = d0 > 0 || d1 > 0 || d2 > 0;
      if (!(hasNeg && hasPos)) c.set(x, y, color);
    }
  }
}

// ---- Downsample (box filter, averages alpha) --------------------------------

function downsample(src, scale, outSize) {
  const out = Buffer.alloc(outSize * outSize * 4);
  const n = scale * scale;
  for (let y = 0; y < outSize; y++) {
    for (let x = 0; x < outSize; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const si = ((y * scale + sy) * src.size + (x * scale + sx)) * 4;
          const sa = src.buf[si + 3];
          r += src.buf[si] * sa;
          g += src.buf[si + 1] * sa;
          b += src.buf[si + 2] * sa;
          a += sa;
        }
      }
      const oi = (y * outSize + x) * 4;
      if (a > 0) {
        out[oi] = Math.round(r / a);
        out[oi + 1] = Math.round(g / a);
        out[oi + 2] = Math.round(b / a);
        out[oi + 3] = Math.round(a / n);
      }
    }
  }
  return out;
}

// ---- Compose the icon -------------------------------------------------------

function renderIcon(size) {
  const scale = 4;
  const S = size * scale;
  const c = makeCanvas(S);

  // Background rounded square — Mastodon blurple → purple vertical gradient.
  fillRoundedRectVGradient(c, 0, 0, S, S, S * 0.22, BLURPLE, PURPLE);

  // Speech bubble body
  fillRoundedRect(c, S * 0.18, S * 0.2, S * 0.64, S * 0.46, S * 0.1, WHITE);
  // Tail
  fillTriangle(c, [S * 0.3, S * 0.62], [S * 0.3, S * 0.82], [S * 0.48, S * 0.62], WHITE);

  // Primary AI sparkle (4-point star = two crossed diamonds), deep purple.
  const cx = S * 0.5, cy = S * 0.43;
  fillDiamond(c, cx, cy, S * 0.07, S * 0.19, DEEP);
  fillDiamond(c, cx, cy, S * 0.19, S * 0.07, DEEP);
  // Small secondary sparkle
  const sx = S * 0.66, sy = S * 0.3;
  fillDiamond(c, sx, sy, S * 0.035, S * 0.09, DEEP);
  fillDiamond(c, sx, sy, S * 0.09, S * 0.035, DEEP);

  return downsample(c, scale, size);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 48, 128]) {
  const rgba = renderIcon(size);
  const png = encodePNG(size, size, rgba);
  const file = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
