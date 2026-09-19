/* ═══════════════════════════════════════════════════════════════════════════
   Humo del renderer: monta la app de verdad y la recorre.

   Se corre con `npm run smoke` (necesita Electron, por eso no está en el
   `npm test`, que es node pelado).

   Lo que busca es lo que un test de unidad NO ve: overlays que aterrizan fuera
   de pantalla, vistas que no montan, animaciones que se quedan quietas donde no
   se las ve, glifos unicode que se colaron. La regla que lo guía: **medí dónde
   CAE una cosa, no solo si existe**. El bug más caro de este sistema fue un
   modal que renderizaba en top:-281px — presente en el DOM, correcto en el
   HTML, e inalcanzable con el mouse.
   ═══════════════════════════════════════════════════════════════════════════ */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const W = 1440; const H = 900;

/* El backgroundColor que main.cjs le pone a la ventana. El renderer se lo
   vuelve a mandar ya resuelto desde los tokens, y los dos tienen que coincidir:
   si no, el que se ve mientras el contenido no cubre la ventana es el otro. */
const BG_MAIN = (fs.readFileSync(path.join(ROOT, 'main.cjs'), 'utf8')
  .match(/const BG = '(#[0-9a-f]{6})'/i)?.[1] || '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const bail = (w, e) => { console.log(`ABORTADO ${w}`, e?.stack || e || ''); app.exit(3); };
process.on('unhandledRejection', (e) => bail('rechazo', e));
process.on('uncaughtException', (e) => bail('excepción', e));
setTimeout(() => bail('timeout de 120s'), 120000);

/* Los datos: un escaneo FIJO en una carpeta temporal, y sin escanear al abrir.
   El humo mide la UI, no el disco: con el escaneo real cada corrida tardaría
   medio minuto y el mapa sería distinto cada vez. */
const os = require('os');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-humo-'));
process.env.ATLAS_DATA = DATA;
const tam = (codigo, deps, build = 0, git = 0) => ({ codigo, deps, build, git, archivos: 1000, total: codigo + deps + build + git });
const FIXTURE = [
  { id: 'c-alfa', nombre: 'Alfa', ruta: 'C:\\tools\\Alfa', raiz: 'C:\\tools', disco: 'C', tipo: 'electron', tam: tam(400e6, 900e6, 300e6, 20e6),
    pkg: { name: 'alfa', version: '0.5.4', productName: 'Alfa', description: 'Una app', electron: '40.10.2', builder: true, updater: false },
    git: { rama: 'main', ultimo: { hash: 'abc1234', ts: Date.now() - 864e5, msg: 'feat: algo' }, sucios: 2, remoto: 'kiddshady/Alfa' },
    instalada: { version: '0.3.0', exe: 'C:\\nada\\Alfa.exe', dir: 'C:\\nada', asarTs: Date.now() - 30 * 864e5, existe: true },
    estado: 'desfasada', motivo: 'version', commitsDespues: 7 },
  { id: 'c-beta', nombre: 'Beta', ruta: 'C:\\tools\\Beta', raiz: 'C:\\tools', disco: 'C', tipo: 'electron', tam: tam(50e6, 600e6, 0, 5e6),
    pkg: { name: 'beta', version: '1.0.0', productName: 'Beta', electron: '40.10.2', builder: true },
    git: { rama: 'main', ultimo: { hash: 'def5678', ts: Date.now() - 5 * 864e5, msg: 'chore: release' }, sucios: 0, remoto: null },
    instalada: { version: '1.0.0', exe: 'C:\\nada\\Beta.exe', dir: 'C:\\nada', asarTs: Date.now() - 864e5, existe: true },
    estado: 'al-dia', motivo: null, commitsDespues: 0 },
  { id: 'c-gamma', nombre: 'Gamma', ruta: 'C:\\tools\\Gamma', raiz: 'C:\\tools', disco: 'C', tipo: 'python', tam: tam(2e9, 0), pkg: null, git: null, instalada: null, estado: 'no-aplica', commitsDespues: 0 },
  { id: 's-delta', nombre: 'Delta', ruta: 'S:\\tools\\Delta', raiz: 'S:\\tools', disco: 'S', tipo: 'electron', tam: tam(120e6, 700e6, 0, 8e6),
    pkg: { name: 'delta', version: '0.1.0', productName: 'Delta', electron: '40.10.2', builder: false },
    git: { rama: 'main', ultimo: { hash: '1112223', ts: Date.now() - 2 * 36e5, msg: 'fix: x' }, sucios: 0, remoto: 'kiddshady/Delta' },
    instalada: null, estado: 'sin-instalar', commitsDespues: 0 },
  { id: 's-epsilon', nombre: 'Epsilon', ruta: 'S:\\tools\\Epsilon', raiz: 'S:\\tools', disco: 'S', tipo: 'venv', tam: tam(1e6, 5e9), pkg: null, git: null, instalada: null, estado: 'no-aplica', commitsDespues: 0 },
  { id: 's-zeta', nombre: 'Zeta', ruta: 'S:\\tools\\Zeta', raiz: 'S:\\tools', disco: 'S', tipo: 'carpeta', tam: tam(30e6, 0), pkg: null, git: null, instalada: null, estado: 'no-aplica', commitsDespues: 0 },
];
fs.writeFileSync(path.join(DATA, 'escaneo.json'), JSON.stringify({ en: Date.now() - 36e5, raices: ['C:\\tools', 'S:\\tools'], proyectos: FIXTURE }));
fs.writeFileSync(path.join(DATA, 'settings.json'), JSON.stringify({ schema: 1, raices: ['C:\\tools', 'S:\\tools'], excluir: [], escanearAlAbrir: false, medida: 'total' }));

app.whenReady().then(async () => {
  require(path.join(ROOT, 'src', 'ipc.cjs')).register();

  const win = new BrowserWindow({
    x: -20000, y: -20000, width: W, height: H,
    frame: false, show: false, paintWhenInitiallyHidden: true, backgroundColor: '#000',
    webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true },
  });
  const errores = [];
  win.webContents.on('console-message', (e) => { if (e.level >= 2) errores.push(`${e.level}: ${e.message}`); });
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  win.show();
  await sleep(2200);

  const js = (c) => win.webContents.executeJavaScript(c);
  // Clickear sin explotar si el selector no existe: un elemento faltante tiene
  // que reportarse como falla del test, no como excepción que aborta todo.
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false; el.click(); return true; })()`);
  // Un click real es pointerdown → pointerup → click, y varios overlays se
  // cierran en pointerdown. Con `el.click()` solo, el orden nunca se prueba.
  const tap = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
    el.click(); return true; })()`);
  // Una tecla de verdad, por el canal de entrada de la ventana. Misma razón por
  // la que `tap` existe al lado de `click`: un evento fabricado a mano prueba el
  // manejador, no el camino que recorre la tecla hasta llegar a él.
  const escape = () => win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });

  console.log('\n1. Arranque');
  ok('el splash se fue', !(await js(`!!document.getElementById('boot-splash')`)));
  ok('el shell está montado', await js(`!!document.querySelector('.op-titlebar') && !!document.querySelector('.op-rail')`));
  ok('los <i data-icon> se reemplazaron por SVG', !(await js(`!!document.querySelector('i[data-icon]')`)));
  ok('la vista inicial pintó algo', (await js(`document.getElementById('view').children.length`)) > 0);

  console.log('\n2. El mapa pinta el último escaneo, y se mide dónde cae cada celda');
  const mapa = await js(`(() => {
    const m = document.getElementById('mapa'); if (!m) return null;
    const r = m.getBoundingClientRect();
    const celdas = [...m.querySelectorAll('.at-celda')];
    const dentro = celdas.filter((c) => { const b = c.getBoundingClientRect(); return b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1; }).length;
    const area = celdas.reduce((n, c) => { const b = c.getBoundingClientRect(); return n + b.width * b.height; }, 0);
    const solapes = celdas.some((c, i) => celdas.slice(i + 1).some((d) => { const x = c.getBoundingClientRect(), y = d.getBoundingClientRect();
      return x.left < y.right - 1 && y.left < x.right - 1 && x.top < y.bottom - 1 && y.top < x.bottom - 1; }));
    return { celdas: celdas.length, dentro, discos: m.querySelectorAll('.at-disco').length, solapes,
      cobertura: area / (r.width * r.height),
      discoBlur: [...m.querySelectorAll('.at-disco')].every((d) => getComputedStyle(d).backdropFilter !== 'none'),
      celdaBlur: celdas.some((c) => getComputedStyle(c).backdropFilter !== 'none'),
      capas: m.querySelectorAll('.at-capa').length,
      puntos: [...m.querySelectorAll('.at-celda[data-estado="desfasada"] .at-celda__punto')].map((p) => getComputedStyle(p).opacity) };
  })()`);
  ok('hay una celda por proyecto medido', mapa && mapa.celdas === FIXTURE.length, JSON.stringify(mapa));
  ok('todas caen adentro del mapa', mapa && mapa.dentro === mapa.celdas);
  ok('y ninguna se solapa con otra', mapa && !mapa.solapes);
  ok('un disco por raíz', mapa && mapa.discos === 2);
  ok('las celdas cubren el mapa (los márgenes son lo único que falta)', mapa && mapa.cobertura > 0.8, String(mapa?.cobertura));
  ok('el vidrio está en los discos y NO en las celdas (regla de las hojas)', mapa && mapa.discoBlur && !mapa.celdaBlur);
  ok('las celdas grandes muestran sus capas', mapa && mapa.capas > 0);
  ok('la instalada vieja lleva su punto de acento encendido', mapa && mapa.puntos.length === 1 && mapa.puntos[0] === '1', JSON.stringify(mapa?.puntos));

  ok('el rail cuenta las desfasadas', (await js(`document.getElementById('nav-stale').textContent`)) === '1');
  ok('la statusbar suma el total', /GB/.test(await js(`document.getElementById('stat-total').textContent`)));

  await click('.at-celda[data-id="c-alfa"]');
  await sleep(600);
  ok('click en una celda la selecciona', await js(`!!document.querySelector('.at-celda[data-id="c-alfa"].is-selected')`));
  ok('y el inspector muestra ese proyecto', (await js(`document.querySelector('#inspector .op-inspector__head .op-truncate')?.textContent`)) === 'Alfa');
  ok('con el veredicto y su motivo', /vieja/.test(await js(`document.querySelector('#inspector .at-estado')?.textContent || ''`)));
  ok('la titlebar muestra el contexto', (await js(`document.getElementById('titlebar-context').textContent.trim()`)) === 'Alfa');
  const versus = await js(`document.querySelector('#inspector .at-versus')?.textContent.replace(/\\s+/g, ' ') || ''`);
  ok('enfrenta la versión instalada con la del repo', versus.includes('0.3.0') && versus.includes('0.5.4'), versus);

  await click('#medida [data-value="codigo"]');
  await sleep(700);
  const porCodigo = await js(`(() => { const a = document.querySelector('.at-celda[data-id="c-gamma"]'); const b = document.querySelector('.at-celda[data-id="s-epsilon"]');
    return { gamma: a && a.offsetWidth * a.offsetHeight, epsilon: b && b.offsetWidth * b.offsetHeight, capas: document.querySelectorAll('.at-capa').length }; })()`);
  ok('medir por código re-dimensiona (Gamma, todo código, le gana al venv)', porCodigo.gamma > porCodigo.epsilon, JSON.stringify(porCodigo));
  ok('y en ese modo las celdas no llevan estratos', porCodigo.capas === 0);
  await click('#medida [data-value="total"]');
  await sleep(500);

  console.log('\n3. Todas las vistas montan');
  for (const v of ['lista', 'desfasadas', 'piezas', 'ajustes', 'mapa']) {
    await click(`[data-view="${v}"]`);
    await sleep(700);
    const hijos = await js(`document.getElementById('view').children.length`);
    const activo = await js(`!!document.querySelector('[data-view="${v}"].is-active')`);
    ok(`${v}: pinta y queda activa en el rail`, hijos > 0 && activo, `hijos=${hijos} activo=${activo}`);
  }

  console.log('\n4. La lista: filas, orden, filtro y selección compartida');
  await click('[data-view="lista"]');
  await sleep(700);
  ok('una fila por proyecto', (await js(`document.querySelectorAll('#filas tr[data-select]').length`)) === FIXTURE.length);
  ok('la selección del mapa sigue marcada acá', await js(`!!document.querySelector('#filas tr[data-select="c-alfa"].is-selected')`));
  const primero = () => js(`document.querySelector('#filas tr[data-select]')?.dataset.select`);
  ok('ordenada por tamaño, el venv va primero', (await primero()) === 's-epsilon', await primero());
  await click('th[data-col="nombre"]');
  await sleep(300);
  ok('click en una columna reordena', (await primero()) === 'c-alfa', await primero());
  await js(`(() => { const f = document.getElementById('filtro'); f.value = 'zet'; f.dispatchEvent(new Event('input')); return true; })()`);
  await sleep(300);
  ok('el filtro deja solo lo que coincide', (await js(`document.querySelectorAll('#filas tr[data-select]').length`)) === 1);
  await js(`(() => { const f = document.getElementById('filtro'); f.value = ''; f.dispatchEvent(new Event('input')); return true; })()`);
  await sleep(300);
  ok('la tabla no desborda la vista', await js(`(() => { const sc = document.getElementById('tabla-scroll'); return sc.querySelector('table').scrollWidth <= sc.clientWidth + 1; })()`));
  /* El encabezado sticky tiene que quedar CLAVADO al borde del scroller. Con
     el padding del esfumado se enganchaba --op-fade más abajo y las filas
     pasaban por ese hueco, por encima de sus títulos (bug portado de Onyx). */
  const hueco = await js(`(() => { const sc = document.getElementById('tabla-scroll'); sc.scrollTop = 60;
    const th = sc.querySelector('th'); return th.getBoundingClientRect().top - sc.getBoundingClientRect().top; })()`);
  ok('el encabezado sticky no deja hueco arriba', Math.abs(hueco) < 1, String(hueco));
  await js(`document.getElementById('tabla-scroll').scrollTop = 0; true`);
  await click('#filas tr[data-select="s-delta"]');
  await sleep(500);
  ok('click en una fila cambia el inspector', (await js(`document.querySelector('#inspector .op-inspector__head .op-truncate')?.textContent`)) === 'Delta');

  await click('[data-view="desfasadas"]');
  await sleep(700);
  ok('Desfasadas lista solo las viejas', (await js(`[...document.querySelectorAll('#filas tr[data-select]')].map((t) => t.dataset.select).join()`)) === 'c-alfa');

  console.log('\n5. Overlays: dónde caen, no solo si existen');
  await click('#btn-palette');
  await sleep(500);
  const pal = await js(`(() => { const p=document.querySelector('.op-palette'); if(!p) return null;
    const r=p.getBoundingClientRect(); return {t:Math.round(r.top),cx:Math.round(r.left+r.width/2)}; })()`);
  ok('la paleta abre centrada y visible', pal && pal.t > 0 && Math.abs(pal.cx - W / 2) < 4, JSON.stringify(pal));

  /* Y el campo vacío no promete cosas de otra app. Estuvo diciendo «Buscar
     comandos, pipelines, agentes…» —vocabulario de aquella para la que se
     escribió esta paleta— y viajó con la plantilla hasta un editor de química,
     donde ofrecía dos features que no existen. Un texto que solo se lee con el
     campo en blanco es de los que nadie vuelve a mirar: que lo mire esto. */
  const ph = await js(`document.querySelector('.op-palette__input')?.placeholder || ''`);
  ok('con una pista en el campo vacío', ph.length > 3, ph);
  ok('y sin vocabulario prestado de otra app', !/pipeline|agente/i.test(ph), ph);

  await click('.op-scrim'); await sleep(400);

  await click('[data-view="piezas"]');
  await sleep(900);
  await click('#demo-modal');
  await sleep(600);
  const modal = await js(`(() => { const m=document.querySelector('.op-modal'); if(!m) return null;
    const r=m.getBoundingClientRect(); return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),t:Math.round(r.top)}; })()`);
  ok('el modal queda CENTRADO en la ventana',
    modal && Math.abs(modal.cx - W / 2) < 4 && Math.abs(modal.cy - H / 2) < 4 && modal.t > 0, JSON.stringify(modal));
  await click('[data-dismiss]'); await sleep(400);

  // El toggle del menú. Volver a tocar el botón que lo abrió TIENE que cerrarlo.
  // Si no, se ve como un rebote: el manejador de click-afuera deja pasar al
  // ancla, el handler del botón vuelve a llamar a show(), y cierra+reabre en el
  // mismo gesto. Por eso acá va `tap` y no `click`: reproduce el orden real.
  const abierto = () => js(`!!document.querySelector('.op-menu')`);
  await tap('#demo-select');
  await sleep(400);
  ok('el select abre su menú', await abierto());
  await tap('#demo-select');
  await sleep(500);
  ok('volver a tocarlo lo CIERRA (no rebota)', !(await abierto()));
  ok('y el ancla suelta el estado abierto', !(await js(`!!document.querySelector('#demo-select.is-open')`)));

  await tap('#demo-select');
  await sleep(400);
  await js(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); true`);
  await sleep(500);
  ok('y un click afuera también lo cierra', !(await abierto()));

  /* ── 5-bis. Escape con un menú abierto encima de un modal ──────────────────
     Modal y Menu escuchan los dos el keydown en `document` y en CAPTURA. Para
     el mismo nodo y la misma fase gana el que se registró primero, y ese es
     siempre el modal, que abrió antes. Resultado: desplegar un select adentro
     de un diálogo y arrepentirse con Escape cerraba el DIÁLOGO ENTERO y se
     perdía todo lo tipeado, en vez de cerrar solo el menú.

     Es un bug de orden de registro: no se ve leyendo ninguno de los dos módulos
     por separado —cada manejador, solo, es correcto— y vuelve apenas alguien
     reordene los overlays. Por eso se prueba acá y no en unidad: hace falta que
     los dos estén vivos al mismo tiempo.

     El modal de la vitrina no trae un select adentro, así que el escenario se
     arma: se abre el modal y se dispara el menú del select que quedó atrás. Que
     ese botón esté tapado por el scrim da igual — lo que se prueba es el estado
     «menú abierto encima de un modal», no dónde se puede clickear. */
  console.log('\n5-bis. Escape se lleva el menú, no el diálogo de atrás');
  await click('#demo-modal');
  await sleep(600);
  await click('#demo-select');
  await sleep(400);
  const hayModal = () => js(`!!document.querySelector('.op-modal')`);
  ok('con el diálogo abierto, el menú abre encima', (await abierto()) && (await hayModal()));

  escape();
  await sleep(600);
  ok('el primer Escape cierra SOLO el menú', !(await abierto()));
  ok('y el diálogo sigue en pie', await hayModal());

  escape();
  await sleep(600);
  ok('el segundo Escape sí cierra el diálogo', !(await hayModal()));

  /* ── 6. El medidor indeterminado ───────────────────────────────────────────
     Una pista vacía se lee como un componente roto, no como «esperando». Se
     muestrea el recorrido entero en vez de mirar un instante.

     SE MIDE LA RACHA, NO LAS MUESTRAS SUELTAS, y la diferencia importa. La
     barra recorre de -100% a 294% de su propio ancho, así que en el empalme del
     bucle queda un frame exactamente al filo de la pista: medido con
     requestAnimationFrame sobre dos ciclos completos —226 frames— el solape
     mínimo es 0.43 px, aparece UNA vez y no se repite nunca dos frames
     seguidos. Es el diseño, y está escrito así arriba de la animación.

     La versión anterior exigía «más de 1 px SIEMPRE», lo que convertía ese
     frame invisible en una falla y dejaba el resultado librado a dónde cayera
     el muestreo. Lo que de verdad hay que prohibir es que la pista quede vacía
     un RATO —lo único que un ojo alcanza a ver— y eso es una racha. */
  console.log('\n6. El medidor indeterminado nunca deja la pista vacía');
  const pista = await js(`(async () => {
    const m = document.querySelector('.op-meter--indeterminate');
    const f = m && m.querySelector('.op-meter__fill');
    if (!f) return { error: 'no existe' };
    const muestras = [];
    for (let i = 0; i < 40; i++) {
      const p = m.getBoundingClientRect(); const r = f.getBoundingClientRect();
      muestras.push(Math.min(r.right, p.right) - Math.max(r.left, p.left));
      await new Promise(res => setTimeout(res, 50));
    }
    let racha = 0; let peor = 0;
    for (const v of muestras) { if (v < 1) { racha++; peor = Math.max(peor, racha); } else racha = 0; }
    return { peor, min: Math.round(Math.min(...muestras) * 100) / 100, n: muestras.length };
  })()`);
  ok('la barra nunca falta dos muestras seguidas',
    pista && !pista.error && pista.peor <= 1, JSON.stringify(pista));

  console.log('\n6-bis. El campo numérico y sus flechas');
  /* Lo que se mide no es que el botón exista: es que el VALOR cambie, que el
     evento salga (los listeners de las apps escuchan al input, no al botón), y
     que el spinner de Chromium no esté asomando por debajo. */
  const paso = await js(`(async () => {
    const root = document.getElementById('demo-stepper');
    if (!root) return { error: 'no existe el stepper' };
    const input = root.querySelector('input[type="number"]');
    const arriba = root.querySelector('[data-step="up"]');
    const abajo = root.querySelector('[data-step="down"]');

    let cambios = 0;
    input.addEventListener('change', () => cambios++);

    const tocar = (b) => {
      const o = { bubbles: true, pointerId: 1, pointerType: 'mouse' };
      b.dispatchEvent(new PointerEvent('pointerdown', o));
      b.dispatchEvent(new PointerEvent('pointerup', o));
    };

    input.value = '1';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    tocar(arriba);
    const trasSubir = input.value;
    tocar(abajo); tocar(abajo);
    const trasBajar = input.value;

    // Al mínimo (1) la flecha de abajo tiene que quedar apagada.
    const abajoApagado = abajo.disabled;

    // Y al máximo (12), la de arriba.
    for (let i = 0; i < 20; i++) tocar(arriba);
    const tope = input.value;
    const arribaApagado = arriba.disabled;

    const spinner = getComputedStyle(input, '::-webkit-inner-spin-button');
    return {
      trasSubir, trasBajar, tope, cambios, abajoApagado, arribaApagado,
      spinnerOculto: spinner.appearance === 'none' || spinner.display === 'none',
      apariencia: getComputedStyle(input).appearance,
    };
  })()`);
  ok('subir suma uno', paso.trasSubir === '2', JSON.stringify(paso));
  ok('bajar no pasa del mínimo', paso.trasBajar === '1', paso.trasBajar);
  ok('y ahí la flecha de abajo se apaga', paso.abajoApagado === true);
  ok('no pasa del máximo', paso.tope === '12', paso.tope);
  ok('y ahí se apaga la de arriba', paso.arribaApagado === true);
  /* 1→2, 2→1 (el segundo click no mueve nada), y 11 subidas hasta 12. */
  ok('cada paso real despacha change', paso.cambios === 13, `${paso.cambios}`);
  ok('el input no muestra el control nativo', paso.apariencia === 'textfield', paso.apariencia);

  console.log('\n7. La fuente empaquetada carga de verdad');
  /* Éste es el chequeo que evita el fracaso silencioso: con CSP estricta y
     protocolo file://, un @font-face con la ruta mal puesta no tira error —
     el navegador cae a la de respaldo y todo "se ve bien". Por eso no alcanza
     con preguntar por --op-mono: hay que confirmar que la familia cargó Y que
     realmente cambia el ancho del texto. */
  const fuente = await js(`(async () => {
    await document.fonts.ready;
    const cargadas = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ':' + f.weight);
    const medir = (fam) => { const s = document.createElement('span');
      s.style.cssText = 'position:fixed;left:-9999px;font-size:64px;white-space:pre;font-family:' + fam;
      s.textContent = 'MMMiiilll0O1'; document.body.appendChild(s);
      const w = s.getBoundingClientRect().width; s.remove(); return Math.round(w); };
    return {
      cargadas,
      declarada: getComputedStyle(document.documentElement).getPropertyValue('--op-mono').trim(),
      roboto: medir("'Roboto Mono'"), serif: medir('serif'),
      disponible: document.fonts.check('400 13px "Roboto Mono"'),
    };
  })()`);
  ok('el @font-face resolvió a archivos reales', fuente.cargadas.length > 0, JSON.stringify(fuente.cargadas));
  ok('Roboto Mono está disponible para pintar', fuente.disponible, JSON.stringify(fuente));
  ok('y NO está cayendo a la de respaldo', fuente.roboto !== fuente.serif, `roboto=${fuente.roboto} serif=${fuente.serif}`);
  // Ojo: getComputedStyle RESUELVE el var(), así que acá se ve la familia final
  // y no la indirección. Que --op-mono apunte a un token se verifica sobre el
  // texto del CSS, en tokens.test.mjs.
  ok('la familia efectiva es la empaquetada', fuente.declarada.includes('Roboto Mono'), fuente.declarada);

  const monos = await js(`document.querySelectorAll('#knob-mono [data-mono]').length`);
  ok('la vitrina descubrió las monos declaradas', monos >= 2, `${monos}`);
  const antesMono = await js(`getComputedStyle(document.querySelector('#mono-sample')).fontFamily`);
  await click('#knob-mono [data-mono="sistema"]');
  await sleep(300);
  ok('cambiar la mono cambia lo que se pinta',
    (await js(`getComputedStyle(document.querySelector('#mono-sample')).fontFamily`)) !== antesMono);

  console.log('\n8. Las perillas re-tintan de verdad');
  const antes = await js(`getComputedStyle(document.body).backgroundColor`);
  await js(`(() => { const h=document.getElementById('knob-hue'); h.value=30; h.dispatchEvent(new Event('input')); return true; })()`);
  await sleep(300);
  ok('cambiar el matiz cambia el fondo', (await js(`getComputedStyle(document.body).backgroundColor`)) !== antes);
  await click('#knob-reset');
  await sleep(300);
  ok('el reset vuelve al original', (await js(`getComputedStyle(document.body).backgroundColor`)) === antes);

  /* El color que el renderer le manda a la ventana.
     Va acá y no en tokens.test.mjs porque ese test compara ARCHIVOS: verifica
     que el hex de main.cjs derive del token. Este mide lo que pasa en tiempo
     de ejecución, que es otra cosa y es donde estuvo el bug — el renderer
     pisaba el backgroundColor correcto con uno mal traducido. */
  console.log('\n8-bis. El color que va a la ventana');
  const colorVentana = await js(`(async () => {
    const { colorToken, aHex } = await import('./js/ui.js');
    const computado = (() => {
      const p = document.createElement('span');
      p.style.cssText = 'position:fixed;left:-9999px;color:var(--op-bg)';
      document.body.appendChild(p);
      const c = getComputedStyle(p).color;
      p.remove();
      return c;
    })();
    return {
      computado,
      hex: colorToken('--op-bg'),
      // El regex viejo, para dejar constancia de qué habría devuelto.
      conRegexViejo: (() => {
        const n = computado.match(/[0-9]+/g);
        return n ? '#' + n.slice(0, 3).map((x) => Number(x).toString(16).padStart(2, '0')).join('') : null;
      })(),
      // aHex tiene que dar lo mismo pase lo que pase por la notación.
      desdeRgb: aHex('rgb(10, 11, 13)'),
      desdeHex: aHex('#0a0b0d'),
    };
  })()`);
  ok('el token resuelve a un hex de 6 dígitos',
    /^#[0-9a-f]{6}$/i.test(colorVentana.hex || ''), JSON.stringify(colorVentana));
  ok('coincide con el backgroundColor de main.cjs',
    colorVentana.hex.toLowerCase() === BG_MAIN, `${colorVentana.hex} vs ${BG_MAIN}`);
  /* La red de seguridad de verdad: que el fondo NO sea un color saturado. El
     bug daba #009500 —un hex perfectamente válido— así que validar la FORMA no
     alcanza; hay que mirar el color. */
  ok('y no es un verde/magenta salido de parsear mal el oklch', (() => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(colorVentana.hex.slice(i, i + 2), 16));
    return Math.max(r, g, b) - Math.min(r, g, b) < 40;
  })(), `${colorVentana.hex} (el regex viejo daba ${colorVentana.conRegexViejo})`);
  ok('aHex normaliza cualquier notación',
    colorVentana.desdeRgb === '#0a0b0d' && colorVentana.desdeHex === '#0a0b0d',
    JSON.stringify(colorVentana));

  /* ── Botones de solo ícono ─────────────────────────────────────────────────
     Un botón que solo lleva un SVG tiene que tenerlo centrado. Suena obvio y no
     lo era: Chromium le da `padding: 1px 6px` a todo `<button>` y este reset no
     lo tocaba. En los controles chicos eso deja la caja de contenido más
     angosta que el ícono; el ícono desborda, y un ítem de grid que desborda su
     área cae de `center` a `start`. El tilde del `.op-check` salía 4px a la
     derecha y recortado contra el borde; el `.op-iconbtn`, 1,5px — invisible de
     a uno y repetido en la titlebar, el rail y cada fila.

     Corre sobre Piezas, que es donde están todos los primitivos juntos. */
  console.log('\n8-ter. Los botones de solo ícono centran su contenido');
  const descentrados = await js(`(() => {
    const malos = [];
    for (const b of document.querySelectorAll('button')) {
      // Solo ícono: un único hijo elemento, que es un svg, y sin texto.
      if (b.children.length !== 1 || b.textContent.trim()) continue;
      const hijo = b.firstElementChild;
      if (hijo.tagName.toLowerCase() !== 'svg') continue;
      const rb = b.getBoundingClientRect();
      const rh = hijo.getBoundingClientRect();
      if (!rb.width || !rh.width) continue;
      const d = ((rh.left + rh.right) / 2) - ((rb.left + rb.right) / 2);
      const desborda = rh.right > rb.right + 0.5 || rh.left < rb.left - 0.5;
      if (Math.abs(d) > 0.51 || desborda) {
        malos.push({ clase: b.className.slice(0, 34), corrimiento: +d.toFixed(2), desborda });
      }
    }
    return { malos, revisados: [...document.querySelectorAll('button')].length };
  })()`);
  ok('ninguno tiene el ícono corrido ni desbordado',
    descentrados.malos.length === 0, JSON.stringify(descentrados.malos));
  ok('y había botones que revisar', descentrados.revisados > 10, `${descentrados.revisados}`);

  /* ── La tarjeta sin encabezado ──────────────────────────────────────────────
     `.op-card__body` llevaba `padding-top: 0` para no repetir el aire que el
     `__head` ya pone. Con head quedaba perfecto; SIN head el contenido se
     pegaba al borde de arriba — 0 px contra 16 abajo.

     Vivió tanto porque esta misma vitrina mostraba UNA tarjeta y con `padding`
     inline: el único lugar que existe para ver las piezas era el único donde la
     pieza rota no se veía. */
  console.log('\n8-quater. Las dos formas de la tarjeta');

  const tarjetas = await js(`(() => [...document.querySelectorAll('.op-card__body')].map((b) => {
    const s = getComputedStyle(b);
    const head = b.previousElementSibling?.classList.contains('op-card__head');
    const arriba = b.getBoundingClientRect().top - b.closest('.op-card').getBoundingClientRect().top;
    return {
      head: !!head,
      top: parseFloat(s.paddingTop),
      bottom: parseFloat(s.paddingBottom),
      // Lo que de verdad separa al contenido del filo: el padding del cuerpo
      // MÁS lo que haya arriba de él.
      aire: +(arriba + parseFloat(s.paddingTop)).toFixed(1),
    };
  }))()`);

  const sinHead = tarjetas.filter((t) => !t.head);
  const conHead = tarjetas.filter((t) => t.head);

  ok('la vitrina muestra las dos formas', sinHead.length > 0 && conHead.length > 0,
    JSON.stringify(tarjetas));
  ok('sin encabezado, el cuerpo pone su propio aire arriba',
    sinHead.every((t) => t.top > 0 && t.top === t.bottom), JSON.stringify(sinHead));
  /* Y el arreglo NO puede romper el caso que ya estaba bien: con head, repetir
     el padding separaría el cuerpo de su propio título. */
  ok('con encabezado, el cuerpo NO lo repite', conHead.every((t) => t.top === 0),
    JSON.stringify(conHead));
  ok('pero el contenido igual queda separado del filo',
    tarjetas.every((t) => t.aire >= 12), JSON.stringify(tarjetas.map((t) => t.aire)));

  /* ── El vidrio está puesto donde va, y solo ahí ────────────────────────────
     La regla de las hojas es fácil de romper en las dos direcciones: una card
     que hereda blur "porque queda lindo" (paga GPU en cada scroll) o un shell
     que lo pierde en una refactorización (y el sistema entero deja de ser
     vidrio sin que ningún test de unidad lo note). Se mide el computado, no
     la clase: lo que importa es lo que pinta el compositor. */
  console.log('\n8-quinquies. El vidrio: en el shell y los overlays, no en las cards');
  const vidrio = await js(`(() => {
    const bf = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).backdropFilter : null; };
    return { fog: !!document.querySelector('.op-fog'), titlebar: bf('.op-titlebar'),
             rail: bf('.op-rail'), card: bf('.op-card') };
  })()`);
  ok('el sustrato de niebla existe', vidrio.fog);
  ok('la titlebar es vidrio (blur en el computado)', /blur\(/.test(vidrio.titlebar || ''), String(vidrio.titlebar));
  ok('el rail es vidrio', /blur\(/.test(vidrio.rail || ''), String(vidrio.rail));
  ok('la card NO lleva blur de fábrica (regla de las hojas)', vidrio.card === 'none', String(vidrio.card));

  await click('#demo-menu');
  await sleep(400);
  const menuGlass = await js(`(() => { const m = document.querySelector('.op-menu'); return m ? getComputedStyle(m).backdropFilter : null; })()`);
  ok('el menú es vidrio', /blur\(/.test(menuGlass || ''), String(menuGlass));
  await js(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); true`);
  await sleep(400);

  /* La demo de la vitrina vive ADENTRO del scroller, donde el backdrop queda
     ciego (la máscara del esfumado es frontera): tiene que usar el ESPEJO —
     copia del fondo con filter, alineada al píxel — y no backdrop-filter. */
  const espejo = await js(`(() => {
    const demo = document.getElementById('glass-demo');
    const hoja = document.getElementById('glass-hoja');
    const copia = document.querySelector('#glass-espejo > div');
    if (!demo || !hoja || !copia) return null;
    const rd = demo.getBoundingClientRect(); const rc = copia.getBoundingClientRect();
    return {
      filtro: getComputedStyle(copia).filter,
      alineada: Math.abs(rc.left - rd.left) < 1.5 && Math.abs(rc.top - rd.top) < 1.5
             && Math.abs(rc.width - rd.width) < 1.5 && Math.abs(rc.height - rd.height) < 1.5,
      sinBackdrop: getComputedStyle(hoja).backdropFilter === 'none',
    };
  })()`);
  ok('la demo usa el espejo (filter con blur en la copia)', /blur\(/.test(espejo?.filtro || ''), JSON.stringify(espejo));
  ok('la copia queda alineada con el fondo', espejo?.alineada === true, JSON.stringify(espejo));
  ok('y la hoja no intenta backdrop adentro del scroller', espejo?.sinBackdrop === true);
  /* Sin base opaca, el espejo solo SUMA borrón y el texto real de abajo se
     sigue leyendo nítido a través del relleno translúcido: la oclusión es
     parte del truco, no un detalle. */
  const espejoOpaco = await js(`(() => {
    const host = document.getElementById('glass-espejo');
    if (!host) return null;
    const c = getComputedStyle(host).backgroundColor;
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    const alfa = m && m[1].split(',').length === 4 ? parseFloat(m[1].split(',')[3]) : 1;
    return { color: c, alfa };
  })()`);
  ok('y el espejo es opaco (ocluye el original)', espejoOpaco && espejoOpaco.alfa >= 0.99, JSON.stringify(espejoOpaco));

  /* ── Rutas largas: el pie del rail trunca y el tooltip contiene ────────────
     El bug real: en dev la ruta de datos es corta y todo parece andar; la app
     INSTALADA llega con C:\Users\...\Roaming\App\data y el span inline no
     trunca (text-overflow pide caja de bloque) mientras el tooltip desborda
     su burbuja (una cadena sin espacios no envuelve sin overflow-wrap). Se
     inyecta una ruta larga y se miden CAJAS, no clases. */
  console.log('\n8-sexies. Rutas largas: el pie trunca y el tooltip contiene');
  const rutas = await js(`(async () => {
    const foot = document.getElementById('rail-foot');
    const original = foot.innerHTML;
    const ruta = ['C:', 'Users', 'usuario', 'AppData', 'Roaming', 'UnaAppDeNombreLargo', 'data'].join('\\\\');
    foot.innerHTML = '<span class="op-meta op-truncate"></span>';
    const el = foot.firstElementChild;
    el.dataset.tip = ruta;
    el.textContent = ruta;
    const r = {
      truncado: el.scrollWidth > el.clientWidth + 1,
      elipsis: getComputedStyle(el).textOverflow === 'ellipsis',
      contenido: el.getBoundingClientRect().right <= foot.getBoundingClientRect().right + 1,
    };
    el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await new Promise((res) => setTimeout(res, 700));
    const tip = document.querySelector('.op-tooltip');
    if (tip) {
      const rt = tip.getBoundingClientRect();
      const ra = el.getBoundingClientRect();
      r.tip = {
        dentroDeSi: tip.scrollWidth <= tip.clientWidth + 1 && tip.scrollHeight <= tip.clientHeight + 1,
        centradoOClampeado: Math.abs((rt.left + rt.right) / 2 - (ra.left + ra.right) / 2) < 12 || rt.left <= 12,
        enVentana: rt.left >= 0 && rt.right <= window.innerWidth,
      };
    }
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    foot.innerHTML = original;
    return r;
  })()`);
  ok('la ruta larga trunca con elipsis', rutas.truncado && rutas.elipsis, JSON.stringify(rutas));
  ok('y no desborda el rail', rutas.contenido === true);
  ok('el tooltip contiene su texto (nada cuelga afuera del vidrio)', rutas.tip?.dentroDeSi === true, JSON.stringify(rutas.tip));
  ok('y queda centrado sobre el ancla (o clampeado al borde) y en ventana',
    rutas.tip?.centradoOClampeado === true && rutas.tip?.enVentana === true, JSON.stringify(rutas.tip));

  console.log('\n9. Las reglas de oro');
  const glifos = await js(`(() => {
    const malo = /[\\u2190-\\u21FF\\u2300-\\u23FF\\u25A0-\\u27BF\\u2B00-\\u2BFF\\uFE0F\\u{1F300}-\\u{1FAFF}]/u;
    const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) if (malo.test(n.nodeValue)) out.push(n.nodeValue.trim().slice(0, 40));
    return out;
  })()`);
  ok('cero emojis y glifos unicode en la UI', glifos.length === 0, JSON.stringify(glifos));
  ok('cero title= nativo', (await js(`document.querySelectorAll('[title]').length`)) === 0);
  const reglas = await js(`(() => { const r = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules] } catch { return [] } })
      .map(x => x.selectorText).filter(Boolean).join(' ');
    return { scrollbar: r.includes('::-webkit-scrollbar'), seleccion: r.includes('::selection'), focus: r.includes(':focus-visible') }; })()`);
  ok('scrollbar propia', reglas.scrollbar);
  ok('::selection propia', reglas.seleccion);
  ok('focus ring propio (:focus-visible)', reglas.focus);

  // Los datos eran de mentira y temporales: se van con el test.
  fs.rmSync(DATA, { recursive: true, force: true });

  console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
  console.log(errores.length ? `CONSOLA:\n  ${errores.join('\n  ')}` : 'CONSOLA: limpia');
  app.exit(fail || errores.length ? 1 : 0);
});
