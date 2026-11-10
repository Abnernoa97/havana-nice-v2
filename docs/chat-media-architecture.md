# HAVANA NICE V2 — Chat multimedia

## Objetivo

Cada acción ejecuta solo su responsabilidad. El chat mantiene una sola sesión,
un solo historial y el mismo almacenamiento R2. Ni el módulo multimedia ni el
visor pueden crear otra conexión de chat, modificar Google Drive, alterar
mensajes anteriores o reescribir la autenticación.

## Recorrido de una fotografía

1. **Seleccionar o fotografiar:** el selector del dispositivo devuelve el
   archivo original. Se valida tipo y tamaño antes de añadirlo a la cola.
2. **Conservar pendiente:** una copia temporal privada se mantiene por un máximo
   de 24 horas, dentro del límite de almacenamiento aplicable, para recuperar
   la selección después de una interrupción.
3. **Enviar:** el transportador existente sube el **archivo original sin
   recomprimirlo**. Conserva el identificador estable para reintentar.
4. **Confirmar:** solo después de la confirmación del servidor se quita ese
   archivo de la cola y se limpia su copia temporal.
5. **Ver en conversación:** se solicita un permiso corto de lectura y se crea
   una vista previa, no una copia permanente del original.
6. **Ampliar:** solo cuando se toca la foto se descarga el original completo.
   Al cerrar, la URL temporal se revoca y se libera memoria.

Si una subida falla, el archivo permanece pendiente y puede reintentarse.

## PWA / administrador — responsabilidades

| Módulo | Única responsabilidad |
| --- | --- |
| `usePwaMediaSelection.ts` | Interacción con cámara/galería y cola seleccionada |
| `chat-media-draft.ts` | Recuperación temporal y validada del archivo pendiente |
| `PwaChatMediaQueuePreview.tsx` | Mostrar adjuntos pendientes y progreso |
| `chat-media-upload.ts` | Subir originales a R2 y confirmar mensajes |
| `chat-media-grant.ts` | Solicitar URL autorizada temporal de lectura |
| `chat-photo-preview.ts` | Decodificar una miniatura nítida con memoria acotada |
| `useChatMediaPreview.ts` | Cargar/liberar previews cerca de la ventana visible |
| `ChatMediaView.tsx` | Mostrar burbuja de foto o video, sin lógica de transporte |
| `ChatPhotoViewer.tsx` | Abrir el original a pantalla completa **solo al tocar** |

Las fotos JPEG se previsualizan con borde largo máximo de **1,440 px** y
calidad **0.92**. Las PNG conservan formato sin pérdidas para textos y
transparencias. No se aumenta una foto pequeña artificialmente. Solo hay
**dos decodificaciones** simultáneas; las miniaturas que quedan lejos de la
pantalla se liberan con una pequeña espera para evitar parpadeos al desplazarse.

Estas cifras afectan solo a lo que se muestra **en Chat**. Los originales
almacenados en R2 permanecen intactos y se recuperan al ampliarlos. El visor
compartido se utiliza también en la sección administrativa.

## Android nativo — responsabilidades

| Módulo | Única responsabilidad |
| --- | --- |
| `useNativeMediaSelection.ts` | Elegir medios y recuperar el resultado de la cámara |
| `chatPendingMedia.ts` | Copias privadas de archivos todavía no enviados |
| `NativeChatMediaQueuePreview.tsx` | Mostrar archivos pendientes |
| `native-chat-r2-upload.ts` | Transmitir originales y confirmar mensajes |
| `native-chat-media-grant.ts` | Solicitar permiso de lectura |
| `NativeChatMediaView.tsx` | Elegir el componente de foto o video |
| `NativeChatPhoto.tsx` | Usar cache verificada y abrir el original |
| `NativeChatVideo.tsx` | Reproducir video con el reproductor Expo |
| `chatPhotoCache.ts` | Descargar/verificar el original completo en almacenamiento de caché de la app |

El módulo de fotos **no** inicializa un reproductor de video; el módulo de
video **no** descarga ni decodifica fotos. No se eliminan originales completos
del cache solo por reorganizar el código.

## Aislamiento de adjuntos por integrante

