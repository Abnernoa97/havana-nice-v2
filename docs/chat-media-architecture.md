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
| `chat-media-return.ts` | Conservar la navegación de regreso a Chat, sin credenciales |
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
