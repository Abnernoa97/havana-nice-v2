# HAVANA NICE V2 — CONTINUIDAD EXACTA

**Fecha de referencia: 20/11/2026.** La descripción vigente y la lista única de pendientes están en [PLAN-MAESTRO.md](./PLAN-MAESTRO.md). No guardar otro plan paralelo: cualquier modificación debe actualizar aquel tablero. El historial completo de implementación se consulta en Git, no en archivos obsoletos dentro de la app.

## Identificación precisa

- Repositorio: `Abnernoa97/havana-nice-v2`, única rama `main`; en la auditoría, PRs abiertos **0**. PWA: `https://havana-nice-v2.pages.dev`; acceso habitual de músico `/`, vista visual `/visual.html`, Admin `/admin.html`, BOOK canónico `/book` (`book.html` en el código fuente).
- Worker único `havana-nice-v2-dev` (en Cloudflare bajo cuenta y proyecto V2, no HAVANA CLOUD). **Worker vivo, carátulas de Chat:** `96100737-ce2d-4056-bb1e-bc00bd7067e6` al 100 % desde el 12/11; versión v66 (`87e6d28a-f1eb-43ed-974b-eb1884198533`) conservada para reversión. Siete bindings iguales y sin migraciones adicionales.
- D1 única `6a4abd3a-c01b-4d4f-b0ed-49f7eaca0cc5`. Bucket R2 único privado `havana-nice-v2-media` → `MEDIA_BUCKET`. DO `CHAT_ROOMS` clase `ChatRoom` y `CALENDAR_ROOMS` clase `CalendarRoom`. Siete bindings conservados; credencial Admin solo secreto de Cloudflare, nunca fuente.
- Android package ID `com.havananice.v2`; APK más reciente publicada **0.0.21**, `versionCode 21`, firmada y compatible con 0.0.20 según CI; corrige sesión nativa en BOOK y Recuerdos mediante puente directo tras `boot`. **Usuario confirmó BOOK en Android 0.0.21 y PWA, incluidos retroceso y mayor fluidez del giro. Recuerdos y QA integral pendientes.** Solo se crea una nueva versión mediante lote explícitamente autorizado.
- GitHub Actions: exactamente dos workflows, `.github/workflows/v2-foundation-check.yml` y `v2-android-apk.yml`. CI verde de Android 0.0.21: [42571102335](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42571102335); CI general/BOOK: [42571102501](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42571102501). La exportación Android de la CI general **no** publica APK; la versión firmada se libera únicamente mediante el workflow de lote.

## Principios no negociables

1. Un `main`, sin ramas temporales, bridges a Google Drive/HAVANA CLOUD/Supabase, motores duplicados, archivos obsoletos ni datos de demostración falsos.
2. No tocar app original ni cloud original. No destruir fotos, videos, mensajes, sesiones, identificadores, fechas ni autorizaciones. Migraciones D1 aditivas; no cambiar histórico ya aplicado.
3. PWA iPhone y nativa Android son interfaces distintas para mismos contratos. HOME central, módulos Chat, Calendario, Repertorio, Familia, BOOK, Músicos y Multimedia independientes por responsabilidad. Una sola autorización por nombre aprobada por Admin; una sola instalación/músico; Admin con sesión separada.
4. Los anexos de Chat y Familia se suben como originales, sin reducir calidad ni forzar transcodificación; máximo cinco archivos combinados en Chat. R2 rápido. Derivados WebP exclusivamente para BOOK y recuerdos de eventos, conservando original. Cuota global de aviso 9.0 GB y corte preventivo 9.5 GB.
5. UI estética *después* de funcionamiento, sincronización y estructura. BOOK con el mismo motor StPageFlip y diseño aprobado por usuario; pergamino y sello de evento realizado en Calendario ya aprobados.

## Mapa de fuente y estado

`apps/pwa/src/app/App.tsx`: dueño de sesión músico, controlador Chat web y navegación HOME. `VisualApp.tsx` y sus Calendar/Repertoire/Family son lazy. Admin en `features/admin/AdminChatAccess.tsx` es único dueño de sesión Administrador; sus pestañas son lazy. BOOK: `features/book/BookReader.tsx` + `book-image-optimizer.ts`. Calendario de recuerdos: `features/calendar/CalendarMemories.tsx` y `AdminCalendarMemories.tsx`, el editor sólo monta cuando se abre una fecha. El Service Worker cachéa solo shells/recursos públicos y evita privadas.

`apps/android/App.tsx`: entrada Expo. `apps/android/app/NativeApp.tsx`: entrada de 10 líneas; `features/chat/useNativeChatController.ts` conserva el único dueño de sesión/Chat; `features/chat/NativeChatSurface.tsx` muestra UI; `features/chat/useNativeChatViewport.ts` controla historial; `hooks/useNativeMemberNavigation.ts` maneja botón Atrás/gestos; HOME usa `NativeMemberHome`. Módulos en `features/{calendar,repertoire,family,book,chat,musicians}`. El BOOK nativo abre la ruta canónica `/book` y recibe la sesión existente tras `boot`, mediante un único puente en memoria. Control del picker separado en `features/chat/useNativeMediaSelection.ts`; PWA tiene `features/chat/usePwaMediaSelection.ts`.

