# Bingo

PWA móvil para digitalizar y controlar cartones de Bingo de 75 bolas. Una pulsación marca o desmarca el mismo número en todos los cartones activos. La partida se guarda automáticamente y se recupera después de recargar, cerrar Safari o volver horas más tarde.

## Funciones

- Varias partidas independientes por dispositivo.
- Cartones 5×5 con centro libre, validación de rangos B‑I‑N‑G‑O y edición manual.
- Fotografías desde cámara, fototeca o archivos; OCR local con revisión obligatoria.
- Marcado global, deshacer, reinicio seguro e historial de números.
- Líneas horizontales, proximidad a una línea y cartón completo.
- Vista compacta 2×2, Web Share API, instalación en iPhone y funcionamiento offline tras la primera carga.

## Arquitectura

La interfaz está en React + TypeScript + Vite. `src/core.ts` contiene la lógica pura de partidas y patrones; `src/db.ts` es la capa versionada de IndexedDB; `src/ocr.ts` implementa la interfaz `CardImageParser`. Esto permite cambiar Tesseract por otro proveedor sin tocar la UI ni el modelo de datos.

Las partidas y referencias de cartones se guardan exclusivamente en IndexedDB del navegador. Solo el identificador de la última partida se conserva en `localStorage`. No hay cuentas ni sincronización: abrir la misma URL en otro teléfono crea un espacio local independiente.

## OCR y privacidad

V1 usa Tesseract.js en el propio navegador. La imagen no se envía ni se conserva en un servidor. El texto se filtra a números 1–75, se agrupa como candidatos 5×5 y se contrasta con los rangos B (1–15), I (16–30), N (31–45), G (46–60) y O (61–75). Los candidatos de baja confianza se rechazan y nunca se confirman sin una pantalla editable.

Limitación actual: fotos inclinadas, cuadrículas decoradas o páginas con varios cartones pueden requerir crear/corregir el cartón manualmente. Para usar un servicio externo en el futuro, cree otra clase que implemente `CardImageParser`; documente su política de retención y conecte esa implementación en `src/App.tsx`.

## Desarrollo

Requiere Node.js 22 o posterior.

```bash
npm install
npm run dev
npm test
npm run build
```

El build se genera en `dist/` con base `/bingo-app/`. El service worker precachea la aplicación y limpia cachés antiguas; cuando hay una versión nueva se solicita confirmación para actualizar.

## Publicación

En GitHub, active **Settings → Pages → Source: GitHub Actions**. Cada push a `main` ejecuta pruebas, construye la PWA y publica en:

`https://gabrieljaqueriffo-prog.github.io/bingo-app/`

En iPhone: abra esa URL en Safari, toque **Compartir** y después **Añadir a pantalla de inicio**.
