# Opal — referencia del sistema

La versión que se toca está adentro de la app, en **Piezas**. Esto es para
buscar mientras escribís.

Todo lleva el prefijo `op-`. Los modificadores van con `--`, los elementos con
`__`, y los estados son clases `is-*` o atributos `data-state`.

La física de Opal en una frase: **una sola superficie opaca** (el fondo), una
**niebla** encima (`.op-fog`), y de ahí para arriba HOJAS de luz translúcida y
POZOS de sombra. El vidrio (`backdrop-filter`) va solo en el shell y en los
overlays — la regla de las hojas, abajo.

---

## Tokens

Todos en [`renderer/css/tokens.css`](../renderer/css/tokens.css). Ningún
componente escribe un valor crudo.

### Superficies — hojas y pozos

| Token | Qué es | Para qué |
|---|---|---|
| `--op-bg` | **La única opaca** | Base de la ventana (y el hex de main.cjs) |
| `--op-sunken` / `-2` | Pozo (alfa de negro) | Campos, consola, lienzo; `-2` con foco |
| `--op-s1` | Hoja (alfa de blanco) | Rail, titlebar, statusbar |
| `--op-s2` | Hoja | Card, panel, fila elevada |
| `--op-s3` | Hoja | Menú, modal, popover, tooltip |
| `--op-s4` | Hoja | Lo más alto: lo que flota sobre todo |

Cuanto más alto flota algo, más luz junta. Como todo es alfa sobre el fondo,
el mismo componente funciona sobre la niebla, sobre una card o sobre un modal
sin declarar variantes por contexto.

### El vidrio

| Token | Qué es |
|---|---|
| `--op-glass` | `backdrop-filter` listo: `blur(--op-blur) saturate(135%)` |
| `--op-glass-heavy` | Lo mismo, ×1.65 — titlebar, menú, modal |
| `--op-edge-lit` | El canto superior iluminado de una hoja |
| `--op-sheet` | El contorno de hoja completo: canto + hairline perimetral |

**La regla de las hojas:** `backdrop-filter` va SOLO donde puede muestrear —
el shell, los overlays (portaleados a `#op-layer`), y hojas directas de la
vista **fuera del scroller** (`.op-card--glass`). Lo que vive *adentro* de una
hoja es relleno translúcido sin blur: desenfocar lo ya desenfocado cuesta GPU y
no se ve. Y el blur **no se anima nunca** — todo entra y sale por `opacity` y
`transform`, con el blur ya puesto.

Una hoja de vidrio que entra moviéndose dejaba en Prism 0.2.13 una línea
blanca en su canto de arriba contra una página clara: Chromium recalculaba el
blur en cada cuadro. Con Electron 44 (Chromium 152), medido como allá
(congelando la entrada del menú y del modal en 30, 70 y 120 ms sobre blanco,
gris y un borde claro justo debajo del canto), el canto nunca está más claro
que quieto. Por eso los overlays siguen siendo vidrio y siguen entrando con su
movimiento. El humo lo vigila (sección 19): si una versión de Chromium lo trae
de vuelta, la salida es la de Prism, una hoja opaca mientras se mueve, o que
el vidrio entre solo por opacidad.

**La frontera de backdrop** (dos veces cazada a píxel): un ancestro con máscara
(el esfumado de `.op-scroll`) o con una animación de opacidad retenida deja al
vidrio interno CIEGO — el blur computa pero no muestrea, y lo de abajo se lee
nítido a través. `isolation: isolate` NO lo arregla. El router ya suelta
`.op-view` al terminar; para vidrio adentro de un scroller, el truco del
espejo: una copia del contenido esmerilada con `filter` y alineada por JS —
la vitrina lo muestra hecho.

La receta de una hoja nueva: `background: var(--op-s2)` +
`box-shadow: var(--op-sheet), var(--op-e2)` + radio `--op-r-lg`. Si además
flota directo sobre la niebla, `backdrop-filter: var(--op-glass)`.

### Texto — escalera de énfasis

