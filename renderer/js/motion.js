/* ═══════════════════════════════════════════════════════════════════════════
   OPAL — motion (runtime)
   La mitad JS del sistema de movimiento. Su trabajo más importante es el que
   más se olvida: que lo que se va del DOM TERMINE su animación de salida antes
   de irse. Sin esto los overlays parpadean al cerrarse y la app se siente rota.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Dos frames: garantiza que el navegador ya aplicó los estilos iniciales. */
export function raf2(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/**
 * Saca un elemento del DOM DESPUÉS de su animación de salida.
 * Marca data-state="closing" (el CSS engancha ahí) y espera al animationend,
 * con un timeout de red por si el elemento no tiene animación declarada.
 */
export function exit(el, { fallback = 400, onDone } = {}) {
  if (!el) return Promise.resolve();
  // Ya se está yendo: la misma salida (quien espera, espera a que se vaya).
  if (el.dataset.state === 'closing') return el.__leaving || Promise.resolve();
  el.dataset.state = 'closing';

  return el.__leaving = new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeEventListener('animationend', onAnim);
      el.remove();
      onDone?.();
      resolve();
    };
    // Solo nos importa la animación del propio elemento, no la de sus hijos.
    const onAnim = (e) => { if (e.target === el) finish(); };
    el.addEventListener('animationend', onAnim);
    const timer = setTimeout(finish, fallback);
  });
}

/** Escalona los hijos de un contenedor seteando --i (el CSS lo usa de delay). */
export function stagger(container, selector = ':scope > *', step = 1) {
  container.querySelectorAll(selector).forEach((el, i) => {
    el.style.setProperty('--i', String(i * step));
  });
}

/* ── Click-flash ────────────────────────────────────────────────────────────
   Un velo de luz que nace con el press y decae. No viaja como un ripple de
   Material: solo confirma que el click llegó, y se limpia solo. */
export function initClickFlash(root = document) {
  root.addEventListener('pointerdown', (e) => {
    const target = e.target.closest?.('.op-flashable');
    if (!target || target.disabled) return;
    const flash = document.createElement('span');
    flash.className = 'op-flash';
    target.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove(), { once: true });
  });
}

/* ── Esfumado del scroll ────────────────────────────────────────────────────
   Apaga el fade del lado donde no hay nada recortado: pegado arriba no se
   esfuma arriba. Sin esto el primer item vive a media luz sin razón. */
export function scrollFade(el) {
  if (!el || el.__vcFade) return;
  el.__vcFade = true;

  const update = () => {
    const slack = el.scrollHeight - el.clientHeight;
    if (slack <= 1) {                       // no hay nada que recortar
      el.classList.add('is-top', 'is-bottom');
      return;
    }
    el.classList.toggle('is-top', el.scrollTop <= 1);
    el.classList.toggle('is-bottom', el.scrollTop >= slack - 1);
  };

  el.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(el);
  // El contenido puede cambiar de alto sin que cambie el del contenedor.
  new MutationObserver(update).observe(el, { childList: true, subtree: true });
  update();
}

/** Aplica scrollFade a todo .op-scroll que todavía no lo tenga. */
export function initScrollFades(root = document) {
  root.querySelectorAll('.op-scroll').forEach(scrollFade);
}

/* ── Indicadores que viajan ─────────────────────────────────────────────────
   La cápsula del segmentado y el subrayado de los tabs se DESLIZAN entre
   opciones. Que viajen en vez de saltar es lo que los hace sentir físicos. */

export function syncSegmented(seg) {
  const opts = [...seg.querySelectorAll('.op-segmented__opt')];
  if (!opts.length) return;
  const active = Math.max(0, opts.findIndex((o) => o.classList.contains('is-active')));
  const w = (seg.clientWidth - 4) / opts.length;
  seg.style.setProperty('--seg-w', `${w}px`);
  seg.style.setProperty('--seg', String(active));
}

export function syncTabs(tabs) {
  const active = tabs.querySelector('.op-tab.is-active');
  if (!active) return;
  tabs.style.setProperty('--tab-x', `${active.offsetLeft}px`);
  tabs.style.setProperty('--tab-w', `${active.offsetWidth}px`);
}

/**
 * Cablea un grupo (segmentado o tabs) para que se comporte solo.
 * onChange recibe el value del botón elegido.
 */
