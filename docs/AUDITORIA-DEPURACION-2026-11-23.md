# HAVANA NICE V2 — Auditoría y depuración controlada · 23/11/2026

**Repositorios y alcance:** `Abnernoa97/havana-nice-v2`, única `main`. Inventario de Git, estructura de directorios, CSS, entradas, Chat, Worker en vivo, Pages, release Android y contratos de tests. La revisión no afirma análisis semántico línea por línea de 411 archivos ni QA física.

## Inventario comprobado
- 411 archivos / 75 directorios de Git antes de la limpieza, 20 CSS, 37 migraciones SQL históricas. No se encontraron archivos exactamente duplicados por SHA; eso no excluye código parcialmente duplicado.
- Una rama `main` y cero PR abiertos. Los cuatro documentos PWA son entradas independientes; las funciones mantienen carpetas `features` y `services`.
- Última APK firmada: 0.0.30, workflow [45090812813](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/45090812813). Worker en producción: versión `ea9e96b2-b36c-4e45-988f-11f9d8d99ead` al 100 %, **10** bindings, secretos no expuestos.
- Cloudflare Pages tras el primer refactor `1297588`: deploy **correcto**, control estructural PASS, auditoría preventiva PASS, TypeScript PWA/Android PASS, **129 pruebas aprobadas y 0 fallos**.

## Depuración realizada
1. Se consolidó la selección de medios visibles del Chat en `packages/shared/src/chat-gallery-selection.ts`. Android y PWA dejan de duplicar esa lógica, conservan el mosaico y recorren fotos/video de todo el historial ya cargado.
2. Se eliminaron reglas CSS para flechas inexistentes y estilos nativos de botones anterior/siguiente que el visor no renderiza.
3. Se consolidaron declaraciones CSS del grabador de voz y se conservó el aspecto final definido por la cascada.
4. Se incorporaron tres pruebas de selección: intercalación de texto/voz, cambio de autor, mensajes eliminados, selección consistente y paridad de ambos clientes.
5. Se retiraron dos constantes de agrupación ilimitada declaradas como compatibilidad antigua, no utilizadas en la lógica; siguen los mosaicos consecutivos.
6. Se actualizan README, continuidad y plan vigente, eliminando cronologías obsoletas del plan canónico; los hechos antiguos se conservan en Git.
7. En Cloudflare Pages se eliminó la instalación duplicada: la plataforma ya instala dependencias y el comando queda `npm run build:pwa`.
8. `.gitignore` evita incluir por accidente archivos binarios APK/AAB, keystores y carpetas locales de Wrangler/Gradle.

## Residuo real vs dependencia legítima
- **Hallazgo resuelto:** al comenzar la auditoría, `ChatPhotoViewer.tsx` y `ChatVideoPlayer.tsx` atendían las aperturas individuales de Administración. Tras migrar Admin al visor continuo y validar los consumidores, ambos se retiraron en el commit `2e0bfaa`.
- `cloudflare/migrations` contiene historia de D1 aplicada. Las 37 migraciones no se tratan como basura, ni se compactan.
- Algunos selectores CSS aparecen repetidos por breakpoints o variaciones de contexto. Eliminar por coincidencia de nombre, sin estudiar cascada y uso, dañaría la UI aprobada.
- `useNativeChatController.ts` y `usePwaChatController.ts` siguen concentrando un volumen elevado de estado y callbacks. Refactorizar únicamente con pruebas específicas de socket, reconexión, outbox, scroll, notificaciones y sesión.

## Pendientes antes de declarar 100 %
- Recorrido a páginas históricas todavía no cargadas por el servidor; no está incluido en la selección actual.
- Pruebas físicas Android/iPhone de carga de miniaturas/video y gesto del visor; confirmar build nueva APK si se autoriza.
- Revisión profunda de código muerto de módulos fuera de Chat y CSS en viewports reales; revisión de alertas npm cuando el control de dependencias vuelva a ejecutarse.
- Comprobación diferencial Worker fuente vs versión en vivo cuando se programe una publicación backend; no se ha recompilado ni desplegado el Worker.
- Política de protección de `main` y un linter de referencias/estilo acordes con los costos de CI.