`--op-text` (primario, nunca blanco puro) · `--op-text-2` (secundario) ·
`--op-text-3` (muted: metadatos, labels, atajos) · `--op-text-4` (faint:
deshabilitado, placeholder, íconos de adorno).

`--op-text-3` es el gris más bajo que todavía **se lee**: pasa 4,5:1 (WCAG,
texto chico) sobre el fondo y sobre las tres hojas, y el test de tokens lo
verifica. `--op-text-4` no se lee y no lleva datos: la ayuda de un campo, una
clave de `.op-kv`, el atajo de un menú, la hora de un log o un estado vacío van
en `--op-text-3` (`.op-dim`), nunca en `--op-text-4` (`.op-dim2`).

### Acento — la luz no rellena, talla

`--op-accent` y sus derivados: `--op-wash-1` (hover sutil), `--op-wash-2` (hover
fuerte / seleccionado), `--op-wash-3` (activo / presionado), `--op-ring` (focus),
`--op-select` (`::selection`). Todos salen de `--op-accent-rgb`: cambiar el
triplete los re-tinta a todos.

**El anillo de foco es un `outline`**, no un `box-shadow` (base.css): casi todos
los controles declaran su propia sombra en una hoja que carga después, con la
misma especificidad, y la sombra del anillo perdía (el primario, el secundario,
el switch, el check y el select quedaban sin ninguna marca). Lo que marca el
foco a su manera (un campo que se hunde) lo apaga con `outline: none`, nunca
con `box-shadow: none`.

**La ley de Opal:** el acento nunca rellena un plano. Vive en cantos, líneas y
puntos — el rim del primario, el fill de 3px del meter y el slider, el halo de
`running`, el subrayado del tab. El énfasis se **talla**: `--op-deep` /
`--op-deep-2` (el pozo) + `--op-rim` / `--op-rim-2` (el canto vivo, derivado del
acento). Por eso con un acento cian el primario no se vuelve un botón cian: se
vuelve obsidiana con el canto cian.

`--op-accent-ink` existe para tinta sobre un plano de acento si tu app llega a
pintar uno — el sistema base ya no lo hace.

### Rojo

`--op-danger`, `--op-danger-dim`, `--op-danger-hover` (el sólido bajo el
mouse), `--op-danger-wash`, `--op-danger-ring`. Reservados al fallo. Si el rojo
aparece decorando, deja de significar.

`--op-scrim` (el velo detrás de un modal) y `--op-foot` (el pie del modal, que
se hunde apenas) también son tokens: en el CSS de las piezas no queda un color
escrito a mano.

### Hairlines, elevación, radios

`--op-line` / `-2` / `-3` para divisores finos — **siempre como
`box-shadow: inset 0 0 0 1px`**, porque un `border` real deja hilacha en las
esquinas redondeadas con `overflow:hidden`. `--op-hairline` ya viene armado, y
`--op-sheet` es el hairline + el canto iluminado, para hojas.

Sombras: `--op-e1` a `--op-e4` — largas y suaves; una hoja de vidrio flota
lejos de lo que tapa. Radios: `--op-r-xs` (4) a `--op-r-xl` (16), más
`--op-r-pill`. Los overlays usan `lg`/`xl`: lo que flota redondea medio punto
más.

### Espaciado y tipografía

Escala de 4: `--op-1` (4px) a `--op-10` (72px). Tamaños: `--op-fs-10` a
`--op-fs-26`. Pesos: `--op-w-regular` / `-medium` / `-semi`. Tracking:
`--op-track-tight` para lo grande, `--op-track-caps` para versalitas.

`--op-font` es la sans (sale del sistema). `--op-mono` es la monoespaciada y es
una **perilla**: apunta a un token `--op-mono-*`, nunca directo a una familia.
Las empaquetadas viven en `renderer/fonts/` y se declaran en `fonts.css`.

```
node tools/retint.mjs --mono sistema     # roboto | sistema
```

