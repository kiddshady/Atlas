/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — vista Mapa
   El treemap. Cada disco es una hoja de vidrio sobre la niebla; adentro, cada
   proyecto es una hoja de luz y, adentro de esa, sus capas. La geometría la
   da treemap.js; acá se concilia con el DOM: las celdas que ya existen se
   MUEVEN a su lugar nuevo, las nuevas afloran, las que se van salen animadas.
   Repintar todo en cada evento del escaneo haría que el mapa parpadee
   cuarenta veces por minuto.

   ── Cómo se mueven: FLIP ───────────────────────────────────────────────────
   Las celdas y los estratos NO transicionan su geometría. Con 74 celdas y 300
   estratos animando left/top/width/height a la vez, el navegador relayouteaba
   el mapa entero en cada fotograma y el escaneo lo dejaba en 37 fps
   (test/perf-mapa.cjs: 26,6 ms por frame en una pantalla de 13,3). La
   geometría nueva se escribe de una, y el viaje se hace con `transform`, que
   corre en el compositor sin tocar el layout: la celda arranca con la
   transformación inversa —donde estaba, del tamaño que tenía— y la va
   soltando. Como escalar la celda escalaría el texto, el rótulo se
   contra-escala en los mismos fotogramas. Los discos son dos y siguen con
   transición CSS: no cuestan, y las celdas viajan en coordenadas del disco,
   así que su movimiento se suma sin contarse dos veces.

   ── Durante el escaneo: olas ───────────────────────────────────────────────
   Los tamaños llegan cada 50-300 ms y un viaje dura 420. Redibujando con cada
   uno, las celdas nunca llegaban: a mitad de camino salían para otro lado, y
   el mapa temblaba entero durante todo el escaneo. Ahora lo que llega se
   junta y el mapa se mueve de a olas, con una pausa entre una y otra en la
   que todo queda quieto. El orden pegajoso de treemap.js hace el resto: los
   casi iguales no se reacomodan entre ola y ola.
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

/* ── El viaje de una celda ─────────────────────────────────────────────────
   Duración y curva salen de los tokens (--op-t-4, --op-ease), así el mapa se
   mueve igual que el resto de la app. La curva se muestrea en PASOS
   fotogramas clave lineales: es lo que permite que el rótulo lleve en cada
   instante la escala exactamente inversa a la de su celda. Con dos
   animaciones con easing propio el producto no daría 1 y el texto ondularía. */

const PASOS = 30;

/** Resuelve una cubic-bezier CSS: x en [0,1] → y. */
function bezier(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a;
  const B = (a, b) => 3 * b - 6 * a;
  const C = (a) => 3 * a;
  const at = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const pend = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const p = pend(t, x1, x2);
      if (!p) break;
      t -= (at(t, x1, x2) - x) / p;
    }
    return at(t, y1, y2);
  };
}

function leerMovimiento() {
  const cs = getComputedStyle(document.documentElement);
  const dur = parseFloat(cs.getPropertyValue('--op-t-4')) || 420;
  const curva = cs.getPropertyValue('--op-ease').trim();
  const m = curva.match(/cubic-bezier\(([^)]+)\)/);
  const ease = m ? bezier(...m[1].split(',').map(Number)) : (x) => 1 - 2 ** (-10 * x);
  return {
    dur, ease,
    // Para el salto: la salida y la entrada del relevo (motion-timing §2).
    sale: parseFloat(cs.getPropertyValue('--op-t-2')) || 180,
    entra: parseFloat(cs.getPropertyValue('--op-t-3')) || 280,
    curvaSale: cs.getPropertyValue('--op-ease-both').trim() || 'ease-in-out',
    curvaEntra: curva || 'ease-out',
  };
}

/** Rectángulo visual de `el` (con transform), relativo al de su padre. */
function relativo(el, padre) {
  const r = el.getBoundingClientRect();
  return { x: r.left - padre.left, y: r.top - padre.top, w: r.width, h: r.height };
}

const viajes = new WeakMap();   // celda → su animación en curso

/* ── El salto ──────────────────────────────────────────────────────────────
   Cuando el orden cambia de verdad (un proyecto que creció o se achicó mucho,
   uno nuevo grande), hay celdas que cambian de punta del mapa. Viajando,
   cruzaban por encima de otras diez, se encimaban (las hojas son
   translúcidas: el cruce se veía como un manchón brillante) y el mapa entero
   parecía sacudirse. Esas no viajan: un calco se esfuma donde estaba la
   celda y la celda aflora en su lugar nuevo, las dos a la vez y sin
   corrimiento. Sin espera a propósito: cuando saltan veinte juntas, la espera
   del relevo destapaba medio disco y el mapa se apagaba un instante. La
   entrada en expo-out llega rápido y tapa mientras el calco baja parejo. Las
   que se corren poco siguen viajando: ahí el viaje cuenta qué pasó. */

/** ¿Se va demasiado lejos para viajar? Más que su propio tamaño. */
function salta(de, a) {
  if (!de) return false;
  const d = Math.hypot((de.x + de.w / 2) - (a.x + a.w / 2), (de.y + de.h / 2) - (a.y + a.h / 2));
  return d > Math.max(64, de.w, de.h, a.w, a.h);
}

