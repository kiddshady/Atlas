'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — el escaneo, orquestado
   Junta las piezas de escaner.cjs en una corrida que EMITE a medida que
   avanza, en vez de devolver todo al final. Un escaneo frío de dos discos
   tarda medio minuto, y una app que se queda muda medio minuto parece rota:
   el mapa tiene que irse llenando.

   Orden de los eventos, pensado para que la UI tenga algo útil lo antes posible:

     inicio    { proyectos }   la lista pelada: nombre, ruta, disco. Instantáneo.
     proyecto  { proyecto }    package + git + instalada + veredicto. Barato,
                               sale en el primer segundo.
     tamano    { id, tam }     el recorrido del árbol. Es lo lento, y llega
                               proyecto por proyecto desde un pool de workers.
     fin       { proyectos, duracion }

   Todo lo que emite es serializable: cruza el IPC tal cual.
   ═══════════════════════════════════════════════════════════════════════════ */

const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');
const E = require('./escaner.cjs');

const WORKER = path.join(__dirname, 'medidor-worker.cjs');

/** Un pool de hilos que mide de a un proyecto por hilo. */
function crearPool(n) {
  const libres = [];
  const todos = [];
  const cola = [];
  let cerrado = false;

  for (let i = 0; i < n; i++) {
    const w = new Worker(WORKER);
    todos.push(w);
    libres.push(w);
  }

  function despachar() {
    while (libres.length && cola.length) {
      const w = libres.pop();
      const { tarea, resolve, reject } = cola.shift();
      const onMsg = (m) => { limpiar(); libres.push(w); resolve(m); despachar(); };
      const onErr = (err) => { limpiar(); libres.push(w); reject(err); despachar(); };
      const limpiar = () => { w.off('message', onMsg); w.off('error', onErr); };
      w.on('message', onMsg);
      w.on('error', onErr);
      w.postMessage(tarea);
    }
  }

  return {
    medir: (tarea) => new Promise((resolve, reject) => {
      if (cerrado) return reject(new Error('escaneo cancelado'));
      cola.push({ tarea, resolve, reject });
      despachar();
    }),
    cerrar: async () => {
      cerrado = true;
      cola.splice(0).forEach((t) => t.reject(new Error('escaneo cancelado')));
      await Promise.all(todos.map((w) => w.terminate()));
    },
  };
}

/**
 * Corre un escaneo completo.
 *   const corrida = escanear(['C:\\tools', 'S:\\tools'], { emitir: (ev, data) => {} });
 *   await corrida.listo;      // resuelve con la lista final
 *   corrida.cancelar();       // mata los workers y corta lo que falte
 */
function escanear(raices, { excluir = [], hilos = Math.max(2, Math.min(4, os.cpus().length - 1)), emitir = () => {} } = {}) {
  const t0 = Date.now();
  const pool = crearPool(hilos);
  let cancelado = false;

  const listo = (async () => {
    const base = await E.listarProyectos(raices, { excluir });
    emitir('inicio', { proyectos: base });

    const instaladas = await E.leerInstaladas();
    const porId = new Map();

    // Lo barato primero y en paralelo acotado: git abre dos procesos por repo.
    const describir = E.enLotes(base, 6, async (b) => {
      if (cancelado) return null;
      const p = await E.describir(b, instaladas);
      const previo = porId.get(p.id);
      if (previo?.tam) p.tam = previo.tam;   // el tamaño puede haber llegado antes
      porId.set(p.id, p);
      emitir('proyecto', { proyecto: p });
      return p;
    });

    // Los tamaños salen del pool, cada uno apenas termina. Los proyectos más
    // grandes suelen ser los últimos: no hay forma de saberlo antes de medir.
    const medir = Promise.all(base.map(async (b) => {
      if (cancelado) return;
      try {
        const { tam, error } = await pool.medir({ id: b.id, ruta: b.ruta });
        if (cancelado) return;
        const p = porId.get(b.id);
        if (p) p.tam = tam;
        else porId.set(b.id, { ...b, tam });   // llegó antes que su descripción
        emitir('tamano', { id: b.id, tam, error });
      } catch (err) {
        if (!cancelado) emitir('tamano', { id: b.id, tam: null, error: err.message });
      }
    }));

    await Promise.all([describir, medir]);
    await pool.cerrar();

    const proyectos = base.map((b) => porId.get(b.id)).filter(Boolean)
      .map((p) => ({ ...p, escaneadoEn: Date.now() }));
    emitir('fin', { proyectos, duracion: Date.now() - t0, cancelado });
    return proyectos;
  })();

  return {
    listo,
    cancelar: () => { cancelado = true; return pool.cerrar(); },
  };
}

module.exports = { escanear, crearPool };