Para sumar una: el `.woff2` en `renderer/fonts/`, su `@font-face` en
`fonts.css`, y su token en `tokens.css`. **Declará todos los pesos que uses** —
si falta el 500, el navegador engorda el 400 a mano y en una monoespaciada se
nota. Aparece sola en **Piezas**, que descubre los tokens leyendo las hojas de
estilo.

### Movimiento

| Token | Curva | Para |
|---|---|---|
| `--op-ease` | expo-out | El default. Sale rápido, frena largo |
| `--op-ease-soft` | cubic-out | Micro-hovers |
| `--op-ease-both` | in-out | Lo que va y vuelve |
| `--op-ease-in` | in | Salidas |

Duraciones: `--op-t-1` (110ms, hover, y la salida de los overlays chicos:
tooltip, menú) · `--op-t-2` (180ms, el default) · `--op-t-3` (280ms, overlays) ·
`--op-t-4` (420ms, la vista que aflora al arrancar) · `--op-t-out` (150ms, lo
que se va en su lugar: el valor viejo de un relevo, la fila que sale de una
lista). Lo que se anima desde JS (`motion.js`) lee estas mismas perillas.

Transiciones ya compuestas: `--tr-color`, `--tr-move`, `--tr-fade`,
`--tr-surface`. **Nunca `transition: all`** — anima propiedades que no querías
y cuesta caro en repaints.

---

## Utilidades

`.op-row` · `.op-col` · `.op-grow` · `.op-spacer` · `.op-truncate` ·
`.op-scroll` (con esfumado) · `.op-scroll-x` · `.op-hr` · `.op-vr`

El esfumado de `.op-scroll` va **solo donde el corte es al aire**. Si de ese lado
hay una línea — la statusbar, el pie de un panel, el hairline del propio bloque —
esa línea ya es el límite: el fade encima la ensucia, y además miente, porque el
contenido no se pierde en la nada sino que muere contra un borde.

```html
<div class="op-scroll op-scroll--line-bottom">…</div>
```

Modificadores: `--line-top` · `--line-bottom` (y `--line-left` · `--line-right`
en `.op-scroll-x`). El shell ya los aplica donde corresponde, y con `:has()`, así
que si sacás la pieza que cerraba ese lado el fade vuelve solo: rail contra su
pie, inspector contra el suyo, vista contra la statusbar, modal contra su pie. **El menú no esfuma nunca** — su hairline lo cierra por
los cuatro lados, y como máscara y borde viven en el mismo elemento, el fade le
comía el propio hairline. El tamaño lo da `--op-fade`, y el contenedor lleva
padding ≥ ese valor para que en reposo la banda no coma el primer ni el último
ítem.

`.op-title` · `.op-subtitle` · `.op-display` · `.op-label` · `.op-meta` ·
`.op-eyebrow` (versalita espaciada) · `.op-mono` · `.op-num` (tabular) ·
`.op-dim` · `.op-dim2` · `.op-danger`

`.op-copyable` — marca contenido como seleccionable. Ante la duda, ponelo.

`.op-icon` con `--sm` / `--lg` / `--xl` / `--fill`.

---

## Shell

```html
<div class="op-app">
  <header class="op-titlebar">
    <div class="op-brand op-no-drag">…</div>
    <div class="op-titlebar__context" id="titlebar-context"></div>
    <div class="op-wincontrols">
      <button class="op-wincontrol">…</button>
      <button class="op-wincontrol op-wincontrol--close">…</button>
    </div>
  </header>
  <div class="op-body">
    <nav class="op-rail">
      <div class="op-rail__top">…</div>
      <div class="op-rail__nav op-scroll">
        <div class="op-rail__group">
          <div class="op-rail__group-label">Sección</div>
          <button class="op-navitem" data-view="x">… <span class="op-navitem__count">3</span></button>
        </div>
      </div>
      <div class="op-rail__foot">…</div>
    </nav>
    <main class="op-main" id="view"></main>
  </div>
  <footer class="op-statusbar">
    <div class="op-statusbar__item"><span class="op-statusbar__value">…</span></div>
  </footer>
</div>
<div id="op-layer"></div>
```

