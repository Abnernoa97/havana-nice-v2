# HAVANA NICE V2 — CONTINUIDAD EXACTA

**Fecha de referencia: 08/11/2026.** La descripción vigente y la lista única de pendientes están en [PLAN-MAESTRO.md](./PLAN-MAESTRO.md). No guardar otro plan paralelo: cualquier modificación debe actualizar aquel tablero. El historial completo de implementación se consulta en Git, no en archivos obsoletos dentro de la app.

## Identificación precisa

- Repositorio: `Abnernoa97/havana-nice-v2`, única rama `main`; en la auditoría, PRs abiertos **0**. PWA: `https://havana-nice-v2.pages.dev`; acceso habitual de músico `/`, vista visual `/visual.html`, Admin `/admin.html`, BOOK `/book.html`.
- Worker único `havana-nice-v2-dev` (en Cloudflare bajo cuenta y proyecto V2, no HAVANA CLOUD). **Versión viva v65:** `81a512bb-a383-4258-8f5b-6aacf831b9b5` al 100 %. **La refactorización posterior del Worker está en `main` y compilada, pero pendiente de publicarse con procedimiento controlado.**
- D1 única `6a4abd3a-c01b-4d4f-b0ed-49f7eaca0cc5`. Bucket R2 único privado `havana-nice-v2-media` → `MEDIA_BUCKET`. DO `CHAT_ROOMS` clase `ChatRoom` y `CALENDAR_ROOMS` clase `CalendarRoom`. Siete bindings conservados; credencial Admin solo secreto de Cloudflare, nunca fuente.
- Android package ID `com.havananice.v2`; APK publicada **0.0.13**, versionCode 13, firma verificable y actualización encima del dispositivo. Desarrollo nativo posterior no se ha enviado como APK. Solo se crea una versión con lote explícitamente autorizado.
- GitHub Actions: exactamente dos workflows, `.github/workflows/v2-foundation-check.yml` y `v2-android-apk.yml`. CI verde del Worker modular: [42444820118](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42444820118). Los pasos de export APK del workflow **no** constituyen publicación de APK.

## Principios no negociables

1. Un `main`, sin ramas temporales, bridges a Google Drive/HAVANA CLOUD/Supabase, motores duplicados, archivos obsoletos ni datos de demostración falsos.
2. No tocar app original ni cloud original. No destruir fotos, videos, mensajes, sesiones, identificadores, fechas ni autorizaciones. Migraciones D1 aditivas; no cambiar histórico ya aplicado.
3. PWA iPhone y nativa Android son interfaces distintas para mismos contratos. HOME central, módulos Chat, Calendario, Repertorio, Familia, BOOK, Músicos y Multimedia independientes por responsabilidad. Una sola autorización por nombre aprobada por Admin; una sola instalación/músico; Admin con sesión separada.
4. Los anexos de Chat y Familia se suben como originales, sin reducir calidad ni forzar transcodificación; máximo cinco archivos combinados en Chat. R2 rápido. Derivados WebP exclusivamente para BOOK y recuerdos de eventos, conservando original. Cuota global de aviso 9.0 GB y corte preventivo 9.5 GB.
5. UI estética *después* de funcionamiento, sincronización y estructura. BOOK con el mismo motor StPageFlip y diseño aprobado por usuario; pergamino y sello de evento realizado en Calendario ya aprobados.

## Mapa de fuente y estado

`apps/pwa/src/app/App.tsx`: dueño de sesión músico, controlador Chat web y navegación HOME. `VisualApp.tsx` y sus Calendar/Repertoire/Family son lazy. Admin en `features/admin/AdminChatAccess.tsx` es único dueño de sesión Administrador; sus pestañas son lazy. BOOK: `features/book/BookReader.tsx` + `book-image-optimizer.ts`. Calendario de recuerdos: `features/calendar/CalendarMemories.tsx` y `AdminCalendarMemories.tsx`, el editor sólo monta cuando se abre una fecha. El Service Worker cachéa solo shells/recursos públicos y evita privadas.

