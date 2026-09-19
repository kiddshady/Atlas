/* ═══════════════════════════════════════════════════════════════════════════
   El treemap es geometría: se prueba con números, no con capturas.
   Lo que tiene que cumplir cualquier layout: áreas proporcionales al valor,
   ninguna celda fuera del rectángulo, ninguna encima de otra, y celdas
   razonablemente cuadradas (que es todo el punto del algoritmo).
   ═══════════════════════════════════════════════════════════════════════════ */

import { squarify, nivelar, adentro, capasDe } from '../renderer/js/treemap.js';

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

console.log('\n1. squarify: proporción, contención y no solape');
const items = [400, 250, 150, 100, 60, 25, 10, 5].map((value, i) => ({ id: i, value }));
const rect = { x: 10, y: 20, w: 800, h: 500 };
const out = squarify(items, rect);
const total = items.reduce((a, b) => a + b.value, 0);
ok('sale una celda por ítem', out.length === items.length, String(out.length));
ok('la suma de áreas es el rectángulo', cerca(out.reduce((a, c) => a + c.w * c.h, 0), rect.w * rect.h, 1e-6));
ok('cada área es proporcional a su valor', out.every((c) => cerca((c.w * c.h) / (rect.w * rect.h), c.value / total, 1e-9)));
ok('todas adentro del rectángulo', out.every((c) => c.x >= rect.x - 1e-9 && c.y >= rect.y - 1e-9
  && c.x + c.w <= rect.x + rect.w + 1e-6 && c.y + c.h <= rect.y + rect.h + 1e-6));
const solapan = out.some((a, i) => out.slice(i + 1).some((b) =>
  a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6));
ok('ninguna se solapa', !solapan);
const peorAspecto = Math.max(...out.map((c) => Math.max(c.w / c.h, c.h / c.w)));
ok('ninguna celda es una tira (aspecto < 4)', peorAspecto < 4, String(peorAspecto));

console.log('\n2. Bordes');
ok('sin ítems → sin celdas', squarify([], rect).length === 0);
ok('valores cero no producen celdas', squarify([{ value: 0 }, { value: 0 }], rect).length === 0);
ok('un rectángulo vacío no produce celdas', squarify(items, { x: 0, y: 0, w: 0, h: 100 }).length === 0);
const uno = squarify([{ value: 7 }], rect);
ok('un solo ítem ocupa todo', uno.length === 1 && cerca(uno[0].w, rect.w) && cerca(uno[0].h, rect.h));
ok('no muta la lista de entrada', items[0].value === 400 && !('x' in items[0]));
ok('adentro() encoge por margen y cabecera', (() => { const r = adentro({ x: 0, y: 0, w: 100, h: 60 }, 4, 22); return r.x === 4 && r.y === 26 && r.w === 92 && r.h === 30; })());
ok('adentro() nunca da negativo', adentro({ x: 0, y: 0, w: 5, h: 5 }, 4, 22).h === 0);

console.log('\n3. nivelar: discos → proyectos → capas');
const tam = (codigo, deps, build = 0, git = 0) => ({ codigo, deps, build, git, total: codigo + deps + build + git });
const proyectos = [
  { id: 'c-a', disco: 'C', tam: tam(400, 900, 300, 20) },
  { id: 'c-b', disco: 'C', tam: tam(50, 600) },
  { id: 's-c', disco: 'S', tam: tam(2000, 0) },
  { id: 's-d', disco: 'S', tam: null },            // sin medir: no sale
  { id: 's-e', disco: 'S', tam: tam(0, 0) },        // vacío: tampoco
];
const { discos } = nivelar(proyectos, { x: 0, y: 0, w: 1000, h: 600 });
ok('un disco por letra con proyectos medibles', discos.map((d) => d.disco).sort().join() === 'C,S');
const c = discos.find((d) => d.disco === 'C');
const s = discos.find((d) => d.disco === 'S');
ok('el disco suma sus proyectos', c.value === 2270 && s.value === 2000);
ok('los sin tamaño no aparecen', s.proyectos.length === 1 && c.proyectos.length === 2);
ok('los proyectos caen dentro de su disco (bajo la cabecera)', [...c.proyectos, ...s.proyectos].every((p) => {
  const d = p.id.startsWith('c') ? c : s;
  return p.x >= d.x && p.y >= d.y + 22 && p.x + p.w <= d.x + d.w + 1e-6 && p.y + p.h <= d.y + d.h + 1e-6;
}));
const a = c.proyectos.find((p) => p.id === 'c-a');
ok('las capas de una celda grande están dentro de la celda', a.capas.length === 4 && a.capas.every((k) =>
  k.x >= a.x && k.y >= a.y && k.x + k.w <= a.x + a.w + 1e-6 && k.y + k.h <= a.y + a.h + 1e-6));
ok('y en la proporción del tamaño', cerca(a.capas.find((k) => k.capa === 'deps').w * a.capas.find((k) => k.capa === 'deps').h
  / a.capas.reduce((n, k) => n + k.w * k.h, 0), 900 / 1620, 1e-9));
ok('capasDe omite las capas vacías', capasDe(tam(10, 0, 0, 5)).map((k) => k.capa).join() === 'codigo,git');
const porCodigo = nivelar(proyectos, { x: 0, y: 0, w: 1000, h: 600 }, { valor: (p) => p.tam?.codigo || 0, conCapas: false });
ok('otra medida cambia los valores', porCodigo.discos.find((d) => d.disco === 'C').value === 450);
ok('y sin capas cuando se pide', porCodigo.discos.every((d) => d.proyectos.every((p) => p.capas.length === 0)));
const chico = nivelar(proyectos, { x: 0, y: 0, w: 60, h: 60 });
ok('en un mapa minúsculo las capas se omiten solas', chico.discos.every((d) => d.proyectos.every((p) => p.capas.length === 0)));

console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