export function bindSwitcher(root, onChange) {
  const isSeg = root.classList.contains('op-segmented');
  const optSel = isSeg ? '.op-segmented__opt' : '.op-tab';
  /* Para un lector de pantalla, cuál es la elegida: un segmentado es un grupo
     de botones apretados o no (aria-pressed); unos tabs, una lista de tabs. */
  if (!isSeg) root.setAttribute('role', 'tablist');
  const aria = () => root.querySelectorAll(optSel).forEach((o) => {
    const on = o.classList.contains('is-active');
    if (isSeg) o.setAttribute('aria-pressed', String(on));
    else { o.setAttribute('role', 'tab'); o.setAttribute('aria-selected', String(on)); }
  });
  const sync = () => { aria(); return isSeg ? syncSegmented(root) : syncTabs(root); };

  root.addEventListener('click', (e) => {
    const opt = e.target.closest(optSel);
    if (!opt || opt.classList.contains('is-active')) return;
    root.querySelectorAll(optSel).forEach((o) => o.classList.remove('is-active'));
    opt.classList.add('is-active');
    sync();
    onChange?.(opt.dataset.value, opt);
  });

  new ResizeObserver(sync).observe(root);
  /* El indicador NACE en su lugar: sin esto pintaba un cuadro en 0 (a la
     izquierda, sin ancho) y después viajaba hasta la opción activa. Cada
     vista que se pinta con un segmentado o unos tabs los hacía moverse solos.
     Solo viaja al elegir. Salvo que ya traiga una posición: la que le devolvió
     el repintado de la misma vista (repintar). Ese viaja desde ahí, porque es
     el que se acaba de tocar. */
  const traido = !!root.style.getPropertyValue(isSeg ? '--seg-w' : '--tab-w');
  if (!traido) root.dataset.placing = '';
  sync();
  raf2(() => {
    sync();   // las fuentes pueden cambiar el ancho después del primer layout
    if (traido) return;
    getComputedStyle(root, isSeg ? '::before' : '::after').transform;   // asienta el lugar sin transición
    delete root.dataset.placing;
  });
  return sync;
}

/**
 * Cablea un `.op-switch` o un `.op-check`: alterna `is-on` con el click y le
 * dice a un lector de pantalla qué es y cómo está (role + aria-checked). Sin
 * esto un switch era «botón» a secas, prendido o apagado.
 * onChange recibe el estado nuevo. Devuelve set(on), para cambiarlo desde
 * afuera sin disparar onChange.
 */
export function bindToggle(el, onChange) {
  if (!el) return () => {};
  el.setAttribute('role', el.classList.contains('op-check') ? 'checkbox' : 'switch');
  const set = (on) => {
    el.classList.toggle('is-on', on);
    el.setAttribute('aria-checked', String(on));
  };
  set(el.classList.contains('is-on'));
  el.addEventListener('click', () => {
    const on = !el.classList.contains('is-on');
    set(on);
    onChange?.(on, el);
  });
  return set;
}

/* ── Campo numérico ─────────────────────────────────────────────────────────
   El spinner de `<input type=number>` es de Chromium y está tapado en el CSS.
   Esto le devuelve las flechas, ya dibujadas por nosotros.

   El input NO se reemplaza: sigue siendo el dueño del valor, del foco y del
   teclado. Por eso cada paso despacha `input` Y `change` con bubbles — quien
   escuchaba al campo antes de tener flechas sigue funcionando sin tocar nada.

   Mantener apretado repite, y acelera: un campo de copias que llega a 50 de a
   un click por vez no lo usa nadie. */

const ESPERA = 380;    // antes de empezar a repetir: distingue click de aguante
const PASO_LENTO = 110;
const PASO_RAPIDO = 45;
const ACELERA_A = 1200;   // ms aguantando antes de pasar a rápido

/**
 * Cablea un `.op-stepper` (input + dos flechas).
 * onChange recibe el valor numérico ya acotado a min/max.
 */
export function bindStepper(root, onChange) {
  const input = root?.querySelector('input[type="number"]');
  if (!input) return () => {};

  const num = (attr, fallback) => {
    const v = parseFloat(input.getAttribute(attr));
    return Number.isFinite(v) ? v : fallback;
  };

  const leer = () => {
    const v = parseFloat(input.value);
    return Number.isFinite(v) ? v : num('min', 0);
  };

  /** Los topes se releen en cada paso: el max suele depender de otra cosa. */
  const acotar = (v) => Math.min(num('max', Infinity), Math.max(num('min', -Infinity), v));

  const sync = () => {
    const v = leer();
    const arriba = root.querySelector('[data-step="up"]');
    const abajo = root.querySelector('[data-step="down"]');
    if (arriba) arriba.disabled = v >= num('max', Infinity);
    if (abajo) abajo.disabled = v <= num('min', -Infinity);
  };

  function mover(dir) {
    const antes = leer();
    const v = acotar(antes + dir * num('step', 1));
    if (v === antes) { sync(); return false; }
    input.value = String(v);
    sync();
    // bubbles: los listeners suelen estar en el contenedor, no en el input.
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    onChange?.(v, input);
    return true;
  }

  let timer = null;
  const frenar = () => { clearTimeout(timer); timer = null; };

  function arrancar(dir, desde) {
    const transcurrido = Date.now() - desde;
    if (!mover(dir)) { frenar(); return; }
    timer = setTimeout(() => arrancar(dir, desde), transcurrido > ACELERA_A ? PASO_RAPIDO : PASO_LENTO);
  }

  root.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('[data-step]');
    if (!btn || btn.disabled) return;
    e.preventDefault();                 // que el campo no pierda el foco
    const dir = btn.dataset.step === 'up' ? 1 : -1;
    mover(dir);
    const desde = Date.now();
    timer = setTimeout(() => arrancar(dir, desde), ESPERA);
    /* La captura del puntero es lo que hace que soltar CUENTE aunque el dedo se
       haya ido del botón. Sin esto, arrastrar afuera deja el contador corriendo
       para siempre. */
    btn.setPointerCapture?.(e.pointerId);
  });

  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    root.addEventListener(ev, frenar);
  }

  input.addEventListener('input', sync);
  sync();
  return sync;
}

