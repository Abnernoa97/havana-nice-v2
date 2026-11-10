# HAVANA NICE V2 · Chat multimedia — arquitectura vigente

## Principios

Una sola rama (`main`), una sesión autorizada, un historial, una ruta de
subida a Cloudflare R2 y una fuente de verdad para el estado de mensajes.
Los módulos de multimedia no abren WebSockets, no gestionan permisos de chat
ni modifican Familia, Drive, OPFS, D1 o la navegación. No crear rutas paralelas
ni modificar datos existentes durante una limpieza estructural.

## Recorrido de foto · PWA de iPhone

1. **Selección:** `usePwaMediaSelection.ts` valida hasta cinco archivos por
   envío y muestra inmediatamente la bandeja con un `clientMessageId` de
   adjunto estable (UUID de medio).
2. **Preparación:** `chat-photo-upload-optimizer.ts` intenta WebP a calidad
   0.74 o JPEG a 0.76, conservando la proporción y limitando el lado largo a
   2048 px. No amplía imágenes pequeñas. Solo reemplaza el archivo si ahorra
   al menos 8 % de bytes. No convierte PNG con transparencia a JPEG. Si
   Safari no puede decodificar/codificar, conserva el archivo compatible.
3. **Plazo:** la preparación corre en una cola local de una foto a la vez.
   Al tocar Enviar, espera un máximo adicional de 1.5 s por el lote.
   Los trabajos sin terminar se congelan: no pueden cambiar los bytes
   mientras R2 ya conoce el tamaño y el MIME. Una cancelación o cambio de
   integrante reinicia la cola sin modificar el historial.
4. **Subida:** `chat-media-upload.ts` usa el transporte R2 existente, con
   los mismos UUID y reintentos. No se sube otra copia del original cuando
   existe una versión optimizada. Un error de conversión no bloquea el envío.
5. **Confirmación:** solo al confirmar R2 se retira la selección enviada.
   Los fallos permanecen pendientes para reintento; los archivos pendientes
   las fotografías pendientes se respaldan en `chat-media-draft.ts`, con
   vigencia de 24 h y límite de 80 MiB. Los videos originales no se
   copian a IndexedDB: si iOS cierra la PWA antes de confirmar el envío,
   habrá que volver a seleccionar los videos pendientes.
6. **Lectura:** `useChatMediaPreview.ts` consulta primero la miniatura de
   caché y solo ante fallo pide permiso a R2 y genera una miniatura.
   `ChatPhotoViewer.tsx` muestra al abrir la miniatura disponible e
   intercambia a la foto confirmada en R2 en cuanto termine de bajarla.
   Esa foto puede ser WebP optimizado, no necesariamente el original de cámara.

No prometer que toda imagen será WebP: iOS puede conservar el original
cuando el formato no es compatible, la imagen ya pesa poco o excede los
límites seguros del convertidor. La compresión ocurre **antes de subir**,
no en Cloudflare.

## Fotos · caché y presentación

| Módulo | Responsable |
| --- | --- |
| `usePwaMediaSelection.ts` | Selección y cola de adjuntos PWA |
| `chat-photo-upload-optimizer.ts` | Reducción local de fotos antes de R2 |
| `chat-media-draft.ts` | Recuperación privada de selección no enviada |
| `PwaChatMediaQueuePreview.tsx` | Progreso y miniaturas de selección |
| `chat-media-upload.ts` | Transporte y confirmación R2 |
| `chat-media-grant.ts` | Permiso temporal de lectura |
| `chat-photo-preview.ts` | Generación acotada de miniaturas |
| `chat-photo-thumbnail-cache.ts` | LRU de miniaturas en memoria e IndexedDB |
| `useChatMediaPreview.ts` | Precargar fotos una vez por mensaje montado; liberar al desmontar; video solo visible |
| `ChatMediaView.tsx` | Burbuja; no realiza subidas |
| `ChatPhotoViewer.tsx` | Visor progresivo; libera la URL temporal |

Las miniaturas usan un máximo de 1440 px en el lado largo, JPEG 0.92 para
fotografías y PNG cuando corresponde. Hasta dos decodificaciones simultáneas.
La caché privada PWA dispone de 16 MiB en memoria y de hasta 48 MiB,
80 elementos y 14 días en IndexedDB. Se identifica por huella de la
sesión, no almacena el token ni una URL firmada. Nunca utilizar la
caché de un integrante para mostrar medios a otro. Los `blob:`
temporales se revocan al liberar el componente.

Las fotografías dentro del chat respetan su proporción natural
(`aspect-ratio:auto`; `object-fit:contain`), no un marco cuadrado
forzado. El visor muestra la miniatura disponible al instante mientras
carga la versión almacenada en R2.

## Videos y Android nativo

Los videos de la PWA no se convierten con el codificador de fotografías:
mantienen el formato admitido por el servidor y la ruta de subida R2
existente. La bandeja de selección muestra un icono liviano y nombre,
sin montar elementos `<video>` o precargar metadatos para cinco archivos
a la vez. La subida a R2 sigue siendo secuencial por archivo.
Durante el scroll del historial solo muestran una carátula 16:9:
el permiso y reproductor se activan al tocar **Ver video**.
No instalar un transcodificador pesado de video en Safari sin pruebas
de rendimiento y de reproducción.

