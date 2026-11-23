# HAVANA NICE V2

**Aplicación autónoma del equipo HAVANA NICE.** Un repositorio, una rama `main`, una PWA instalable para iPhone, una app nativa React Native para Android y un único backend Cloudflare (Workers + D1 + Durable Objects + R2). **No es HAVANA CLOUD original**. Ni su código, datos ni despliegues deben tocarse.

**Estado operativo: 23/11/2026.** Rama única `main`. APK Android **0.0.30** (`versionCode 30`) firmada mediante [ejecución aprobada](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/45090812813); la limpieza posterior de Chat está en `main` pero **todavía no se incluye en esa APK**. PWA de músicos e interfaz Admin conectadas a Cloudflare Pages con despliegue por `main`. Worker activo `havana-nice-v2-dev`: versión `ea9e96b2-b36c-4e45-988f-11f9d8d99ead` al 100 %, **10 bindings** (incluidos secretos FCM/VAPID/Admin). BOOK 3D, historial de Chat y R2 se preservan. El estado vigente y las pruebas pendientes se encuentran en [PLAN-MAESTRO.md](docs/PLAN-MAESTRO.md).

## Aplicaciones

| Interfaz | Ruta | Propósito |
| --- | --- | --- |
| PWA músico | `https://havana-nice-v2.pages.dev/` | Acceso autorizado por nombre y Chat PWA |
| HOME | `/visual.html` | Calendario, Repertorio y Familia, por código diferido |
| Administrador | `/admin.html` | Sesión propia y gestión de módulos |
| BOOK | `/book` (fuente `book.html`) | Lector editorial 3D compartido, servido desde la ruta canónica de Cloudflare Pages |
| Android | `apps/android/` | `app/NativeApp.tsx` mantiene la única sesión y HOME nativos; BOOK 3D PWA va embebido en WebView (sin segundo login) |

Las entradas web son cuatro documentos HTML; los módulos no necesitan documentos/URLs independientes para **cargar su JavaScript de forma independiente**. `React.lazy`/`Suspense` difiere Calendar, Repertoire, Family, BOOK y paneles Admin. No crear sesiones separadas en cada sección. Un mismo usuario aprobado por Admin inicia sesión una vez.

## Código

```text
apps/pwa/src/app/         puntos de entrada PWA, HOME y Admin
apps/pwa/src/features/    chat, calendar, repertoire, family, book, admin
apps/pwa/src/services/    API, conexión de calendario, medios y almacenamiento
apps/pwa/public/sw.js     caché estático público, nunca respuestas privadas
apps/android/App.tsx      entrada mínima de Expo
apps/android/app/NativeApp.tsx  único dueño de sesión, Chat y navegación nativa
apps/android/features/    componentes nativos por dominio
apps/android/services/    almacenamiento y subida nativa a R2
packages/shared/src/     APIs, modelos, política offline/ACK, reconexión, subida por lotes
cloudflare/src/index.ts  única entrada del Worker
cloudflare/src/modules/  admin, book, calendar, chat, family, repertoire
cloudflare/src/shared/   tipos, respuestas y criptografía
cloudflare/migrations/   evolución D1 aditiva
tests/, cloudflare/tests/, scripts/  comprobaciones y prevención de residuos
```

**Chat Android/PWA:** el visor continuo de fotos y videos de todo el historial **ya cargado** utiliza una sola política en `packages/shared/src/chat-gallery-selection.ts`; la paginación histórica permanece en los controladores. El módulo de selección de archivos es independiente (`useNativeMediaSelection.ts` / `usePwaMediaSelection.ts`). La cola de subida secuencial y el progreso son una sola función `packages/shared/src/chat-media-batch.ts` que mantiene el original y reintenta solo lo que no se confirmó. Los transportes de R2 de Android y navegador siguen adaptados a cada plataforma; ChatRoom continúa siendo el único backend de mensajes.

