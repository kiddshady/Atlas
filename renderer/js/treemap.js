/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — treemap
   Geometría pura: recibe valores y un rectángulo, devuelve rectángulos. No
   sabe de DOM ni de proyectos, así que se prueba en node pelado.

   Es el algoritmo "squarified" (Bruls, Huizing y van Wijk): arma filas de
   celdas eligiendo en cada paso si sumar la próxima a la fila actual o
   cerrarla, según qué opción deje las celdas más cuadradas. Las celdas
   cuadradas se comparan a ojo; las tiras largas y finas no.

   ── El orden pegajoso ──────────────────────────────────────────────────────
   Squarify ordena de mayor a menor, y el orden lo decide todo: dónde cierra
   cada fila y, por lo tanto, dónde cae cada celda que viene después. Con
   varios proyectos casi iguales (en S: hay ocho entre 425 y 435 MB), una
   diferencia del 0,02 % los cambia de lugar y el squarify reacomoda todo lo
   que sigue. En un escaneo eso eran ~40 celdas viajando hasta 550 px con
   cada tamaño que llegaba. Por eso nivelar() recuerda el orden anterior y
   uno solo pasa adelante de otro si lo supera por más de HISTERESIS.
   ═══════════════════════════════════════════════════════════════════════════ */

/** La peor relación de aspecto de una fila de áreas apoyada sobre un lado `w`. */
function peor(fila, w) {
  const s = fila.reduce((a, b) => a + b, 0);
  if (!s || !w) return Infinity;
  const max = Math.max(...fila);
  const min = Math.min(...fila);
  return Math.max((w * w * max) / (s * s), (s * s) / (w * w * min));
}

/** Cuánto más grande tiene que ser uno para pasar adelante del que lo precede. */
export const HISTERESIS = 0.12;

/**
 * Ordena de mayor a menor sin olvidar el orden anterior. `previo` es un Map
 * clave → puesto (el `orden` que devuelve nivelar). Los que ya tenían puesto
 * arrancan en él; los nuevos, detrás y por tamaño. Después, por inserción,
 * cada uno pasa adelante solo de los que supera por más del margen: los
 * casi iguales se quedan donde estaban.
 */
export function ordenEstable(items, previo, clave, margen = HISTERESIS) {
  const puesto = (it) => previo?.get(clave(it)) ?? Infinity;
  const lista = [...items].sort((a, b) => (puesto(a) - puesto(b)) || (b.value - a.value));
  for (let i = 1; i < lista.length; i++) {
    const it = lista[i];
    let j = i;
    while (j > 0 && it.value > lista[j - 1].value * (1 + margen)) { lista[j] = lista[j - 1]; j--; }
    lista[j] = it;
  }
  return lista;
}

/**
 * Reparte `items` (cada uno con `value` > 0) dentro de `rect` ({x,y,w,h}).
 * Devuelve una copia de cada ítem con su x/y/w/h. Los de valor 0 no salen:
 * un rectángulo de área cero no existe. Con `ordenar: false` respeta el orden
 * en que vienen (el de ordenEstable).
 */
