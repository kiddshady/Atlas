/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — el inspector
   El panel derecho, compartido por el mapa y la lista: el detalle del
   proyecto seleccionado o, sin selección, el resumen de los discos.
   ═══════════════════════════════════════════════════════════════════════════ */

import { esc } from '../ui.js';
import { Icons } from '../icons.js';
import { initScrollFades } from '../motion.js';
import { fmtBytes, fmtNum, fmtDate, relTime, monogram, plural } from '../format.js';
import { S, lista, seleccionado, totalBytes, desfasadas } from '../estado.js';
import { chipEstado, estratos, filasCapas, tipoLabel, urlRepo, CAPAS } from './comunes.js';

export function inspectorHTML() {
  return `<aside class="op-inspector" id="inspector">${cuerpo()}</aside>`;
}

/** Repinta el inspector en el lugar. Con `fundido`, un fade corto para que el cambio se vea. */
export function repintarInspector({ fundido = false } = {}) {
  const el = document.getElementById('inspector');
  if (!el) return;
  const scroll = el.querySelector('.op-inspector__body')?.scrollTop || 0;
  el.innerHTML = cuerpo();
  Icons.mount(el);
  initScrollFades(el);
  const body = el.querySelector('.op-inspector__body');
  if (body) {
    body.scrollTop = scroll;
    if (fundido) body.classList.add('op-in-fade');
  }
}

/* Durante un escaneo llegan varios eventos por segundo; repintar el panel en
   cada uno lo vuelve ilegible. Se junta todo en un repintado cada 400 ms. */
let timer = null;
export function repintarInspectorSuave() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; repintarInspector(); }, 400);
}

function cuerpo() {
  const p = seleccionado();
  return p ? detalle(p) : resumen();
}

/* ── Un proyecto ─────────────────────────────────────────────────────────── */

function detalle(p) {
  const repo = urlRepo(p);
  return `
    <div class="op-inspector__head">
      <span class="op-avatar">${esc(monogram(p.nombre))}</span>
      <div class="op-grow" style="min-width:0">
        <div class="op-truncate" style="font-weight:var(--op-w-medium)">${esc(p.nombre)}</div>
        <div class="op-meta">${esc(tipoLabel(p))} · disco ${esc(p.disco)}</div>
      </div>
      <button class="op-iconbtn op-iconbtn--sm" data-action="deseleccionar" data-tip="Cerrar"><i data-icon="close"></i></button>
    </div>

    <div class="op-inspector__body op-scroll">
      <div class="at-inspector-blk" style="padding-top:0">
        <div class="at-ruta op-copyable" data-copy="${esc(p.ruta)}">${esc(p.ruta)}</div>
        ${p.pkg?.description ? `<p class="op-meta" style="margin-top:8px;line-height:1.55">${esc(p.pkg.description)}</p>` : ''}
      </div>

      ${p.tipo === 'electron' ? bloqueInstalada(p) : ''}

      <div class="at-inspector-blk">
        <span class="op-eyebrow">Tamaño</span>
        ${p.tam ? `
          <div class="op-row" style="align-items:baseline;gap:8px;margin-bottom:10px">
            <span class="op-stat__value">${esc(fmtBytes(p.tam.total))}</span>
            <span class="op-meta">${esc(fmtNum(p.tam.archivos))} archivos</span>
          </div>
          ${estratos(p.tam)}
          ${filasCapas(p.tam)}`
        : `<div class="op-row" style="gap:8px"><span class="op-meter op-meter--indeterminate op-grow"><span class="op-meter__fill"></span></span><span class="op-meta">midiendo</span></div>`}
      </div>

      <div class="at-inspector-blk">
        <span class="op-eyebrow">Git</span>
        ${p.git ? `
          <div class="op-kv">
            <span class="op-kv__k">Rama</span><span class="op-kv__v op-mono">${esc(p.git.rama || '—')}</span>
            <span class="op-kv__k">Cambios</span><span class="op-kv__v">${p.git.sucios ? `${plural(p.git.sucios, 'archivo', 'archivos')} sin commitear` : 'árbol limpio'}</span>
            ${p.git.remoto ? `<span class="op-kv__k">Remoto</span><span class="op-kv__v op-mono op-truncate">${esc(p.git.remoto)}</span>` : ''}
          </div>
          ${p.git.ultimo ? `
            <div class="at-commit" style="margin-top:10px">
              <span class="at-commit__hash">${esc(p.git.ultimo.hash)}</span> · ${esc(relTime(p.git.ultimo.ts))}<br>${esc(p.git.ultimo.msg)}
            </div>` : '<p class="op-meta" style="margin-top:8px">Todavía sin commits.</p>'}`
        : '<p class="op-meta">No es un repositorio.</p>'}
      </div>

      ${p.pkg ? `
      <div class="at-inspector-blk">
        <span class="op-eyebrow">package.json</span>
        <div class="op-kv">
          <span class="op-kv__k">Nombre</span><span class="op-kv__v op-mono">${esc(p.pkg.name || '—')}</span>
          <span class="op-kv__k">Versión</span><span class="op-kv__v op-mono">${esc(p.pkg.version || '—')}</span>
          ${p.pkg.electron ? `<span class="op-kv__k">Electron</span><span class="op-kv__v op-mono">${esc(p.pkg.electron)}</span>` : ''}
          ${p.pkg.electron ? `<span class="op-kv__k">Empaqueta</span><span class="op-kv__v">${p.pkg.builder ? (p.pkg.updater ? 'sí, con auto-update' : 'sí') : 'no'}</span>` : ''}
        </div>
      </div>` : ''}
    </div>

    <div class="op-inspector__foot">
      <button class="op-btn op-btn--secondary op-btn--sm op-grow" data-action="abrir-carpeta" data-arg="${esc(p.ruta)}"><i data-icon="folder"></i> Abrir carpeta</button>
      ${repo ? `<button class="op-iconbtn" data-action="abrir-url" data-arg="${esc(repo)}" data-tip="Ver en GitHub"><i data-icon="external"></i></button>` : ''}
      <button class="op-iconbtn" data-copy="${esc(p.ruta)}" data-tip="Copiar ruta"><i data-icon="copy"></i></button>
    </div>`;
}

