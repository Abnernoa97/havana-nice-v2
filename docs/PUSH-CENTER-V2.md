# HAVANA NICE V2 · Push Center único

## Regla de publicación

**No compilar, firmar ni publicar Android hasta completar todas las rutas, configurar FCM
y verificar la entrega en teléfonos reales.** La versión nativa instalada 0.0.29
permanece intacta. No modificar `releases/android-batch.json` durante esta fase.
Mantener una sola rama `main`, el mismo Worker, D1, R2 y las sesiones existentes.

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
| Repertorio del evento modificado | `repertoire.updated` | **Por conectar** |
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
- [ ] Credenciales VAPID configuradas y prueba real PWA iPhone cerrada.
- [x] Proyecto Firebase `havana-nice-v2-push` registrado; `google-services.json` del paquete `com.havananice.v2` integrado en Expo mediante `android.googleServicesFile`.
- [ ] Cuenta de servicio FCM HTTP v1 con permisos mínimos, almacenada como secreto de Cloudflare (`FCM_SERVICE_ACCOUNT_JSON`).
- [ ] Enlace nativo Expo para canal, permisos, rotación de token, click y logout.
- [ ] Cobertura de repertorio y cualquier evento de Admin adicional.
- [ ] Prueba cruzada Android ↔ PWA con pantalla bloqueada, sin red y reconexión.
- [ ] **Solo entonces** lote nativo nuevo firmado, incremental y probado.

Una app totalmente apagada por el usuario, un teléfono sin corriente,
el modo No molestar o restricciones del sistema pueden alterar la entrega;
no prometer tiempo ni entrega absoluta de un proveedor externo.

## Estado confirmado · 22 de noviembre de 2026

- Worker `havana-nice-v2-dev` desplegado con motor de push y siete bindings históricos intactos.
- D1 contiene `member_push_devices` y `member_push_outbox`, ambos inicialmente vacíos.
- PWA activa con permiso desde la bandeja privada y service worker para recepción; todavía no puede mostrar push reales sin claves VAPID.
- Las credenciales VAPID no se provisionaron; intento de configuración segura bloqueado. No colocar claves en Git.
- Firebase Android registrado: proyecto `havana-nice-v2-push`, número de proyecto `33085079931`, paquete `com.havananice.v2`; `google-services.json` integrado en `apps/android/` sin compilar APK. Falta la credencial del servidor FCM HTTP v1, que **no** se obtiene de este JSON público.
- Ninguna APK nueva, compilación Android ni lote `android-batch.json` realizados durante el desarrollo de push. Los cambios en `app.json` y `google-services.json` no activan el workflow de lanzamiento de APK.
- Push en segundo plano sin probar en teléfonos físicos, no declarar finalizado.
