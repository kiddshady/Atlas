/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — piezas comunes de las vistas
   Las palabras del dominio y los trozos de HTML que aparecen en más de una
   vista: el chip de estado, la barra de estratos, la etiqueta de tipo.
   ═══════════════════════════════════════════════════════════════════════════ */

import { esc } from '../ui.js';
import { Icons } from '../icons.js';
import { fmtBytes, relTime } from '../format.js';

export const CAPAS = [
  { id: 'codigo', label: 'Código', hint: 'Lo que está escrito a mano, más assets' },
  { id: 'deps', label: 'Dependencias', hint: 'node_modules, venvs, target' },
  { id: 'build', label: 'Build', hint: 'dist, out, release' },
  { id: 'git', label: 'Git', hint: 'El historial en .git' },
];

export const TIPO = {
  electron: 'App Electron',
  node: 'Node',
  python: 'Python',
  venv: 'Entorno Python',
  rust: 'Rust',
  unreal: 'Unreal',
  carpeta: 'Carpeta',
};

export const ESTADO = {
  'desfasada': { label: 'Instalada vieja', corto: 'Vieja', icon: 'stale' },
  'al-dia': { label: 'Instalada al día', corto: 'Al día', icon: 'check' },
  'sin-instalar': { label: 'Sin instalar', corto: 'Sin instalar', icon: 'box' },
  'no-aplica': { label: 'No se instala', corto: '', icon: null },
};

/** "Instalada vieja · 3 commits" — el detalle que hace útil el veredicto. */
export function motivoDe(p) {
  if (p.estado !== 'desfasada') return '';
  if (p.motivo === 'version') return `${p.instalada?.version || '?'} → ${p.pkg?.version || '?'}`;
  if (p.commitsDespues) return `${p.commitsDespues} ${p.commitsDespues === 1 ? 'commit' : 'commits'} sin instalar`;
  return 'commits después de la instalación';
}

export function chipEstado(p, { detalle = true } = {}) {
  const e = ESTADO[p.estado] || ESTADO['no-aplica'];
  const extra = detalle ? motivoDe(p) : '';
  const texto = detalle ? e.label : e.corto;
  return `<span class="op-chip at-estado" data-estado="${esc(p.estado)}"${detalle ? '' : ` data-tip="${esc(e.label + (motivoDe(p) ? ' · ' + motivoDe(p) : ''))}"`}>${e.icon ? Icons.svg(e.icon) : ''}${esc(texto)}${extra ? ` · ${esc(extra)}` : ''}</span>`;
}

/** La barra apilada. Segmentos con ancho proporcional; vacío si no hay tamaño. */
export function estratos(tam, { mini = false } = {}) {
  const total = tam?.total || 0;
  const segs = total ? CAPAS.map((c) => {
    const v = tam[c.id] || 0;
    return v ? `<span class="at-estratos__seg" data-capa="${c.id}" style="width:${(v / total) * 100}%"></span>` : '';
  }).join('') : '';
  return `<span class="at-estratos${mini ? ' at-estratos--mini' : ''}"${mini ? ` data-tip="${esc(resumenCapas(tam))}"` : ''}>${segs}</span>`;
}

export function resumenCapas(tam) {
  if (!tam?.total) return 'Sin medir';
  return CAPAS.filter((c) => tam[c.id]).map((c) => `${c.label} ${fmtBytes(tam[c.id])}`).join(' · ');
}

export function filasCapas(tam) {
  if (!tam) return '';
  return `<div class="at-capas">${CAPAS.map((c) => `
    <span class="at-leyenda__sw" data-capa="${c.id}"></span>
    <span>${esc(c.label)}</span>
    <span class="op-num">${esc(fmtBytes(tam[c.id] || 0))}</span>`).join('')}</div>`;
}

export function leyenda() {
  return `<div class="at-leyenda">${CAPAS.map((c) => `
    <span class="at-leyenda__item" data-tip="${esc(c.hint)}" data-tip-side="bottom"><span class="at-leyenda__sw" data-capa="${c.id}"></span>${esc(c.label)}</span>`).join('')}</div>`;
}

export const tipoLabel = (p) => TIPO[p.tipo] || TIPO.carpeta;

/** "hace 3 días · fix(x): …" o "sin git". */
export function commitCorto(p) {
  if (!p.git) return 'sin git';
  if (!p.git.ultimo) return 'sin commits';
  return `${relTime(p.git.ultimo.ts)} · ${p.git.ultimo.msg}`;
}

export const urlRepo = (p) => (p.git?.remoto && /^[\w.-]+\/[\w.-]+$/.test(p.git.remoto) ? `https://github.com/${p.git.remoto}` : null);