function bloqueInstalada(p) {
  const i = p.instalada;
  return `
    <div class="at-inspector-blk">
      <span class="op-eyebrow">Instalada</span>
      <div style="margin-bottom:10px">${chipEstado(p)}</div>
      ${i?.existe ? `
        <div class="at-versus" data-estado="${esc(p.estado)}">
          <div class="at-versus__lado">
            <span class="at-versus__v">${esc(i.version || '?')}</span>
            <span class="at-versus__k">Instalada</span>
          </div>
          ${Icons.svg(p.estado === 'desfasada' ? 'arrowRight' : 'check')}
          <div class="at-versus__lado">
            <span class="at-versus__v">${esc(p.pkg?.version || '?')}</span>
            <span class="at-versus__k">Repo</span>
          </div>
        </div>
        <div class="op-kv" style="margin-top:10px">
          <span class="op-kv__k">Compilada</span><span class="op-kv__v">${esc(i.asarTs ? fmtDate(i.asarTs, { withTime: true }) : '—')}</span>
          ${p.git?.ultimo ? `<span class="op-kv__k">Último commit</span><span class="op-kv__v">${esc(fmtDate(p.git.ultimo.ts, { withTime: true }))}</span>` : ''}
          ${p.commitsDespues ? `<span class="op-kv__k">Después</span><span class="op-kv__v">${esc(plural(p.commitsDespues, 'commit', 'commits'))} sin instalar</span>` : ''}
        </div>
        <div style="margin-top:10px">
          <button class="op-btn op-btn--ghost op-btn--sm" data-action="mostrar-exe" data-arg="${esc(i.exe || '')}"><i data-icon="box"></i> Ver el ejecutable</button>
        </div>`
      : `<p class="op-meta" style="line-height:1.55">${p.pkg?.builder
          ? 'Tiene empaquetado pero no figura instalada. Se corre desde el repo o desde una portable.'
          : 'No tiene electron-builder: se corre desde el repo.'}</p>`}
    </div>`;
}

