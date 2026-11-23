# HAVANA NICE V2 · Push Center único

## Regla de publicación

**Autorización posterior (22-Nov-2026):** el usuario pidió preparar ya Android
nativo mientras termina la actualización iOS. Se autoriza un único lote
incremental **0.0.30 (code 30)** para poder hacer la primera prueba física FCM.
No considerar Android final hasta verificar que el token se registra y que la
notificación de prueba se entrega con pantalla bloqueada.
Mantener una sola rama `main`, el mismo Worker, D1, R2 y las sesiones existentes.
Conservar APK anterior y validar certificado antes de reemplazar el enlace.

## Arquitectura

1. Todos los módulos escriben avisos privados con `notifyMember` /
   `notifyCalendarMembers` y deduplicación del evento. Nunca se reciben
   destinatarios desde la petición del usuario.
2. La migración `0038_member_push_center.sql` crea únicamente
   `member_push_devices` y `member_push_outbox`: registros ligados al hash
   de la sesión autorizada y entrega individual por dispositivo.
3. `push-center.js` registra/desvincula el token nativo FCM o una
   suscripción estándar Web Push (VAPID) para iPhone PWA.
4. `push-delivery.js` entrega al instante y conserva intentos fallidos.
   El cron de 1 minuto reintenta, separadamente de la limpieza existente
   de 15 minutos. Nunca reenvía avisos de más de 6 horas.
5. `sw.js` presenta avisos en la PWA instalada y abre la sección
   Notificaciones al pulsarlos. Android requerirá `expo-notifications`
   con token FCM, canal Android y permisos explícitos.

## Cobertura del evento (fuente central)

| Evento | Notificación | Destino |
| --- | --- | --- |
| Texto nuevo en Chat | `chat.message` | Resto del equipo |
| Foto/video confirmado en Chat | `chat.message` | Resto del equipo |
| Reacción a mensaje Chat | `chat.reaction` | Autor original |
| Uno a cinco Estados nuevos | `story.created` | Resto del equipo |
| Comentario a Estado | `story.comment` | Propietario del Estado |
| Nota de voz en Estado | `story.voice` | Propietario del Estado |
| Corazón/emoji en Estado | `story.reaction` | Propietario del Estado |
| Cambio de foto de perfil | `profile.photo` | Resto del equipo |
| Foto/video nuevo en Familia por Admin | `family.media` | Todo el equipo incluido propietario del álbum |
| Fecha creada/modificada/eliminada | `calendar.event` | Destinatarios asignados y anteriores aplicables |
| Repertorio del evento modificado (añadir, quitar, orden, progreso) | `repertoire.updated` | Integrado para los músicos asignados |
| Otras acciones futuras | Tipo específico | Según permisos y relevancia |

**No enviar** notificaciones por lecturas, gestos, renders, progreso de subida,
trozos multipart, portadas derivadas, consultas repetidas, borradores ni reintentos.
Son acciones técnicas, no actividad útil del equipo.

## Seguridad y privacidad

- `chat_sessions` y `chat_single_device_owners` siguen siendo autoridad:
  un dispositivo con sesión caducada/revocada no recibe un push nuevo.
- El endpoint Web Push y el token FCM son privados en D1, sin exposición
  en GET. Se almacenan hashes para localizar, desvincular y evitar duplicados.
- La pantalla bloqueada recibe solo metadatos cortos, **sin** contenido
  completo del mensaje, enlaces privados, credenciales ni rutas R2.
- `PUSH_VAPID_PRIVATE_KEY` y `FCM_SERVICE_ACCOUNT_JSON` deben permanecer
  como secretos de Worker; `PUSH_VAPID_PUBLIC_KEY` es público.
- Mensajes entrantes y archivos guardados no pueden revertirse por un
  error de proveedor push; el inbox privado sigue funcionando.
- En iPhone: PWA agregada a pantalla de inicio, iOS 16.4+, permiso
  obtenido mediante toque del usuario.

## Puertas de calidad antes de construir APK