/** Deja un calco de la celda en `de` que se esfuma. Se llama ANTES de moverla. */
function dejarCalco(c, de, { sale, curvaSale }) {
  const calco = c.cloneNode(true);
  calco.classList.add('at-celda--calco');
  calco.classList.remove('is-nueva');
  for (const a of ['data-id', 'role', 'tabindex', 'data-tip']) calco.removeAttribute(a);
  calco.style.left = `${de.x}px`;
  calco.style.top = `${de.y}px`;
  calco.style.width = `${de.w}px`;
  calco.style.height = `${de.h}px`;
  calco.style.transform = 'none';
  c.parentElement.appendChild(calco);
  const an = calco.animate({ opacity: [1, 0] }, { duration: sale, easing: curvaSale, fill: 'forwards' });
  // Plazo de red: una ventana tapada no avanza la animación (motion-timing §1).
  const fin = () => { clearTimeout(red); calco.remove(); };
  const red = setTimeout(fin, sale + 120);
  an.finished.then(fin, fin);
}

/** La celda aflora en su lugar nuevo mientras el calco se esfuma. */
function aflorar(c, { entra, curvaEntra }) {
  viajes.get(c)?.forEach((an) => an.cancel());
  const an = c.animate({ opacity: [0, 1] }, { duration: entra, easing: curvaEntra });
  viajes.set(c, [an]);
  // Una animación que no avanza (ventana tapada) dejaría la celda invisible
  // en su primer cuadro: el plazo de red la termina.
  setTimeout(() => { if (an.playState !== 'finished') an.finish(); }, entra + 120);
}

/** Anima la celda desde el rectángulo `de` (visual) hasta `a` (ya escrito). */
function viajar(c, de, a, { dur, ease }) {
  if (!de || a.w < 1 || a.h < 1 || de.w < 1 || de.h < 1) return;
  const dx = de.x - a.x; const dy = de.y - a.y;
  const sx = de.w / a.w; const sy = de.h / a.h;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.004 && Math.abs(sy - 1) < 0.004) return;

  const celda = []; const rotulo = [];
  for (let i = 0; i <= PASOS; i++) {
    const e = ease(i / PASOS);
    const kx = sx + (1 - sx) * e; const ky = sy + (1 - sy) * e;
    celda.push({ transform: `translate(${dx * (1 - e)}px, ${dy * (1 - e)}px) scale(${kx}, ${ky})` });
    rotulo.push({ transform: `scale(${1 / kx}, ${1 / ky})` });
  }
  /* Se cancela solo el viaje anterior, no `getAnimations()` entero: eso
     cortaría la transición de opacidad de una celda que todavía está
     aflorando y la haría aparecer de golpe. */
  viajes.get(c)?.forEach((an) => an.cancel());
  const anims = [c.animate(celda, { duration: dur, easing: 'linear' })];
  /* Una celda mínima no muestra el rótulo (display: none). Animarlo igual no
     se ve, pero Chromium no puede llevar al compositor una animación sobre
     algo que no tiene caja: la corre en el hilo principal, cuadro a cuadro.
     En el mapa de S: eran 48 de 74 y le sacaban un cuarto de los cuadros a
     cada viaje. */
  if (!c.classList.contains('is-minima')) anims.push(c.querySelector('.at-celda__label').animate(rotulo, { duration: dur, easing: 'linear' }));
  viajes.set(c, anims);
}

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
  const movimiento = leerMovimiento();
  let orden = null;   // el puesto de cada celda en el dibujo anterior (treemap.js)

  /* Coalescer: el ResizeObserver dispara en cada píxel de un arrastre. Un
     solo dibujo por frame. */
  let pedido = false;
  let ultimo = 0;
  const pedirDibujo = () => {
    if (pedido) return;
    pedido = true;
    requestAnimationFrame(() => { pedido = false; ultimo = performance.now(); dibujar(); });
  };

  /* Lo del escaneo va por olas: un dibujo deja viajar a las celdas (dur) y
     descansar otro tanto antes del siguiente. Lo que llega mientras tanto
     se junta en la ola que viene. */
  const OLA = movimiento.dur * 2;
  let ola = null;
  const pedirOla = () => {
    if (ola || pedido) return;
    const falta = OLA - (performance.now() - ultimo);
    if (falta <= 0) { pedirDibujo(); return; }
    ola = setTimeout(() => { ola = null; pedirDibujo(); }, falta);
  };
  Router.onLeave(() => clearTimeout(ola));

  function dibujar() {
    if (!mapa.isConnected) return;
    const rect = { x: 0, y: 0, w: mapa.clientWidth, h: mapa.clientHeight };
    const todos = lista();
    // Midiendo solo el código, la celda ENTERA es código: los estratos sobran.
    const nivel = nivelar(todos, rect, { valor: (p) => medidaDe(p), conCapas: S.medida === 'total', previo: orden });
    const layout = nivel.discos;
    orden = nivel.orden;

    /* Dónde está cada celda AHORA, en pantalla y con su viaje a medio hacer,
       relativa a su disco. Todas las lecturas van antes de la primera
       escritura: un solo layout, no uno por celda. */
    const previos = new Map();
    const cajas = new Map();
    for (const [id, c] of celdas) {
      const d = c.parentElement;
      if (!cajas.has(d)) cajas.set(d, d.getBoundingClientRect());
      previos.set(id, relativo(c, cajas.get(d)));
    }

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
        const destino = { x: p.x - d.x, y: p.y - d.y, w: p.w, h: p.h };
        const de = nueva ? null : previos.get(p.id);
        const salto = salta(de, destino);
        if (salto) dejarCalco(c, de, movimiento);
        poner(c, destino);
        c.classList.toggle('is-chica', p.h < 38 || p.w < 70);
        c.classList.toggle('is-minima', p.h < 20 || p.w < 44);
        if (salto) aflorar(c, movimiento);
        else if (!nueva) viajar(c, de, destino, movimiento);
        c.dataset.estado = p.estado || 'no-aplica';
        c.classList.toggle('is-selected', S.seleccion === p.id);
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
      pedirOla();
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
