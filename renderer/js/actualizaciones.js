/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — actualizaciones, del lado del renderer
   El proceso principal manda el estado entero en cada cambio (ver
   src/actualizador.cjs). Acá se decide qué merece un cartel: una versión
   nueva, un "estás al día" que vos pediste, un error. La búsqueda silenciosa
   del arranque no molesta si no hay nada. La versión de la statusbar es el
   botón: busca, muestra la nueva o reinicia, según el momento.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from './icons.js';
import { Toast, Modal } from './overlays.js';
import { esc, attempt } from './ui.js';
import { fmtBytes } from './format.js';
import { S } from './estado.js';

const api = window.opal;

let upd = null;          // el último estado recibido
let updToast = null;     // el toast persistente mientras descarga

function onUpdateState(e) {
  const prev = upd;
  upd = e;
  paintVersion();
  switch (e.fase) {
    case 'disponible':
      if (prev?.fase !== 'disponible') offerUpdate(e);
      break;
    case 'descargando':
      paintDownload(e);
      break;
    case 'listo':
      updToast?.close(); updToast = null;
      Toast.show({
        title: `Atlas ${e.version} lista`,
        text: 'Se instala al reiniciar. Si no llegás, entra sola la próxima vez que cierres la app.',
        icon: 'check', duration: 0,
        action: { label: 'Reiniciar y actualizar', run: () => api.update.instalar() },
      });
      break;
    case 'al-dia':
      if (e.manual) Toast.show({ title: 'Estás al día', text: `Atlas ${e.actual}`, icon: 'check' });
      break;
    case 'error':
      updToast?.close(); updToast = null;
      if (e.manual || prev?.fase === 'descargando') Toast.error('No se pudo actualizar', e.error);
      break;
  }
}

function paintVersion() {
  const chip = document.getElementById('stat-version');
  const val = chip?.querySelector('.op-statusbar__value');
  if (!chip || !val) return;
  const v = upd?.actual || S.info?.version || '';
  const pending = upd?.fase === 'disponible' || upd?.fase === 'listo';
  val.textContent = upd?.fase === 'listo' ? `${upd.version} lista para instalar`
    : upd?.fase === 'disponible' ? `${upd.version} disponible`
    : upd?.fase === 'descargando' ? `bajando ${upd.version}…`
    : `v${v}`;
  chip.classList.toggle('is-pending', pending);
  chip.dataset.tip = upd?.fase === 'listo' ? 'Reiniciar y actualizar'
    : upd?.fase === 'disponible' ? 'Ver la versión nueva'
    : 'Buscar actualizaciones';
}

function paintDownload(e) {
  const pct = Math.round(e.progreso.pct * 100);
  const text = e.progreso.total
    ? `${pct} % · ${fmtBytes(e.progreso.transferido)} de ${fmtBytes(e.progreso.total)}`
    : `${fmtBytes(e.progreso.transferido)}…`;
  if (!updToast) updToast = Toast.show({ title: `Descargando Atlas ${e.version}`, text: ' ', icon: 'download', duration: 0 });
  const t = updToast.el?.querySelector('.op-toast__text');
  if (t) t.textContent = text;
}

function offerUpdate(e) {
  Toast.show({
    title: 'Hay una versión nueva',
    text: e.nombre,
    icon: 'zap', duration: 12000,
    action: { label: 'Ver', run: () => updateModal() },
  });
}

async function updateModal() {
  const e = upd;
  if (!e || e.fase !== 'disponible') return;
  const body = document.createElement('div');
  body.className = 'op-col';
  body.style.gap = '14px';
  /* El link sale por atlas:abrir-url, que solo abre github.com: el mismo
     camino que los remotos de cada proyecto. */
  body.innerHTML = `
    <p class="op-meta" style="margin:0;line-height:1.65">
      Tenés la <span class="op-mono">${esc(e.actual)}</span>. La <span class="op-mono">${esc(e.version)}</span>
      pesa ${esc(fmtBytes(e.bytes))}: se descarga solo si decís que sí, y se instala al reiniciar
      (o al cerrar Atlas, si no llegás a reiniciar).
    </p>
    <div><button class="op-btn op-btn--ghost op-btn--sm" data-action="abrir-url" data-arg="${esc(e.url)}"><i data-icon="external"></i> Ver las notas de la versión</button></div>`;
  Icons.mount(body);
  const ok = await Modal.show({
    title: e.nombre || `Atlas ${e.version}`,
    body,
    width: 460,
    actions: [
      { label: 'Después', value: null },
      { label: 'Descargar', value: true, variant: 'primary', autofocus: true },
    ],
  });
  if (ok) attempt(() => api.update.descargar(), { errorTitle: 'No se pudo descargar' });
}

/** Lo que hace el clic en la versión de la statusbar, según el momento. */
function versionClick() {
  if (upd?.fase === 'listo') return api.update.instalar();
  if (upd?.fase === 'disponible') return updateModal();
  return checkUpdates();
}

export async function checkUpdates() {
  const st = await attempt(() => api.update.buscar({ manual: true }), { errorTitle: 'No se pudo buscar' });
  // Los demás desenlaces (al día, disponible, error) llegan por onUpdateState.
  if (st?.fase === 'sin-soporte') Toast.show({ title: 'Acá no se actualiza sola', text: st.motivo, icon: 'info', duration: 8000 });
}

export function wireUpdates() {
  api.update?.onCambio(onUpdateState);
  api.update?.estado().then(onUpdateState).catch(() => paintVersion());
  const chip = document.getElementById('stat-version');
  chip?.addEventListener('click', versionClick);
  chip?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); versionClick(); } });
}