Android nativo conserva su flujo de selección y R2, **independiente de
la PWA**, pero comparte el contrato de servidor y mensajes.
`useNativeMediaSelection.ts` obtiene medios;
`chatPendingMedia.ts` los recupera;
`native-chat-r2-upload.ts` los transmite;
`NativeChatPhoto.tsx` y `chatPhotoCache.ts` muestran fotos ya
verificadas sin esperar otra descarga ni el cálculo inicial de relación.
`NativeChatVideo.tsx` usa el reproductor Expo.

Cambiar la PWA en Cloudflare **no instala una APK nueva**.

## Desplazamiento y sesiones

En la PWA el historial mantiene una ventana de 80 mensajes, avanzando
24 por vez, sin descartar los mensajes almacenados. La paginación espera
a que el desplazamiento termine; Safari no debe cambiar de página durante
el toque ni responder al rebote elástico. Los gestos verticales no activan
la animación lateral de responder. El seguimiento al final se suspende
mientras se revisa el historial. Solo existe un propietario del WebSocket
por plataforma.

Los módulos compartidos `chat-outbox.ts`, `chat-outbox-delivery.ts`,
`chat-incoming.ts`, `chat-connection-timers.ts`,
`chat-resume-gate.ts` y `chat-session-recovery.ts` concentran el orden,
ACK, eventos, timers y recuperación autorizada, respectivamente.
La capa multimedia nunca debe crear una segunda cola de mensajes
confirmados ni una conexión paralela.

En cambios de integrante o revocación, descartar solo la selección
transitoria del miembro anterior y revocar sus URLs temporales;
no eliminar R2, fotografías confirmadas, historial ni los datos de
Familia. La recuperación de borradores valida el integrante autorizado.

## Contratos de mantenimiento y QA

- Una responsabilidad por módulo. No volver a duplicar subida, compresión,
  almacenamiento de previews o autorización por plataforma.
- El UUID, tamaño y MIME deben permanecer estables durante cada subida R2.
  Nunca cambiar `item.file` después de empezar la transferencia.
- No borrar selecciones con error ni hacer limpieza destructiva de cachés.
- No persistir URLs firmadas, tokens en claro ni originales extra si hay
  versión comprimida; la miniatura es una copia pequeña de visualización.
- No mezclar las decisiones de video y foto en un segundo pipeline.
- Conservar Inicio, Atrás, cámara/galería, calendario y resto de la aplicación.
- Las pruebas de UI, recuperación y compresión están en
  `tests/chat-media-ui.test.mjs`, `tests/chat-media-resilience.test.mjs`,
  `tests/chat-photo-preview-policy.test.mjs` y
  `tests/chat-photo-upload-optimizer.test.mjs`.
- La compilación de Cloudflare valida la PWA; no reemplaza las pruebas
  de velocidad y gestos con un iPhone real ni las pruebas de APK Android.
- GitHub Actions de auditoría completa se ejecuta manualmente o según
  la programación existente, no por cada commit.

## Scroll PWA iPhone · ciclo de vida de fotos

La carga de una miniatura se inicia hasta 900 px antes de entrar en pantalla,
una sola vez por montaje de mensaje. Ya no se borra la foto por salir del
viewport ni se vuelve a crear su `blob:` al invertir el gesto; solo se libera
al desmontar la fila, cerrar Chat o cambiar de identidad. La caché LRU/IndexedDB
mantiene sus límites y permisos, y el video conserva su propia política de
visibilidad. El controlador de scroll espera 420 ms de silencio de eventos
tras la inercia de WebKit: jamás fuerza el fondo mientras el dedo o momentum
siguen desplazando. No se modifica selección, WebP, multipart R2 ni Android.

## iPhone · carátulas de videos (sin transcoding)

`chat-video-poster.ts` extrae opcionalmente una carátula JPEG de 640 px
(calidad 0.76, máximo 256 KiB), usando un solo decodificador a la vez.
El límite de espera es de 2.4 s por video. La selección aparece primero con
ícono y pasa a imagen si Safari logra obtener un fotograma. La generación
NO bloquea el envío ni multiplica videos en la vista. La URL `blob:` se
revoca al eliminar, confirmar o cerrar la selección.

El mismo `chat-media-upload.ts` sube el MOV intacto, luego intenta
guardar la carátula en `chat/<miembro>/<id>.poster.jpg` mediante el
endpoint privado `PUT /api/chat/media/:id/poster`. El JPEG es opcional
y no cambia D1 ni el UUID del mensaje. Se eliminan ambos objetos al borrar
el mensaje o miembro, y el cleanup de pendientes también limpia el sidecar.

El historial usa `chatVideoPosterUrl` para derivar la URL privada de la
carátula desde el mismo permiso temporal de lectura del video. Una única
caché de imágenes de chat conserva fotos y carátulas; nunca persistimos
grants. Los videos anteriores sin JPEG siguen mostrando el botón Ver video.
