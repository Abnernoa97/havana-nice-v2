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
