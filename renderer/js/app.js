/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — arranque
   Cablea el shell, define las vistas, y se suscribe al escaneo para que la
   statusbar y el rail cuenten lo que va llegando. Las vistas viven en
   vistas/; el estado en estado.js.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from './icons.js';
import './iconos-atlas.js';
import { Tooltip, Toast, FieldMenu } from './overlays.js';
import Router from './router.js';
import { initClickFlash, initScrollFades, raf2, tick, roll, swap, swapText } from './motion.js';
import { paint, head, empty, esc, attempt, copy, colorToken, viewEl } from './ui.js';
import { fmtBytes, relTime, plural } from './format.js';
import { designHTML, wireDesign } from './design-view.js';
import {
  S, cargar, suscribir, proyecto, seleccionar, escanear, cancelarEscaneo,
  escucharEscaneo, totalBytes, desfasadas,
} from './estado.js';
import { viewMapa } from './vistas/mapa.js';
import { viewLista } from './vistas/lista.js';
import { viewAjustes } from './vistas/ajustes.js';
import { wireUpdates } from './actualizaciones.js';

const api = window.opal;

/* ══ Vista: Piezas ═══════════════════════════════════════════════════════════ */

function viewPiezas() {
  paint(head({
    title: 'Piezas',
    sub: 'Todos los primitivos del sistema, vivos',
    actions: '<button class="op-btn op-btn--ghost op-flashable" id="replay"><i data-icon="retry"></i> Repetir entradas</button>',
  }) + designHTML());

  wireDesign(viewEl());
  document.getElementById('replay')?.addEventListener('click', () => {
    const body = document.getElementById('design-body');
    body.style.animation = 'none';
    void body.offsetWidth;
    body.style.animation = 'op-glide-in 420ms var(--op-ease) both';
  });
}

/* ══ Router ══════════════════════════════════════════════════════════════════ */

Router.define({
  mapa: { view: viewMapa },
  lista: { view: () => viewLista() },
  desfasadas: { view: () => viewLista({ soloViejas: true }) },
  piezas: { view: viewPiezas },
  ajustes: { view: viewAjustes },
}, document.getElementById('view'));

/* ══ Acciones ════════════════════════════════════════════════════════════════ */

async function abrirCarpeta(ruta) {
  await attempt(() => api.atlas.abrirCarpeta(ruta), { errorTitle: 'No se pudo abrir la carpeta' });
}

async function pedirEscaneo() {
  if (S.escaneando) {
    Toast.show({ title: 'Ya está escaneando', text: 'Esperá a que termine o cancelalo desde el rail.', icon: 'scan' });
    return;
  }
  await attempt(() => escanear(), { errorTitle: 'No se pudo escanear' });
}

/* ══ Shell ═══════════════════════════════════════════════════════════════════ */

function wireShell() {
  const w = api?.win;
  document.getElementById('win-min')?.addEventListener('click', () => w?.minimize());
  document.getElementById('win-close')?.addEventListener('click', () => w?.close());
  const maxBtn = document.getElementById('win-max');
  maxBtn?.addEventListener('click', () => w?.toggleMaximize());
  w?.onMaximized((isMax) => {
    maxBtn.classList.toggle('is-b', isMax);   // los dos íconos se cruzan (.op-iconswap)
    maxBtn.setAttribute('aria-label', isMax ? 'Restaurar' : 'Maximizar');
  });

  document.querySelectorAll('.op-navitem').forEach((b) =>
    b.addEventListener('click', () => Router.go(b.dataset.view)));

  const btnScan = document.getElementById('btn-scan');
  btnScan?.addEventListener('click', () => (S.escaneando ? cancelarEscaneo() : pedirEscaneo()));

  /* Delegación global: las vistas se repintan enteras, así que enganchar los
     handlers en cada repintado sería recablear todo cada vez. */
  document.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) Router.go(goto.dataset.goto, goto.dataset.param || null);

    const sel = e.target.closest('[data-select]');
    if (sel) seleccionar(sel.dataset.select);

    const cp = e.target.closest('[data-copy]');
    if (cp) copy(cp.dataset.copy);

    const act = e.target.closest('[data-action]');
    if (act) {
      const a = act.dataset.action;
      const arg = act.dataset.arg;
      if (a === 'escanear') pedirEscaneo();
      if (a === 'deseleccionar') seleccionar(null);
      if (a === 'abrir-carpeta') abrirCarpeta(arg);
      if (a === 'mostrar-exe') attempt(() => api.atlas.mostrarExe(arg), { errorTitle: 'No se encontró el ejecutable' });
      if (a === 'abrir-url') attempt(() => api.atlas.abrirUrl(arg), { errorTitle: 'No se pudo abrir' });
    }
  });

  // Doble click en una celda del mapa: abrir la carpeta.
  document.addEventListener('atlas:abrir', (e) => {
    const p = proyecto(e.detail);
    if (p) abrirCarpeta(p.ruta);
  });

  // Escape suelta la selección, salvo que haya un overlay que lo necesite.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('#op-layer > *') && S.seleccion) seleccionar(null);
  });
}

/* Un contador que corre desde lo que muestra ahora (roll, de Opal). La
   primera vez escribe sin correr: el primer llenado no es un cambio. */
function contar(id, valor, formato = (v) => String(Math.round(v))) {
  const el = document.getElementById(id);
  if (el) roll(el, valor, (v) => { el.textContent = formato(v); });
}

/** Todo lo que vive fuera de la vista: statusbar, contadores del rail, botón de escaneo.
    Se llama con cada evento del escaneo: lo que ya se ve se pone al día (corre o
    se releva), no se reescribe de golpe. */