- [x] Migración aditiva D1 aplicada sin alterar chats ni estados existentes.
- [x] Código de registro privado de dispositivos y cola deduplicada.
- [x] Adaptadores cifrados Web Push (RFC 8291/8292) + FCM HTTP v1.
- [x] Service Worker y control PWA de activación mediante toque.
- [x] Validación inicial CI del Worker y PWA: Worker versión `41c1c56e` y Pages `4adc9bce` pasaron las pruebas. Repetir para cambios posteriores.
- [x] Credenciales VAPID guardadas como secretos privados en Cloudflare (nombres comprobados).
- [ ] Prueba real de notificación de pantalla bloqueada en PWA iPhone instalada.
- [x] Proyecto Firebase `havana-nice-v2-push` registrado; `google-services.json` del paquete `com.havananice.v2` integrado en Expo mediante `android.googleServicesFile`.
- [x] Cuenta de servicio FCM HTTP v1 guardada como secreto privado en Cloudflare (`FCM_SERVICE_ACCOUNT_JSON`), sin compartir la clave.
- [ ] Verificación de OAuth FCM y entrega real; la existencia del secreto no garantiza permisos válidos.
- [x] Código fuente nativo `expo-notifications` SDK 58 conectado al Chat shell con permisos, token FCM, renovación, revocación y navegación al tocar un aviso. **No hay APK nueva**.
- [ ] Verificación de build nativo, firma y recepción real en Android al final del lote autorizado.
- [x] Notificaciones actorless del Repertorio por evento mediante migración aditiva `0039_member_system_notifications.sql` y destinatarios asignados; falta verificar push en teléfono real.
- [ ] Revisar cualquier otra acción futura de Admin que deba generar actividad útil, sin notificar acciones técnicas.
- [ ] Prueba cruzada Android ↔ PWA con pantalla bloqueada, sin red y reconexión.
- [ ] Un único lote nativo 0.0.30 compilado/firmado con prueba de firma y rollback; la comprobación en dispositivo real será después de instalarlo.

Una app totalmente apagada por el usuario, un teléfono sin corriente,
el modo No molestar o restricciones del sistema pueden alterar la entrega;
no prometer tiempo ni entrega absoluta de un proveedor externo.

## Estado confirmado · 22 de noviembre de 2026

- Worker `havana-nice-v2-dev` desplegado con motor de push y siete bindings históricos intactos.
- D1 contiene `member_push_devices` y `member_push_outbox`, ambos inicialmente vacíos.
- PWA activa con permiso desde la bandeja privada y service worker para recepción; todavía no puede mostrar push reales sin claves VAPID.
- Los nombres de las claves VAPID pública/privada y FCM aparecen en la versión activa del Worker como secretos. Nunca guardar valores en Git.
- Firebase Android registrado: proyecto `havana-nice-v2-push`, número de proyecto `33085079931`, paquete `com.havananice.v2`; `google-services.json` integrado en `apps/android/` sin compilar APK. La credencial FCM HTTP v1 está en el secreto del Worker; faltan pruebas de su validez y de entrega.
- Ninguna APK nueva, compilación Android ni lote `android-batch.json` realizados durante el desarrollo de push. Los cambios en `app.json` y `google-services.json` no activan el workflow de lanzamiento de APK.
- Push en segundo plano sin probar en teléfonos físicos, no declarar finalizado.

## Fase de integración nativa y Repertorio

- Android: `useNativePush.ts` se monta una sola vez desde `NativeChatSurface`, usa el token FCM nativo, canal `havana-team-activity`, renovación, permiso explícito y apertura contextual. El control se muestra en `NativeNotices`. Desactivación persistente con `expo-sqlite/kv-store`. No publicar ni compilar APK todavía.
- Repertorio: `0039_member_system_notifications.sql` aplicada en D1, avisos de los cambios reales del repertorio de evento a los músicos asignados. Se evita suplantar la identidad de un músico con un evento de Administración.
- `expo-notifications` 58.1.6 añadido y fijado en el lockfile; compilación Java/Gradle no ejecutada.
- El cierre del proyecto depende de registrar teléfonos reales, probar Android bloqueado + PWA iPhone instalada y verificar FCM y VAPID, además de la firma de la futura APK única cuando el usuario lo autorice.

- Verificación asistida: `/api/push/test` crea **solo para la sesión autorizada** una notificación de prueba con entrega diferida, límite de una solicitud por minuto y control «Probar aviso» en Android/PWA. La aceptación de la solicitud no demuestra entrega hasta observarla físicamente.

## Cambio de fase: Android 0.0.30 para prueba real

La PWA en iPhone permanece sin pruebas de pantalla bloqueada por requisitos de iOS 16.4+; su actualización puede ocurrir en paralelo. Android SDK 58 tiene integración FCM nativa y configuración aprobada. Se añadió protección contra registros tardíos al cerrar sesión, y un gate de permiso `POST_NOTIFICATIONS` en el APK. El lote 0.0.30 se limita a notificaciones y no debe modificar Audio, BOOK 3D, los Estados ni Chat existentes.