`packages/shared/src/index.ts`: contrato compartido, importador de `chat-media-batch.ts` para envíos originales de ambos sistemas, Chat offline/outbox/ACK, reconexión, display, APIs de Calendar, R2, Repertorio y BOOK. El guard `scripts/check-structure.mjs` valida también este paquete y resuelve importaciones ESM/TS.

`cloudflare/src/index.ts`: ÚNICA entrada Worker (~265 líneas tras limpieza). `modules/chat/chat-room.ts`: UNA clase `ChatRoom`, preserva WebSockets de Chat/Admin/Familia, presencia, envío, edición y borrado. `modules/chat/chat-session.ts`: validación única de token y propiedad de instalación para Worker y DO; `shared/worker-types.ts` y `shared/worker-http.ts` contienen tipos y respuesta no-cache. Nunca reintroducir `ChatRoom` en index.ts. `modules/calendar/calendar-realtime.js`: una clase `CalendarRoom`. Otros módulos por dominio bajo `cloudflare/src/modules/`.

## Última auditoría y realidad en D1

- Calendario: cuatro fechas y cuatro recuerdos fotográficos, **tres** optimizados WebP. Se confirmó que el editor sólo carga al abrir una fecha; optimización: eliminar consulta repetida `adminMembers` al procesar cada invalidación, tomando la lista ya sincronizada por Admin.
- BOOK general: siete originales (29,333,701 bytes), **cero** derivados WebP al control; abrir Administración de BOOK para crear sus copias ligeras. No afirmar un ahorro de archivos todavía inexistentes.
- Familia: dieciséis archivos privados al control. El motor de subida rápida es modelo aprobado por el usuario y no debe alterarse.
- Colas de borrado de BOOK, recuerdos y bajas de músicos: cero pendientes; reservas R2 en vuelo: cero. Si hay errores R2 futuros, revisar persistencia y recuperación segura sin cron innecesario.
- Chat multimedia refactor: Android y PWA tienen selectores separados, subida original con los mismos transportes, y **una** política compartida de progreso/confirmación; las colas fallidas siguen disponibles para reintento.
- Worker refactor: una clase Durable Object y un `index.ts` delgado. Worker de carátulas publicado desde el 12/11; siete bindings preservados. El control del 20/11 validó las fuentes y pruebas, sin subir otro Worker ni compilar nueva APK. Los smoke tests históricos de v66 siguen documentados en Git.
- No confundir compilación + pruebas con experiencia física. En iPhone la navegación modular fue confirmada por usuario; el lector BOOK 3D Android/PWA también fue confirmado después de la corrección. Siguen pendientes modo avión, Recuerdos y QA integral de Chat/Familia/Calendario.

**21/11 · Perfil:** foto obligatoria y editable por actorId, Notificaciones sexta pestaña; D1 0030 y Worker v69 activos, R2 privado. Foto cargada en R2 pero ícono roto en iPhone: Workers Logs sin solicitudes GET de foto, compatible con ruta relativa en JS anterior. Corrección lista: Worker devuelve URL absoluta de imagen, ambos clientes validan mismo origen y PWA usa fallback con única recuperación. Verificar Pages, versión Wrangler nueva y QA iPhone; Android código modificado sin APK.

## Próximos pasos en orden

1. **Worker de carátulas activo y alineado con PWA:** conservar siete bindings y v66 como reversión; sin cambios al backend durante el refactor nativo.
2. **NativeApp modularizado en main (20/11):** Cloudflare Build `b0cb0fab` verificó `check:structure`, `audit:guard`, los tres typechecks, build PWA y **300/300 pruebas**. No hay APK nueva y falta QA físico de reconexión/offline. Se completó la separación de `apps/pwa/src/app/App.tsx`: entrada de 9 líneas. `features/chat/usePwaChatController.ts` posee sesión, socket, reconexión, historial y offline; `PwaChatSurface.tsx` presenta el Chat, `app/usePwaMemberNavigation.ts` gestiona historial/navegación, y `usePwaChatMediaUpload.ts` conserva el envío R2 original con misma cola/identificadores. El acceso visual sigue en `PwaMemberAccessPanel.tsx`. La publicación Pages ejecuta estructura, auditoría, typecheck y pruebas de acceso/lazy chunks; QA real de iPhone offline sigue pendiente.
3. Comprobar cache offline PWA de módulos abiertos/no abiertos en iPhone real; conservar semántica y no cachear APIs ni archivos privados.
4. **Conservar APK 0.0.21:** BOOK y el gesto 3D están confirmados por el usuario; verificar Recuerdos y sincronización Chat/Familia/Calendario en pruebas independientes. La próxima APK requiere un lote explícito, manteniendo la firma.
5. Completar Músicos y Multimedia, después detalles One UI y diseño; medir tiempos reales antes de prometer velocidad.

## Regla de trabajo del siguiente chat

No repetir preguntas ya contestadas. Inspeccionar `main`, el Plan Maestro y la última CI. Trabajar directamente por módulos **sin crear ramas ni motores**, confirmar no romper D1/R2 ni las apps de producción y marcar cada bloque sólo cuando haya evidencia. Si el proceso está en CI o pendiente de dispositivo, decirlo explícitamente. Mantener el historial de Git como registro técnico, sin acumular cronologías contradiciendo este estado.
