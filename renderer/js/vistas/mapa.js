/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — vista Mapa
   El treemap. Cada disco es una hoja de vidrio sobre la niebla; adentro, cada
   proyecto es una hoja de luz y, adentro de esa, sus capas. La geometría la
   da treemap.js; acá se concilia con el DOM: las celdas que ya existen se
   MUEVEN a su lugar nuevo (transición), las nuevas afloran, las que se van
   salen animadas. Repintar todo en cada evento del escaneo haría que el mapa
   parpadee cuarenta veces por minuto.
   ═══════════════════════════════════════════════════════════════════════════ */

import Router from '../router.js';
import { paint, head, esc, empty } from '../ui.js';
import { Icons } from '../icons.js';
import { exit, raf2, bindSwitcher } from '../motion.js';
import { fmtBytes, plural } from '../format.js';
import { S, lista, suscribir, seleccionar, medidaDe, guardarAjustes, totalBytes } from '../estado.js';
import { nivelar } from '../treemap.js';
import { leyenda } from './comunes.js';
import { inspectorHTML, repintarInspector, repintarInspectorSuave } from './inspector.js';

const MEDIDAS = [
  { id: 'total', label: 'Total' },
  { id: 'codigo', label: 'Código' },
];

export function viewMapa() {
  const n = S.proyectos.size;
  paint(head({
    title: 'Mapa',
    sub: n ? `${plural(n, 'proyecto', 'proyectos')} · ${fmtBytes(totalBytes())} en disco` : 'Las raíces todavía no se escanearon',
    actions: `${leyenda()}<div class="op-segmented" id="medida" style="width:150px;margin-left:12px">
      ${MEDIDAS.map((m) => `<button class="op-segmented__opt${S.medida === m.id ? ' is-active' : ''}" data-value="${m.id}">${m.label}</button>`).join('')}
    </div>`,
  }) + `
    <div class="op-viewbody">
      <div class="op-viewbody__main op-viewbody__main--bleed">
        <div class="at-mapa" id="mapa"></div>
      </div>
      ${inspectorHTML()}
    </div>`);

  const mapa = document.getElementById('mapa');
  const discos = new Map();   // letra → elemento
  const celdas = new Map();   // id → elemento

  /* Coalescer: los eventos del escaneo llegan de a varios por segundo y el
     ResizeObserver dispara en cada píxel de un arrastre. Un solo dibujo por frame. */
  let pedido = false;
  const pedirDibujo = () => {
    if (pedido) return;
    pedido = true;
    requestAnimationFrame(() => { pedido = false; dibujar(); });
  };

  function dibujar() {
    if (!mapa.isConnected) return;
    const rect = { x: 0, y: 0, w: mapa.clientWidth, h: mapa.clientHeight };
    const todos = lista();
    // Midiendo solo el código, la celda ENTERA es código: los estratos sobran.
    const { discos: layout } = nivelar(todos, rect, { valor: (p) => medidaDe(p), conCapas: S.medida === 'total' });

    // Sin nada medible: o no hay escaneo, o todavía no llegó ningún tamaño.
    const vacio = mapa.querySelector('.at-mapa__vacio');
    if (!layout.length) {
      if (!vacio) {
        const div = document.createElement('div');
        div.className = 'at-mapa__vacio op-in-fade';
        div.innerHTML = S.escaneando
          ? `<div class="op-empty">${Icons.svg('scan', 'op-spinning')}<div class="op-empty__title">Midiendo</div><div class="op-empty__text">Las celdas van a ir apareciendo a medida que cada carpeta termine de contarse.</div></div>`
          : `<div class="op-empty">${Icons.svg('map')}<div class="op-empty__title">Todavía no hay mapa</div><div class="op-empty__text">Escaneá las raíces para ver cuánto ocupa cada proyecto y en qué disco vive.</div>
             <div class="op-row" style="margin-top:6px"><button class="op-btn op-btn--secondary op-flashable" data-action="escanear"><i data-icon="scan"></i> Escanear ahora</button></div></div>`;
        mapa.appendChild(div);
        Icons.mount(div);
      }
      return;
    }
    if (vacio) exit(vacio);

    const vivosDisco = new Set();
    const vivosCelda = new Set();

    for (const d of layout) {
      vivosDisco.add(d.disco);
      let el = discos.get(d.disco);
      if (!el) {
        el = document.createElement('div');
        el.className = 'at-disco op-in-fade';
        el.dataset.disco = d.disco;
        el.innerHTML = `<div class="at-disco__label">${Icons.svg('disk')}<span>Disco ${esc(d.disco)}</span><span class="op-num"></span></div>`;
        mapa.appendChild(el);
        discos.set(d.disco, el);
      }
      poner(el, d);
      el.querySelector('.at-disco__label .op-num').textContent = fmtBytes(d.value);

      for (const p of d.proyectos) {
        vivosCelda.add(p.id);
        let c = celdas.get(p.id);
        const nueva = !c;
        if (nueva) {
          c = document.createElement('div');
          c.className = 'at-celda is-nueva';
          c.dataset.id = p.id;
          c.setAttribute('role', 'button');
          c.tabIndex = 0;
          c.innerHTML = `<div class="at-celda__capas"></div>
            <div class="at-celda__label"><span class="at-celda__nombre"></span><span class="at-celda__tam"></span></div>
            <span class="at-celda__punto"></span>`;
          el.appendChild(c);
          celdas.set(p.id, c);
        }
        // La celda es hija del disco: sus coordenadas van relativas a él.
        poner(c, { x: p.x - d.x, y: p.y - d.y, w: p.w, h: p.h });
        c.dataset.estado = p.estado || 'no-aplica';
        c.classList.toggle('is-selected', S.seleccion === p.id);
        c.classList.toggle('is-chica', p.h < 38 || p.w < 70);
        c.classList.toggle('is-minima', p.h < 20 || p.w < 44);
        c.querySelector('.at-celda__nombre').textContent = p.nombre;
        c.querySelector('.at-celda__tam').textContent = fmtBytes(p.value);
        c.dataset.tip = `${p.nombre} · ${fmtBytes(p.value)}${p.estado === 'desfasada' ? ' · instalada vieja' : ''}`;

        // Las capas, relativas a la celda.
        const zona = c.querySelector('.at-celda__capas');
        const vivas = new Set();
        for (const k of p.capas) {
          vivas.add(k.capa);
          let s = zona.querySelector(`[data-capa="${k.capa}"]`);
          if (!s) {
            s = document.createElement('span');
            s.className = 'at-capa';
            s.dataset.capa = k.capa;
            zona.appendChild(s);
          }
          poner(s, { x: k.x - p.x, y: k.y - p.y, w: k.w, h: k.h });
        }
        zona.querySelectorAll('.at-capa').forEach((s) => { if (!vivas.has(s.dataset.capa)) s.remove(); });

        if (nueva) raf2(() => c.classList.remove('is-nueva'));
      }
    }

    for (const [id, c] of celdas) if (!vivosCelda.has(id)) { celdas.delete(id); exit(c); }
    for (const [k, el] of discos) if (!vivosDisco.has(k)) { discos.delete(k); exit(el); }
  }

  function poner(el, r) {
    el.style.left = `${r.x}px`;
    el.style.top = `${r.y}px`;
    el.style.width = `${Math.max(0, r.w)}px`;
    el.style.height = `${Math.max(0, r.h)}px`;
  }

  function marcarSeleccion() {
    for (const [id, c] of celdas) c.classList.toggle('is-selected', S.seleccion === id);
  }

  /* Interacción: click selecciona, doble click abre la carpeta, click en el
     fondo del disco deselecciona. Enter sobre una celda enfocada también abre. */
  mapa.addEventListener('click', (e) => {
    const celda = e.target.closest('.at-celda');
    if (celda) { seleccionar(celda.dataset.id); return; }
    if (e.target.closest('.at-disco') || e.target === mapa) seleccionar(null);
  });
  mapa.addEventListener('dblclick', (e) => {
    const celda = e.target.closest('.at-celda');
    if (celda) document.dispatchEvent(new CustomEvent('atlas:abrir', { detail: celda.dataset.id }));
  });
  mapa.addEventListener('keydown', (e) => {
    const celda = e.target.closest?.('.at-celda');
    if (!celda) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleccionar(celda.dataset.id); }
  });

  bindSwitcher(document.getElementById('medida'), async (value) => {
    await guardarAjustes({ medida: value });
    pedirDibujo();
  });

  const ro = new ResizeObserver(pedirDibujo);
  ro.observe(mapa);
  Router.onLeave(() => ro.disconnect());

  Router.onLeave(suscribir((que, id) => {
    if (que === 'seleccion') { marcarSeleccion(); repintarInspector({ fundido: true }); return; }
    if (que === 'inicio' || que === 'tamano' || que === 'proyecto' || que === 'fin') {
      pedirDibujo();
      // El inspector muestra datos: se actualiza si cambió lo que tiene a la
      // vista (el proyecto seleccionado) o si muestra el resumen de todo.
      const afecta = !S.seleccion || id === S.seleccion || que === 'fin' || que === 'inicio';
      if (afecta) (que === 'fin' ? repintarInspector() : repintarInspectorSuave());
      const sub = document.querySelector('.op-viewhead__sub');
      if (sub && S.proyectos.size) sub.textContent = `${plural(S.proyectos.size, 'proyecto', 'proyectos')} · ${fmtBytes(totalBytes())} en disco`;
    }
  }));

  dibujar();
}