**Regla:** no borrar datos R2/D1, migraciones, Durable Objects, credenciales, historial, APK instalada ni BOOK 3D. No crear ramas ni una APK por refactor de estructura.

## Segunda fase · Administración y estilos del visor (23/11)
- Administración reutiliza ahora `ChatMediaGallery` para recorrer fotos/videos de todo el historial ya cargado, con la misma selección de `packages/shared`; sigue usando su token privado existente, sin nuevo socket ni sesión.
- CSS del visor trasladado a `features/chat/chat-media-gallery.css`, importado por el propio visor. El resto de `chat.css` permanece en el chat músico, sin llevar estilos generales al panel Admin.
- Se retiraron `ChatPhotoViewer.tsx` y `ChatVideoPlayer.tsx`, los estilos de esos modales y el estado `videoRequest`/`videoGrant` que les pertenecía. `ChatMediaView` es exclusivamente presentación y abre el visor compartido mediante `onOpen`.
- La compilación de Cloudflare Pages confirmó estructura, auditoría preventiva, TypeScript Android/PWA y **131 pruebas aprobadas con 0 fallos**; commit `2e0bfaa` publicado.
- Esta fase no modifica Cloudflare Worker, datos, migraciones, BOOK 3D, Android nativo ni APK instalada.

## Tercera fase · Subida multimedia Android aislada (23/11)
- La lógica de disponibilidad R2, envío de nota de voz y lote de fotos/videos salió de `useNativeChatController.ts` a `useNativeChatMediaUpload.ts`, equivalente al hook PWA existente.
- El nuevo hook mantiene el transporte `uploadNativeChatFile`, IDs y progreso; **no** crea sesiones, sockets, outbox ni otros servicios.
- Las confirmaciones revalidan el token activo antes de refrescar historial o retirar archivos, evitando que una subida tardía mezcle la conversación de otro músico.
- El grafo de pruebas `tests/helpers/native-source.mjs` incluye el nuevo hook y se añaden pruebas de aislamiento y paridad.
- **Límite:** se requiere una APK nueva para reflejar cambios nativos. La firma y BOOK 3D vigentes no se modifican.

## Cuarta fase · Política offline única de salida (23/11)
- `packages/shared/src/chat-outbox.ts` genera la estructura idéntica de mensajes de texto pendientes para Android y PWA mediante `createQueuedChatMessage`.
- Identificadores y fecha siguen generados por la plataforma propietaria; el paquete compartido no crea cola, sesión, WebSocket ni persistencia.
- Nuevas pruebas verifican que se preservan `replyToSeq`, `pending`, `deliveryStatus` y que nunca se incrusta el token en el mensaje almacenado.

## Quinta fase · Historial y reconexión protegidos (23/11)
- Se añadió `packages/shared/src/chat-history-requests.ts` para centralizar solicitud de páginas anteriores y snapshots, conservando el único controlador, WebSocket, sesión y desplazamiento por plataforma.
- Las solicitudes solapadas y respuestas tardías tras revocación/cambio de músico se descartan con el mismo `ChatHistoryRequestGate` preexistente.
- Las pruebas nuevas verifican solicitudes duplicadas, cambio de sesión, fallo de red, snapshots fuera de orden y ausencia de segundo socket.
- PWA maneja ahora el error síncrono al abrir WebSocket, con mensaje y estado recuperables, tal como Android ya hacía.
- Worker, Durable Objects, datos D1/R2, motor BOOK 3D, secreto FCM y APK firmada no se han alterado.

## Sexta fase · Edición y borrado sin duplicación (23/11)
- La validación del editor, los mensajes de protocolo `chat.edit`/`chat.delete` y el timeout de confirmación (10 segundos) se centralizan en `packages/shared/src/chat-message-mutations.ts`.
- Android y PWA conservan el límite de 15 minutos para editar y 48 horas para borrar, además de sus borradores, sesiones, WebSocket y outbox.
- Se agregan cuatro pruebas nuevas sobre prioridad de decisiones, borde temporal, formatos exactos de protocolo y paridad entre plataformas.
- No se modifican Worker, D1, R2, BOOK 3D ni la APK firmada.

