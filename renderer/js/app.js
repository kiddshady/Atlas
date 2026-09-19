/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — arranque
   Cablea el shell, define las vistas, y se suscribe al escaneo para que la
   statusbar y el rail cuenten lo que va llegando. Las vistas viven en
   vistas/; el estado en estado.js.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from './icons.js';
import './iconos-atlas.js';
import { Tooltip, Toast } from './overlays.js';
import Palette from './palette.js';
import Router from './router.js';
import { initClickFlash, initScrollFades, raf2, tick } from './motion.js';
import { paint, head, empty, esc, attempt, copy, colorToken, viewEl } from './ui.js';
import { fmtBytes, relTime, plural } from './format.js';
import { designHTML, wireDesign } from './design-view.js';
import {
  S, cargar, suscribir, lista, proyecto, seleccionar, escanear, cancelarEscaneo,
  escucharEscaneo, totalBytes, desfasadas,
} from './estado.js';
import { viewMapa } from './vistas/mapa.js';
import { viewLista } from './vistas/lista.js';
import { viewAjustes } from './vistas/ajustes.js';

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
    maxBtn.innerHTML = Icons.svg(isMax ? 'winRestore' : 'winMax');
    maxBtn.setAttribute('aria-label', isMax ? 'Restaurar' : 'Maximizar');
  });

  document.querySelectorAll('.op-navitem').forEach((b) =>
    b.addEventListener('click', () => Router.go(b.dataset.view)));

  document.getElementById('btn-palette')?.addEventListener('click', () => Palette.toggle());

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

/** Todo lo que vive fuera de la vista: statusbar, contadores del rail, botón de escaneo. */
function updateChrome() {
  const n = S.proyectos.size;
  document.getElementById('nav-count').textContent = n;
  document.getElementById('nav-stale').textContent = desfasadas().length;
  document.getElementById('stat-proyectos').textContent = n;
  document.getElementById('stat-total').textContent = n ? fmtBytes(totalBytes()) : '—';

  const ultimo = document.querySelector('#stat-escaneo .op-statusbar__value');
  if (ultimo) ultimo.textContent = S.escaneando ? 'escaneando' : (S.escaneadoEn ? relTime(S.escaneadoEn) : 'sin escanear');

  const prog = document.getElementById('stat-progreso');
  prog.dataset.state = S.escaneando ? 'running' : 'idle';
  const { hechos, total } = S.progreso;
  document.getElementById('stat-progreso-texto').textContent = S.escaneando ? `${hechos}/${total}` : '';
  document.getElementById('stat-progreso-fill').style.setProperty('--op-pct', `${total ? (hechos / total) * 100 : 0}%`);

  const btn = document.getElementById('btn-scan');
  if (btn) btn.innerHTML = S.escaneando
    ? `${Icons.svg('scan', 'op-spinning')} Cancelar`
    : `${Icons.svg('scan')} Escanear`;

  document.getElementById('rail-foot').innerHTML = `<div class="op-col" style="gap:2px;min-width:0">${(S.settings.raices || [])
    .map((r) => `<span class="op-meta op-truncate op-mono" data-tip="${esc(r)}">${esc(r)}</span>`).join('')}</div>`;

  const ctx = document.getElementById('titlebar-context');
  const p = S.seleccion ? proyecto(S.seleccion) : null;
  ctx.innerHTML = p ? `${Icons.svg('folder', 'op-icon--sm')}<span>${esc(p.nombre)}</span>` : '';
}

function registerCommands() {
  Palette.clear();
  Palette.register([
    { id: 'scan', group: 'Escaneo', icon: 'scan', label: 'Escanear las raíces', run: pedirEscaneo },
    { id: 'nav-mapa', group: 'Ir a', icon: 'map', label: 'Mapa', run: () => Router.go('mapa') },
    { id: 'nav-lista', group: 'Ir a', icon: 'list', label: 'Lista', run: () => Router.go('lista') },
    { id: 'nav-desfasadas', group: 'Ir a', icon: 'stale', label: 'Desfasadas', run: () => Router.go('desfasadas') },
    { id: 'nav-piezas', group: 'Ir a', icon: 'layers', label: 'Piezas', run: () => Router.go('piezas') },
    { id: 'nav-ajustes', group: 'Ir a', icon: 'settings', label: 'Ajustes', run: () => Router.go('ajustes') },
    ...lista().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => ({
      id: `p-${p.id}`, group: 'Proyecto', icon: p.tipo === 'electron' ? 'box' : 'folder', label: p.nombre,
      hint: p.tam ? fmtBytes(p.tam.total) : p.disco,
      run: () => { if (Router.name !== 'mapa' && Router.name !== 'lista' && Router.name !== 'desfasadas') Router.go('mapa'); seleccionar(p.id); },
    })),
  ]);
}

/* ══ Color de la ventana ═════════════════════════════════════════════════════
   --op-bg está en oklch y Electron solo entiende hex; colorToken() lo resuelve
   con un canvas (ver ui.js: con regex la app arrancaba verde). */
function syncWindowColor() {
  const hex = colorToken('--op-bg');
  if (hex) api?.win?.setBackground(hex);
}

/* ══ Arranque ════════════════════════════════════════════════════════════════ */

async function boot() {
  Icons.mount(document);
  Tooltip.init();
  Palette.init({ placeholder: 'Proyecto, vista o acción' });
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
  suscribir((que, extra) => {
    updateChrome();
    if (que === 'fin') {
      registerCommands();
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

  registerCommands();
  updateChrome();
  Router.onChange(updateChrome);
  Router.go('mapa');

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