La titlebar entera es zona de arrastre; lo que sea clickeable lleva
`.op-no-drag`. `#op-layer` es donde se portalean todos los overlays.

Los `.op-wincontrol` se clickean en todo el alto de la titlebar (maximizada,
la esquina acierta la cruz), pero se ven como una pastilla de 28 px adentro:
hover, press y el anillo de foco no llegan al canto de la ventana, donde se
cortaban. Si la titlebar tiene otras piezas al lado (pestañas, por ejemplo),
`--op-wincontrol-nudge` corre la pastilla en vertical para alinearla.

### El anillo de foco no se corta

El anillo de `base.css` sale **3.5px por fuera** del elemento (1.5px de
outline a 2px de distancia). Todo lo que pueda recibir foco necesita ese aire
hasta cualquier cosa que recorte (un `.op-scroll`, el borde de la ventana) y
hasta el canto de la superficie que lo contiene. Donde no lo hay, el anillo va
**hacia adentro** con un `outline-offset` negativo: así lo llevan el
`.op-segmented__opt` (2px de carril) y la `.op-tr` con tabindex (va de borde a
borde, muchas veces de una card). El rail deja `--op-2` arriba del nav por lo
mismo, y de paso separa el botón principal de la navegación. `npm run smoke`
lo mide en cada vista (9-bis): si sumás una pieza que pega su anillo contra un
borde, o una que con Tab no muestra nada, falla ahí.

### Dentro de la vista

`head({ title, sub, crumbs, actions })` de `ui.js` arma el `.op-viewhead`.

Hay dos layouts. El simple, que es el 90% de las vistas:

```html
<div class="op-scroll op-grow">…</div>
```

Y el de dos paneles:

```html
<div class="op-viewbody">
  <div class="op-viewbody__main">…</div>
  <aside class="op-inspector">
    <div class="op-inspector__head">…</div>
    <div class="op-inspector__body op-scroll">…</div>
    <div class="op-inspector__foot">…</div>
  </aside>
</div>
```

**La sangría lateral la pone el shell, en los dos.** No le agregues padding
horizontal a tu contenedor: el contenido arranca en la misma columna que el
título de la vista, y el número sale de un solo lugar. Lo que va de borde a
borde —un lienzo, un mapa— lleva `.op-bleed`.

`.op-inspector.is-collapsed` lo cierra con transición. `.op-viewbody__main` es
`position:relative` para anclar controles flotantes: si viven dentro del
contenedor que scrollea, se van de pantalla con el contenido.

---

## Controles

### Botones

`.op-btn` + una variante: `--primary` (uno solo por pantalla) · `--secondary` ·
`--ghost` · `--danger` · `--danger-solid` (lo que no tiene vuelta atrás).
Tamaños `--sm` / `--lg`. `.op-iconbtn` (+`--sm`) para los de solo ícono.

Agregá `.op-flashable` para el velo de luz al presionar. Se cablea solo con
`initClickFlash()`.

### Campos

```html
<div class="op-field">
  <label class="op-field__label">Nombre</label>
  <input class="op-input" spellcheck="false">
  <span class="op-field__hint">Ayuda</span>
</div>
```

`.op-input.is-invalid` + `.op-field__hint--error` para el error.
`.op-textarea`, `--mono` en ambos. `.op-inputwrap` para meter un ícono adentro.

### Los que no son nativos

| Clase | Notas |
|---|---|
| `.op-select` | Es un `<button>`. Abre un `Menu` propio, no un `<select>` |
| `.op-stepper` | Envuelve un `<input type=number>` y le pone flechas propias. Cablealo con `bindStepper()` |
| `.op-switch` | `.is-on` lo prende. Cablealo con `bindToggle()` |
| `.op-check` | `.is-on`; el tilde se dibuja con `stroke-dashoffset`. También `bindToggle()` |
| `.op-slider` | `<input type=range>` estilado; seteale `--op-pct` |
| `.op-segmented` | La cápsula viaja. Cablealo con `bindSwitcher()` |
| `.op-iconswap` | Un botón con dos íconos en la misma celda; `.is-b` muestra el segundo y se cruzan. `--swap-out` y `--swap-in` cambian cómo se van y llegan (por defecto, `scale(.75)`) |
| `.op-kbd` | Una tecla |

