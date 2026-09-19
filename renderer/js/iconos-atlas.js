/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — íconos propios
   Los del dominio, sumados al set base de Opal con Icons.add(). Misma receta:
   grilla de 16, contenido entre 1.8 y 14.2, trazo 1.5 con puntas redondeadas,
   sin fill salvo para puntos macizos.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from './icons.js';

export const ICONOS_ATLAS = {
  /* La marca: una rosa de los vientos reducida a lo mínimo — el aro y la
     aguja. El aro es la piedra (mismo trazo que el cabujón de Opal, así el
     splash lo dibuja igual); la aguja es lo que Atlas hace: señalar. */
  atlas: '<path d="M8 2.4a5.6 5.6 0 1 1 0 11.2a5.6 5.6 0 1 1 0-11.2"/>'
       + '<path class="op-brand__trail" d="M8 3.9 9.5 8 8 12.1 6.5 8z"/>',

  /* Un mapa plegado en tres paños. */
  map: '<path d="M2.2 4.2 6 2.6l4 1.6 3.8-1.6v9.2L10 13.4 6 11.8l-3.8 1.6z"/><path d="M6 2.6v9.2M10 4.2v9.2"/>',

  /* Un disco: la caja con su luz de actividad. */
  disk: '<rect x="2" y="3.2" width="12" height="9.6" rx="1.6"/><path d="M2 9.4h12"/><circle cx="11.3" cy="11.4" r=".9" fill="currentColor" stroke="none"/>',

  /* Rama de git: dos nodos en línea y uno que se desprende. */
  branch: '<circle cx="4.6" cy="3.7" r="1.6"/><circle cx="4.6" cy="12.3" r="1.6"/><circle cx="11.4" cy="5.2" r="1.6"/><path d="M4.6 5.3v5.4M11.4 6.8c0 2.7-6.8 1.7-6.8 4"/>',

  /* Una caja: el paquete, lo que se instala. */
  box: '<path d="M8 2.2 13.6 5.1v5.8L8 13.8 2.4 10.9V5.1z"/><path d="M2.4 5.1 8 8l5.6-2.9M8 8v5.8"/>',

  /* El barrido de un radar: el escaneo. */
  scan: '<path d="M8 2.2a5.8 5.8 0 1 1-5.8 5.8"/><path d="M8 8l4.1-4.1"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/>',

  /* Código: los dos ángulos. */
  code: '<path d="M5.6 4.4 2.2 8l3.4 3.6M10.4 4.4 13.8 8l-3.4 3.6"/>',

  /* Tres capas: el tamaño partido. */
  strata: '<path d="M2.2 4.4h11.6M2.2 8h11.6M2.2 11.6h11.6"/><path d="M2.2 4.4v7.2M13.8 4.4v7.2" opacity=".45"/>',

  /* Un reloj de arena: lo que quedó atrás. */
  stale: '<path d="M4.2 2.2h7.6M4.2 13.8h7.6M5 2.2v2.1L8 8l3-3.7V2.2M5 13.8v-2.1L8 8l3 3.7v2.1"/>',
};

Icons.add(ICONOS_ATLAS);
