import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(repo, 'public', 'icons');
const assetDir = join(repo, 'assets');
mkdirSync(root, { recursive: true });
mkdirSync(assetDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(width, height, rgba, opaque = false) {
  const channels = opaque ? 3 : 4;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    if (!opaque) {
      rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
      continue;
    }
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      const dest = row + 1 + x * 3;
      raw[dest] = rgba[source];
      raw[dest + 1] = rgba[source + 1];
      raw[dest + 2] = rgba[source + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function blend(data, width, x, y, r, g, b, a) {
  if (a <= 0) return;
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= width || py >= data.length / 4 / width) return;
  const i = (py * width + px) * 4;
  const sa = a / 255;
  const da = data[i + 3] / 255;
  const out = sa + da * (1 - sa);
  data[i] = Math.round((r * sa + data[i] * da * (1 - sa)) / out);
  data[i + 1] = Math.round((g * sa + data[i + 1] * da * (1 - sa)) / out);
  data[i + 2] = Math.round((b * sa + data[i + 2] * da * (1 - sa)) / out);
  data[i + 3] = Math.round(out * 255);
}

function heartPoints(cx, cy, scale) {
  const points = [];
  for (let i = 0; i < 90; i++) {
    const t = (i / 90) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    points.push([cx + x * scale, cy + y * scale]);
  }
  return points;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function roundRect(x, y, w, h, r) {
  const dx = Math.abs(x - w / 2) - (w / 2 - r);
  const dy = Math.abs(y - h / 2) - (h / 2 - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

function paintIcon(size, maskable) {
  const data = Buffer.alloc(size * size * 4);
  const margin = maskable ? size * 0.16 : size * 0.08;
  const heart = heartPoints(size * 0.5, size * 0.55, size * 0.0125);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = y / size;
      const felt = [20 + t * 8, 110 - t * 28, 62 - t * 16];
      blend(data, size, x, y, felt[0], felt[1], felt[2], 255);
      const cardW = size - margin * 2.4;
      const cardH = cardW * 1.38;
      const originX = (size - cardW) / 2;
      const originY = (size - cardH) / 2 - size * 0.01;
      const back = roundRect(x - originX - size * 0.035, y - originY - size * 0.03, cardW, cardH, cardW * 0.1);
      if (back < 1.2) blend(data, size, x, y, 230, 211, 161, Math.round((1 - Math.max(0, back)) * 255));
      const front = roundRect(x - originX, y - originY, cardW, cardH, cardW * 0.1);
      if (front < 1.2) {
        const edge = front > -size * 0.012;
        const color = edge ? [230, 211, 161] : [251, 246, 236];
        blend(data, size, x, y, color[0], color[1], color[2], Math.round((1 - Math.max(0, front)) * 255));
      }
      if (insidePolygon(x, y, heart)) blend(data, size, x, y, 197, 22, 44, 255);
    }
  }
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return data;
}

function drawIcon(size, maskable) {
  return encodePng(size, size, paintIcon(size, maskable));
}

const files = [
  ['apple-touch-icon.png', 180, false],
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-512-maskable.png', 512, true],
];

for (const [name, size, maskable] of files) {
  const png = drawIcon(size, maskable);
  writeFileSync(join(root, name), png);
  console.log(`wrote ${name} (${png.length} bytes)`);
}

function fill(size, top, bottom) {
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

function sample(src, size, x, y) {
  const x0 = Math.max(0, Math.min(size - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(size - 1, Math.floor(y)));
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (px, py) => {
    const i = (py * size + px) * 4;
    return [src[i], src[i + 1], src[i + 2]];
  };
  const a = at(x0, y0);
  const b = at(x1, y0);
  const c = at(x0, y1);
  const d = at(x1, y1);
  return [0, 1, 2].map((channel) =>
    Math.round(
      a[channel] * (1 - fx) * (1 - fy) +
        b[channel] * fx * (1 - fy) +
        c[channel] * (1 - fx) * fy +
        d[channel] * fx * fy,
    ),
  );
}

function blit(dest, destSize, src, srcSize, left, top, draw) {
  for (let y = 0; y < draw; y++) {
    const dy = top + y;
    if (dy < 0 || dy >= destSize) continue;
    const sy = ((y + 0.5) * srcSize) / draw - 0.5;
    for (let x = 0; x < draw; x++) {
      const dx = left + x;
      if (dx < 0 || dx >= destSize) continue;
      const sx = ((x + 0.5) * srcSize) / draw - 0.5;
      const [r, g, b] = sample(src, srcSize, sx, sy);
      const i = (dy * destSize + dx) * 4;
      dest[i] = r;
      dest[i + 1] = g;
      dest[i + 2] = b;
      dest[i + 3] = 255;
    }
  }
}

function splash(top, bottom, icon) {
  const size = 2732;
  const canvas = fill(size, top, bottom);
  const draw = 980;
  const origin = Math.round((size - draw) / 2);
  blit(canvas, size, icon, 1024, origin, origin - 40, draw);
  return encodePng(size, size, canvas);
}

const master = paintIcon(1024, false);
writeFileSync(join(assetDir, 'icon-only.png'), encodePng(1024, 1024, master, true));
writeFileSync(join(assetDir, 'icon-foreground.png'), encodePng(1024, 1024, master, true));
writeFileSync(join(assetDir, 'icon-background.png'), encodePng(1024, 1024, fill(1024, [20, 107, 60], [12, 78, 43]), true));
writeFileSync(join(assetDir, 'splash.png'), splash([47, 157, 92], [12, 78, 43], master));
writeFileSync(join(assetDir, 'splash-dark.png'), splash([42, 59, 51], [16, 23, 20], master));
console.log('wrote assets/icon-only.png and launch images');

const iosIcons = join(repo, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
mkdirSync(iosIcons, { recursive: true });
const slots = [
  ['Icon-App-20x20@2x.png', 40, '20x20', '2x', 'iphone'],
  ['Icon-App-20x20@3x.png', 60, '20x20', '3x', 'iphone'],
  ['Icon-App-29x29@2x.png', 58, '29x29', '2x', 'iphone'],
  ['Icon-App-29x29@3x.png', 87, '29x29', '3x', 'iphone'],
  ['Icon-App-40x40@2x.png', 80, '40x40', '2x', 'iphone'],
  ['Icon-App-40x40@3x.png', 120, '40x40', '3x', 'iphone'],
  ['Icon-App-60x60@2x.png', 120, '60x60', '2x', 'iphone'],
  ['Icon-App-60x60@3x.png', 180, '60x60', '3x', 'iphone'],
  ['Icon-App-1024x1024@1x.png', 1024, '1024x1024', '1x', 'ios-marketing'],
];
for (const [name, pixels] of slots) {
  const image = pixels === 1024 ? master : (() => {
    const dest = Buffer.alloc(pixels * pixels * 4);
    blit(dest, pixels, master, 1024, 0, 0, pixels);
    return dest;
  })();
  writeFileSync(join(iosIcons, name), encodePng(pixels, pixels, image, true));
}
writeFileSync(
  join(iosIcons, 'Contents.json'),
  `${JSON.stringify({
    images: slots.map(([filename, , size, scale, idiom]) => ({ filename, idiom, scale, size })),
    info: { author: 'xcode', version: 1 },
  }, null, 2)}\n`,
);
console.log('wrote iOS AppIcon set');