`bindSwitcher(el, onChange)` de `motion.js` sirve para `.op-segmented` y
`.op-tabs`: maneja el activo, hace viajar el indicador y reajusta al
redimensionar. El indicador nace en su lugar (antes viajaba desde la izquierda
cada vez que se pintaba la vista) y solo viaja al elegir, o al repintar si la
opción cambió. También marca la elegida para un lector de pantalla
(`aria-pressed` en el segmentado; `role=tab` y `aria-selected` en los tabs).

`bindToggle(el, onChange)` alterna un `.op-switch` o un `.op-check` y le pone
`role` (`switch` o `checkbox`) y `aria-checked`: sin eso, para un lector de
pantalla es «botón» a secas, prendido o apagado. Devuelve `set(on)` para
cambiarlo desde afuera.

Un `.op-iconbtn` con `disabled` se ve apagado. Las flechas de un `.op-stepper`
que andan van en `--op-text-3` (un control pide 3:1), y la del tope en
`--op-text-4`.

Un `.op-input` mide 30 px, lo mismo que un `.op-select` y un `.op-btn`: en una
fila de controles no hay dos alturas.

### Un botón nuevo declara SU padding

`base.css` pone `button { padding: 0 }`. No lo saques y no confíes en el padding
de fábrica: Chromium le da `1px 6px` a todo `<button>`, y con `box-sizing:
border-box` eso se come el interior de los controles chicos. En un `.op-check`
de 15px dejaba una caja de contenido de 3px para un ícono de 11 — el ícono
desbordaba, y **un ítem de grid que desborda su área cae de `center` a
`start`**, así que el tilde salía 4px a la derecha y recortado contra el borde.
El `.op-iconbtn` tenía lo mismo en chico (1,5px), invisible de a uno y presente
en toda la app.

El de humo lo vigila: recorre Piezas y falla si algún botón de solo ícono tiene
el SVG corrido más de medio píxel o desbordando.

---

## Superficies

`.op-card` con `__head` / `__body` / `__foot`; `--interactive` le agrega hover.
`.op-section` con `__head` / `__title`. `.op-sunken` para lo hundido.

`.op-list` + `.op-listitem` con `__main` / `__title` / `__sub` / `__aside`.
Las acciones van en `.op-rowactions` (aparecen con el hover).

`.op-table` + `.op-tr`; `.op-td--num` alinea a la derecha con cifras tabulares,
`.op-td--tight` achica el padding. Una `.op-tr` que se abre con Enter lleva
`tabindex="0"`, y su anillo de foco es un outline hacia adentro, pintado
encima de las celdas.

`.op-kv` para pares clave/valor (`__k` / `__v`). `.op-stat` para una cifra
grande (`__value` / `__unit` / `__label`).

`.op-chip` (+ `--mono` / `--outline` / `--danger`) · `.op-avatar` (+ `--lg`) ·
`.op-empty` (`__title` / `__text`) · `.op-skeleton` · `.op-iconcell`.

`.op-meter` + `.op-meter__fill`, con `--op-pct`. `--danger` lo pinta rojo,
`--indeterminate` lo hace recorrer la pista.

`.op-log` para consolas: `__line` (+`--error` / `--muted`), `__time`, `__src`,
`__msg`.

### Estado

```html
<span class="op-mark op-mark--diamond" data-state="running">
  <span class="op-mark__halo"></span><span class="op-mark__core"></span>
</span>
```

Usá los helpers de `ui.js`: `mark(state, shape)` y `status(state, {shape, label})`.

**Formas:** `circle` · `square` · `diamond` · `hex`.
**Estados:** `idle` · `queued` · `running` · `waiting` · `done` · `skipped` ·
`failed`.

