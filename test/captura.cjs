'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — capturas
   Monta la app de verdad (renderer + IPC reales, escaneo real) en una ventana
   VISIBLE y fotografía cada vista. Visible a propósito: capturePage sobre una
   ventana oculta devuelve un frame viejo, y la primera captura sale vacía —
   por eso cada foto se toma dos veces y se guarda la segunda.

     electron test/captura.cjs [carpeta-de-salida]
   ═══════════════════════════════════════════════════════════════════════════ */

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const ipc = require('../src/ipc.cjs');

const OUT = process.argv[2] || path.join(__dirname, '..', 'capturas');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  ipc.register();

  const win = new BrowserWindow({
    width: 1380, height: 860, frame: false, show: true, backgroundColor: '#0a0a0a',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  const errores = [];
  win.webContents.on('console-message', (e) => { if (e.level >= 2) errores.push(e.message); });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  const js = (code) => win.webContents.executeJavaScript(code, true);
  async function foto(nombre) {
    await win.webContents.capturePage();
    await wait(160);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `${nombre}.png`), img.toPNG());
    console.log('  foto', nombre);
  }

  await wait(2200);
  await foto('01-mapa-escaneando');

  // Esperar a que termine el escaneo (o 60 s).
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const txt = await js(`document.getElementById('stat-escaneo').textContent`);
    if (!/escaneando/.test(txt)) break;
    await wait(500);
  }
  await wait(800);
  await foto('02-mapa');

  await js(`(document.querySelector('.at-celda[data-estado="desfasada"]') || document.querySelector('.at-celda'))?.click()`);
  await wait(700);
  await foto('03-mapa-seleccion');

  await js(`document.querySelector('[data-view="lista"]').click()`);
  await wait(800);
  await foto('04-lista');
  console.log('  lista', await js(`(() => {
    const sc = document.getElementById('tabla-scroll'); const t = sc.querySelector('table');
    const td = t.querySelector('td.at-ver');
    return JSON.stringify({ contenedor: sc.clientWidth, tabla: t.scrollWidth, ws: td && getComputedStyle(td).whiteSpace, cols: t.querySelectorAll('th').length });
  })()`));

  await js(`document.getElementById('tabla-scroll').scrollTop = 320; true`);
  await wait(500);
  await foto('04b-lista-scrolleada');
  console.log('  sticky', await js(`(() => { const sc = document.getElementById('tabla-scroll'); const th = sc.querySelector('th');
    return JSON.stringify({ hueco: Math.round(th.getBoundingClientRect().top - sc.getBoundingClientRect().top) }); })()`));

  await js(`document.querySelector('[data-view="desfasadas"]').click()`);
  await wait(800);
  await foto('05-desfasadas');

  await js(`document.querySelector('[data-view="ajustes"]').click()`);
  await wait(800);
  await foto('06-ajustes');

  await js(`document.querySelector('[data-view="mapa"]').click()`);
  await wait(700);
  await js(`document.querySelector('#medida [data-value="codigo"]').click()`);
  await wait(900);
  await foto('07-mapa-codigo');
  await js(`document.querySelector('#medida [data-value="total"]').click()`);
  await wait(600);

  const medidas = await js(`(() => {
    const m = document.getElementById('mapa');
    const celdas = [...m.querySelectorAll('.at-celda')];
    const r = m.getBoundingClientRect();
    const fuera = celdas.filter((c) => { const b = c.getBoundingClientRect(); return b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1; }).length;
    const discos = [...m.querySelectorAll('.at-disco')].map((d) => getComputedStyle(d).backdropFilter);
    const celdasBlur = celdas.filter((c) => getComputedStyle(c).backdropFilter !== 'none').length;
    return { celdas: celdas.length, fuera, discos, celdasBlur, insp: !!document.getElementById('inspector') };
  })()`);
  console.log('  medidas', JSON.stringify(medidas));
  console.log(errores.length ? `  ERRORES:\n${errores.join('\n')}` : '  sin errores de consola');
  app.quit();
}).catch((err) => { console.error(err); app.exit(1); });