/* ── Revelado de alto (grid 0fr → 1fr) ───────────────────────────────────── */
export function toggleReveal(el, open) {
  const next = open ?? !el.classList.contains('is-open');
  el.classList.toggle('is-open', next);
  return next;
}

/* ── Números que cuentan ────────────────────────────────────────────────────
   Un contador que salta de 0 a 1284 no se lee; uno que corre, sí. */
export function countTo(el, to, { from = 0, duration = 700, format = (n) => n } = {}) {
  // Repintando la misma vista, el número ya estaba en pantalla: volver a
  // contar desde 0 lo haría entrar de nuevo. Va el valor; si cambió, el
  // fundido del repintado lo muestra.
  if (asentandoAlgo()) { el.textContent = format(Math.round(to)); return; }
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = format(Math.round(from + (to - from) * ease(t)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Marca un valor que acaba de cambiar: destella y vuelve. */
export function tick(el) {
  el.classList.remove('op-ticked');
  void el.offsetWidth;          // reinicia la animación
  el.classList.add('op-ticked');
}

/* ── Lo que se anima desde JS ───────────────────────────────────────────────
   Las listas y los tamaños no se pueden escribir en una hoja: van por la Web
   Animations API. Las duraciones y las curvas salen de tokens.css, leídas la
   primera vez que hacen falta: si cambiás --op-t-3 o --op-ease, lo de acá
   cambia con todo lo demás. Lo que no tiene token (la espera del relevo, el
   escalonado) va escrito acá. */
let tokens = null;
function T() {
  if (tokens) return tokens;
  const cs = getComputedStyle(document.documentElement);
  const ms = (name, fallback) => {
    const v = cs.getPropertyValue(name).trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? (/ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n) : fallback;
  };
  const curve = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  const slow = ms('--op-t-3', 280);
  tokens = {
    in: slow, move: slow, size: slow,
    out: ms('--op-t-out', 150),   // las salidas son más cortas que las entradas
    after: 80,     // lo nuevo espera a que lo viejo casi no se vea
    step: 14,      // escalonado de las filas que entran juntas
    ease: curve('--op-ease', 'cubic-bezier(.16, 1, .3, 1)'),
    both: curve('--op-ease-both', 'cubic-bezier(.65, 0, .35, 1)'),
  };
  return tokens;
}

/** Una animación hecha desde JS que, si la ventana no pinta, igual termina. */
function settled(anim, ms, fn) {
  let done = false;
  const go = () => { if (!done) { done = true; fn(); } };
  anim.finished.then(go, () => {});
  setTimeout(go, ms);
}

/* ── Números que corren ─────────────────────────────────────────────────────
   Como countTo(), pero arranca de lo que se ve AHORA: cada dato nuevo retoma
   la carrera desde donde iba en vez de volver a cero o saltar. Es lo que pide
   un porcentaje que llega de a pedazos (una descarga, una sincronización).
   `to` es un número o un objeto de números; `paint` recibe el valor (o el
   objeto) de cada cuadro y escribe. La primera vez escribe sin correr, salvo
   que `from` diga qué número muestra ya el texto. */
export function roll(el, to, paint, { duration = 420, from: start0 } = {}) {
  if (!el) return;
  const obj = typeof to === 'object' && to !== null;
  if (!el.__roll && Number.isFinite(start0)) el.__roll = { cur: start0, to: start0, raf: 0 };   // lo que ya dice el texto
  const st = el.__roll;
  if (!st) { el.__roll = { cur: to, to, raf: 0 }; paint(to); return; }
  if (JSON.stringify(st.to) === JSON.stringify(to)) return;
  cancelAnimationFrame(st.raf);
  st.to = to;
  const from = st.cur;
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const lerp = (a, b, k) => (Number.isFinite(a) ? a + (b - a) * k : b);
  const frame = (now) => {
    if (!el.isConnected) return;
    const k = ease(Math.min(1, (now - start) / duration));
    st.cur = obj
      ? Object.fromEntries(Object.keys(to).map((key) => [key, lerp(from?.[key], to[key], k)]))
      : lerp(from, to, k);
    paint(st.cur);
    if (k < 1) st.raf = requestAnimationFrame(frame);
  };
  st.raf = requestAnimationFrame(frame);
}

/* ── Tamaño que viaja ───────────────────────────────────────────────────────
   Un elemento que cambió de tamaño va del que tenía (`from`, medido antes del
   cambio) al de ahora, en vez de saltar. Se anima el tamaño y no un transform
   porque lo que está al lado tiene que acompañarlo; es breve y en cosas
   chicas. `ignore` son hijos que se están yendo: no cuentan para el destino. */
export function glideSize(el, from, { ignore = [], width = true, height = true } = {}) {
  if (!el || !from) return;
  ignore.forEach((o) => { o.style.display = 'none'; });
  const to = { w: el.offsetWidth, h: el.offsetHeight };
  ignore.forEach((o) => { o.style.display = ''; });
  const dw = width && Math.abs(to.w - from.w) >= 1;
  const dh = height && Math.abs(to.h - from.h) >= 1;
  if (!dw && !dh) return;
  el.__glide?.cancel();
  const a = {}; const b = {};
  if (dw) { a.width = `${from.w}px`; b.width = `${to.w}px`; }
  if (dh) { a.height = `${from.h}px`; b.height = `${to.h}px`; }
  /* Si se ACHICA con algo yéndose adentro, primero se va lo de adentro y
     recién después se pliega la caja. Al revés, la caja cortaba lo que todavía
     se veía casi entero (en Prism, ocultar una contraseña larga: el segundo
     renglón salía partido al medio a los 30 ms), y eso se lee como un
     deslizamiento. Para crecer no hace falta esperar: primero se abre,
     después entra. */
  const shrinks = ignore.length > 0 && ((dw && to.w < from.w) || (dh && to.h < from.h));
  // Mientras viaja, lo que todavía no entra no se desborda de la caja.
  el.__glide = el.animate([{ ...a, overflow: 'hidden' }, { ...b, overflow: 'hidden' }], shrinks
    ? { duration: T().size - 40, delay: T().out - 50, easing: T().both, fill: 'backwards' }
    : { duration: T().size, easing: T().ease });
}

/* ── Relevo de contenido ────────────────────────────────────────────────────
   Un valor que cambia EN SU LUGAR (un texto, un ícono, un número que no
   corre, lo tapado y lo visible de una contraseña): el viejo se va y el nuevo
   entra en la misma celda, esperando a que el viejo casi no se vea.
     dir   1 sube, -1 baja: un contador que avanza o retrocede.
     size  la caja va de su tamaño al nuevo en vez de saltar cuando el viejo
           termina de irse (un botón que cambia de rótulo).
   La primera vez adopta lo que el elemento ya tenía, sin animarlo. Un
   elemento en línea (un número en medio de una oración) sigue en línea: la
   celda es un inline-grid, y la oración no se parte en renglones. */
export function swap(el, html, { dir = 0, size = false } = {}) {
  if (!el) return null;
  let items = [...el.children].filter((c) => c.classList.contains('op-swap__item'));
  if (!items.length) {
    if (getComputedStyle(el).display.startsWith('inline')) el.classList.add('op-swap--inline');
    const first = document.createElement('span');
    first.className = 'op-swap__item is-settled';
    first.append(...el.childNodes);
    el.appendChild(first);
    el.__swap = first.innerHTML;
    items = [first];
  }
  el.classList.add('op-swap');
  if (html === el.__swap) return null;
  el.__swap = html;
  const live = items.filter((c) => c.dataset.state !== 'closing');
  const from = size ? { w: el.offsetWidth, h: el.offsetHeight } : null;
  const d = dir > 0 ? 'up' : dir < 0 ? 'down' : '';
  const next = document.createElement('span');
  next.className = 'op-swap__item';
  next.innerHTML = html;
  if (d) next.dataset.dir = d;
  live.forEach((o) => {
    if (d) o.dataset.dir = d; else delete o.dataset.dir;
    exit(o, { fallback: 220 });
  });
  // Si no había nada a la vista (un vacío), lo nuevo entra sin esperar.
  if (live.some((o) => o.textContent.trim() || o.querySelector('svg, img, [class]'))) next.classList.add('is-after');
  el.appendChild(next);
  setTimeout(() => next.classList.add('is-settled'), 420);
  if (from) glideSize(el, from, { ignore: live });
  return next;
}

/** El texto de un elemento, con relevo si cambió. */
export const swapText = (el, text, opts) => swap(el, esc(text), opts);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── Listas que se ponen al día ─────────────────────────────────────────────
   Rehacer una lista con innerHTML la hace parpadear: lo que estaba se va de
   un cuadro al otro y lo nuevo aparece todo junto, aunque sea casi lo mismo
   (buscar, filtrar, una fila que avanza). reconcile() la pone al día fila por
   fila, por clave:
   · las que siguen son el MISMO nodo, y viajan a su lugar nuevo (FLIP);
   · las que ya no están salen desde donde estaban, fuera del flujo;
   · las nuevas entran, y si había algo yéndose, esperan a que casi no se vea.

   items: [{ key, html, ...lo que quieras }]. Opciones:
     update(el, item)   pone al día una fila que sigue y cuyo html cambió
                        (sin esto se le copian los atributos, y si cambió el
                        contenido se releva con un parpadeo corto)
     created(el, item)  después de crear una fila o reemplazar su contenido
                        (cablear íconos, listeners)
     height             la caja va de su alto al nuevo (un desplegable)
     enter              false: las nuevas aparecen sin animar (no hay nada
                        que contar: la primera pintada de algo que ya entra) */
export function reconcile(box, items, { update, created, height = false, enter = true } = {}) {
  const was = new Map();
  const leaving = [];
  for (const el of box.children) {
    if (el.dataset.state === 'closing') continue;
    if (el.dataset.key != null && !was.has(el.dataset.key)) was.set(el.dataset.key, el);
    else leaving.push(el);    // lo que no tiene clave (un innerHTML de antes) también se va
  }
  const keep = new Set(items.map((it) => it.key));
  for (const [k, el] of was) if (!keep.has(k)) leaving.push(el);

  // Dónde estaba cada cosa: todas las lecturas antes de cualquier escritura.
  const box0 = box.getBoundingClientRect();
  const h0 = height ? box.offsetHeight : 0;
  const first = new Map();
  for (const el of box.children) if (el.dataset.state !== 'closing') first.set(el, el.getBoundingClientRect());
  const celdas = new Map(leaving.filter((el) => el.cells)
    .map((el) => [el, [...el.cells].map((c) => c.getBoundingClientRect().width)]));
  for (const el of was.values()) { el.__move?.cancel(); el.__move = null; }

  if (leaving.length && getComputedStyle(box).position === 'static') box.style.position = 'relative';
  for (const el of leaving) {
    const r = first.get(el);
    // Una fila de tabla absoluta deja de ser fila: sus celdas pierden el ancho
    // de las columnas y se encogería mientras se esfuma. Se lo lleva puesto
    // (de Onyx; la lista de Atlas es una tabla).
    celdas.get(el)?.forEach((w, i) => { el.cells[i].style.width = `${w}px`; });
    Object.assign(el.style, {
      position: 'absolute', margin: '0', boxSizing: 'border-box', pointerEvents: 'none', zIndex: '0',
      top: `${r.top - box0.top - box.clientTop + box.scrollTop}px`,
      left: `${r.left - box0.left - box.clientLeft + box.scrollLeft}px`,
      width: `${r.width}px`, height: `${r.height}px`,
    });
    el.dataset.state = 'closing';
    const op = Number(getComputedStyle(el).opacity) || 0;
    const anim = el.animate([{ opacity: op }, { opacity: 0 }], { duration: T().out, easing: T().both, fill: 'forwards' });
    settled(anim, T().out + 200, () => el.remove());
  }

  const fresh = [];
  let prev = null;
  for (const it of items) {
    let el = was.get(it.key);
    if (!el) {
      el = make(it);
      fresh.push(el);
    } else if (el.__html !== it.html) {
      if (update) update(el, it); else morph(el, it, created);
      el.__html = it.html;
    }
    // A su lugar, salteando lo que se está yendo (no cuenta para el orden).
    let want = prev ? prev.nextElementSibling : box.firstElementChild;
    while (want && want !== el && want.dataset.state === 'closing') want = want.nextElementSibling;
    if (want !== el) {
      box.insertBefore(el, want);
      if (!fresh.includes(el)) quiet(el);   // moverlo le reinicia las animaciones de CSS
    }
    prev = el;
  }
  for (const el of fresh) { quiet(el); created?.(el, el.__item); }

  // Las que siguen viajan de donde estaban a donde quedaron.
  const vh = window.innerHeight;
  for (const el of was.values()) {
    if (!keep.has(el.dataset.key)) continue;
    const a = first.get(el);
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    if ((a.bottom < 0 && b.bottom < 0) || (a.top > vh && b.top > vh)) continue;   // afuera: nadie lo ve
    el.__move = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: T().move, easing: T().ease });
  }

  if (enter) {
    const wait = leaving.length ? T().after : 0;
    fresh.forEach((el, i) => {
      el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
        { duration: T().in, easing: T().ease, delay: wait + Math.min(i, 16) * T().step, fill: 'backwards' });
    });
  }

  if (height) glideSize(box, { w: box.offsetWidth, h: h0 }, { width: false, ignore: leaving });
  return { fresh, leaving };
}