La forma dice **qué es** la cosa, la luminancia si **está viva**, y el
movimiento (el halo que respira) es exclusivo de `running`. Renombrá las
palabras con `setStateLabels({...})`; las claves conviene dejarlas.

---

## Overlays

Todos se portalean a `#op-layer` y todos entran **y salen** animados.

```js
Tooltip.init();                         // una vez, al arrancar
FieldMenu.init();                       // el click derecho en los campos de texto
Toast.show({ title, text, icon, tone, duration });
Toast.error(title, text);
Menu.show(anchorEl, items, { align: 'end' });
Menu.showAt(x, y, items);               // en un punto (un click derecho propio)
await Modal.show({ title, sub, body, actions, width, dismissible, signal, arm });
await Modal.confirm({ title, sub, confirmLabel, danger });
```

**Tooltips**: declarativos. `data-tip="texto"`, opcionalmente `data-tip-side`
(`top`|`bottom`|`left`|`right`) y `data-tip-key` para el atajo. Nunca `title=`.
Aparecen también al llegar con Tab (solo con `:focus-visible`) y Escape los
descarta. Un botón de solo ícono con `data-tip` y sin `aria-label` toma el
texto del tooltip como nombre: para un lector de pantalla, deja de ser «botón»
a secas. Si su ancla se va del DOM mientras se ve, el tooltip se va con ella.

**Menu items**: `{ label, icon, key, danger, selected, disabled, onSelect,
mount }`, más `{ sep: true }` y `{ groupLabel }`. Un `disabled` se ve apagado,
no reacciona al pasar y las flechas lo saltean. `mount(button)` recibe el ítem
armado, para uno que cambia con el menú abierto. El alto del menú es el lugar
que hay desde el ancla: si no entra, se desplaza con la barrita a la vista
mientras quede algo escondido. El menú no se lleva el foco, y las teclas que usa
(flechas, Enter, Escape) no siguen de largo.

**FieldMenu**: Electron no trae menú contextual en los campos. Este es el de
Chrome (deshacer, cortar, copiar, pegar, suprimir, seleccionar todo) y se
prende una vez para toda la app. Pegar lee el portapapeles por el proceso
principal (`clip:read`): desde la página, leerlo pide un permiso. Un campo que
quiera otro menú hace `preventDefault()` en su `contextmenu`.

**Modal**: devuelve una promesa con el `value` del botón que se apretó (`null`
si se cerró). El `body` puede ser HTML o un `Node` — si es un nodo, podés leer
sus campos después de que cierre. Atrapa el foco y cierra con Escape. El foco
arranca en el botón que tenga `autofocus` (para un diálogo de opciones, como
imprimir, donde las flechas no pueden cambiar un campo) y, si ninguno lo pide,
en el primer campo visible del cuerpo. Un diálogo con un nombre para escribir
no le pone `autofocus` al botón. Enter en un campo de una línea confirma con la
acción `primary`: nunca con la destructiva, ni en un textarea, ni con un menú
abierto encima.

Hay uno solo a la vista: el que llega con otro abierto **espera su turno** y,
cuando el actual se cierra, entra sobre el mismo velo (relevo, no dos modales
encimados). Antes el nuevo pisaba al de abajo, que quedaba trabado con su velo
tapando todo y una promesa que no se resolvía nunca. Para retirar UN modal
—todavía en la fila o ya a la vista— se le pasa el `signal` de un
`AbortController` y se aborta; `Modal.close()` cierra el que se ve, que puede
ser otro. `arm` (ms) es para lo que se abre solo, sin que la persona lo pida:
durante ese rato los botones no toman clicks y el foco arranca en el diálogo,
así un click o un Enter que venía para otra cosa no contesta por ella.

---

## Movimiento (JS)

