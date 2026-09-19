/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — vista Ajustes
   Las raíces (qué carpetas se escanean), lo que se excluye, y si se escanea
   al abrir. Todo se guarda en settings.json con escritura atómica.
   ═══════════════════════════════════════════════════════════════════════════ */

import Router from '../router.js';
import { paint, head, esc, attempt } from '../ui.js';
import { Icons } from '../icons.js';
import { Toast, Modal } from '../overlays.js';
import { exit } from '../motion.js';
import { S, guardarAjustes } from '../estado.js';

const api = window.opal;

export function viewAjustes() {
  const st = S.settings;
  paint(head({ title: 'Ajustes', sub: 'Se guardan en settings.json, con escritura atómica' }) + `
    <div class="op-scroll op-grow">
      <div style="max-width:640px">

        <div class="op-section">
          <div class="op-section__head">
            <span class="op-section__title">Raíces</span>
            <span class="op-spacer"></span>
            <button class="op-btn op-btn--secondary op-btn--sm op-flashable" id="agregar-raiz"><i data-icon="plus"></i> Agregar carpeta</button>
          </div>
          <p class="op-meta" style="margin:0 0 12px;line-height:1.6">Cada subcarpeta directa de una raíz es un proyecto. Se miden enteras, con todo lo que tengan adentro.</p>
          <div class="op-list" id="raices">${(st.raices || []).map(filaRaiz).join('')}</div>
        </div>

        <div class="op-section">
          <div class="op-section__head"><span class="op-section__title">Escaneo</span></div>
          <div class="op-card"><div class="op-card__body op-col" style="gap:18px">
            <label class="op-row" style="gap:12px">
              <button class="op-switch${st.escanearAlAbrir ? ' is-on' : ''}" id="set-abrir"></button>
              <span class="op-col" style="gap:2px">
                <span class="op-label">Escanear al abrir</span>
                <span class="op-meta">Si no, al abrir se muestra el último escaneo y se mide solo cuando lo pedís.</span>
              </span>
            </label>
            <div class="op-field">
              <label class="op-field__label">Carpetas que no son proyectos</label>
              <input class="op-input op-input--mono" id="set-excluir" spellcheck="false" value="${esc((st.excluir || []).join(', '))}">
              <span class="op-field__hint">Nombres de primer nivel, separados por coma. Se saltean en todas las raíces.</span>
            </div>
          </div></div>
        </div>

        <div class="op-section">
          <div class="op-section__head"><span class="op-section__title">Datos</span></div>
          <div class="op-card"><div class="op-card__body">
            <div class="op-kv">
              <span class="op-kv__k">Carpeta</span>
              <span class="op-kv__v op-mono op-copyable" data-copy="${esc(S.info?.dataDir || '')}">${esc(S.info?.dataDir || '—')}</span>
              <span class="op-kv__k">Esquema</span><span class="op-kv__v op-mono">v${esc(st.schema ?? 1)}</span>
            </div>
            <p class="op-meta" style="margin-top:14px;line-height:1.65">
              El último escaneo queda en <span class="at-code">escaneo.json</span>: es lo que se ve al abrir
              mientras se vuelve a medir. Los ajustes van en <span class="at-code">settings.json</span>.
            </p>
          </div></div>
        </div>

        <div class="op-section">
          <div class="op-section__head"><span class="op-section__title">Acerca de</span></div>
          <div class="op-card"><div class="op-card__body">
            <div class="op-kv">
              <span class="op-kv__k">App</span><span class="op-kv__v">${esc(S.info?.name || '—')} ${esc(S.info?.version || '')}</span>
              <span class="op-kv__k">Electron</span><span class="op-kv__v op-mono">${esc(S.info?.electron || '—')}</span>
              <span class="op-kv__k">Base</span><span class="op-kv__v">Opal</span>
            </div>
          </div></div>
        </div>

      </div>
      <div style="height:32px"></div>
    </div>`);

  const raices = document.getElementById('raices');

  document.getElementById('agregar-raiz').addEventListener('click', async () => {
    const ruta = await attempt(() => api.atlas.elegirCarpeta(), { errorTitle: 'No se pudo abrir el selector' });
    if (!ruta) return;
    const actuales = S.settings.raices || [];
    if (actuales.some((r) => r.toLowerCase() === ruta.toLowerCase())) {
      Toast.show({ title: 'Ya está', text: ruta, icon: 'info' });
      return;
    }
    await attempt(() => guardarAjustes({ raices: [...actuales, ruta] }));
    raices.insertAdjacentHTML('beforeend', filaRaiz(ruta));
    Icons.mount(raices);
    raices.lastElementChild.classList.add('op-in-rise');
    Toast.show({ title: 'Raíz agregada', text: 'Se incluye en el próximo escaneo.', icon: 'folder' });
  });

  raices.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-quitar]');
    if (!btn) return;
    const ruta = btn.dataset.quitar;
    const ok = await Modal.confirm({
      title: `¿Quitar ${ruta}?`,
      sub: 'Sus proyectos desaparecen del mapa en el próximo escaneo. La carpeta no se toca.',
      confirmLabel: 'Quitar',
    });
    if (!ok) return;
    await attempt(() => guardarAjustes({ raices: (S.settings.raices || []).filter((r) => r !== ruta) }));
    exit(btn.closest('.op-listitem'));
  });

  document.getElementById('set-abrir').addEventListener('click', async (e) => {
    const on = !e.currentTarget.classList.contains('is-on');
    e.currentTarget.classList.toggle('is-on', on);
    await attempt(() => guardarAjustes({ escanearAlAbrir: on }));
  });

  const excluir = document.getElementById('set-excluir');
  excluir.addEventListener('blur', async () => {
    const lista = excluir.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (lista.join('|') === (S.settings.excluir || []).join('|')) return;
    await attempt(() => guardarAjustes({ excluir: lista }));
    Toast.show({ title: 'Exclusiones guardadas', text: lista.join(', ') || 'ninguna', icon: 'check' });
  });
}

function filaRaiz(ruta) {
  return `
    <div class="op-listitem">
      ${Icons.svg('folder')}
      <div class="op-listitem__main">
        <span class="op-listitem__title op-mono op-copyable">${esc(ruta)}</span>
      </div>
      <div class="op-rowactions">
        <button class="op-iconbtn op-iconbtn--sm" data-quitar="${esc(ruta)}" data-tip="Quitar"><i data-icon="close"></i></button>
      </div>
    </div>`;
}