function make(it) {
  const t = document.createElement('template');
  t.innerHTML = it.html.trim();
  const el = t.content.firstElementChild;
  el.dataset.key = it.key;
  el.__html = it.html;
  el.__inner = el.innerHTML;
  el.__item = it;
  return el;
}

/* Sin la entrada propia de la fila (la que tiene en su CSS para cuando la
   lista se pinta entera): de entrar se encarga reconcile(). Cancelada por la
   API, una animación de CSS no vuelve hasta que cambie su nombre, así que la
   salida de [data-state=closing] (exit()) sigue funcionando. */
function quiet(el) {
  for (const a of el.getAnimations()) if (a instanceof CSSAnimation && a.effect?.getTiming().iterations !== Infinity) a.cancel();
}

/* Una fila que sigue pero cambió: los atributos se copian (las clases nuevas
   corren con sus transiciones de color), y el contenido, si cambió, se releva
   con un parpadeo corto en vez de cambiar de un cuadro al otro. */
function morph(el, it, created) {
  const t = document.createElement('template');
  t.innerHTML = it.html.trim();
  const nu = t.content.firstElementChild;
  for (const { name } of [...el.attributes]) if (name !== 'data-key' && name !== 'data-state' && !nu.hasAttribute(name)) el.removeAttribute(name);
  for (const { name, value } of [...nu.attributes]) if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  el.__item = it;
  if (nu.innerHTML === el.__inner) return;
  el.__inner = nu.innerHTML;
  el.__next = nu;
  if (el.__blink) return;               // ya hay uno en curso: usa lo último que llegue
  el.__blink = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: T().both, fill: 'forwards' });
  settled(el.__blink, 200, () => {
    const latest = el.__next;
    el.__next = null;
    el.replaceChildren(...latest.childNodes);
    created?.(el, el.__item);
    el.__blink.cancel();
    el.__blink = null;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T().in - 100, easing: T().ease });
  });
}

