# HAVANA NICE V2 · Audio con portada y controles del sistema

**Estado:** implementación incorporada a `main`. No es una publicación final de Android. PWA podrá mostrar la interfaz desde Pages, pero **la biblioteca no funciona hasta desplegar el Worker** y aplicar la migración 0036.

## UX acordada
- Músicos: sección **Audio** con reproductor minimalista: portada cuadrada, título, artista, duración, línea de progreso y reproducir/pausar/anterior/siguiente.
- Administración: módulo Audio con subida de MP3/M4A/AAC/WAV y edición de título/artista/álbum y portada. Los MP3 ID3v2.3/v2.4 reconocen etiquetas `TIT2`, `TPE1`, `TALB`, `APIC` sin dependencia pesada; otras variantes permiten elegir portada manual.
- Android `expo-audio` (ya instalado): Media Session presenta carátula, nombre y artista en los controles de Samsung/Android al reproducir audio con `setActiveForLockScreen`. La imagen y disposición exactas de Quick Settings las controla **Android**, no nuestra PWA. En la PWA se usa `navigator.mediaSession` cuando el navegador la admite.
- Audio original privado en R2 con `D1` sólo para el índice. Capabilities temporales de una hora, sin R2 público, sin S3 keys en el cliente, con streaming por rango. Los bytes de audios/portadas cuentan en el presupuesto actual R2 compartido de 9.5 GB.
- Separación estricta: no modificar mensajes de voz, ChatRoom, sesión de músicos, BOOK 3D, Calendario, Familia. El sonido al cambiar de pista no requiere otro socket; hay un solo reproductor nativo persistente.

## Publicación controlada pendiente
1. Build `npm run build -w @havana/pwa` y tests `audio-api` + `audio-player-parity` + cuota general R2.
2. Respaldar/bookmark D1. Migración idempotente `0036_audio_library.sql` en la D1 existente: `audio_tracks`, `audio_media_grants`, `audio_delete_queue`.
3. Publicar el **Worker completo construido del mismo main** a `havana-nice-v2-dev` con bindings D1, R2 y Durable Objects actuales. No sobrescribir con JS parcial; guardar versión rollback. Este paso también habilitará funcionalidades pendientes de otros módulos si comparten Worker.
4. QA: subir MP3 con portada incrustada, confirmar que la misma carátula aparece en PWA, Android y Android Quick Settings; probar seek, play/pause, cambios de pista, multimedia en background, actualización de portada, borrado, permisos y consumo R2.
5. Sólo cuando se apruebe QA nativo generar y firmar la siguiente APK encima de la **0.0.23**. **No** incrementar `versionCode` ni modificar la liberación Android en este lote.

**No declarar Android o el nuevo API operativos antes de compilar Worker y probar dispositivo real.**
