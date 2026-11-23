# HAVANA NICE V2 — CONTINUIDAD EXACTA

**Estado operativo: 23 de noviembre de 2026.** Este documento es la guía técnica vigente de continuidad. El [PLAN-MAESTRO.md](./PLAN-MAESTRO.md) es el único tablero de pendientes. Las versiones anteriores y sus decisiones se consultan en el historial Git; no reutilizar cifras antiguas como si fueran actuales.

## Infraestructura y versiones verificadas

- **Repositorio:** `Abnernoa97/havana-nice-v2`, única rama `main`, cero PR abiertos. PWA de músico `https://havana-nice-v2.pages.dev/`, panel Admin `/admin.html`, HOME `/visual.html`, BOOK canónico `/book`.
- **PWA:** Cloudflare Pages despliega únicamente desde `main` con `npm ci && npm run build:pwa`. Tras el refactor de galería del 23/11, se verificaron **129 pruebas aprobadas, cero fallos**, TypeScript PWA/Android y controles estructurales. La certificación de gestos/velocidad en teléfonos sigue siendo física.
- **Android:** `com.havananice.v2`, versión publicada **0.0.30**, `versionCode 30`, [firma y lote aprobados](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/45090812813). Cambios posteriores de código nativo **no** forman parte de la APK hasta aprobar otro lote. Conservar PREVIOUS y actualizar siempre sobre la instalada, sin borrar datos.
- **Backend:** Worker único `havana-nice-v2-dev`, despliegue activo `ec52c4fe-384a-4b37-bdd0-4bf7d847c7c8`, versión `ea9e96b2-b36c-4e45-988f-11f9d8d99ead` al 100 %. **10 bindings**: `DB`, `MEDIA_BUCKET`, `CHAT_ROOMS`, `CALENDAR_ROOMS`, `HAVANA_ENV`, `V2_ADMIN_LOGIN_MODE` y cuatro secretos para FCM, VAPID y Admin. No publicar el Worker solo porque cambió Pages.
- **Datos:** D1 `havana-nice-v2-dev`, R2 privado `havana-nice-v2-media`, Durable Objects `ChatRoom` y `CalendarRoom`. Ninguna limpieza de código puede eliminar/modificar medios, sesiones, accesos, migraciones aplicadas ni el producto HAVANA CLOUD original.

## Arquitectura por responsables

```text
apps/pwa/src/app/                        entradas ligeras PWA, visual, Admin, BOOK
apps/pwa/src/features/{chat,...}/        funciones de usuario separadas por dominio
apps/pwa/src/services/                   adaptadores navegador/API
apps/pwa/src/styles/                     estilos generales que comparte más de un módulo
apps/android/app/                         entrypoint y HOME nativo
apps/android/features/{chat,...}/        UI y hooks nativos por dominio
apps/android/services/,storage/          subida R2, sockets y caché nativa
packages/shared/src/                     contratos, reconexión, ACK, outbox y galería
cloudflare/src/index.ts                  único router/entrada Worker
cloudflare/src/modules/                  Chat, Admin, Audio, Familia, Estados, Calendario, BOOK, avisos
cloudflare/migrations/                   historial D1 inmutable; no depurar como código muerto
tests/,cloudflare/tests/,scripts/         pruebas, verificadores y políticas de seguridad
```

- **Un solo propietario de sesión/Chat por plataforma.** `useNativeChatController.ts` y `usePwaChatController.ts` gestionan identidad, socket, historial, outbox; vistas y media no abren sockets adicionales.
- **Mosaicos vs visor:** `groupChatMediaMessages` agrupa burbujas consecutivas; `selectChatGalleryMedia` selecciona todas las fotos y videos **cargados** del Chat, incluyendo archivos separados por textos, notas de voz y autores. Los visores individuales de Chat en Admin siguen siendo consumidores activos; no borrarlos por el nombre antiguo.
- **Audio/BOOK:** el Audio aprobado es independiente del BOOK 3D. BOOK Android utiliza el mismo lector web autorizado y su puente de sesión; no sustituir ni animar con motores 3D nuevos.
- **Push:** FCM Android 0.0.30 probado en dispositivos; PWA iOS requiere validar permisos Web Push en instalación real. Notificaciones de pantalla bloqueada nunca contienen mensajes privados ni credenciales.
- **Archivos multimedia:** Chat iPhone puede preparar fotografías optimizadas antes de R2; no asumir conservación obligatoria del fichero original de cámara. Android, Familia y BOOK tienen políticas independientes y verificables.

## Cómo verificar cambios seguros

```bash
npm ci
npm run check:structure
npm run audit:guard
npm run typecheck
npm run build:pwa
```

La publicación Pages sucede automáticamente tras cambios en `main`. La APK firmada requiere aprobación explícita del lote `releases/android-batch.json`; el backend Worker requiere otra publicación controlada. Verificar SHAs concretos en Cloudflare, no inferir que GitHub y producción son idénticos porque ambos usan el nombre `main`.

## Pendientes que no deben esconderse

- Depurar por partes los controladores grandes de Chat, con cobertura de socket/reconexión/outbox/scroll.
- QA de gestos, rendimiento y carga de fotos/video en dispositivos Android/iPhone; el visor actual navega multimedia *cargada*, no consulta automáticamente toda la historia en D1.
- Inspeccionar estilos por consumidor real y viewport antes de eliminar selectores repetidos entre media queries.
- Corregir desviaciones de documentación y código mediante cambios atomizados; no generar ramas, reiniciar D1/R2, borrar versiones anteriores ni recompilar APK sin necesidad.

**Una sola `main`, una sola fuente de verdad, una sola sesión, cero datos destruidos.**