/* ── Plegar y desplegar ─────────────────────────────────────────────────────
   Una fila que se va de una columna se esfuma Y se pliega: así las de abajo
   suben acompañándola en vez de saltar cuando sale del DOM. expand() es lo
   mismo al revés, para una que llega. Si la fila ya se estaba yendo (exit(),
   otro collapse()), devuelve esa misma salida: borrarla en el acto era el
   salto que este helper existe para evitar. */
export function collapse(el, { duration = 200 } = {}) {
  if (!el?.isConnected) return Promise.resolve();
  if (el.__leaving) return el.__leaving;
  el.dataset.state = 'closing';
  const cs = getComputedStyle(el);
  el.style.overflow = 'hidden';
  el.style.pointerEvents = 'none';
  const anim = el.animate([
    { opacity: cs.opacity, height: `${el.offsetHeight}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
    { opacity: 0, height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' },
  ], { duration, easing: T().both, fill: 'forwards' });
  return el.__leaving = new Promise((resolve) => settled(anim, duration + 200, () => { el.remove(); resolve(); }));
}

export function expand(el, { duration = T().in } = {}) {
  if (!el?.isConnected) return;
  const cs = getComputedStyle(el);
  el.animate([
    { opacity: 0, height: '0px', paddingTop: '0px', paddingBottom: '0px', overflow: 'hidden' },
    { opacity: 1, height: `${el.offsetHeight}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, overflow: 'hidden' },
  ], { duration, easing: T().ease });
}