function updateChrome() {
  const n = S.proyectos.size;
  contar('nav-count', n);
  contar('nav-stale', desfasadas().length);
  contar('stat-proyectos', n);
  const total = document.getElementById('stat-total');
  if (n) contar('stat-total', totalBytes(), fmtBytes);
  else { delete total.__roll; total.textContent = '—'; }

  const ultimo = document.querySelector('#stat-escaneo .op-statusbar__value');
  if (ultimo) swapText(ultimo, S.escaneando ? 'escaneando' : (S.escaneadoEn ? relTime(S.escaneadoEn) : 'sin escanear'));

  const prog = document.getElementById('stat-progreso');
  prog.dataset.state = S.escaneando ? 'running' : 'idle';
  const { hechos, total: de } = S.progreso;
  const texto = document.getElementById('stat-progreso-texto');
  // Un escaneo nuevo arranca de 0/N sin correr hacia atrás desde el anterior.
  // Al terminar, el texto se queda: el medidor se apaga con él adentro.
  if (S.escaneando && hechos === 0) delete texto.__roll;
  if (S.escaneando) roll(texto, { h: hechos, t: de }, (v) => { texto.textContent = `${Math.round(v.h)}/${Math.round(v.t)}`; });
  const fill = document.getElementById('stat-progreso-fill');
  // El que arranca de nuevo toma su 0 sin transición: si no, la barra llena
  // del escaneo anterior se desenrollaba hacia atrás mientras aparecía.
  if (S.escaneando && hechos === 0) fill.style.transition = 'none';
  fill.style.setProperty('--op-pct', `${de ? (hechos / de) * 100 : 0}%`);
  if (fill.style.transition) { void fill.offsetWidth; fill.style.transition = ''; }

  const btn = document.getElementById('btn-scan');
  if (btn) {
    btn.classList.add('op-swap--row');
    swap(btn, S.escaneando ? `${Icons.svg('scan', 'op-spinning')} Cancelar` : `${Icons.svg('scan')} Escanear`);
  }

  // Las raíces solo cambian desde Ajustes: reescribirlas en cada evento del
  // escaneo soltaba el tooltip de la que tenía el mouse encima.
  const foot = document.getElementById('rail-foot');
  const raices = `<div class="op-col" style="gap:2px;min-width:0">${(S.settings.raices || [])
    .map((r) => `<span class="op-meta op-truncate op-mono" data-tip="${esc(r)}">${esc(r)}</span>`).join('')}</div>`;
  if (foot.__html !== raices) { foot.innerHTML = raices; foot.__html = raices; }

  const ctx = document.getElementById('titlebar-context');
  const p = S.seleccion ? proyecto(S.seleccion) : null;
  ctx.classList.add('op-swap--row');
  swap(ctx, p ? `${Icons.svg('folder', 'op-icon--sm')}<span>${esc(p.nombre)}</span>` : '');
}

/* ══ Color de la ventana ═════════════════════════════════════════════════════
   --op-bg está en oklch y Electron solo entiende hex; colorToken() lo resuelve
   con un canvas (ver ui.js: con regex la app arrancaba verde). */
function syncWindowColor() {
  const hex = colorToken('--op-bg');
  if (hex) api?.win?.setBackground(hex);
}

/* Un archivo de datos ilegible se aparta (store.cjs) y la app arranca sin él.
   Sin este aviso, para la persona sus datos simplemente desaparecieron. */
async function tellAsides() {
  const list = await api.asides().catch(() => []);
  if (!list.length) return;
  const files = [...new Set(list.map((a) => a.file))];
  Toast.show({
    tone: 'error',
    duration: 0,
    title: files.length === 1 ? `${files[0]} estaba dañado` : `${files.join(', ')} estaban dañados`,
    text: `${files.length === 1 ? 'Quedó' : 'Quedaron'} aparte en la carpeta de datos, con «.corrupto-» en el nombre, y la app arrancó sin ${files.length === 1 ? 'él' : 'ellos'}.`,
  });
}

/* ══ Arranque ════════════════════════════════════════════════════════════════ */

async function boot() {
  Icons.mount(document);
  Tooltip.init();
  FieldMenu.init();           // el click derecho en un campo: cortar, copiar, pegar
  initClickFlash();
  initScrollFades();
  wireShell();
  syncWindowColor();

  try {
    await cargar();
  } catch (err) {
    paint(empty({ icon: 'alert', title: 'No se pudo iniciar', text: err.message }));
    console.error(err);
    return;
  }

  escucharEscaneo();
  wireUpdates();
  suscribir((que, extra) => {
    updateChrome();
    if (que === 'fin') {
      if (!extra?.cancelado) {
        const viejas = desfasadas().length;
        Toast.show({
          title: 'Escaneo listo',
          text: `${plural(S.proyectos.size, 'proyecto', 'proyectos')} · ${fmtBytes(totalBytes())}${viejas ? ` · ${plural(viejas, 'app vieja', 'apps viejas')}` : ''}`,
          icon: 'check',
        });
        tick(document.getElementById('stat-total'));
      }
    }
    if (que === 'error') Toast.error('El escaneo falló', String(extra || ''));
  });

  updateChrome();
  Router.onChange(updateChrome);
  Router.go('mapa');
  tellAsides();

  raf2(() => {
    const splash = document.getElementById('boot-splash');
    if (!splash) return;
    splash.style.opacity = '0';
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    setTimeout(() => splash.remove(), 600);
  });

  // El escaneo de arranque sale DESPUÉS de que haya algo pintado: la app
  // muestra el mapa anterior al instante y lo corrige a medida que mide.
  if (S.settings.escanearAlAbrir) setTimeout(() => pedirEscaneo(), 300);
}

boot();