```js
exit(el, { fallback: 300 })    // saca del DOM DESPUÉS de la animación de salida
raf2(fn)                       // dos frames: los estilos iniciales ya se aplicaron
stagger(container)             // escalona los hijos con --i
initClickFlash(root)
initScrollFades(root)          // cablea todo .op-scroll
scrollFade(el)                 // uno solo
bindSwitcher(el, onChange)     // segmentado o tabs: el indicador viaja, nace en su lugar
bindToggle(el, onChange)       // un switch o un check: alterna, con role y aria-checked
bindStepper(el, onChange)      // las flechas de un .op-stepper; repiten al aguantar
toggleReveal(el, open)         // alto con grid 0fr → 1fr, sin animar height
countTo(el, n, { format })     // un número que corre en vez de saltar
tick(el)                       // destella un valor que acaba de cambiar

roll(el, to, paint, { from })  // corre desde lo que se ve AHORA (un % que llega de a pedazos)
swap(el, html, { dir, size })  // relevo de un valor en su lugar (texto, ícono, rótulo)
swapText(el, text, opts)       // swap() de un texto
reconcile(box, items, opts)    // pone una lista al día fila por fila, por clave (FLIP)
dissolve(old)                  // fundido: lo viejo, opaco y encima, se esfuma sobre lo nuevo
glideSize(el, from)            // de un tamaño al otro, en vez de saltar
collapse(el) / expand(el)      // una fila que se va (o llega) plegándose: las de abajo acompañan
replaceSoft(old, node)         // un nodo que reemplaza a otro en una fila (un ícono)

calcar(host)                   // la vista que se va, a un calco que se esfuma (lo usa el router)
repintar(root, poner)          // repinta sin perder el lugar (lo usa paint())
```

`exit()` es el más importante y el que más se olvida: sin él, todo lo que se va
del DOM parpadea. Sobre algo que ya se está yendo, `exit()` y `collapse()`
devuelven esa misma salida: nunca lo borran de golpe.

**Nada se rehace con `innerHTML` si ya está a la vista.** Una lista que cambia
(buscar, filtrar, quitar una fila) va con `reconcile()`: las filas que siguen
son el mismo nodo y viajan a su lugar, las que se van se esfuman fuera del
flujo y las nuevas entran cuando las viejas casi no se ven. Un valor que cambia
en su lugar va con `swap()` o, si es un número, con `roll()`; uno en medio de
una oración sigue en línea (`swap()` lo detecta y usa un `inline-grid`). Una
superficie entera que cambia por otra (un panel) va con `dissolve()`, y su
calco necesita fondo opaco. Una vista que se pone al día (unos ajustes) se arma
una vez y después solo actualiza lo que cambió: los switches se mueven, las
cápsulas viajan y lo que aparece según otro ajuste se despliega con
`.op-reveal`. Los cuatro andan en **Piezas → Movimiento**.

Las duraciones y las curvas de lo que se anima desde JS salen de `tokens.css`
(`--op-t-3`, `--op-ease`, `--op-ease-both`): si cambiás una, cambia todo junto.

### Clases de animación

Entradas: `.op-in-fade` · `.op-in-rise` · `.op-in-glide` · `.op-in-pop`.
Estado: `.op-spinning` · `.op-breathing` · `.op-shaking` · `.op-skeleton` ·
`.op-ticked`. `.op-view` es la transición de vista (la aplica el router).
`.op-reveal` con `.is-open` para el alto. Relevo: `.op-swap--row` (un rótulo
con ícono, como un botón) y `.op-swap--truncate` (un texto que se corta con
puntos suspensivos). Fundido: `.op-dissolving` es el calco que se va.

---

## Router

```js
Router.define({
  inicio: { view: viewInicio },
  item:   { view: viewItem, nav: 'inicio' },   // qué ítem del rail se ilumina
}, document.getElementById('view'));

Router.go('item', 'n-0003');
Router.refresh();                 // repinta la actual, sin perder el lugar
Router.onLeave(store.onEvent(f)); // limpieza de la vista que se está montando
Router.onChange((a, desde) => {});
Router.current / .name / .param
```

`onLeave` es el que evita la fuga: las vistas que se suscriben a algo tienen que
soltarlo al navegar, o cada navegación deja basura escuchando y la app se
degrada sola.