/** Un nodo que reemplaza a otro en una fila (un ícono): el viejo se apaga, el nuevo se enciende. */
export function replaceSoft(old, node, { out = 90 } = {}) {
  if (!old?.isConnected || !old.getClientRects().length) {
    old?.replaceWith(node);
    node.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: T().in - 100, easing: T().ease });
    return;
  }
  const a = old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: out, easing: T().both, fill: 'forwards' });
  settled(a, out + 150, () => {
    if (!old.isConnected) return;
    old.replaceWith(node);
    node.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: T().in - 100, easing: T().ease });
  });
}

/* ── Fundido ────────────────────────────────────────────────────────────────
   Para una superficie entera que cambia por otra (un panel): lo nuevo ya está
   quieto debajo y lo viejo, opaco y ENCIMA, se esfuma. Así la pantalla está
   tapada todo el tiempo: el relevo con espera destapaba el fondo en el medio.
   El calco lleva la clase op-dissolving (su CSS le pone el fondo opaco y lo
   sube); el contenedor tiene que apilarlos en la misma celda. */
export function dissolve(old, { fallback = 260 } = {}) {
  if (!old) return Promise.resolve();
  if (old.dataset.state === 'closing') return old.__leaving || Promise.resolve();
  old.inert = true;
  old.removeAttribute('id');
  for (const el of old.querySelectorAll('[id]')) el.removeAttribute('id');
  old.classList.add('op-dissolving');
  // Lo que tenía entrada propia la da por terminada: no vuelve a entrar adentro del calco.
  for (const a of old.getAnimations({ subtree: true })) {
    if (a.effect?.getTiming().iterations !== Infinity) a.finish();
  }
  return exit(old, { fallback });
}

