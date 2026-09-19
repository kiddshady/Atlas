/* ═══════════════════════════════════════════════════════════════════════════
   El escáner, sobre un árbol de mentira.
   Se arma una raíz temporal con proyectos de distintos tipos y se mide de
   verdad: bytes por capa, tipo detectado, ids, y el veredicto instalada/repo
   con un registro simulado. Git no se ejecuta acá (depende de la máquina);
   lo que se prueba de git es el parseo de remotos.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const E = require('../src/escaner.cjs');

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };

const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-raiz-'));
const escribir = (rel, bytes) => {
  const f = path.join(RAIZ, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.alloc(bytes, 97));
};

// Una app Electron con dependencias, build y git.
escribir('Alfa/package.json', 0);
fs.writeFileSync(path.join(RAIZ, 'Alfa', 'package.json'), JSON.stringify({
  name: 'alfa', productName: 'Alfa', version: '0.5.4', devDependencies: { electron: '40.10.2', 'electron-builder': '^26' },
}));
escribir('Alfa/main.cjs', 1000);
escribir('Alfa/renderer/app.js', 2000);
escribir('Alfa/node_modules/x/index.js', 5000);
escribir('Alfa/node_modules/x/lib/deep/dist/no-es-build.js', 700);   // dist ADENTRO de deps sigue siendo deps
escribir('Alfa/dist/Alfa-Setup.exe', 4000);
escribir('Alfa/.git/objects/ab', 300);
// Un venv de Python.
escribir('envx/pyvenv.cfg', 10);
escribir('envx/Lib/site-packages/numpy/core.py', 8000);
// Un script suelto de Python.
escribir('script/main.py', 50);
// Una carpeta cualquiera.
escribir('cosas/foto.jpg', 900);
// Un archivo suelto en la raíz: no es proyecto.
escribir('notas.md', 5);

console.log('\n1. Listar y clasificar');
const lista = await E.listarProyectos([RAIZ], { excluir: ['cosas'] });
ok('cada subcarpeta es un proyecto, los archivos no', lista.map((p) => p.nombre).sort().join() === 'Alfa,envx,script');
ok('las excluidas no aparecen', !lista.some((p) => p.nombre === 'cosas'));
ok('el id lleva la letra del disco y el nombre en minúsculas', lista.find((p) => p.nombre === 'Alfa').id === `${RAIZ[0].toLowerCase()}-alfa`);
ok('idDe normaliza acentos y espacios', E.idDe('S:\\tools\\Química Médica 2') === 's-quimica-medica-2');

const alfaPkg = await E.leerPackage(path.join(RAIZ, 'Alfa'));
ok('lee el package', alfaPkg.version === '0.5.4' && alfaPkg.productName === 'Alfa' && alfaPkg.builder === true);
ok('detecta electron', (await E.tipoDe(path.join(RAIZ, 'Alfa'), alfaPkg)) === 'electron');
ok('detecta un venv', (await E.tipoDe(path.join(RAIZ, 'envx'), null)) === 'venv');
ok('detecta python suelto', (await E.tipoDe(path.join(RAIZ, 'script'), null)) === 'python');
ok('lo demás es carpeta', (await E.tipoDe(path.join(RAIZ, 'cosas'), null)) === 'carpeta');

console.log('\n2. Medir por capas');
const t = E.medirProyecto(path.join(RAIZ, 'Alfa'));
ok('código = lo que no cae en ninguna capa', t.codigo === 1000 + 2000 + alfaBytes(), String(t.codigo));
ok('deps = node_modules entero, aunque tenga un dist adentro', t.deps === 5700, String(t.deps));
ok('build = dist', t.build === 4000);
ok('git = .git', t.git === 300);
ok('total = la suma', t.total === t.codigo + t.deps + t.build + t.git);
ok('cuenta archivos', t.archivos === 7, String(t.archivos));
const v = E.medirProyecto(path.join(RAIZ, 'envx'));
ok('site-packages es dependencia', v.deps === 8000 && v.codigo === 10);
ok('una carpeta inexistente mide cero sin explotar', E.medirProyecto(path.join(RAIZ, 'no-existe')).total === 0);

function alfaBytes() { return fs.statSync(path.join(RAIZ, 'Alfa', 'package.json')).size; }

console.log('\n3. Versiones y remotos');
ok('compara semver', E.compararVersion('0.5.4', '0.3.0') === 1 && E.compararVersion('1.0.0', '1.0.0') === 0 && E.compararVersion('0.9.0', '0.10.0') === -1);
ok('un prerelease no compara contra el número', E.compararVersion('1.0.0-beta', '1.0.0') === 0);
ok('remoto ssh de GitHub', E.remotoCorto('git@github.com:kiddshady/Apex.git') === 'kiddshady/Apex');
ok('remoto https de GitHub', E.remotoCorto('https://github.com/kiddshady/Apex') === 'kiddshady/Apex');
ok('otro remoto queda tal cual', E.remotoCorto('https://gitea.local/x/y.git') === 'https://gitea.local/x/y.git');

console.log('\n4. El registro y el veredicto');
const reg = [
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{guid-1}',
  '    DisplayName    REG_SZ    Alfa 0.3.0',
  '    DisplayVersion    REG_SZ    0.3.0',
  '    DisplayIcon    REG_SZ    C:\\Users\\yo\\AppData\\Local\\Programs\\Alfa\\Alfa.exe,0',
  '',
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{guid-2}',
  '    DisplayName    REG_SZ    Otra Cosa',
  '    DisplayVersion    REG_SZ    2.0.0-beta',
  '    InstallLocation    REG_SZ    C:\\Program Files\\Otra',
  '',
].join('\r\n');
const entradas = E.parsearReg(reg);
ok('parsea una entrada por clave', entradas.length === 2);
ok('con sus valores', entradas[0].DisplayName === 'Alfa 0.3.0' && entradas[1].InstallLocation === 'C:\\Program Files\\Otra');

const instaladas = [
  { nombre: 'Alfa', nombreCompleto: 'Alfa 0.3.0', version: '0.3.0', exe: 'C:\\nada\\Alfa.exe', dir: 'C:\\nada' },
  { nombre: 'Alfa', nombreCompleto: 'Alfa 0.1.0', version: '0.1.0', exe: 'C:\\nada2\\Alfa.exe', dir: 'C:\\nada2' },
];
const alfa = { nombre: 'Alfa', pkg: alfaPkg, tipo: 'electron' };
ok('empareja por productName y elige la versión más alta', E.emparejarInstalada(alfa, instaladas)?.version === '0.3.0');
ok('sin coincidencia devuelve null', E.emparejarInstalada({ nombre: 'Zeta', pkg: null }, instaladas) === null);

const base = { tipo: 'electron', pkg: { version: '0.5.4' }, git: { ultimo: { ts: 2000 } } };
ok('no-aplica para lo que no es app', E.veredicto({ tipo: 'python' }).estado === 'no-aplica');
ok('sin-instalar si no hay entrada', E.veredicto({ ...base, instalada: null }).estado === 'sin-instalar');
ok('sin-instalar si el exe ya no está', E.veredicto({ ...base, instalada: { version: '0.5.4', existe: false } }).estado === 'sin-instalar');
ok('desfasada por versión', E.veredicto({ ...base, instalada: { version: '0.3.0', existe: true, asarTs: 9e12 } }).motivo === 'version');
ok('desfasada por commits posteriores a la compilación', E.veredicto({ ...base, git: { ultimo: { ts: 5_000_000 } }, instalada: { version: '0.5.4', existe: true, asarTs: 1000 } }).motivo === 'commits');
ok('al día si la versión coincide y no hubo commits después', E.veredicto({ ...base, instalada: { version: '0.5.4', existe: true, asarTs: 3000 } }).estado === 'al-dia');
ok('un commit del mismo minuto que la compilación no la desfasa', E.veredicto({ ...base, git: { ultimo: { ts: 40_000 } }, instalada: { version: '0.5.4', existe: true, asarTs: 10_000 } }).estado === 'al-dia');

fs.rmSync(RAIZ, { recursive: true, force: true });
console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
