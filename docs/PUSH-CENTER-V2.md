# HAVANA NICE V2 — Centro de notificaciones

**Estado auditado:** 22 de noviembre de 2026 (CDMX) · Android 0.0.30, backend Cloudflare y PWA.

## Estado comprobado

- **Android 0.0.30:** APK firmada y publicada. El propietario comprobó recepción con la app cerrada y el teléfono bloqueado para Chat (texto, fotografía y reacciones), Estados (publicaciones, emojis, comentarios y audios), Calendario, Familia, Repertorio y BOOK 3D. El FCM funciona en segundo plano.
- **PWA iPhone:** Web Push incluido, pero la confirmación física completa depende de instalar una versión de iOS compatible (16.4 o superior), abrir la PWA desde pantalla de inicio y aceptar el permiso. No presentarlo como verificado antes de esa prueba.
- **Servidor:** FCM HTTP v1 y Web Push VAPID configurados en Worker; registro autorizado de dispositivos en D1 y cola con reintentos. Las notificaciones cortas se emiten desde el servidor, no desde el navegador ni desde un segundo Chat.
- **APK:** no se recompila para reorganizar los archivos del servidor, ajustar los textos de pantalla bloqueada o documentar el sistema. El comportamiento nativo de la 0.0.30 permanece intacto.

## Estructura única (main)

```text
cloudflare/src/modules/notices/
  member-notifications.js    → entrada estable y API /api/notices, lectura y marcado
  member-event-notices.js     → acciones entre músicos; identidades autorizadas
  member-system-notices.js    → Calendario, Repertorio y BOOK de Administración
  push-copy.js                → textos cortos de pantalla bloqueada
  push-center.js              → configuración, registro y desvinculación, cola
  push-delivery.js            → transportes FCM HTTP v1 y Web Push, reintentos

apps/android/features/notices/
  useNativePush.ts            → único registro/token FCM y permisos nativos
  NativeNotices.tsx           → bandeja y botones del usuario
  useNativeUnreadNotices.ts   → contador de avisos no leídos

apps/pwa/src/features/notices/
  usePwaPush.ts               → permiso y suscripción Web Push
  MemberNotices.tsx           → bandeja y controles PWA
  usePwaUnreadNotices.ts      → contador PWA

apps/pwa/public/sw.js         → push y notificationclick en PWA
packages/shared/src/member-notifications.ts → contrato API y nombres comunes
cloudflare/migrations/0034_member_notifications.sql
cloudflare/migrations/0037_calendar_member_notifications.sql
cloudflare/migrations/0038_member_push_center.sql
cloudflare/migrations/0039_member_system_notifications.sql
cloudflare/migrations/0040_book_member_notifications.sql
```

La entrada `member-notifications.js` mantiene los mismos nombres exportados, de modo que Chat, Estados, Perfil, Familia, Calendario, Repertorio, BOOK y pruebas existentes siguen utilizando el contrato anterior. **Un Worker, un D1, un R2, un Durable Object de Chat existente, una rama `main`.**

## Disparadores y destinatarios

| Origen | Actividad que produce aviso | Destinatarios |
| --- | --- | --- |
| Chat | Mensaje de texto, foto o video guardado | Demás músicos activos |
| Chat | Emoji nuevo en un mensaje | Autor del mensaje |
| Estados | Publicación de 1–5 fotografías | Demás músicos activos, un aviso por lote |
| Estados | Emoji, comentario o audio | Propietario del Estado |
| Perfil | Cambio de foto de perfil | Demás músicos activos |
| Familia | Foto o video nuevo y confirmado por Administración | Equipo activo, incluido titular del álbum |
| Calendario | Crear, editar o eliminar evento | Músicos asignados y anteriores, cuando proceda |
| Repertorio general | Administración añade, edita o elimina canción | Todo el equipo activo |
| Repertorio de un evento | Añadir, quitar, ordenar o completar canciones | Únicamente músicos asignados |
| BOOK 3D general | Administración publica página nueva | Equipo activo, agrupando lotes cercanos |
| Prueba explícita | Pulsar «Probar aviso» | Dispositivos del propio músico, tras 15 segundos |