**Cambiar de vista es un fundido.** `go()` pasa la vista que se va a un calco
(`calcar()` en `motion.js`, clase `.op-main--saliente`) que queda encima, en la
misma celda, y se esfuma en `--op-t-2`. La nueva está entera y quieta debajo
desde el primer cuadro. El calco es opaco: su fondo es la misma niebla de la
ventana (`--op-sustrato` con `background-attachment: fixed`), así que calza
pixel a pixel con lo de atrás y la pantalla está tapada en todo momento. Antes
la vieja se iba de un cuadro al otro y la nueva arrancaba desde transparente.
El afloramiento (`.op-view`) queda para el arranque, cuando no hay nada que se
vaya: si aflorara mientras se funde la vieja, la pantalla se destaparía hasta
la mitad y el encabezado, que las dos tienen en el mismo lugar, temblaría.

**Repintar la misma es el mismo fundido, sin perder el lugar.** `refresh()` (o
cualquier `paint()` sobre una vista que ya está) usa `repintar()`: el scroll,
el foco, los `.op-reveal` abiertos y la posición de las cápsulas se fotografían
antes y se devuelven después (se reconocen por `id`), lo nuevo se asienta sin
volver a entrar, y `countTo()` escribe el valor en vez de contar desde 0. Si la
opción de un segmentado cambió, la cápsula viaja desde donde estaba.

---

## Helpers de vista

```js
paint(html)                        // innerHTML + monta íconos + cablea fades
head({ title, sub, crumbs, actions })
empty({ icon, title, text, actions })
esc(str)                           // TODO dato de afuera pasa por acá
mark(state, shape) / status(state, opts)
await attempt(fn, { errorTitle })  // el error se ve, no se traga
await copy(texto)

colorToken('--op-bg')              // un token de color, resuelto a #rrggbb
aHex('oklch(.149 .0046 258)')      // cualquier color CSS, a #rrggbb
```

**Para pasarle un color a Electron, usá `colorToken()` y nunca un regex.** Desde
Chromium 144 el valor computado de una var en oklch se devuelve tal cual
(`"oklch(0.149 0.0046 258)"`), y sacarle los números con `.match(/\d+/g)` toma
el `0.149` del lightness como si fuera el canal verde: arma `#009500` y la app
arranca con medio segundo de pantalla **verde**. Es un hex válido, así que
ninguna validación de forma lo agarra. `colorToken()` pinta el color en un
canvas de 1×1 y lee el píxel, que funciona con cualquier notación presente y
futura. El caso completo está en
`C:\tools\electron-dev-docs\METODO-Flash-Verde-Arranque-Electron-Win11.md`.

Y de `format.js`: `fmtDur` · `fmtNum` · `fmtBytes` · `fmtMoney` · `fmtClock` ·
`fmtDate` · `relTime` · `monogram` · `plural` · `ellipsize`.

Todos escriben el decimal según `locale.tag` (por defecto `es-AR`, o sea coma).
**No uses `toFixed()` para nada que vaya a pantalla**: escribe siempre con punto
y deja la app diciendo "2.1 MB" al lado de "209,9 mm". Si necesitás un número
con decimales que no encaja en ninguna de estas funciones, sumale una a
`format.js` en vez de formatearlo a mano en la vista.

---

## Íconos

```js
Icons.svg('play')                       // string SVG
Icons.svg('play', 'op-icon--sm')
Icons.spinner()
Icons.mount(root)                       // reemplaza <i data-icon="…">
Icons.add({ miIcono: '<path d="…"/>' }) // los de tu dominio
```

El set base tiene 72, todos sobre grilla de 16, trazo 1.5, puntas redondeadas —
por eso se ven de la misma familia. Miralos todos en **Piezas**; click en
cualquiera copia su etiqueta.

Dibujá los tuyos con la misma receta: `viewBox="0 0 16 16"`, contenido entre 1.8
y 14.2, sin `fill` salvo para puntos macizos (ahí va
`fill="currentColor" stroke="none"`).

**No edites `icons.js` para agregar los tuyos.** Usá `Icons.add()` — así podés
traerte una versión nueva del set base sin pisar tu trabajo.