/* ── Cambiar o repintar la vista ────────────────────────────────────────────
   Navegar es un fundido: la vista que se va pasa a un calco opaco encima y se
   esfuma, y la nueva está entera y quieta debajo desde el primer cuadro
   (calcar, lo usa el router). Antes la vieja se iba de un cuadro al otro y la
   nueva arrancaba desde transparente: un cuadro vacío en cada navegación.

   Repintar la MISMA vista (Router.refresh() después de guardar) era un
   innerHTML en seco, y traía cuatro cosas:
   · lo viejo se iba en el mismo cuadro en que llegaba lo nuevo;
   · todo lo que tenía entrada propia volvía a entrar;
   · los contadores (countTo) volvían a contar desde 0;
   · el lugar se perdía: el scroll volvía arriba, un revelado abierto se
     cerraba, el foco se iba y las cápsulas de los segmentados nacían de cero.
   Ahora paint() repinta con repintar(): el mismo calco que al navegar, y lo
   nuevo ASENTADO debajo, sin entradas, con los contadores en su valor y en
   el mismo lugar que lo viejo. Viene de Onyx, que lo midió en Quire y Pharos. */

/**
 * La vista que se va pasa a un calco con la misma clase que `host`, en la
 * misma celda de la grilla, y se esfuma encima (.op-main--saliente). El calco
 * va sin ids, inerte, y conserva su scroll. Si la vieja todavía estaba
 * entrando, arranca desde la opacidad y el corrimiento en que la agarró. Si
 * ya había otro calco yéndose, el nuevo va DEBAJO de ese, pegado a la vista:
 * encima, un calco opaco tapaba de golpe lo que se estaba yendo.
 */
export function calcar(host) {
  if (!host || !host.firstChild || !host.parentElement) return null;
  const cs = getComputedStyle(host);
  const calco = document.createElement(host.tagName);
  calco.className = host.className;
  calco.classList.remove('op-view');
  calco.classList.add('op-main--saliente');
  calco.setAttribute('aria-hidden', 'true');
  calco.inert = true;
  calco.style.opacity = cs.opacity;
  if (cs.transform !== 'none') calco.style.transform = cs.transform;

  const scrolls = [...host.querySelectorAll('*')]
    .filter((el) => el.scrollTop || el.scrollLeft)
    .map((el) => [el, el.scrollTop, el.scrollLeft]);
  calco.append(...host.childNodes);
  for (const el of calco.querySelectorAll('[id]')) el.removeAttribute('id');
  host.after(calco);
  for (const [el, top, left] of scrolls) { el.scrollTop = top; el.scrollLeft = left; }

  // Moverlo le reinicia las animaciones de CSS: lo que tenía entrada propia
  // volvería a entrar adentro del calco que se va. Se dan por terminadas; lo
  // que gira para siempre (un spinner) sigue girando.
  for (const a of calco.getAnimations({ subtree: true })) {
    if (a.effect?.getTiming().iterations !== Infinity) a.finish();
  }

  exit(calco, { fallback: 260 });
  host.__calcadoEn = performance.now();
  // Hasta el cuadro siguiente, lo que se ponga en host no se pintó nunca (ver
  // recienCalcado). El tope es por si la ventana no está pintando.
  const marca = host.__sinPintar = {};
  const pintado = () => { if (host.__sinPintar === marca) host.__sinPintar = null; };
  requestAnimationFrame(pintado);
  setTimeout(pintado, 100);
  return calco;
}

/**
 * Si lo que hay en `host` es un estado intermedio que el calco, todavía casi
 * opaco, no dejó ver: otro calco encima lo mostraría. Pasa con un refresh() y
 * un go() en la misma tarea (guardar algo desde una vista y navegar a otra), o
 * con una vista que pinta «cargando» y el dato a los pocos ms. Lo que llega en
 * ese rato va directo debajo del calco que ya está. Es «todavía no hubo un
 * cuadro desde el calco» o, con la ventana oculta, «hace menos de 60 ms».
 */
export function recienCalcado(host) {
  if (!host) return false;
  if (host.__sinPintar && document.visibilityState === 'visible') return true;
  return performance.now() - (host.__calcadoEn ?? -Infinity) < 60;
}

/* Los indicadores que viajan: dónde está la cápsula (o el subrayado) que se
   VE, para que la del repintado salga de ahí. El segmentado se mide en
   opciones (--seg) y ancho de opción (--seg-w); los tabs, en píxeles. */
const INDICADORES = [
  { sel: '.op-segmented', pseudo: '::before', poner: (el, x, w) => { el.style.setProperty('--seg-w', `${w}px`); el.style.setProperty('--seg', String(w ? x / w : 0)); } },
  { sel: '.op-tabs', pseudo: '::after', poner: (el, x, w) => { el.style.setProperty('--tab-x', `${x}px`); el.style.setProperty('--tab-w', `${w}px`); } },
];

