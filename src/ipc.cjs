'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — puente IPC
   El renderer no tiene fs, ni require, ni red: `contextIsolation` está activo.
   Todo lo que necesite del sistema pasa por acá, y acá se decide qué se puede
   pedir. Es la superficie de ataque de la app: todo lo que agregues es una
   puerta más.

   Convención: cada handler devuelve {ok:true, data} o {ok:false, error}. El
   preload la desenvuelve y convierte el error en una excepción real, así el
   renderer escribe try/catch normal en vez de chequear banderas.

   Lo propio de Atlas: el escaneo no devuelve, EMITE. El renderer lo dispara
   con `atlas:escanear` y va recibiendo `atlas:evento` hasta el `fin`. Un solo
   escaneo a la vez: pedir otro mientras corre cancela el anterior.
   ═══════════════════════════════════════════════════════════════════════════ */

const { ipcMain, app, shell, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const actualizador = require('./actualizador.cjs');
const path = require('path');
const store = require('./store.cjs');
const { escanear } = require('./escaneo.cjs');

/* Las colecciones que el renderer puede tocar. Atlas no guarda ítems del
   usuario: el escaneo va en un documento suelto. La lista queda vacía a
   propósito, y así cualquier `col:*` falla en vez de crear carpetas sueltas. */
const COLLECTIONS = [];

function coll(name) {
  if (!COLLECTIONS.includes(name)) throw new Error(`colección no permitida: ${name}`);
  return store.collection(name);
}

function ventana() { return BrowserWindow.getAllWindows()[0] || null; }

/** Envuelve un handler para que un throw viaje como error y no como crash. */
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      console.error(`[ipc] ${channel}:`, err);
      return { ok: false, error: err?.message || String(err) };
    }
  });
}

/* ── El escaneo ──────────────────────────────────────────────────────────────
   El último escaneo completo se guarda en `escaneo.json`: al abrir, la app
   muestra eso al instante y recién después mide de nuevo. Sin la copia, cada
   arranque arrancaría con el mapa vacío medio minuto. */
const ultimo = store.doc('escaneo', null);
let corrida = null;

async function arrancarEscaneo() {
  if (corrida) await corrida.cancelar().catch(() => {});
  const cfg = await store.loadSettings();
  const win = ventana();
  const emitir = (tipo, data) => {
    if (win && !win.isDestroyed()) win.webContents.send('atlas:evento', { tipo, ...data });
  };
  const propia = escanear(cfg.raices, { excluir: cfg.excluir, emitir });
  corrida = propia;
  propia.listo
    .then((proyectos) => {
      if (corrida !== propia) return;   // lo reemplazó otro escaneo: el suyo manda
      corrida = null;
      return ultimo.write({ en: Date.now(), raices: cfg.raices, proyectos });
    })
    .catch((err) => {
      if (corrida === propia) corrida = null;
      console.error('[escaneo]', err);
      emitir('error', { error: err?.message || String(err) });
    });
  return true;
}

/** Una ruta que llega del renderer solo puede ser algo que el escaneo listó. */
async function rutaConocida(ruta) {
  const r = String(ruta || '');
  const cfg = await store.loadSettings();
  const dentro = cfg.raices.some((raiz) => {
    const rel = path.relative(raiz, r);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  });
  if (!dentro || !fs.existsSync(r)) throw new Error(`ruta fuera de las raíces: ${r}`);
  return r;
}

function register() {
  handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    dataDir: store.ROOT,
    electron: process.versions.electron,
  }));

  /* ── Actualizaciones: el renderer pide, el main contesta con el estado
     entero; los cambios espontáneos (progreso, error) llegan por
     'update:cambio' (ver actualizador.cjs). ── */
  handle('update:estado', () => actualizador.leer());
  handle('update:buscar', (opts) => actualizador.buscar(opts));
  handle('update:descargar', () => actualizador.descargar());
  handle('update:instalar', () => actualizador.instalar());

  handle('settings:get', () => store.loadSettings());
  handle('settings:save', (patch) => store.saveSettings(patch));

  handle('doc:read', (name, fallback = null) => store.doc(name, fallback).read());
  handle('doc:write', (name, data) => store.doc(name).write(data).then(() => true));

  handle('col:list', (name) => coll(name).list());
  handle('col:get', (name, id) => coll(name).get(id));
  handle('col:save', (name, item) => coll(name).save(item));
  handle('col:remove', (name, id) => coll(name).remove(id).then(() => true));
  handle('col:next-id', (name, prefix) => coll(name).nextId(prefix));

  /* ── Atlas ── */
  handle('atlas:ultimo', () => ultimo.read());
  handle('atlas:escanear', arrancarEscaneo);
  handle('atlas:cancelar', async () => {
    if (corrida) { await corrida.cancelar(); corrida = null; }
    return true;
  });
  handle('atlas:escaneando', () => !!corrida);

  /* Abrir cosas afuera. La ruta se valida contra las raíces: el renderer no
     puede mandar a abrir cualquier carpeta del disco. */
  handle('atlas:abrir-carpeta', async (ruta) => shell.openPath(await rutaConocida(ruta)).then((e) => { if (e) throw new Error(e); return true; }));
  handle('atlas:mostrar-exe', async (exe) => {
    const r = String(exe || '');
    if (!fs.existsSync(r)) throw new Error('el ejecutable ya no está');
    shell.showItemInFolder(r);
    return true;
  });
  handle('atlas:abrir-url', (url) => {
    if (!/^https:\/\/github\.com\//i.test(String(url))) throw new Error('solo se abren repos de GitHub');
    return shell.openExternal(String(url)).then(() => true);
  });

  /** Elegir una carpeta nueva como raíz. Devuelve null si canceló. */
  handle('atlas:elegir-carpeta', async () => {
    const res = await dialog.showOpenDialog(ventana(), { properties: ['openDirectory'], title: 'Elegir una raíz de proyectos' });
    return res.canceled ? null : res.filePaths[0];
  });
}

module.exports = { register, COLLECTIONS };
