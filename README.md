# Atlas

El mapa de los proyectos. Escanea `C:\tools` y `S:\tools` (o las raíces que
le digas) y responde, por carpeta, tres preguntas que antes costaban abrir el
explorador, una terminal y el menú inicio:

- **Cuánto ocupa y por qué.** El tamaño se parte en capas —código,
  dependencias, build, git— porque "4 GB" no dice nada y "3,9 GB son
  `node_modules`" lo dice todo.
- **En qué anda.** Rama, último commit, archivos sin commitear, remoto.
- **Si lo que uso está viejo.** Cruza el `package.json` y el git del repo
  contra el registro de desinstalación de Windows: si la app instalada tiene
  una versión menor, o hay commits posteriores a la compilación instalada,
  queda marcada como **desfasada**, con el porqué.

Construida sobre [Opal](S:\tools\Opal). El vidrio acá no es adorno: en el
mapa, cada disco es una hoja esmerilada sobre la niebla, cada proyecto una
hoja de luz adentro, y cada capa un estrato más tenue adentro de esa. Los
niveles se ven unos a través de otros.

```
npm run dev        # con la consola del renderer en la terminal
npm test           # tokens + store + formato + treemap + escáner + actualizador (node pelado)
npm run smoke      # monta el renderer con Electron y lo recorre (91 chequeos)
npm run capturas   # fotografía cada vista de la app real en capturas/
```

## Instalar y actualizar

Los releases están en [GitHub](https://github.com/kiddshady/Atlas/releases):
**Setup** se instala y se actualiza solo (busca al arrancar, avisa si hay
versión nueva y no descarga nada sin permiso; la versión de la statusbar es
el botón); **Portable** es un exe suelto que no se actualiza.

```
npm run icons      # hornea build/icon.ico desde el código (control en .shots/icons.png)
npm run build      # Setup + Portable en dist/, sin publicar
npm run release    # compila y publica el release (antes: $env:GH_TOKEN = gh auth token)
```

Para publicar: bump de `version` en package.json en un commit
`chore(release): vX.Y.Z`, y después `npm run release`.

## Las vistas

- **Mapa** — el treemap. Click selecciona, doble click abre la carpeta, el
  segmentado cambia la medida (total o solo código). El punto de acento
  sobre una celda es una app instalada vieja.
- **Lista** — lo mismo en tabla, ordenable por columna, con filtro.
- **Desfasadas** — solo las apps cuya instalación quedó atrás, con el motivo.
- **Ajustes** — las raíces, lo que se excluye, y si se escanea al abrir.

El inspector (panel derecho) es compartido: el detalle del proyecto
seleccionado o, sin selección, el resumen por disco.

## Cómo escanea

`src/escaner.cjs` es Node puro y hace las cuatro lecturas; `src/escaneo.cjs`
las orquesta y **emite a medida que avanza** (`inicio → proyecto → tamano →
fin`), así el mapa se llena en vez de quedarse mudo medio minuto. Los tamaños
—lo lento— salen de un pool de `worker_threads` (`src/medidor-worker.cjs`)
para que la ventana siga respondiendo.

Al abrir se muestra el último escaneo (`data/escaneo.json`) al instante y se
vuelve a medir de fondo; las celdas se corrigen en el lugar, con transición.

Dos detalles que no son opcionales:

- **`original-fs`, no `fs`.** Dentro de Electron, `fs` trata a un `.asar`
  como carpeta: el stat del `app.asar` instalado devolvía una fecha inventada
  y todas las apps salían "al día". Con `original-fs` el asar es un archivo.
- **Solo HKCU.** Las apps de electron-builder se registran en la rama de
  usuario; volcar HKLM (cientos de entradas de terceros) tarda 4 s por
  escaneo para un caso que no se da.

## Los datos

- **En desarrollo** → `data/` del proyecto.
- **Empaquetada** → el `userData` de la app.
- `ATLAS_DATA` mueve la carpeta en los dos casos.

`settings.json` guarda raíces, exclusiones, escaneo al abrir y la medida del
mapa. `escaneo.json` es el último escaneo completo.

La referencia del sistema de diseño está en [docs/sistema.md](docs/sistema.md),
y la vitrina viva de todos los primitivos, dentro de la app en **Piezas**.