export function squarify(items, rect, { ordenar = true } = {}) {
  const { x: X, y: Y, w: W, h: H } = rect;
  const vivos = items.filter((it) => it.value > 0);
  const total = vivos.reduce((a, it) => a + it.value, 0);
  if (!vivos.length || W <= 0 || H <= 0 || total <= 0) return [];

  const orden = ordenar ? [...vivos].sort((a, b) => b.value - a.value) : vivos;
  const escala = (W * H) / total;
  const out = [];

  let cur = { x: X, y: Y, w: W, h: H };
  let fila = [];

  const cerrarFila = () => {
    if (!fila.length) return;
    const areas = fila.map((it) => it.value * escala);
    const s = areas.reduce((a, b) => a + b, 0);
    if (cur.w >= cur.h) {
      // Tira vertical pegada a la izquierda del espacio que queda.
      const ancho = s / cur.h;
      let y = cur.y;
      fila.forEach((it, i) => {
        const alto = areas[i] / ancho;
        out.push({ ...it, x: cur.x, y, w: ancho, h: alto });
        y += alto;
      });
      cur = { x: cur.x + ancho, y: cur.y, w: cur.w - ancho, h: cur.h };
    } else {
      // Tira horizontal pegada arriba.
      const alto = s / cur.w;
      let x = cur.x;
      fila.forEach((it, i) => {
        const ancho = areas[i] / alto;
        out.push({ ...it, x, y: cur.y, w: ancho, h: alto });
        x += ancho;
      });
      cur = { x: cur.x, y: cur.y + alto, w: cur.w, h: cur.h - alto };
    }
    fila = [];
  };

  for (const it of orden) {
    const lado = Math.min(cur.w, cur.h);
    const areas = fila.map((f) => f.value * escala);
    const area = it.value * escala;
    if (!fila.length || peor([...areas, area], lado) <= peor(areas, lado)) {
      fila.push(it);
    } else {
      cerrarFila();
      fila.push(it);
    }
  }
  cerrarFila();
  return out;
}

/** Un rectángulo encogido por un margen (y por una cabecera arriba). */
export function adentro(r, margen = 0, cabecera = 0) {
  return {
    x: r.x + margen,
    y: r.y + margen + cabecera,
    w: Math.max(0, r.w - margen * 2),
    h: Math.max(0, r.h - margen * 2 - cabecera),
  };
}

/**
 * El mapa de Atlas en tres niveles: discos → proyectos → capas.
 *   nivelar(proyectos, rect, { valor: (p) => p.tam.total })
 * Devuelve { discos: [{disco, value, x,y,w,h, proyectos: [{...p, value, x,y,w,h, capas: [...]}]}], orden }.
 * Las capas se calculan solo si la celda del proyecto tiene lugar para verlas.
 * `orden` es el puesto de cada disco, proyecto y capa: pasándolo de vuelta
 * como `previo` en el próximo llamado, los casi iguales no se reacomodan.
 */
export function nivelar(proyectos, rect, {
  valor = (p) => p?.tam?.total || 0,
  margenDisco = 4,
  cabeceraDisco = 22,
  margenProyecto = 2,
  minCapa = 28,
  conCapas = true,
  previo = null,
} = {}) {
  const orden = new Map();
  const acomodar = (items, r, clave) => {
    const lista = ordenEstable(items, previo, clave);
    lista.forEach((it, i) => orden.set(clave(it), i));
    return squarify(lista, r, { ordenar: false });
  };

  const porDisco = new Map();
  for (const p of proyectos) {
    const v = valor(p);
    if (!(v > 0)) continue;
    if (!porDisco.has(p.disco)) porDisco.set(p.disco, { disco: p.disco, value: 0, items: [] });
    const d = porDisco.get(p.disco);
    d.value += v;
    d.items.push({ ...p, value: v });
  }

  const discos = acomodar([...porDisco.values()], rect, (d) => `d:${d.disco}`).map((d) => {
    const interior = adentro(d, margenDisco, cabeceraDisco);
    const proyectos = acomodar(d.items, interior, (p) => `p:${p.id}`).map((p) => {
      const capas = [];
      if (conCapas && p.w >= minCapa && p.h >= minCapa && p.tam) {
        const zona = adentro(p, margenProyecto);
        for (const c of acomodar(capasDe(p.tam), zona, (k) => `k:${p.id}:${k.capa}`)) capas.push(c);
      }
      return { ...p, capas };
    });
    return { ...d, items: undefined, proyectos };
  });

  return { discos, orden };
}

/** Las capas de un tamaño como ítems con valor, en el orden de la leyenda. */
export function capasDe(tam) {
  return ['codigo', 'deps', 'build', 'git']
    .map((capa) => ({ capa, value: tam?.[capa] || 0 }))
    .filter((c) => c.value > 0);
}