Si cambia o termina la sesión autorizada, PWA y Android vacían inmediatamente la
cola multimedia **en memoria** para que otra identidad no pueda reutilizar las
fotos o videos pendientes. Las URL temporales de la PWA se revocan. Esta medida
no modifica el historial, R2, la caché de originales confirmados ni los
archivos permanentes de otras secciones. La recuperación de borradores sigue
validando el `actorId` autorizado.

## Responsabilidad de la navegación

Inicio es la pantalla inicial en PWA y Android. El controlador principal
decide el destino y gestiona Atrás. Cámara, selección, almacenamiento temporal
y subida no pueden abrir una pantalla por su cuenta cuando hay archivos
pendientes. La recuperación de una selección es independiente de la
navegación. Si iOS reinicia la PWA al tomar una foto, se vuelve a Inicio y
el archivo ya guardado temporalmente estará disponible al entrar a Chat.
Android mantiene el retorno explícito a Chat tras un resultado nuevo que
entrega `ImagePicker.getPendingResultAsync`, pero los borradores antiguos
no cambian la pantalla inicial.

## Contratos que deben respetarse

- No comprimir ni alterar fotografías o videos antes de enviarlos.
- Nunca borrar una selección después de un fallo de subida.
- No duplicar sesiones WebSocket, llamadas de subida ni mensajes confirmados.
- No guardar tokens ni URLs privadas autorizadas en almacenamiento persistente.
- No descargar originales completos para todas las burbujas del historial.
- Respetar el máximo de archivos, límites de tamaño y permisos existentes.
- Conservar los controles nativos de volver y el acceso a la cámara y galería.
- Proteger Inicio, Familia, Google Drive, R2, OPFS y el resto de la aplicación.
- No eliminar cache de usuario ni mensajes como parte de limpieza estructural.

## Validación y publicación

Las regresiones de UI y recuperación están en
`tests/chat-media-ui.test.mjs`,
`tests/chat-media-resilience.test.mjs` y
`tests/chat-photo-preview-policy.test.mjs`.

GitHub Actions completo se reserva para ejecución manual o la programación
existente; no se dispara en cada modificación pequeña. Compilar la PWA en
Cloudflare no sustituye probar con una foto real en iPhone, Android PWA y la
siguiente APK Android nativa.

## Conexión y recuperación de sesión (auditoría estructural)

`recoverChatAccess` es la única decisión compartida al restaurar acceso:
una validación exitosa usa la sesión autorizada, una revocación explícita
rechaza el acceso y una interrupción de red conserva la sesión local para
reintentar. No crea un segundo inicio de sesión ni toca IndexedDB o SQLite.
El transporte nativo `openNativeChatSocket` solo abre el handshake existente
(`Authorization: Bearer`, subprotocolo `havana-v2`); el controlador Android
conserva la titularidad del único socket, reintentos y manejo de eventos.
La PWA sigue usando `openChatSocket`, sin alterar su autenticación.

## Un solo ciclo para mensajes salientes y confirmaciones

`chat-outbox.ts` conserva el orden y las transiciones puras. El módulo
`chat-outbox-delivery.ts` ejecuta la única política de envío, temporizador ACK,
confirmación, pausa y reintento manual compartida por PWA y Android. Los
controladores siguen siendo propietarios de sus sockets, cola local y
persistencia, sin nuevos registros, nuevos endpoints ni limpieza de datos.

El envío ahora exige que `senderId` coincida con `actorId` de la sesión
activa. Una autorización nueva vacía la cola anterior y cancela ACK pendientes
en **ambas** plataformas. El rechazo ocurre antes de transmitir datos,
sin eliminar historiales confirmados, caché, R2 ni borradores de otras secciones.

## Eventos entrantes — fuente de verdad

`chat-incoming.ts` es el único controlador de decisiones sobre eventos
`chat.ready`, presencia, escritura, edición, borrado, lectura, reacciones,
mensajes, revocación y errores. `chat-events.ts` concentra las proyecciones
puras de mensajes y evita reglas duplicadas en `index.ts`. El WebSocket y los
estados visuales permanecen en cada cliente, sin una segunda sesión.
Una edición rechazada conserva ahora su mensaje de error visible en lugar
de borrarlo en la misma actualización. No se modifica R2, D1 ni la APK.

## Control único de temporizadores de conexión

