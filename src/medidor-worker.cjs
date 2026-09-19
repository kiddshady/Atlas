'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — worker de tamaños
   Recorrer 300.000 archivos tarda decenas de segundos y el recorrido es
   bloqueante a propósito (ver escaner.cjs). Acá corre en un hilo aparte para
   que el proceso principal —y con él la ventana, los menús y el IPC— siga
   respondiendo mientras se cuenta.

   Protocolo: recibe {id, ruta}, contesta {id, tam}. Uno a la vez por hilo;
   el paralelismo lo pone el pool de escaneo.cjs.
   ═══════════════════════════════════════════════════════════════════════════ */

const { parentPort } = require('worker_threads');
const { medirProyecto } = require('./escaner.cjs');

parentPort.on('message', ({ id, ruta }) => {
  let tam = null;
  let error = null;
  try { tam = medirProyecto(ruta); } catch (err) { error = err?.message || String(err); }
  parentPort.postMessage({ id, tam, error });
});