## Séptima fase · CSS residual de reproductor retirado (23/11)
- Eliminadas las clases `.hn-chat-video` y `.hn-video-placeholder` de `chat.css`: correspondían al reproductor individual retirado; ningún componente actual las usa.
- Se conservan los selectores reales `.hn-chat-video-cover`, `.hn-chat-video-poster`, y sus variaciones para el mosaico y Administración.
- Las pruebas de interfaz se actualizaron a las clases existentes, y se añade un escaneo de fuentes para impedir reintroducciones sin estilos correspondientes.

## Octava fase · HOME y Familia: estilos antiguos aislados (23/11)
- `home.css`: se eliminaron reglas de barra de Familia, texto introductorio y tarjeta/portada estática de revista (`hn-family-book*`) que ya no aparecen en los componentes.
- `home-stage.css`: se retiró la clase obsoleta `hn-moment-story-pending`; las portadas y miniaturas actuales conservan sus clases.
- Se preservan las clases actuales de álbumes, álbum privado, Estados, lector BOOK 3D y controles de revista (`hn-family-inline-book`).
- La prueba de regresión inspecciona todos los archivos TS/TSX/JS/HTML de la PWA y verifica que no se consumen las clases antiguas.
- No se modifica la estructura de pantalla, lógica de HOME/Familia/Admin, APK, Worker ni datos D1/R2.

## Novena fase · Administración: cabecera y accesos antiguos (23/11)
- `admin-editorial.css`: se retiran reglas del perfil/cabecera y mosaico de atajos anteriores al menú plano actual. Esas clases ya no existen en `AdminApp.tsx` ni en las otras vistas administrativas.
- Se mantienen intactos el menú y cabecera actuales (`hn-admin-minimal`, `hn-admin-brand-button`, `hn-admin-plain-menu`), permisos, historial, Chat, calendarios, BOOK 3D y paneles privados.
- Se añade una prueba que recorre los 90 archivos fuente de la PWA y comprueba tanto la ausencia de referencias antiguas como la permanencia de los estilos de la interfaz actual.
- No hay cambios de endpoints, autenticación, Worker, R2, D1 ni APK.

## Décima fase · Administración: tablero viejo y metadata inerte (23/11)
- `admin.css` y `admin-editorial.css`: retiradas 45 reglas antiguas de estado de servidor, tarjetas de estadísticas, atajos, alertas decorativas y pantallas de bienvenida que no tienen consumidores actuales.
- Se conserva el selector compartido del formulario vigente al quitar `a-module-next`; el panel de acceso, los menús reales, la sesión y los permisos no cambian.
- `AdminApp.tsx`: eliminadas ocho descripciones de pestañas nunca renderizadas. Identificadores, nombres, iconos, orden y navegación permanecen idénticos.
- Dos pruebas nuevas recorren los fuentes activos para impedir referencias a selectores eliminados y preservar los ocho accesos vigentes.
- Sin alteraciones de Worker, R2/D1, migraciones, FCM ni APK firmada; CSS solo se evalúa en el build y requiere prueba visual posterior.

## Undécima fase · Calendario y Repertorio: responsabilidades aisladas (23/11)
- Auditoría por consumidores: `event-repertoire.css`, `calendar-memories.css`, `calendar-live-notice.css` y `member-repertoire.css` siguen en uso. Se conservan (incluidos estilos internos del lector BOOK).
- El acordeón del Calendario delega la vista y petición D1 del repertorio de cada evento a `features/calendar/EventRepertoire.tsx`; ahora el CSS de la sección se importa desde su propio componente.
- Se mantiene el mismo `getEventRepertoire(token,eventId)`, el mismo estado de error/carga, la protección contra respuesta tardía y las mismas props `token/eventId/revision`; no se crea otra sesión, conexión ni canal.
- En Administración de Repertorio se elimina el segundo efecto de limpieza de `itemsRequest`, redundante porque el efecto dueño de la suscripción ya invalida ese contador al desmontar o cambiar token.
- Pruebas de modularidad cubren la propiedad del CSS, el esquema de peticiones, las invalidaciones al salir y el montaje únicamente al expandir una fecha.
- No se modifican Worker, schema D1, objetos R2, EPUB/BOOK, ni APK Android.