**No generan avisos:** abrir o leer mensajes, ver Estados, pasar páginas del BOOK, optimizar imágenes, renderizar vistas, editar portadas derivadas, guardar borradores, borrar elementos, reintentar subidas ni recibir ACK técnicos. La privacidad prohíbe incluir texto privado de Chat, notas de voz, rutas R2 y tokens en pantalla bloqueada.

## Seguridad y fiabilidad

- La identidad del músico sale siempre de `chat_members` y su sesión válida, nunca de destinatarios enviados por el cliente.
- `chat_sessions` y `chat_single_device_owners` conservan el control de acceso. Al desactivar un teléfono o invalidar sesión, no debe seguir recibiendo eventos de otras cuentas.
- Los identificadores FCM y suscripciones Web Push son privados; el secreto `FCM_SERVICE_ACCOUNT_JSON`, la clave `PUSH_VAPID_PRIVATE_KEY` y las credenciales Admin nunca pertenecen al código fuente.
- La cola guarda un aviso por evento/dispositivo, evita reenvíos duplicados y aplica reintentos limitados. El Worker procesa avisos inmediatamente o mediante cron de un minuto, y purga el historial antiguo sin borrar la bandeja privada.
- Si falla la entrega externa, **no se revierte** el mensaje, comentario, cambio de calendario ni archivo guardado.
- Las migraciones son aditivas; no reescribir las tablas 0034–0040 ni cambiar restricciones existentes. BOOK tiene tabla de sistema propia porque `0039` restringe expresamente su tipo al Repertorio.
- Las notificaciones indican el destino mediante `kind` y `targetId`; Android 0.0.30 abre módulos. Al tocar un BOOK nuevo puede abrir la bandeja, no la página exacta. Cambiar ese comportamiento exige una futura compilación nativa explícitamente autorizada.
- Las limitaciones del sistema operativo (teléfono sin energía, restricciones de batería o modo No molestar) siguen aplicando.

## Pruebas y puertas de seguridad

1. `cloudflare/tests/member-notifications.test.mjs`: destinatarios, deduplicación, aislamiento, bandeja y sistemas Admin.
2. `cloudflare/tests/push-center.test.mjs`: FCM, VAPID, envío, prueba diferida y reintentos.
3. `cloudflare/tests/push-copy.test.mjs`: nombre real, emoji, foto/video y privacidad de la pantalla bloqueada.
4. `cloudflare/tests/book.test.mjs`: subir/optimizar/ordenar y avisos solo por publicación real.
5. `tests/notifications-module-boundaries.test.mjs`: responsabilidades separadas, sin segunda conexión Chat ni segundo motor FCM.
6. `tests/native-push-integrity.test.mjs`, `tests/push-platform-support.test.mjs` y `tests/member-notifications-parity.test.mjs`: compatibilidad de ambas superficies sin cambios de APK.

Estas pruebas forman parte de la compilación web de Cloudflare Pages. Para publicar cambios en el Worker, ejecutar también su compilación, validar los resultados y confirmar que se mantienen los bindings de D1, R2, DO, FCM y VAPID. Jamás desplazar una versión funcional sin comprobar su sustituta.

## Versiones estables y recuperación

- Android estable verificado: **0.0.30 (versionCode 30)**.
- Compilación firmada: https://github.com/Abnernoa97/havana-nice-v2/actions/runs/45090812813
- APK actual: https://github.com/Abnernoa97/havana-nice-v2/releases/download/v2-android-current/HAVANA-NICE-V2-LATEST.apk
- Respaldo de la APK anterior: https://github.com/Abnernoa97/havana-nice-v2/releases/download/v2-android-current/HAVANA-NICE-V2-PREVIOUS.apk
- La versión de Worker anterior permanece como opción de reversión en Cloudflare Versions.
- Conservar Android, BOOK 3D y Audio sin reconstrucción salvo solicitud expresa.