/** Mientras se asienta un repintado, countTo() no cuenta: escribe el valor.
    Cada uno con la pintada que asienta: si go() ya puso otra vista, la nueva
    cuenta como siempre. */
const asentando = new Set();
const asentandoAlgo = () => [...asentando].some((a) => a.root.__pinta === a.pinta);

/** El lugar de una vista, antes de repintarla. Se reconoce por ids. */
function fotografiar(root) {
  const f = { scrolls: [], indicadores: new Map(), revelados: [], foco: null };
  root.querySelectorAll('.op-scroll').forEach((el) => f.scrolls.push(el.scrollTop));
  for (const ind of INDICADORES) {
    root.querySelectorAll(`${ind.sel}[id]`).forEach((el) => {
      // Lo que se VE, no el destino: si la cápsula venía viajando, sigue desde ahí.
      const cs = getComputedStyle(el, ind.pseudo);
      const x = cs.transform && cs.transform !== 'none' ? new DOMMatrixReadOnly(cs.transform).m41 : 0;
      f.indicadores.set(el.id, { ind, x, w: parseFloat(cs.width) || 0 });
    });
  }
  root.querySelectorAll('.op-reveal.is-open[id]').forEach((el) => f.revelados.push(el.id));
  const act = document.activeElement;
  const dueño = act && root.contains(act) ? act.closest('[id]') : null;
  // Se reconoce por su id, o por el data-value dentro de un grupo con id; si
  // no, no hay forma honesta de encontrar su gemelo y el foco no se devuelve.
  if (dueño && root.contains(dueño) && (dueño === act || act.dataset.value != null)) {
    f.foco = { id: dueño.id, valor: dueño === act ? null : act.dataset.value };
  }
  return f;
}

/** Lo que la vista tiene que ver ANTES de cablearse: revelados e indicadores. */
function devolverAlPintar(root, f) {
  for (const id of f.revelados) root.querySelector(`#${CSS.escape(id)}`)?.classList.add('is-open');
  for (const [id, { ind, x, w }] of f.indicadores) {
    const el = root.querySelector(`#${CSS.escape(id)}`);
    if (!el?.matches(ind.sel) || !w) continue;
    // Puesto sin viajar: bindSwitcher lo ve ya ubicado y, si la opción
    // activa es otra, lo lleva desde ahí.
    el.dataset.placing = '';
    ind.poner(el, x, w);
    void getComputedStyle(el, ind.pseudo).transform;
    delete el.dataset.placing;
  }
}

/**
 * Repinta `root` con `poner()`, que escribe lo nuevo. Si `root` ya tenía una
 * vista, es un fundido que no pierde el lugar y devuelve true; si estaba
 * vacío (o se calcó hace un instante), solo pinta.
 */
export function repintar(root, poner) {
  const f = !recienCalcado(root) && root.firstChild ? fotografiar(root) : null;
  const calco = f ? calcar(root) : null;
  poner();
  if (!calco) return false;
  devolverAlPintar(root, f);
  asentar(root, f);
  return true;
}

/* Lo nuevo queda quieto debajo del calco: sus entradas se dan por terminadas
   (lo que gira para siempre sigue, y las transiciones también: una cápsula
   que viene de donde estaba tiene que llegar viajando). Se hace dos veces:
   ahora, con lo que trajo el HTML, y al terminar la tarea, con lo que la
   vista haya arrancado al cablearse. Recién ahí se devuelven el scroll y el
   foco, que dependen del alto final. */
function asentar(root, f) {
  const terminar = () => {
    for (const a of root.getAnimations({ subtree: true })) {
      if (a.effect?.target === root || a instanceof CSSTransition) continue;
      if (a.effect?.getTiming().iterations !== Infinity) a.finish();
    }
  };
  /* `__pinta` cuenta las vistas que pasaron por root, y go() lo sube. Si un
     go() llega en la misma tarea, este pendiente ya no es para la vista que
     quedó: no le pone el scroll de la vieja ni le enfoca nada por un id que
     coincida. */
  const yo = { root, pinta: root.__pinta };
  asentando.add(yo);
  terminar();
  queueMicrotask(() => {
    asentando.delete(yo);
    if (root.__pinta !== yo.pinta) return;
    terminar();
    const scrolls = root.querySelectorAll('.op-scroll');
    f.scrolls.forEach((top, i) => { if (scrolls[i] && top) scrolls[i].scrollTop = top; });
    // Si la vista ya puso el foco donde quería, se respeta.
    if (f.foco && (!document.activeElement || document.activeElement === document.body)) {
      const dueño = root.querySelector(`#${CSS.escape(f.foco.id)}`);
      const el = f.foco.valor != null
        ? dueño?.querySelector(`[data-value="${CSS.escape(f.foco.valor)}"]`)
        : dueño;
      el?.focus({ preventScroll: true });
    }
  });
}
