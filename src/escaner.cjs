'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   ATLAS — escáner
   Lo único que Atlas sabe hacer: mirar las raíces de proyectos y contar. Node
   pelado a propósito — nada de acá pide Electron, así que corre en los tests
   y podría correr en un worker sin cambiar una línea.

   Por proyecto (cada subcarpeta directa de una raíz) se juntan cuatro cosas,
   cada una con su costo:

     · tamaño     — el caro: recorre TODO el árbol y suma. Se parte en capas
                    (código / dependencias / git / build) porque "ocupa 4 GB"
                    no dice nada y "3,9 GB son node_modules" lo dice todo.
     · package    — barato: un JSON. Da versión, nombre de producto y si es
                    una app Electron con empaquetado.
     · git        — dos procesos por repo: el último commit y el estado.
     · instalada  — se cruza contra el registro de desinstalación de Windows,
                    que es donde electron-builder deja nombre, versión y exe.

   De cruzar package + git + instalada sale el dato por el que existe la app:
   si la versión que Fran USA es más vieja que la del repo.
   ═══════════════════════════════════════════════════════════════════════════ */

/* `original-fs` y no `fs`: adentro de Electron, `fs` está parcheado para que
   un .asar se comporte como carpeta. Eso rompe DOS cosas acá: el stat del
   app.asar de una instalación devuelve una fecha inventada (y el veredicto
   "instalada vieja" sale siempre "al día"), y recorrer un dist/ entra a los
   asar como si fueran directorios. En node pelado `original-fs` no existe y
   se cae al `fs` normal, que es el mismo. */
function fsReal() {
  try { return require('original-fs'); } catch { return require('fs'); }
}
const fs = fsReal();
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');

/* ── Capas del tamaño ─────────────────────────────────────────────────────────
   Un directorio con uno de estos nombres, esté donde esté en el árbol, cuenta
   entero para su capa y no se baja más a clasificar. Lo que no cae en ninguna
   es "código": lo que Fran escribió, más assets. */
const CAPAS = {
  deps: new Set(['node_modules', 'site-packages', '.venv', 'venv', 'target', '.cargo', '__pycache__', '.cache', '.next', '.gradle']),
  git: new Set(['.git']),
  build: new Set(['dist', 'out', 'release', 'Binaries', 'Intermediate', 'DerivedDataCache', 'Saved', 'build-output']),
};

function capaDe(nombre) {
  for (const [capa, set] of Object.entries(CAPAS)) if (set.has(nombre)) return capa;
  return null;
}

/**
 * Recorre un árbol sumando bytes por capa. Síncrono a propósito: en Windows
 * el stat asíncrono pasa por el threadpool y termina siendo más lento que
 * el bloqueante; quien lo llame desde Electron lo mete en un worker.
 */
function medir(dir, capa = 'codigo', acc = { codigo: 0, deps: 0, git: 0, build: 0, archivos: 0 }) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    if (e.isSymbolicLink()) continue;            // un enlace se cuenta donde vive el destino
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      medir(p, capa === 'codigo' ? (capaDe(e.name) || 'codigo') : capa, acc);
    } else if (e.isFile()) {
      try { acc[capa] += fs.statSync(p).size; acc.archivos++; } catch { /* borrado a mitad de camino */ }
    }
  }
  return acc;
}

function medirProyecto(dir) {
  const t = medir(dir);
  return { ...t, total: t.codigo + t.deps + t.git + t.build };
}

/* ── Proyectos ───────────────────────────────────────────────────────────── */

/** Un id estable por carpeta: sirve de nombre de archivo y de clave de selección. */
function idDe(ruta) {
  const disco = ruta.slice(0, 1).toLowerCase();
  const slug = path.basename(ruta).normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'x';
  return `${disco}-${slug}`;
}

