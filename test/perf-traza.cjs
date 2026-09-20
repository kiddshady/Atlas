'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — traza del mapa
   Graba una traza de Chromium durante la misma tormenta de redibujos que
   perf-mapa.cjs y resume dónde se va el tiempo, por hilo y por evento. Es lo
   que dijo que el pico de cada redibujo es Document::recalcStyle (30-60 ms)
   y no layout (~1,5 ms) ni pintado. Diagnóstico, no test.
     electron test/perf-traza.cjs [css-extra]
   ═══════════════════════════════════════════════════════════════════════════ */

const { app, BrowserWindow, contentTracing } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-perf-'));
fs.copyFileSync(path.join(ROOT, 'data', 'escaneo.json'), path.join(tmp, 'escaneo.json'));
const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'settings.json'), 'utf8'));
st.escanearAlAbrir = false;
fs.writeFileSync(path.join(tmp, 'settings.json'), JSON.stringify(st));
process.env.ATLAS_DATA = tmp;

const ipc = require('../src/ipc.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CSS = process.argv[2] || '';

app.whenReady().then(async () => {
  ipc.register();
  const win = new BrowserWindow({
    width: 1380, height: 860, frame: false, show: true, backgroundColor: '#0a0a0a',
    webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  const js = (code) => win.webContents.executeJavaScript(code, true);
  await wait(2500);
  await js(`const s = document.createElement('style'); s.textContent = ${JSON.stringify(CSS)}; document.head.appendChild(s); true`);

  await contentTracing.startRecording({ included_categories: ['blink', 'blink.animations', 'cc', 'gpu', 'disabled-by-default-devtools.timeline', 'toplevel', 'renderer.scheduler'] });
  await js(`new Promise((res) => { const main = document.querySelector('.op-viewbody__main'); let i = 0;
    const t = setInterval(() => { main.style.paddingRight = (i++ % 2) + 'px'; }, 83);
    setTimeout(() => { clearInterval(t); main.style.paddingRight = ''; setTimeout(res, 300); }, 2500); })`);
  const file = await contentTracing.stopRecording();
  const traza = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ev = traza.traceEvents || traza;

  // Nombres de hilos.
  const hilos = new Map();
  for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') hilos.set(`${e.pid}:${e.tid}`, e.args.name);
  const porHilo = new Map();
  const detalle = {};
  for (const e of ev) {
    if (e.ph !== 'X' || !e.dur) continue;
    const h = hilos.get(`${e.pid}:${e.tid}`) || `${e.pid}:${e.tid}`;
    if (!porHilo.has(h)) porHilo.set(h, new Map());
    const m = porHilo.get(h);
    m.set(e.name, (m.get(e.name) || 0) + e.dur / 1000);
    if (h === 'CrRendererMain' && /recalcStyle|UpdateLayoutTree|LocalFrameView::UpdateStyleAndLayout$|PrePaint|Paint$|UpdateLayout$/.test(e.name)) {
      (detalle[e.name] ||= []).push(e.dur / 1000);
    }
  }
  const anim = new Map();
  for (const e of ev) if (/Animat|ompositor|Composited/.test(e.name) && e.ph !== 'M') anim.set(e.name, (anim.get(e.name) || 0) + 1);
  console.log('eventos de animación:', JSON.stringify(Object.fromEntries([...anim].sort((a, b) => b[1] - a[1]).slice(0, 25)), null, 0));
  for (const [n, v] of Object.entries(detalle)) {
    v.sort((a, b) => a - b);
    console.log(`${n}: n=${v.length} p50=${v[v.length >> 1].toFixed(1)} p90=${v[Math.floor(v.length * .9)].toFixed(1)} max=${v[v.length - 1].toFixed(1)} sum=${v.reduce((a, b) => a + b, 0).toFixed(0)}`);
  }
  for (const [h, m] of [...porHilo].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0)).slice(0, 4)) {
    const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 14);
    console.log(`\n── ${h}`);
    for (const [n, ms] of top) console.log(`  ${ms.toFixed(0).padStart(6)} ms  ${n}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(0);
});