`apps/android/App.tsx`: dueño de sesión y Chat nativo, navegación `NativeMemberHome`. Módulos en `features/{calendar,repertoire,family,book,chat,home}`. El BOOK nativo usa WebView autorizado hacia `/book.html`. Control del picker separado en `features/chat/useNativeMediaSelection.ts`; PWA tiene `features/chat/usePwaMediaSelection.ts`.

`packages/shared/src/index.ts`: contrato compartido, importador de `chat-media-batch.ts` para envíos originales de ambos sistemas, Chat offline/outbox/ACK, reconexión, display, APIs de Calendar, R2, Repertorio y BOOK. El guard `scripts/check-structure.mjs` valida también este paquete y resuelve importaciones ESM/TS.

`cloudflare/src/index.ts`: ÚNICA entrada Worker (~265 líneas tras limpieza). `modules/chat/chat-room.ts`: UNA clase `ChatRoom`, preserva WebSockets de Chat/Admin/Familia, presencia, envío, edición y borrado. `modules/chat/chat-session.ts`: validación única de token y propiedad de instalación para Worker y DO; `shared/worker-types.ts` y `shared/worker-http.ts` contienen tipos y respuesta no-cache. Nunca reintroducir `ChatRoom` en index.ts. `modules/calendar/calendar-realtime.js`: una clase `CalendarRoom`. Otros módulos por dominio bajo `cloudflare/src/modules/`.

## Última auditoría y realidad en D1

- Calendario: cuatro fechas y cuatro recuerdos fotográficos, **tres** optimizados WebP. Se confirmó que el editor sólo carga al abrir una fecha; optimización: eliminar consulta repetida `adminMembers` al procesar cada invalidación, tomando la lista ya sincronizada por Admin.
- BOOK general: siete originales (29,333,701 bytes), **cero** derivados WebP al control; abrir Administración de BOOK para crear sus copias ligeras. No afirmar un ahorro de archivos todavía inexistentes.
- Familia: dieciséis archivos privados al control. El motor de subida rápida es modelo aprobado por el usuario y no debe alterarse.
- Colas de borrado de BOOK, recuerdos y bajas de músicos: cero pendientes; reservas R2 en vuelo: cero. Si hay errores R2 futuros, revisar persistencia y recuperación segura sin cron innecesario.
- Chat multimedia refactor: Android y PWA tienen selectores separados, subida original con los mismos transportes, y **una** política compartida de progreso/confirmación; las colas fallidas siguen disponibles para reintento.
- Worker refactor: una clase Durable Object y un `index.ts` delgado. **CI SUCCESS** para Worker dry-run, binding checks, pruebas privadas, Chrome BOOK, PWA y export Android. Live Worker v65 no se cambia hasta validar/revisar despliegue manual.
- No confundir compilación + pruebas con experiencia física. En iPhone la navegación modular fue confirmada por usuario. Modo avión con primera apertura de lazy chunks y nuevo APK Android todavía no están validados.

## Próximos pasos en orden

1. Desplegar el Worker reorganizado **solo cuando** bundle canonical Wrangler de `main` coincida con su SHA y siete bindings, staged 0 %, pruebas de API/privacidad, promoción controlada; de momento v65 en producción.
2. Continuar segmentando los controladores Chat nativo/PWA (sobre todo sockets y estado), sin mover ni duplicar autoridad de sesión. Prueba CI y reconexión con pérdida de internet.
3. Comprobar cache offline PWA de módulos abiertos/no abiertos en iPhone real; conservar semántica y no cachear APIs ni archivos privados.
4. Preparar paquete Android **acumulativo** cuando esté autorizado: versionCode incremental, firma de instalación idéntica a 0.0.13, QA nativo de Chat/repertorio/calendar/BOOK.
5. Completar Músicos y Multimedia, después detalles One UI y diseño; medir tiempos reales antes de prometer velocidad.

## Regla de trabajo del siguiente chat

No repetir preguntas ya contestadas. Inspeccionar `main`, el Plan Maestro y la última CI. Trabajar directamente por módulos **sin crear ramas ni motores**, confirmar no romper D1/R2 ni las apps de producción y marcar cada bloque sólo cuando haya evidencia. Si el proceso está en CI o pendiente de dispositivo, decirlo explícitamente. Mantener el historial de Git como registro técnico, sin acumular cronologías contradiciendo este estado.