**Worker reorganizado:** `cloudflare/src/modules/chat/chat-room.ts` define la única clase `ChatRoom`; `chat-session.ts` contiene la verificación de sesión y los grants no se sustituyen. `cloudflare/src/shared/worker-types.ts` tipa los bindings vigentes y `worker-http.ts` establece respuestas HTTP comunes no cacheables. `cloudflare/src/index.ts` exporta la clase para que Wrangler conserve el nombre del Durable Object. El Worker activo tiene 10 bindings y exige una publicación independiente y verificada para futuros cambios de servidor.

## Privacidad, almacenamiento y rendimiento

R2 privado de V2 **activado el 01/11/2026**. Un solo `MEDIA_BUCKET`, D1 y dos Durable Objects (`CHAT_ROOMS`, `CALENDAR_ROOMS`). Nada de puentes a Google Drive, Supabase, OneCloud ni al HAVANA CLOUD original.

- Chat PWA puede optimizar fotografías antes de subirlas; videos conservan el archivo admitido por el servidor. Android y Familia usan sus propios flujos verificados. El Chat limita la selección a cinco medios por envío y confirma cada archivo con R2; no alterar transporte ni pérdida/recuperación sin prueba de regresión. Familia privada por integrante y avisos en tiempo real.
- BOOK usa el mismo motor StPageFlip de giro de páginas que los recuerdos del Calendario. Originales R2 intactos, opcionales derivados WebP de alta calidad para el lector. Admin puede ordenar, publicar, borrar, previsualizar y optimizar.
- Calendario marca eventos confirmados realizados con cuño y pergamino de recuerdos, calculado por zona horaria del evento; fotos privadas solo para músicos asignados. En Admin los editores de fotos solo se montan al expandir la fecha.
- Almacenamiento: aviso preventivo de cuota en 9.0 GB; rechazo de nuevas subidas en 9.5 GB, contabilizando originales, derivados y borrados R2 pendientes. **No equivale a garantía de ausencia de cargos de Cloudflare**.
- PWA Service Worker: solo shell/archivos públicos de aplicación con caché acotada; no intercepta credenciales, archivos privados ni APIs. El código lazy abierto una vez puede quedar cacheado; primera apertura offline de un fragmento nunca descargado no está garantizada.

## Verificaciones

Desde la raíz del repositorio, con Node.js 22 o posterior:

```bash
npm ci
npm run check:structure
npm run audit:guard
npm run typecheck
npm run build:pwa
```

La CI `.github/workflows/v2-foundation-check.yml` añade pruebas por dominio, aislamiento/privacidad D1/R2, credenciales, sincronización, módulo offline, paridad Android/PWA, artefactos Vite, Chrome real para BOOK, bundle Wrangler **sin despliegue**, y export JS Android sin publicar APK.

**El segundo workflow** `v2-android-apk.yml` solo libera APK firmada tras manifiesto `releases/android-batch.json` con aprobación y versión mayor. Nunca publicar automáticamente tras cada commit. Verificar firma anterior y actualización encima, con rollback. No desinstalar ni resetear datos del usuario.

## Único plan vigente y continuidad

- [PLAN-MAESTRO.md](docs/PLAN-MAESTRO.md) — tablero de avance único, prioridades y decisiones.
- [CONTINUIDAD-EXACTA.md](docs/CONTINUIDAD-EXACTA.md) — estado operativo resumido, ubicación exacta de módulos y verificación.
- [AUDITORIA-DEPURACION-2026-11-23.md](docs/AUDITORIA-DEPURACION-2026-11-23.md) — inventario y límites de la limpieza del 23 de noviembre.

**Regla esencial:** actuar directamente en una `main`, sin parches ni duplicados, preservar lo que funciona y no declarar terminado algo sin pruebas. El historial de Git conserva el registro de trabajos anteriores: no acumular notas antiguas y contradictorias en archivos nuevos.
