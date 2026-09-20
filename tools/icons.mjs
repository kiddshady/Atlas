/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — el ícono, horneado desde el código
   La marca (la rosa de los vientos de `.op-brand__mark`: el aro y la aguja)
   sobre la baldosa de Opal: a sangre, sin borde, esquinas al 19 %. El aro y el
   norte de la aguja van en el acento; el sur, en la tinta secundaria, como en
   toda brújula: así el ícono dice de qué color es Atlas y qué hace antes de
   abrirla.

   Todo es geometría con distancia con signo (aro, rombo, baldosa) muestreada
   con supermuestreo, así que cada tamaño se dibuja a SU tamaño y no se achica
   el de 256. Hasta 20 px la geometría se ajusta al píxel: el aro cae en un
   anillo entero y la aguja en columnas enteras, en vez de dos grises sucios.
   Los colores salen de tokens.css, así que un retint.mjs se arrastra con
   volver a correr esto.

   Sin dependencias; los encoders PNG/ICO son los de Moji/Mnemus/Galena.
   `npm run icons` regenera build/ y deja la hoja de control en .shots/icons.png.
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.mjs';
import { encodeICO } from './ico.mjs';
import { oklchToHex } from './oklch.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'build');

/* ── Color: los tokens de la app ─────────────────────────────────────────── */

const css = fs.readFileSync(path.join(ROOT, 'renderer/css/tokens.css'), 'utf8');
const num = (re, what) => {
  const m = css.match(re);
  if (!m) throw new Error(`tokens.css: no encontré ${what}`);
  return m.slice(1).map(Number);
};
const [HUE] = num(/--op-hue:\s*([\d.]+)/, '--op-hue');
const [TINT] = num(/--op-tint:\s*([\d.]+)/, '--op-tint');
const token = (name) => {
  const [L, C] = num(new RegExp(`--op-${name}:\\s*oklch\\(([\\d.]+)%\\s+calc\\(([\\d.]+)\\s*\\*\\s*var\\(--op-tint\\)\\)`), `--op-${name}`);
  const hex = oklchToHex(L / 100, C * TINT, HUE);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
};
const mix = (a, b, k) => a.map((v, i) => Math.round(v * (1 - k) + b[i] * k));

const BG = token('bg');
/* En Opal el plano del rail es un velo blanco sobre el fondo (--op-s1), no un
   color propio: la baldosa es ese velo ya resuelto. */
const [S1] = num(/--op-s1:\s*rgb\(255 255 255 \/ (\.\d+)\)/, '--op-s1');
const TILE = mix(BG, [255, 255, 255], S1);
const NORTH = num(/--op-accent-rgb:\s*(\d+)\s+(\d+)\s+(\d+)/, '--op-accent-rgb');
const SOUTH = token('text-2');
const RING = NORTH;

/* ── La rosa de los vientos ──────────────────────────────────────────────── */

/* En fracción del lienzo. `r` es el radio MEDIO del aro, `sw` el trazo; la
   aguja mide desde el centro `len` hacia cada polo y `wid` de media anchura.
   Misma proporción que la marca: aguja al 88 % del radio interior, media
   anchura al 36 %. */
function glyph(size) {
  if (size <= 20) {
    /* Grilla del lienzo, ajustada al píxel. A 16: aro de radio 5 centrado en
       la costura entre píxeles, trazo 1.25 (ver icon-style de Moji); aguja
       en tres columnas enteras. */
    const px = 1 / size;
    return { r: 5 * px, sw: 1.25 * px, len: 3.5 * px, wid: 1.25 * px };
  }
  const frac = size >= 48 ? 0.62 : 0.68;        // diámetro exterior sobre el lienzo
  const sw = (size >= 48 ? 0.072 : 0.085);      // trazo del aro sobre el lienzo
  const r = frac / 2 - sw / 2;
  const ri = r - sw / 2;
  return { r, sw, len: ri * 0.88, wid: ri * 0.36 };
}

const TILE_R = 0.19;   // radio de la baldosa sobre el lado

/** Distancia con signo a la baldosa redondeada a sangre sobre [0,1]². */
function sdTile(u, v) {
  const qx = Math.abs(u - 0.5) - (0.5 - TILE_R);
  const qy = Math.abs(v - 0.5) - (0.5 - TILE_R);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - TILE_R;
}

