# Qadrant

Nombre completo: **Qadrant Calendar** (así aparece al instalarla; en el icono, «Qadrant»).

Agenda PWA basada en la matriz de Eisenhower. Cada tarea se clasifica en el propio dispositivo: unas reglas calculan la urgencia a partir de la fecha y un modelo pequeño de embeddings multilingüe decide la importancia comparando la tarea con tus objetivos.

Este repositorio contiene la app, su especificación (`docs/`), el diseño (`design/`), las herramientas de la fase 0 (`tools/`) y el servidor opcional (`server/`).

## Cómo usarlo con Claude Code

1. Entra en la carpeta del repositorio: `cd ~/WSApps/Qadrant-App`. Es la raíz del proyecto SvelteKit, junto a `docs/`, `design/`, `tools/` y `server/`.
2. Abre Claude Code ahí. Leerá `CLAUDE.md` automáticamente; contiene las reglas del proyecto.
3. Empieza por la fase 0 (validar el motor) o, si quieres avanzar en paralelo, por la fase 1 (MVP sin IA). Ver `docs/06-hoja-de-ruta.md`.
4. Pídele una fase cada vez, por ejemplo: «Implementa la fase 1 siguiendo docs/06-hoja-de-ruta.md. Al terminar, marca las casillas completadas». O deja que avance solo con `/loop`, siguiendo la sección «Trabajo por iteraciones» de `CLAUDE.md`: se para cuando lo que queda depende de ti (las casillas marcadas «(usuario)»).

## Contenido

| Ruta | Qué es |
| --- | --- |
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
| `tools/laya-finetune/` | Ajuste fino de Laya, para el futuro |

## Prioridad si hay contradicciones

`CLAUDE.md` > `docs/` > maquetas. Las maquetas muestran el aspecto; los documentos mandan sobre el comportamiento.

## Desarrollo

Requisitos: Node 22 y pnpm 10 (`npm install -g pnpm@10` si no lo tienes).

```
pnpm install
pnpm exec playwright install chromium   # solo la primera vez, para pnpm test:e2e
pnpm dev
```

## Primer despliegue en Cloudflare Pages

1. `pnpm exec wrangler login` (abre el navegador para entrar en tu cuenta de Cloudflare).
2. `pnpm exec wrangler pages project create qadrant --production-branch main --force` (solo la primera vez). `--force` crea un proyecto de Pages clásico: sin él, wrangler 4.14x intenta crearlo como Worker y falla. Ya está creado: `https://qadrant-62h.pages.dev`.
3. `pnpm deploy:pages` (compila y publica `build/`).
4. Comprueba en la URL `*.pages.dev` que la consola del navegador dice `crossOriginIsolated === true` y que la app abre sin conexión tras la primera visita.

Si prefieres otro nombre de proyecto, cámbialo en el script `deploy:pages` de `package.json`.