## Duodécima fase · Paginación única de Repertorio (23/11)
- `packages/shared/src/repertoire.ts`: el catálogo general y los temas asignados utilizan la misma función privada `readPages`, manteniendo `offset=0..10000`, paso 250, los endpoints originales, autorización Bearer y cache `no-store`.
- Cada API sigue devolviendo exactamente sus campos (`songs`/`items`) y sus errores de límite diferenciados, sin añadir consultas ni caches. El lector individual de eventos no cambia.
- Pruebas dinámicas con HTTP simulado verifican ambos roles, orden, número de llamadas, cabeceras, límites, errores y codificación de nombres de evento. Android y PWA consumen los mismos exports sin nuevas conexiones.
- No se modifica Worker, D1, R2, notificaciones ni la APK firmada.

## Decimotercera fase · Familia: un solo dueño de reconexión (23/11)
- `MemberFamily.tsx` y `AdminFamily.tsx` mantenían listeners de `online` y `visibilitychange` que llamaban a `refresh()` junto a `useFamilyLive`. Cada reanudación podía duplicar la lectura D1 del directorio.
- Se eliminan solo esos listeners duplicados. La carga inicial inmediata y los contadores que invalidan respuestas HTTP al desmontar se conservan.
- `useFamilyLive` permanece como dueño único de resync foreground/online y de Familia WebSocket: no se crea otro canal ni se alteran permisos o almacenamiento.
- Dos pruebas de regresión comprueban las referencias de ambos componentes y simulan eventos del ciclo de vida con un WebSocket ficticio para validar una sincronización por señal, cierre offline y limpieza de timers.
- Este cambio no modifica el Worker, R2/D1, BOOK 3D, notificaciones ni la APK Android.

## Decimocuarta fase · Cobertura básica de arquitectura en cada despliegue (23/11)
- El build de Pages ahora ejecuta tres suites adicionales ya existentes: `family-realtime-parity`, `module-boundaries` y `android-pwa-parity`. Antes solo estaban en el workflow completo de GitHub.
- Son pruebas locales Node sin conexión a D1/R2 productivos y sin dependencias nuevas; detectan sesiones/transportes duplicados, errores de límites de módulos y diferencias entre la PWA y Android.
- No se modifica la aplicación, sus módulos, URLs, el Worker ni la APK. Los cambios de producción se siguen bloqueando si falla una prueba.
- El workflow completo de GitHub permanece intacto y se mantiene su ejecución manual/programada para controlar minutos.

## Decimoquinta fase · Actualización de pruebas de paridad obsoletas (23/11)
- Se activaron las suites históricas del test de arquitectura en Pages y detectaron cinco afirmaciones antiguas que ya no representaban la estructura actual. La primera compilación del cambio de test quedó bloqueada sin publicar.
- `tests/android-pwa-parity.test.mjs` comprueba que ambos Repertorios muestran el catálogo general y que las canciones del evento están dentro de Calendario (Android `NativeEventRepertoire`, PWA `EventRepertoire`). La prueba de Familia comprueba el BOOK integrado vigente en lugar del antiguo callback `onClose`.
- `tests/module-boundaries.test.mjs` valida el contrato privado de repertorio por evento y el refresco automático de Administración, sin exigir un antiguo botón `Actualizar` que ya no existe.
- No se modificaron componentes, rutas, contratos API, Worker, D1/R2 ni APK para silenciar tests; se corrigieron las aserciones para el comportamiento actual y se mantiene la nueva cobertura en cada build.