/** Las subcarpetas directas de cada raíz. Archivos sueltos no son proyectos. */
async function listarProyectos(raices, { excluir = [] } = {}) {
  const fuera = new Set(excluir.map((s) => s.toLowerCase()));
  const out = [];
  for (const raiz of raices) {
    let ents;
    try { ents = await fsp.readdir(raiz, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (!e.isDirectory() || fuera.has(e.name.toLowerCase())) continue;
      const ruta = path.join(raiz, e.name);
      out.push({ id: idDe(ruta), nombre: e.name, ruta, raiz, disco: raiz.slice(0, 1).toUpperCase() });
    }
  }
  return out;
}

/* ── package.json ────────────────────────────────────────────────────────── */

async function leerPackage(dir) {
  let pkg;
  try { pkg = JSON.parse(await fsp.readFile(path.join(dir, 'package.json'), 'utf8')); } catch { return null; }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return {
    name: pkg.name || null,
    version: pkg.version || null,
    productName: pkg.productName || pkg.build?.productName || null,
    description: pkg.description || null,
    electron: deps.electron || null,
    builder: !!(deps['electron-builder'] || pkg.build),
    updater: !!deps['electron-updater'],
  };
}

/** Qué clase de cosa es la carpeta, mirando solo su primer nivel. */
async function tipoDe(dir, pkg) {
  if (pkg?.electron) return 'electron';
  if (pkg) return 'node';
  let ents;
  try { ents = await fsp.readdir(dir); } catch { return 'carpeta'; }
  const set = new Set(ents.map((s) => s.toLowerCase()));
  if (set.has('pyvenv.cfg')) return 'venv';
  if (set.has('cargo.toml')) return 'rust';
  if ([...set].some((n) => n.endsWith('.uproject'))) return 'unreal';
  if ([...set].some((n) => n.endsWith('.py')) || set.has('requirements.txt') || set.has('pyproject.toml')) return 'python';
  return 'carpeta';
}

/* ── git ─────────────────────────────────────────────────────────────────── */

function run(cmd, args, { cwd, timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: 'buffer' },
      (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

const git = (dir, args) => run('git', ['-C', dir, ...args]).then((b) => b.toString('utf8'));

/** "git@github.com:kiddshady/Apex.git" o "https://github.com/kiddshady/Apex" → "kiddshady/Apex" */
function remotoCorto(url) {
  const m = String(url || '').trim().match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/i);
  return m ? m[1] : (String(url || '').trim() || null);
}

async function leerGit(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) return null;
  try {
    const [log, status] = await Promise.all([
      git(dir, ['log', '-1', '--format=%H%x1f%ct%x1f%s']),
      git(dir, ['status', '--porcelain=v1', '-b']),
    ]);
    const [hash, ct, msg] = log.trim().split('\x1f');
    const lineas = status.split('\n').filter(Boolean);
    const cab = lineas.shift() || '';
    const rama = (cab.match(/^## ([^.\s]+)/) || [])[1] || null;
    let remoto = null;
    try {
      const cfg = await fsp.readFile(path.join(dir, '.git', 'config'), 'utf8');
      remoto = remotoCorto((cfg.match(/\[remote "origin"\][^[]*?url\s*=\s*(.+)/) || [])[1]);
    } catch { /* sin remoto */ }
    return {
      rama,
      ultimo: hash ? { hash: hash.slice(0, 7), ts: Number(ct) * 1000, msg } : null,
      sucios: lineas.length,
      remoto,
    };
  } catch {
    // Un repo sin commits todavía: `git log` falla pero el repo existe.
    return { rama: null, ultimo: null, sucios: 0, remoto: null };
  }
}

/** Cuántos commits hubo después de un instante (para "N commits sin instalar"). */
async function commitsDesde(dir, ts) {
  try {
    const out = await git(dir, ['rev-list', '--count', `--since=${Math.floor(ts / 1000)}`, 'HEAD']);
    return Number(out.trim()) || 0;
  } catch { return 0; }
}

/* ── Instaladas ──────────────────────────────────────────────────────────────
   electron-builder (NSIS) deja en el registro de desinstalación un DisplayName
   "<producto> <versión>", el DisplayVersion y el DisplayIcon apuntando al
   exe. Con eso alcanza para saber QUÉ hay instalado y DÓNDE. Se lee con `reg`
   porque es un proceso de 200 ms; PowerShell tarda cinco veces más.

   Solo la rama de usuario (HKCU): ahí instala electron-builder por defecto, y
   ahí están todas las apps de Fran. Las de máquina (HKLM y su WOW6432Node)
   tienen cientos de entradas de terceros y tardan casi 4 s en volcarse — un
   peaje por escaneo para un caso que no se da. */

const CLAVES_UNINSTALL = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

function decodificarConsola(buf) {
  // `reg` escribe en la página de códigos OEM cuando va a un pipe; en un
  // Windows en castellano es la 850. Si el ICU de este Node no la trae, la
  // salida se lee como latin1: los nombres de app son ASCII igual.
  try { return new TextDecoder('ibm850').decode(buf); } catch { return buf.toString('latin1'); }
}

function parsearReg(texto) {
  const entradas = [];
  let actual = null;
  for (const linea of texto.split(/\r?\n/)) {
    if (/^HKEY_/.test(linea)) { actual = { clave: linea.trim() }; entradas.push(actual); continue; }
    const m = actual && linea.match(/^\s{4}(\S+)\s+REG_\w+\s+(.*)$/);
    if (m) actual[m[1]] = m[2].trim();
  }
  return entradas;
}

/** Lista de {nombre, version, exe, dir} de todo lo instalado, sin filtrar. */
async function leerInstaladas() {
  const out = [];
  for (const clave of CLAVES_UNINSTALL) {
    let texto;
    try { texto = decodificarConsola(await run('reg', ['query', clave, '/s'])); } catch { continue; }
    for (const e of parsearReg(texto)) {
      if (!e.DisplayName) continue;
      const exe = (e.DisplayIcon || '').replace(/,-?\d+$/, '').replace(/^"|"$/g, '') || null;
      const dir = e.InstallLocation || (exe ? path.dirname(exe) : null);
      out.push({
        nombre: e.DisplayName.replace(/\s+v?\d+(\.\d+)*(-[\w.]+)?$/, '').trim(),
        nombreCompleto: e.DisplayName,
        version: e.DisplayVersion || null,
        exe, dir,
      });
    }
  }
  return out;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Busca la instalación que corresponde a un proyecto. Se compara el nombre
 * de producto y, si no, el de la carpeta; si hay varias entradas (queda una
 * vieja cuando el appId cambió), gana la que todavía tiene el exe en disco y
 * después la de versión más alta.
 */
function emparejarInstalada(proyecto, instaladas) {
  const candidatos = [norm(proyecto.pkg?.productName), norm(proyecto.pkg?.name), norm(proyecto.nombre)].filter(Boolean);
  const hits = instaladas.filter((i) => candidatos.includes(norm(i.nombre)) || (i.dir && candidatos.includes(norm(path.basename(i.dir)))));
  if (!hits.length) return null;
  hits.sort((a, b) => (existe(b.exe) - existe(a.exe)) || compararVersion(b.version, a.version));
  return hits[0];
}

const existe = (p) => (p && fs.existsSync(p) ? 1 : 0);

/** semver simplificado: 1 si a > b, -1 si a < b, 0 si iguales o incomparables. */
function compararVersion(a, b) {
  const pa = String(a || '').split(/[.-]/).map((x) => parseInt(x, 10));
  const pb = String(b || '').split(/[.-]/).map((x) => parseInt(x, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

async function leerInstalada(proyecto, instaladas) {
  const inst = emparejarInstalada(proyecto, instaladas);
  if (!inst) return null;
  let asarTs = null;
  if (inst.dir) {
    // El asar es la fecha de la app que corre: lo que se compiló, no lo que se instaló.
    for (const rel of ['resources/app.asar', 'resources/app']) {
      try { asarTs = (await fsp.stat(path.join(inst.dir, rel))).mtimeMs; break; } catch { /* siguiente */ }
    }
  }
  return { version: inst.version, exe: inst.exe, dir: inst.dir, asarTs, existe: !!existe(inst.exe) };
}

/* ── El veredicto ────────────────────────────────────────────────────────────
   Lo que la app existe para responder. Solo aplica a lo que se empaqueta:
   para una carpeta de Python o un repo sin build, "instalada" no significa nada.

     no-aplica     · no es una app que se instale
     sin-instalar  · es una app, pero no hay instalación (o el exe ya no está)
     desfasada     · la instalada es más vieja que el repo (versión o commits)
     al-dia        · lo instalado es lo último que hay en el repo */
function veredicto(p) {
  if (p.tipo !== 'electron') return { estado: 'no-aplica', commitsDespues: 0 };
  if (!p.instalada || !p.instalada.existe) return { estado: 'sin-instalar', commitsDespues: 0 };
  if (compararVersion(p.pkg?.version, p.instalada.version) > 0) return { estado: 'desfasada', motivo: 'version' };
  if (p.git?.ultimo && p.instalada.asarTs && p.git.ultimo.ts > p.instalada.asarTs + 60_000) {
    return { estado: 'desfasada', motivo: 'commits' };
  }
  return { estado: 'al-dia', commitsDespues: 0 };
}

/* ── Todo junto ──────────────────────────────────────────────────────────── */

/** Todo lo barato de un proyecto: package, tipo, git, instalada y veredicto. Sin tamaño. */
async function describir(base, instaladas) {
  const pkg = await leerPackage(base.ruta);
  const p = { ...base, pkg, tipo: await tipoDe(base.ruta, pkg) };
  p.git = await leerGit(base.ruta);
  p.instalada = await leerInstalada(p, instaladas);
  const v = veredicto(p);
  p.estado = v.estado;
  p.motivo = v.motivo || null;
  // Cuántos commits hay después de la compilación instalada: es el dato que
  // dice cuánto se quedó atrás, así que se calcula aunque el motivo sea la versión.
  const comparable = p.estado === 'desfasada' && p.git?.ultimo && p.instalada?.asarTs;
  p.commitsDespues = comparable ? await commitsDesde(base.ruta, p.instalada.asarTs) : 0;
  return p;
}

/** Corre `fn` sobre `items` con a lo sumo `n` en vuelo. */
async function enLotes(items, n, fn) {
  const cola = [...items.entries()];
  const out = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(n, cola.length) }, async () => {
    while (cola.length) {
      const [i, it] = cola.shift();
      out[i] = await fn(it, i);
    }
  }));
  return out;
}

module.exports = {
  CAPAS, medir, medirProyecto, idDe, listarProyectos, leerPackage, tipoDe,
  leerGit, commitsDesde, remotoCorto, leerInstaladas, parsearReg, emparejarInstalada,
  compararVersion, leerInstalada, veredicto, describir, enLotes,
};
