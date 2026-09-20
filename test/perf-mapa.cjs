'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — rendimiento del mapa
   Mide el costo de redibujar el mapa con los datos reales, sin escanear:
   tormenta de redibujos por ResizeObserver (1 px de ancho por tick) a la
   cadencia del escaneo, y se cuentan los frames largos (> 20 ms en una
   pantalla de 75 Hz, 13,3 ms por frame). Diagnóstico, no test: los números
   dependen de la máquina.

   Referencia (20 sep 2026, 74 proyectos, 628 nodos):
     · transiciones CSS de left/top/width/height: p50 26,6 ms → 37 fps
     · FLIP con transform (lo actual):            p50 13,4 ms → 75 fps,
       con un pico de 30-60 ms en cada redibujo (recalcStyle, ver perf-traza)

     electron test/perf-mapa.cjs
   ═══════════════════════════════════════════════════════════════════════════ */

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// Datos reales copiados a un temporal, con el escaneo al abrir apagado.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-perf-'));
fs.copyFileSync(path.join(ROOT, 'data', 'escaneo.json'), path.join(tmp, 'escaneo.json'));
const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'settings.json'), 'utf8'));
st.escanearAlAbrir = false;
fs.writeFileSync(path.join(tmp, 'settings.json'), JSON.stringify(st));
process.env.ATLAS_DATA = tmp;

const ipc = require('../src/ipc.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Cada variante inyecta un CSS que apaga un sospechoso. "sin viajes" no se
   puede apagar por CSS (son animaciones WAAPI): es la referencia a ojo. */
const VARIANTES = [
  ['base', ''],
  ['sin blur', '.at-disco{backdrop-filter:none!important}'],
  ['discos snap', '.at-disco{transition:none!important}'],
  ['sin sombras', '.at-disco,.at-celda{box-shadow:none!important}'],
];

app.whenReady().then(async () => {
  ipc.register();
  const win = new BrowserWindow({
    width: 1380, height: 860, frame: false, show: true, backgroundColor: '#0a0a0a',
    webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  const js = (code) => Promise.race([win.webContents.executeJavaScript(code, true), wait(12000).then(() => 'TIMEOUT')]);
  win.webContents.on('console-message', (e) => { if (e.level >= 2) console.log('  consola:', e.message); });
  await wait(2500);

  console.log('nodos en el mapa:', await js(`document.getElementById('mapa').querySelectorAll('*').length`));

  for (const [nombre, css] of VARIANTES) {
    await js(`(() => { let s = document.getElementById('perf-css'); if (!s) { s = document.createElement('style'); s.id = 'perf-css'; document.head.appendChild(s); } s.textContent = ${JSON.stringify(css)}; })()`);
    await wait(600);
    let r;
    for (let pasada = 0; pasada < 2; pasada++) r = await js(`new Promise((res) => { try {
      const main = document.querySelector('.op-viewbody__main');
      const deltas = []; let last = performance.now(); let vivo = true;
      const loop = (t) => { deltas.push(t - last); last = t; if (vivo) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      // 12 redibujos por segundo durante 3 s: la cadencia del escaneo.
      let i = 0;
      const tick = setInterval(() => { main.style.paddingRight = (i++ % 2) + 'px'; }, 83);
      setTimeout(() => {
        clearInterval(tick); main.style.paddingRight = '';
        setTimeout(() => {
          vivo = false;
          const d = deltas.slice(5).sort((a, b) => a - b);
          const p = (q) => d[Math.floor(d.length * q)].toFixed(1);
          res({ frames: d.length, p50: p(.5), p95: p(.95), max: d[d.length - 1].toFixed(1), largos: d.filter((x) => x > 20).length });
        }, 500);
      }, 3000);
    } catch (e) { res('ERR ' + e.message); } })`);
    console.log(nombre.padEnd(18), JSON.stringify(r));
  }
  // Una foto a mitad del viaje: el texto tiene que verse sin estirar.
  await js(`document.getElementById('perf-css').textContent = ''; document.querySelector('.op-viewbody__main').style.paddingRight = '360px'; true`);
  await wait(140);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ROOT, 'capturas', 'perf-mitad-viaje.png'), img.toPNG());
  console.log('foto: capturas/perf-mitad-viaje.png');
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(0);
});
