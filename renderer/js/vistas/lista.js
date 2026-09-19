/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — vista Lista
   La tabla: todo lo que el mapa muestra por área, acá se ordena por columna.
   "Desfasadas" es la misma vista con el filtro puesto: la pregunta que más
   vale — qué apps estoy usando viejas — merece su ítem en el rail.
   ═══════════════════════════════════════════════════════════════════════════ */

import Router from '../router.js';
import { paint, head, esc, empty } from '../ui.js';
import { Icons } from '../icons.js';
import { fmtBytes, relTime, plural } from '../format.js';
import { S, lista, suscribir, seleccionar, desfasadas } from '../estado.js';
import { chipEstado, estratos, tipoLabel, motivoDe } from './comunes.js';
import { inspectorHTML, repintarInspector, repintarInspectorSuave } from './inspector.js';

/** El orden y el filtro sobreviven a la navegación: volver y encontrarlo igual. */
const estado = { col: 'total', desc: true, texto: '', soloApps: false };

const COLUMNAS = [
  { id: 'nombre', label: 'Proyecto', get: (p) => p.nombre.toLowerCase() },
  { id: 'disco', label: 'Disco', get: (p) => p.disco, tight: true },
  { id: 'total', label: 'Tamaño', get: (p) => p.tam?.total || 0, num: true },
  { id: 'codigo', label: 'Código', get: (p) => p.tam?.codigo || 0, num: true },
  { id: 'commit', label: 'Último commit', get: (p) => p.git?.ultimo?.ts || 0 },
  { id: 'version', label: 'Versión', get: (p) => p.pkg?.version || '', tight: true },
  { id: 'estado', label: 'Estado', get: (p) => ({ desfasada: 0, 'al-dia': 1, 'sin-instalar': 2, 'no-aplica': 3 })[p.estado] ?? 9 },
];

/** "0.5.4", o "0.3.0 → 0.5.4" cuando la instalada quedó atrás por versión. */
function versionHTML(p) {
  const repo = p.pkg?.version;
  if (!repo) return '';
  const inst = p.instalada?.existe ? p.instalada.version : null;
  if (inst && inst !== repo) return `<span class="op-row" style="gap:4px"><span class="at-ver--vieja">${esc(inst)}</span>${Icons.svg('arrowRight', 'op-icon--sm')}<span>${esc(repo)}</span></span>`;
  return esc(repo);
}

