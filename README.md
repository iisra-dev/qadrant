<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Version][version-shield]][changelog-url]
[![License][license-shield]][license-url]
[![SvelteKit][Svelte.dev]][Svelte-url]
[![TypeScript][TypeScript]][TypeScript-url]
[![PWA][PWA]][PWA-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/iisra-dev/qadrant">
    <img src="static/logo.svg" alt="Logo de Qadrant" width="80" height="80">
  </a>

<h3 align="center">Qadrant Calendar</h3>

  <p align="center">
    Agenda basada en la matriz de Eisenhower que clasifica tus tareas en el propio dispositivo.
    <br />
    <a href="docs/"><strong>Explorar la documentación »</strong></a>
    <br />
    <br />
    <a href="https://qadrant-62h.pages.dev">Ver la app</a>
    &middot;
    <a href="CHANGELOG.md">Cambios</a>
    &middot;
    <a href="docs/06-hoja-de-ruta.md">Hoja de ruta</a>
  </p>
</div>

Versión actual: **1.1.0** (6 oct 2026). Cambios en [`CHANGELOG.md`](CHANGELOG.md).

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Índice</summary>
  <ol>
    <li>
      <a href="#sobre-el-proyecto">Sobre el proyecto</a>
      <ul>
        <li><a href="#hecho-con">Hecho con</a></li>
      </ul>
    </li>
    <li>
      <a href="#primeros-pasos">Primeros pasos</a>
      <ul>
        <li><a href="#requisitos">Requisitos</a></li>
        <li><a href="#instalación">Instalación</a></li>
      </ul>
    </li>
    <li>
      <a href="#uso">Uso</a>
      <ul>
        <li><a href="#comandos">Comandos</a></li>
        <li><a href="#pruebas-en-webkit-safari">Pruebas en WebKit (Safari)</a></li>
        <li><a href="#despliegue-en-cloudflare-pages">Despliegue en Cloudflare Pages</a></li>
        <li><a href="#servidor-propio-opcional">Servidor propio (opcional)</a></li>
        <li><a href="#cómo-trabajar-con-claude-code">Cómo trabajar con Claude Code</a></li>
        <li><a href="#estructura-del-repositorio">Estructura del repositorio</a></li>
      </ul>
    </li>
    <li><a href="#hoja-de-ruta">Hoja de ruta</a></li>
    <li><a href="#contribuir">Contribuir</a></li>
    <li><a href="#licencia">Licencia</a></li>
    <li><a href="#contacto">Contacto</a></li>
    <li><a href="#agradecimientos">Agradecimientos</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## Sobre el proyecto

[![Captura de Qadrant][product-screenshot]](https://qadrant-62h.pages.dev)

**Qadrant** (nombre completo «Qadrant Calendar»; en el icono, «Qadrant») es una PWA de agenda basada en la matriz de Eisenhower: **Hacer**, **Programar**, **Delegar** y **Eliminar**. Escribes o dictas una tarea en lenguaje natural y la app la coloca en un cuadrante.

* **Todo en el dispositivo.** Las tareas se guardan en IndexedDB y nunca salen del dispositivo salvo que configures tu propio servidor. Sin analítica ni telemetría.
* **Clasificación local.** Unas reglas calculan la urgencia a partir de la fecha y un modelo pequeño de embeddings multilingüe (`paraphrase-multilingual-MiniLM-L12-v2`) decide la importancia comparando la tarea con tus objetivos. El modelo se ejecuta en un Web Worker y se sirve desde nuestro propio origen.
* **Funciona sin IA.** Si el modelo no está descargado o falla, se clasifica con reglas y elección manual.
* **La IA propone, tú decides.** Cualquier clasificación se cambia con un toque y cada corrección se guarda para afinar el asistente.
* **Bilingüe.** Interfaz en inglés (EE. UU.) y castellano (España); las tareas se interpretan en el idioma elegido y, si no se reconoce nada, en el otro.
* **Sin conexión.** Se instala como app y funciona sin red tras la primera visita.

La especificación completa está en [`docs/`](docs/) y las maquetas en [`design/screens/`](design/screens/).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>



### Hecho con

* [![Svelte][Svelte.dev]][Svelte-url] SvelteKit con `adapter-static` (SPA) y TypeScript estricto
* [![Vite][Vite]][Vite-url] `@vite-pwa/sveltekit` (Workbox, `injectManifest`)
* [![Dexie][Dexie]][Dexie-url] Dexie.js sobre IndexedDB
* [![ONNX][ONNX]][ONNX-url] ONNX Runtime Web (WebGPU con respaldo WASM) y el tokenizador de Transformers.js
* [chrono-node](https://github.com/wanasit/chrono) para interpretar fechas en inglés y castellano
* [![Vitest][Vitest]][Vitest-url] [![Playwright][Playwright]][Playwright-url] tests unitarios y de extremo a extremo
* [![Go][Go]][Go-url] [PocketBase](https://pocketbase.io/) para el servidor opcional
* [![Cloudflare][Cloudflare]][Cloudflare-url] Cloudflare Pages para el despliegue

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>



<!-- GETTING STARTED -->
## Primeros pasos

### Requisitos

* Node 22
* pnpm 10
  ```sh
  npm install -g pnpm@10
  ```
* Go 1.27 o posterior, solo para el servidor opcional (`server/`).

### Instalación

1. Clona el repositorio
   ```sh
   git clone https://github.com/iisra-dev/qadrant.git
   cd qadrant
   ```
2. Instala las dependencias
   ```sh
   pnpm install
   ```
3. Instala Chromium para los tests de extremo a extremo (solo la primera vez)
   ```sh
   pnpm exec playwright install chromium
   ```
4. Arranca el servidor de desarrollo
   ```sh
   pnpm dev
   ```

La app funciona sin el modelo: clasifica con reglas. Para usar el asistente, mira [Desplegar con el modelo](#desplegar-con-el-modelo).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>



<!-- USAGE EXAMPLES -->
## Uso

### Comandos

```sh
pnpm dev            # servidor de desarrollo
pnpm build          # build estático en build/
pnpm preview        # sirve el build (necesario para probar el service worker)
pnpm test           # vitest (con TZ=Europe/Madrid)
pnpm test:e2e       # playwright en Chromium
pnpm test:e2e:webkit  # playwright en WebKit, dentro de un contenedor
pnpm check          # svelte-check + tsc
pnpm deploy:pages   # compila y publica en Cloudflare Pages
```

### Pruebas en WebKit (Safari)

`pnpm test:e2e` usa Chromium. `pnpm test:e2e:webkit` pasa los mismos tests en WebKit, el motor de Safari en iPhone, dentro del contenedor oficial de Playwright (podman o docker): el WebKit de Playwright necesita librerías de Ubuntu que Fedora no trae. El script compila, sirve `build/` en el puerto 4173 y lanza el navegador en el contenedor. La primera vez descarga la imagen (unos 2 GB).

Se saltan en WebKit, con el motivo en el propio test: notificaciones (solo Chromium), las dos pruebas sin conexión (Playwright WebKit falla al recargar sin red con service worker) y la del modelo (el WebKit de Playwright no tiene OPFS; Safari sí).

### Despliegue en Cloudflare Pages

1. `pnpm exec wrangler login` (abre el navegador para entrar en tu cuenta de Cloudflare).
2. `pnpm exec wrangler pages project create qadrant --production-branch main --force` (solo la primera vez). `--force` crea un proyecto de Pages clásico: sin él, wrangler 4.14x intenta crearlo como Worker y falla. Ya está creado: `https://qadrant-62h.pages.dev`.
3. `pnpm deploy:pages` (compila y publica `build/`).
4. Comprueba en la URL `*.pages.dev` que la consola del navegador dice `crossOriginIsolated === true` y que la app abre sin conexión tras la primera visita.

Si prefieres otro nombre de proyecto, cámbialo en el script `deploy:pages` de `package.json`.

#### Desplegar con el modelo

El modelo (≈ 113 MiB) no va en git. Desde una máquina que lo tenga descargado (`tools/embed-eval/fetch_model.py`):

1. `pnpm model:prepare`: lo trocea en `static/models/` en fragmentos de 25 MiB con su manifiesto (versión, tamaño y SHA-256 de cada fragmento) y la calibración por defecto.
2. `pnpm deploy:pages`: el build copia también ONNX Runtime a `/ort/` en fragmentos.

Un despliegue sin `static/models/` sigue funcionando: Ajustes dice que el servidor no ofrece el asistente y la app clasifica con reglas.

### Servidor propio (opcional)

Qadrant funciona por completo sin servidor y no ofrece uno. Quien quiera avisos, calendario o, desde la fase 4, las mismas tareas en todos sus dispositivos puede montar el suyo siguiendo [`server/README.md`](server/README.md). Cada servidor es de una persona y sirve a todos sus dispositivos. Lo que se sincroniza va sin cifrar: puede leerlo quien administre ese servidor y el servicio del túnel, si lo hay. Cada dispositivo sigue clasificando con su propio asistente. El servidor se publicará aparte, en un repositorio público, para que cualquiera pueda montarlo.

### Cómo trabajar con Claude Code

1. Abre Claude Code en la raíz del repositorio. Leerá [`CLAUDE.md`](CLAUDE.md) automáticamente; contiene las reglas del proyecto.
2. Pídele una fase cada vez, por ejemplo: «Implementa la fase 1 siguiendo docs/06-hoja-de-ruta.md. Al terminar, marca las casillas completadas».
3. O deja que avance solo con `/loop`, siguiendo la sección «Trabajo por iteraciones» de `CLAUDE.md`: se para cuando lo que queda depende de ti (las casillas marcadas «(usuario)»).

Si hay contradicciones, manda `CLAUDE.md` sobre `docs/` y `docs/` sobre las maquetas. Las maquetas muestran el aspecto; los documentos mandan sobre el comportamiento.

### Estructura del repositorio

| Ruta | Qué es |
| --- | --- |
| `src/` | La app (SvelteKit) |
| `server/` | Servidor opcional en Go (PocketBase) |
| `CLAUDE.md` | Instrucciones para Claude Code: stack, convenciones, reglas que no se negocian |
| `docs/01-producto.md` | Visión, principios, pantallas, flujos y comportamiento detallado |
| `docs/02-arquitectura.md` | Capas, stack, estructura de carpetas y requisitos PWA |
| `docs/03-motor-de-decision.md` | Cómo se clasifica una tarea: reglas, modelo, umbrales y respaldo |
| `docs/04-modelo-de-datos.md` | Tipos TypeScript y esquema de IndexedDB |
| `docs/05-sistema-de-diseno.md` | Colores (claro y oscuro), tipografía, espaciado y componentes |
| `docs/06-hoja-de-ruta.md` | Plan de acción por fases con tareas y criterios de salida |
| `docs/07-riesgos-y-decisiones.md` | Riesgos, decisiones tomadas y decisiones abiertas |
| `design/tokens.css`, `design/tokens.json` | Tokens de diseño listos para usar |
| `design/screens/` | Maquetas estáticas en HTML; abre `index.html` en el navegador |
| `design/canvas/` | Fuentes originales del lienzo de diseño (`.dc.html` + `canvas.json`) |
| `tools/laya-eval/` | Fase 0: medición de Laya con tareas reales (aparcado) y datos (`tasks.csv`, `goals.txt`) |
| `tools/embed-eval/` | Fase 0: medición del motor elegido (embeddings multilingües) |
| `tools/model-bench/` | Página de prueba de rendimiento del modelo en el navegador |
| `tools/laya-finetune/` | Ajuste fino de Laya, para el futuro |

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>



<!-- ROADMAP -->
## Hoja de ruta

- [x] Fase 0: validar el motor de clasificación
- [x] Fase 1: MVP sin IA (matriz, captura, agenda, ajustes, exportar e importar, inglés y castellano)
- [x] Fase 2: IA local (modelo de embeddings en el navegador, calibración con tus correcciones)
- [x] Fase 3: agenda y avisos (planificador, delegar, archivado, servidor opcional con avisos y calendario)
- [ ] Fase 4: sincronización entre dispositivos y revisión semanal
    - [ ] Fusión campo a campo y cola de cambios
    - [ ] Sincronización en el servidor propio
    - [ ] Publicar el servidor en un repositorio público

En las fases marcadas quedan pendientes los criterios de salida que dependen del uso real. El detalle, con todas las casillas, está en [`docs/06-hoja-de-ruta.md`](docs/06-hoja-de-ruta.md).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>



<!-- CONTRIBUTING -->
## Contribuir

Es un proyecto personal y el repositorio es privado: de momento no acepta contribuciones externas. Las convenciones de trabajo (commits pequeños con prefijo convencional, tests antes de conectar la lógica a la interfaz, `pnpm check`, `pnpm test` y `pnpm build` en verde) están en [`CLAUDE.md`](CLAUDE.md).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>



<!-- LICENSE -->
## Licencia

La app: todos los derechos reservados. Copyright © 2026 iisra-dev.

El servidor de [`server/`](server/) se distribuye con licencia MIT. Ver [`server/LICENSE`](server/LICENSE).

Las licencias de las dependencias de terceros se generan en cada build y se muestran en la propia app («Licencias de terceros»).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>



<!-- CONTACT -->
## Contacto

iisra-dev: [github.com/iisra-dev](https://github.com/iisra-dev)

Proyecto: [https://github.com/iisra-dev/qadrant](https://github.com/iisra-dev/qadrant)

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>



<!-- ACKNOWLEDGMENTS -->
## Agradecimientos

* [sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
* [ONNX Runtime Web](https://onnxruntime.ai/) y [Transformers.js](https://huggingface.co/docs/transformers.js)
* [Dexie.js](https://dexie.org/) y [chrono-node](https://github.com/wanasit/chrono)
* [PocketBase](https://pocketbase.io/) y [webpush-go](https://github.com/SherClockHolmes/webpush-go)
* Tipografías [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) e [IBM Plex](https://github.com/IBM/plex), vía [Fontsource](https://fontsource.org/)
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template)

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
[version-shield]: https://img.shields.io/badge/version-1.1.0-0B3A5E?style=for-the-badge
[changelog-url]: CHANGELOG.md
[license-shield]: https://img.shields.io/badge/license-all%20rights%20reserved-555?style=for-the-badge
[license-url]: #licencia
[product-screenshot]: docs/images/screenshot.png
[Svelte.dev]: https://img.shields.io/badge/Svelte-4A4A55?style=for-the-badge&logo=svelte&logoColor=FF3E00
[Svelte-url]: https://svelte.dev/
[TypeScript]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[PWA]: https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white
[PWA-url]: https://web.dev/explore/progressive-web-apps
[Vite]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vite-pwa-org.netlify.app/frameworks/sveltekit
[Dexie]: https://img.shields.io/badge/Dexie.js-1E2A38?style=for-the-badge
[Dexie-url]: https://dexie.org/
[ONNX]: https://img.shields.io/badge/ONNX%20Runtime-005CED?style=for-the-badge&logo=onnx&logoColor=white
[ONNX-url]: https://onnxruntime.ai/
[Vitest]: https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white
[Vitest-url]: https://vitest.dev/
[Playwright]: https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white
[Playwright-url]: https://playwright.dev/
[Go]: https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white
[Go-url]: https://go.dev/
[Cloudflare]: https://img.shields.io/badge/Cloudflare%20Pages-F38020?style=for-the-badge&logo=cloudflare&logoColor=white
[Cloudflare-url]: https://pages.cloudflare.com/
