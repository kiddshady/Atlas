/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — estado
   El espejo en memoria de lo que sabe la app: el último escaneo, el que está
   corriendo, la selección. Las vistas leen de acá y nunca hacen IPC para
   dibujarse. Los cambios se avisan por `suscribir`, y cada vista suelta su
   suscripción al irse (Router.onLeave).
   ═══════════════════════════════════════════════════════════════════════════ */

const api = window.opal;

export const S = {
  info: null,
  settings: {},
  /** Proyectos por id. Lo que se ve, siempre. */
  proyectos: new Map(),
  /** Cuándo terminó el último escaneo completo (ms) — null si nunca. */
  escaneadoEn: null,
  escaneando: false,
  /** Cuántos proyectos tienen tamaño en este escaneo, sobre el total. */
  progreso: { hechos: 0, total: 0 },
  seleccion: null,
  /** Qué dimensiona el mapa: 'total' | 'codigo'. */
  medida: 'total',
};

const oyentes = new Set();
export function suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
export function avisar(que, extra) { for (const fn of oyentes) fn(que, extra); }

export const lista = () => [...S.proyectos.values()];
export const proyecto = (id) => S.proyectos.get(id) || null;
export const seleccionado = () => (S.seleccion ? proyecto(S.seleccion) : null);

export function seleccionar(id) {
  const nuevo = id && S.proyectos.has(id) ? id : null;
  if (nuevo === S.seleccion) return;
  S.seleccion = nuevo;
  avisar('seleccion', nuevo);
}

/** Tamaño según la medida elegida. Sin tamaño todavía → 0 (no sale en el mapa). */
export function medidaDe(p, medida = S.medida) {
  if (!p?.tam) return 0;
  return medida === 'codigo' ? p.tam.codigo : p.tam.total;
}

export const totalBytes = () => lista().reduce((n, p) => n + (p.tam?.total || 0), 0);
export const desfasadas = () => lista().filter((p) => p.estado === 'desfasada');

/* ── Carga inicial ─────────────────────────────────────────────────────────── */

export async function cargar() {
  const [info, settings, ultimo] = await Promise.all([api.info(), api.settings.get(), api.atlas.ultimo()]);
  S.info = info;
  S.settings = settings;
  S.medida = settings.medida || 'total';
  if (ultimo?.proyectos) {
    S.proyectos = new Map(ultimo.proyectos.map((p) => [p.id, p]));
    S.escaneadoEn = ultimo.en || null;
  }
}

export async function guardarAjustes(patch) {
  const saved = await api.settings.save(patch);
  S.settings = saved;
  if (patch.medida) S.medida = patch.medida;
  avisar('ajustes');
  return saved;
}

/* ── El escaneo, del lado del renderer ─────────────────────────────────────
   Los eventos llegan uno por uno y actualizan el mapa en el lugar. Un
   proyecto que ya existía conserva su tamaño anterior hasta que llega el
   nuevo: así el mapa no se vacía al re-escanear, se corrige. */

let soltarEventos = null;

export function escucharEscaneo() {
  soltarEventos?.();
  soltarEventos = api.atlas.onEvento((ev) => {
    switch (ev.tipo) {
      case 'inicio': {
        const ids = new Set(ev.proyectos.map((p) => p.id));
        // Lo que ya no está en disco se va del mapa.
        for (const id of [...S.proyectos.keys()]) if (!ids.has(id)) S.proyectos.delete(id);
        for (const b of ev.proyectos) {
          if (!S.proyectos.has(b.id)) S.proyectos.set(b.id, { ...b, tam: null, estado: 'no-aplica' });
        }
        S.escaneando = true;
        S.progreso = { hechos: 0, total: ev.proyectos.length };
        if (S.seleccion && !S.proyectos.has(S.seleccion)) S.seleccion = null;
        avisar('inicio');
        break;
      }
      case 'proyecto': {
        const previo = S.proyectos.get(ev.proyecto.id);
        S.proyectos.set(ev.proyecto.id, { ...ev.proyecto, tam: ev.proyecto.tam || previo?.tam || null });
        avisar('proyecto', ev.proyecto.id);
        break;
      }
      case 'tamano': {
        const p = S.proyectos.get(ev.id);
        if (p && ev.tam) p.tam = ev.tam;
        S.progreso.hechos++;
        avisar('tamano', ev.id);
        break;
      }
      case 'fin': {
        S.escaneando = false;
        if (!ev.cancelado) {
          S.escaneadoEn = Date.now();
          for (const p of ev.proyectos) {
            const previo = S.proyectos.get(p.id);
            S.proyectos.set(p.id, { ...p, tam: p.tam || previo?.tam || null });
          }
        }
        avisar('fin', ev);
        break;
      }
      case 'error': {
        S.escaneando = false;
        avisar('error', ev.error);
        break;
      }
    }
  });
}

export async function escanear() {
  if (S.escaneando) return false;
  S.escaneando = true;
  S.progreso = { hechos: 0, total: S.proyectos.size };
  avisar('inicio');
  await api.atlas.escanear();
  return true;
}

export async function cancelarEscaneo() {
  await api.atlas.cancelar();
  S.escaneando = false;
  avisar('fin', { cancelado: true, proyectos: [] });
}