/* ── Sin selección: los discos ───────────────────────────────────────────── */

function resumen() {
  const todos = lista();
  const porDisco = new Map();
  for (const p of todos) {
    if (!porDisco.has(p.disco)) porDisco.set(p.disco, { disco: p.disco, n: 0, tam: { total: 0, codigo: 0, deps: 0, build: 0, git: 0 } });
    const d = porDisco.get(p.disco);
    d.n++;
    if (p.tam) for (const c of ['total', ...CAPAS.map((x) => x.id)]) d.tam[c] += p.tam[c] || 0;
  }
  const viejas = desfasadas();
  const apps = todos.filter((p) => p.tipo === 'electron');

  return `
    <div class="op-inspector__head">
      <div class="op-grow" style="min-width:0">
        <div style="font-weight:var(--op-w-medium)">Todo</div>
        <div class="op-meta">${esc(plural(todos.length, 'proyecto', 'proyectos'))} · ${esc(fmtBytes(totalBytes()))}</div>
      </div>
    </div>
    <div class="op-inspector__body op-scroll">
      <div class="at-inspector-blk at-resumen" style="padding-top:0">
        ${[...porDisco.values()].sort((a, b) => a.disco.localeCompare(b.disco)).map((d) => `
          <div class="at-resumen__disco">
            <div class="at-resumen__cab">
              ${Icons.svg('disk')}
              <span style="font-weight:var(--op-w-medium)">Disco ${esc(d.disco)}</span>
              <span class="op-meta">${esc(plural(d.n, 'proyecto', 'proyectos'))}</span>
              <span class="op-num">${esc(fmtBytes(d.tam.total))}</span>
            </div>
            ${estratos(d.tam)}
          </div>`).join('') || '<p class="op-meta">Todavía no hay nada escaneado.</p>'}
      </div>

      <div class="at-inspector-blk">
        <span class="op-eyebrow">Apps</span>
        <div class="op-kv">
          <span class="op-kv__k">Electron</span><span class="op-kv__v">${apps.length}</span>
          <span class="op-kv__k">Instaladas</span><span class="op-kv__v">${apps.filter((p) => p.instalada?.existe).length}</span>
          <span class="op-kv__k">Al día</span><span class="op-kv__v">${apps.filter((p) => p.estado === 'al-dia').length}</span>
          <span class="op-kv__k">Viejas</span><span class="op-kv__v">${viejas.length}</span>
        </div>
        ${viejas.length ? `<div class="op-list" style="margin-top:10px">${viejas.slice(0, 8).map((p) => `
          <div class="op-listitem" role="button" tabindex="0" data-select="${esc(p.id)}" style="padding:6px 8px">
            <div class="op-listitem__main">
              <span class="op-listitem__title">${esc(p.nombre)}</span>
              <span class="op-listitem__sub">${esc(motivoCorto(p))}</span>
            </div>
          </div>`).join('')}</div>` : ''}
      </div>

      <div class="at-inspector-blk">
        <span class="op-eyebrow">Escaneo</span>
        <div class="op-kv">
          <span class="op-kv__k">Último</span><span class="op-kv__v">${esc(S.escaneadoEn ? relTime(S.escaneadoEn) : 'nunca')}</span>
          <span class="op-kv__k">Raíces</span><span class="op-kv__v op-mono" style="line-height:1.6">${(S.settings.raices || []).map(esc).join('<br>')}</span>
        </div>
      </div>
    </div>
    <div class="op-inspector__foot">
      <button class="op-btn op-btn--secondary op-btn--sm op-grow" data-action="escanear" ${S.escaneando ? 'disabled' : ''}><i data-icon="scan"></i> ${S.escaneando ? 'Escaneando…' : 'Escanear de nuevo'}</button>
    </div>`;
}

function motivoCorto(p) {
  if (p.motivo === 'version') return `${p.instalada?.version} → ${p.pkg?.version}`;
  return p.commitsDespues ? plural(p.commitsDespues, 'commit', 'commits') + ' sin instalar' : 'repo más nuevo';
}