export function viewLista({ soloViejas = false } = {}) {
  const titulo = soloViejas ? 'Desfasadas' : 'Lista';
  paint(head({
    title: titulo,
    sub: soloViejas
      ? 'Apps cuya versión instalada quedó atrás del repo: se compila, se instala, y el arreglo llega'
      : 'Todos los proyectos, ordenables por columna',
  }) + `
    <div class="op-viewbody">
      <div class="op-viewbody__main">
        <div class="at-filtros">
          <div class="op-inputwrap">${Icons.svg('search')}<input class="op-input" id="filtro" placeholder="Filtrar por nombre o ruta" spellcheck="false" value="${esc(estado.texto)}"></div>
          ${soloViejas ? '' : `<button class="op-btn op-btn--ghost op-btn--sm${estado.soloApps ? ' is-active' : ''}" id="solo-apps"><i data-icon="box"></i> Solo apps</button>`}
          <span class="op-meta op-spacer" style="text-align:right" id="conteo"></span>
        </div>
        <div class="op-scroll op-grow" id="tabla-scroll"><table class="op-table at-tabla"><thead><tr>${COLUMNAS.map(th).join('')}</tr></thead><tbody id="filas"></tbody></table><div style="height:24px"></div></div>
      </div>
      ${inspectorHTML()}
    </div>`);

  const filas = document.getElementById('filas');
  const conteo = document.getElementById('conteo');

  function th(c) {
    const sorted = estado.col === c.id;
    // En Desfasadas todas están viejas: la columna dice POR QUÉ en vez de repetirlo.
    const label = soloViejas && c.id === 'estado' ? 'Por qué' : c.label;
    return `<th class="is-sortable${sorted ? ' is-sorted' : ''}${sorted && estado.desc ? ' is-desc' : ''}${c.num ? ' op-td--num' : ''} at-col-${c.id}" data-col="${c.id}">${esc(label)}${Icons.svg('chevronUp')}</th>`;
  }

  function visibles() {
    let out = soloViejas ? desfasadas() : lista();
    if (estado.soloApps && !soloViejas) out = out.filter((p) => p.tipo === 'electron');
    const t = estado.texto.trim().toLowerCase();
    if (t) out = out.filter((p) => p.nombre.toLowerCase().includes(t) || p.ruta.toLowerCase().includes(t));
    const col = COLUMNAS.find((c) => c.id === estado.col) || COLUMNAS[0];
    out.sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return estado.desc ? -r : r;
    });
    return out;
  }

  function pintarFilas() {
    const vis = visibles();
    conteo.textContent = vis.length === S.proyectos.size ? plural(vis.length, 'proyecto', 'proyectos') : `${vis.length} de ${S.proyectos.size}`;
    if (!vis.length) {
      filas.innerHTML = `<tr><td colspan="${COLUMNAS.length}" style="padding:40px 0;box-shadow:none">${empty({
        icon: soloViejas ? 'check' : 'inbox',
        title: soloViejas ? 'Todo lo instalado está al día' : 'Nada que mostrar',
        text: soloViejas ? 'Ninguna app instalada tiene un repo más nuevo que ella.' : (S.proyectos.size ? 'Ningún proyecto coincide con el filtro.' : 'Escaneá las raíces primero.'),
      })}</td></tr>`;
      Icons.mount(filas);
      return;
    }
    filas.innerHTML = vis.map((p) => `
      <tr class="op-tr${S.seleccion === p.id ? ' is-selected' : ''}" data-select="${esc(p.id)}" tabindex="0">
        <td>${esc(p.nombre)}</td>
        <td class="op-td--tight op-mono">${esc(p.disco)}</td>
        <td class="op-td--num op-td--tight"><span class="op-row" style="justify-content:flex-end;gap:8px">${estratos(p.tam, { mini: true })}<span class="op-num">${p.tam ? esc(fmtBytes(p.tam.total)) : '<span class="op-dim">midiendo</span>'}</span></span></td>
        <td class="op-td--num op-td--tight op-num at-col-codigo">${p.tam ? esc(fmtBytes(p.tam.codigo)) : ''}</td>
        <td class="at-td-commit" data-tip="${esc(p.git?.ultimo?.msg || '')}"><span class="op-truncate">${esc(p.git ? (p.git.ultimo ? `${relTime(p.git.ultimo.ts)} · ${p.git.ultimo.msg}` : 'sin commits') : '')}</span>${p.git?.sucios ? `<span class="op-chip op-chip--outline" data-tip="${p.git.sucios} sin commitear" style="margin-left:6px">${p.git.sucios}</span>` : ''}</td>
        <td class="op-td--tight at-ver">${versionHTML(p)}</td>
        <td class="op-td--tight">${soloViejas ? `<span class="op-dim">${esc(motivoDe(p))}</span>` : (p.tipo === 'electron' ? chipEstado(p, { detalle: false }) : '')}</td>
      </tr>`).join('');
    Icons.mount(filas);
  }

  /* Coalescer para el escaneo, igual que el mapa: una tabla no se repinta
     cuarenta veces por segundo sin que se note. */
  let timer = null;
  const pintarSuave = () => { if (!timer) timer = setTimeout(() => { timer = null; pintarFilas(); }, 250); };

  document.querySelector('.at-tabla thead').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-col]');
    if (!th) return;
    if (estado.col === th.dataset.col) estado.desc = !estado.desc;
    else { estado.col = th.dataset.col; estado.desc = th.dataset.col === 'total' || th.dataset.col === 'codigo' || th.dataset.col === 'commit'; }
    document.querySelectorAll('.at-tabla th').forEach((h) => {
      const sorted = h.dataset.col === estado.col;
      h.classList.toggle('is-sorted', sorted);
      h.classList.toggle('is-desc', sorted && estado.desc);
    });
    pintarFilas();
  });

  document.getElementById('filtro').addEventListener('input', (e) => { estado.texto = e.target.value; pintarFilas(); });
  document.getElementById('solo-apps')?.addEventListener('click', (e) => {
    estado.soloApps = !estado.soloApps;
    e.currentTarget.classList.toggle('is-active', estado.soloApps);
    pintarFilas();
  });

  filas.addEventListener('keydown', (e) => {
    const tr = e.target.closest?.('tr[data-select]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); seleccionar(tr.dataset.select); }
  });

  Router.onLeave(suscribir((que, id) => {
    if (que === 'seleccion') {
      filas.querySelectorAll('tr[data-select]').forEach((tr) => tr.classList.toggle('is-selected', tr.dataset.select === S.seleccion));
      repintarInspector({ fundido: true });
      return;
    }
    if (que === 'fin') { pintarFilas(); repintarInspector(); return; }
    pintarSuave();
    if (!S.seleccion || id === S.seleccion) repintarInspectorSuave();
  }));

  pintarFilas();
}