`ChatConnectionTimers` comparte solamente los temporizadores de reintento y
de espera del handshake (9 segundos). No tiene acceso a tokens, WebSocket ni
almacenamiento. Cada cliente mantiene su propio criterio de visibilidad/actividad
y el único socket existente. Las pruebas usan un reloj inyectable para detectar
reintentos duplicados y temporizadores que sobrevivan al cierre de la app.

## Validaciones tardías al volver de segundo plano

`ChatResumeGate` descarta respuestas de restauración antiguas o terminadas
mientras la app está en segundo plano, fuera de línea, revocada o con una
nueva sesión. En ambos clientes, solo la última comprobación de identidad
puede reconectar o revocar acceso. El socket permanece en su controlador
original, sin modificar almacenamiento ni endpoints.

Las validaciones al volver a primer plano y la recuperación inicial tienen
controles de antigüedad separados: ocultar la app invalida los resultados de
reconexión, **no** descarta la recuperación inicial de la sesión guardada.
La conexión inicial se aplaza hasta que PWA esté visible y con red, o Android
esté activa. Los temporizadores también invalidan callbacks ya cancelados,
aunque el sistema entregue uno de ellos tardíamente.

## Miniaturas rápidas del Chat (PWA y Android)

La carátula de una foto descargada una primera vez se conserva como **Blob
optimizado**, no como original ni enlace firmado: PWA usa una LRU en RAM
(limitada a 16 MiB) más IndexedDB privado (48 MiB, 80 miniaturas como máximo,
14 días), separadas por huella SHA-256 de la sesión. Las fotos visibles se
restauran desde caché antes de solicitar una nueva autorización o descargar el
original de R2. Si el navegador no permite IndexedDB, el chat sigue funcionando
por la ruta habitual. El `blob:` temporal se revoca al salir de la vista.
En Android una fotografía ya verificada en caché se pinta antes de terminar
`Image.getSize`; su relación de aspecto se ajusta sin descargar de nuevo.
No se tocaron videos, R2, datos de D1, ni las fotografías originales.

Las fotos enviadas desde la PWA generan su miniatura en paralelo a la
subida, directamente desde el archivo local, sin pedir una descarga posterior
del original a R2. La generación es no bloqueante y su error nunca puede
interrumpir la subida. No cambia el flujo de videos ni el original enviado.

## Desplazamiento del Chat PWA en iPhone

El Chat de iPhone mantiene un rango de 80 mensajes (saltos de 24, solapamiento
de 56), sin modificar ni borrar el historial almacenado. La paginación
automática espera a que termine el desplazamiento, no se activa mientras el
dedo está apoyado, e ignora valores fuera de rango del rebote elástico de
iOS. El seguimiento al último mensaje queda suspendido durante el gesto
y el momentum; el `ResizeObserver` no lucha contra el usuario cuando cargan
fotos o videos. El desplazamiento a lo último sigue disponible por acción
explícita o cuando el usuario realmente llega al fondo.

## iPhone · Multimedia y gestos del chat

Las fotografías ocupan un marco estable cuadrado, con `object-fit: contain`
para no recortar su contenido. Los videos ocupan un marco 16:9 y solicitan
autorización y reproductor solo cuando se toca su carátula; al salir de la
vista, su reproductor se libera. No se tocan originales R2 ni videos guardados.

`SwipeMessage` identifica si el gesto empezó vertical u horizontal. El
desplazamiento vertical no actualiza la posición React de la burbuja en cada
movimiento. `ChatTimeline` descarta cualquier dirección residual al
estabilizarse el movimiento, incluso si no cambia de página.

## PWA iPhone · archivo de foto optimizado ANTES de R2

Al seleccionar fotos, Chat muestra inmediatamente la bandeja. Un único
codificador local intenta convertir cada fotografía a WebP de buena calidad,
conservando el número original de píxeles y la proporción. Solo sustituye el
archivo si reduce como mínimo el 12% de bytes; JPEG es un fallback para fotos
sin transparencia. PNG nunca se convierte a JPEG. Si Safari no soporta el
formato o no puede codificarlo de forma segura, se conserva el archivo
compatible. Los videos no se recodifican con esta ruta.

La subida espera a que el tamaño y MIME finales de cada foto estén cerrados:
un UUID de R2 nunca cambia de contenido en mitad de una transferencia ni en
el reintento. La copia de recuperación en IndexedDB guarda los bytes finales
optimizados, no una segunda copia original. Esta protección deja los videos,
su protocolo multipart y la base de datos existentes intactos.
