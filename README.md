# Gaviotas 160

Panel de administración web (PWA) para el edificio **Gaviotas 160**: control de deudas, contómetros (medidores), registro de movimientos, generación de recibos y consolidación de períodos.

## Estructura del proyecto

| Archivo             | Contenido                                                          |
|---------------------|---------------------------------------------------------------------|
| `index.html`        | Shell principal de la app (login, dashboard, módulos)              |
| `app.js`            | Lógica de la aplicación (auth, render de tablas, llamadas al backend, consolidación, etc.) |
| `CSS.css`           | Estilos, organizados en bloques por módulo                         |
| `Contometros.html`  | Vista de contómetros (medidores)                                    |
| `RegistroMov.html`  | Vista de registro de movimientos                                    |
| `manifest.json`     | Manifiesto PWA (instalable en Android/iOS)                          |
| `sw.js`             | Service worker: solo cachea el "cascarón" estático; las llamadas al backend siempre van a la red |
| `icons/`            | Íconos de la PWA                                                     |

No hay build ni dependencias de Node: es HTML/CSS/JS plano, servido directo.

## Backend

La app consume un backend RPC vía `fetch` (constante `GAS_API_URL` en `app.js`):

```
https://backend-zeta-coral-88.vercel.app/api/rpc
```

Anteriormente el backend era un Google Apps Script (URL comentada en `app.js` como referencia/fallback).

## Autenticación

El token de sesión (`AUTH_TOKEN`) se guarda en `sessionStorage` (no en `localStorage`), se revalida en cada carga y se limpia al cerrar sesión. No hay credenciales ni claves hardcodeadas en el código.

## Cómo ejecutarlo localmente

Al ser archivos estáticos, basta con servirlos con cualquier servidor HTTP (necesario para que el service worker funcione):

```bash
npx serve .
# o
python3 -m http.server 8080
```

Luego abrir `http://localhost:8080/index.html` en el navegador.

## PWA / Service Worker

- El manifest permite instalar la app en Android/iOS como aplicación independiente.
- El service worker (`sw.js`) cachea únicamente el cascarón estático (`index.html`, `CSS.css`, `app.js`, `manifest.json`, íconos). Las respuestas del backend **nunca** se cachean, para evitar mostrar cifras desactualizadas.
- Usa `cache: 'reload'` en cada fetch del cascarón para forzar red fresca y que las actualizaciones publicadas se vean de inmediato sin depender de que el usuario borre caché.

## Seguridad

- Todo el contenido dinámico insertado vía `innerHTML` pasa por `escapeHTML()` / `escapeHtml()` antes de renderizarse, para evitar XSS con datos provenientes del backend o de campos editables.