/** ¿(u,v) cae en el aro? */
const inRing = (g, u, v) => Math.abs(Math.hypot(u - 0.5, v - 0.5) - g.r) <= g.sw / 2;

/** ¿(u,v) cae en la aguja? Devuelve 'n', 's' o null. El rombo es |x|/wid + |y|/len ≤ 1. */
function inNeedle(g, u, v) {
  const x = u - 0.5; const y = v - 0.5;
  if (Math.abs(x) / g.wid + Math.abs(y) / g.len > 1) return null;
  return y < 0 ? 'n' : 's';
}

function render(size) {
  const g = glyph(size);
  const N = size <= 64 ? 8 : 5;               // submuestras por lado
  const out = new Uint8Array(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let tile = 0; let ring = 0; let north = 0; let south = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const u = (px + (sx + 0.5) / N) / size;
          const v = (py + (sy + 0.5) / N) / size;
          if (sdTile(u, v) > 0) continue;
          tile++;
          if (inRing(g, u, v)) { ring++; continue; }
          const n = inNeedle(g, u, v);
          if (n === 'n') north++; else if (n === 's') south++;
        }
      }
      if (!tile) continue;
      const kr = ring / tile; const kn = north / tile; const ks = south / tile;
      const o = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) {
        out[o + c] = Math.round(TILE[c] * (1 - kr - kn - ks) + RING[c] * kr + NORTH[c] * kn + SOUTH[c] * ks);
      }
      out[o + 3] = Math.round((tile / (N * N)) * 255);
    }
  }
  return out;
}

/* ── Hornear ─────────────────────────────────────────────────────────────── */

const ICO_SIZES = [256, 128, 64, 48, 40, 32, 24, 20, 16];
const images = new Map(ICO_SIZES.map((size) => [size, render(size)]));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.ico'), encodeICO(ICO_SIZES.map((size) => ({ size, data: images.get(size) }))));
fs.writeFileSync(path.join(OUT, 'icon.png'), encodePNG(256, 256, images.get(256)));

/* ── Hoja de control: cada tamaño a 1:1 y los chicos ampliados por vecino más
   cercano, sobre la barra de tareas oscura y la clara de Windows 11. ─────── */

function sheet() {
  const GAP = 16;
  const cells = [...ICO_SIZES.map((s) => ({ s, zoom: 1 })), { s: 16, zoom: 10 }, { s: 24, zoom: 8 }, { s: 32, zoom: 6 }];
  const W = cells.reduce((w, c) => w + c.s * c.zoom + GAP, GAP);
  const rowH = 256 + GAP * 2;
  const px = new Uint8Array(W * rowH * 2 * 4);
  [[32, 32, 32], [243, 243, 243]].forEach((bg, row) => {
    for (let y = row * rowH; y < (row + 1) * rowH; y++) {
      for (let x = 0; x < W; x++) px.set([...bg, 255], (y * W + x) * 4);
    }
    let x0 = GAP;
    for (const { s, zoom } of cells) {
      const img = images.get(s); const side = s * zoom;
      const y0 = (row * rowH + GAP + (256 - side) / 2) | 0;
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          const i = (((y / zoom) | 0) * s + ((x / zoom) | 0)) * 4; const a = img[i + 3] / 255;
          const o = ((y0 + y) * W + x0 + x) * 4;
          for (let c = 0; c < 3; c++) px[o + c] = Math.round(px[o + c] * (1 - a) + img[i + c] * a);
        }
      }
      x0 += side + GAP;
    }
  });
  return encodePNG(W, rowH * 2, px);
}

fs.mkdirSync(path.join(ROOT, '.shots'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.shots/icons.png'), sheet());

const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1);
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
console.log(`baldosa ${hex(TILE)} · aro ${hex(RING)} · norte ${hex(NORTH)} · sur ${hex(SOUTH)} (hue ${HUE}, tint ${TINT})`);
console.log(`icon.ico  ${kb('icon.ico')} kB  (${ICO_SIZES.join(', ')})`);
console.log(`icon.png  ${kb('icon.png')} kB`);
console.log('control: .shots/icons.png');
