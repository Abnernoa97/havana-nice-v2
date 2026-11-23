# HAVANA NICE V2 — PLAN MAESTRO ÚNICO

**Estado vigente: 23 de noviembre de 2026.** Una sola fuente de verdad para pendientes y decisiones. Historial de versiones, pruebas y cambios anteriores en Git. La [auditoría del 23/11](./AUDITORIA-DEPURACION-2026-11-23.md) documenta hallazgos y límites; [CONTINUIDAD-EXACTA.md](./CONTINUIDAD-EXACTA.md) describe arquitectura y despliegues.

## 1. Estado comprobado

- **Repositorio:** `Abnernoa97/havana-nice-v2`, solo rama `main`, cero PR abiertos. Android nativo, PWA iPhone/Admin, paquete compartido y backend separados por dominio.
- **Android publicado:** APK firmada **0.0.30** (`versionCode 30`), [run #45090812813](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/45090812813). No incorpora los cambios de código nativo hechos después de la firma.
- **PWA:** `https://havana-nice-v2.pages.dev`, Pages publica automáticamente desde `main`. Primer bloque de galería `1297588` validado: controles estructurales, TypeScript Android/PWA y **129/129 pruebas** correctas.
- **Worker en vivo:** `havana-nice-v2-dev`, versión `ea9e96b2-b36c-4e45-988f-11f9d8d99ead` al 100 %, **10 bindings** (D1, R2, ChatRoom, CalendarRoom, configuración y secretos Admin/FCM/VAPID); no se actualiza por publicar Pages.
- **Notificaciones:** FCM Android 0.0.30 probado en segundo plano según [PUSH-CENTER-V2.md](./PUSH-CENTER-V2.md). Web Push en iPhone requiere verificación física con PWA instalada y permisos.
- **BOOK 3D:** lector híbrido aprobado conservado, mismo motor y sesión compartida. No introducir otro motor ni modificar BOOK como efecto secundario de la limpieza.

## 2. Arquitectura y propiedad de responsabilidades

| Área | Único responsable |
| --- | --- |
| Sesión, Chat, socket, outbox, ACK y reconexión | `useNativeChatController.ts` / `usePwaChatController.ts` (una sesión por plataforma) |
| Presentación y desplazamiento | `NativeChatSurface/Timeline`, `PwaChatSurface/ChatTimeline`, hooks de viewport |
| Selección global de fotos/videos cargados | `packages/shared/src/chat-gallery-selection.ts` |
| Mosaico consecutivo de Chat | `packages/shared/src/chat-media-cluster.ts` |
| Selección y subida de medios | hooks por plataforma, contrato de lotes compartido y R2 existente |
| HOME, Estados, perfiles, Audio, Calendario, Repertorio, Familia y BOOK | `features/` propios, sin otro Chat ni otro backend |
| APIs privadas | `cloudflare/src/index.ts` + `cloudflare/src/modules/` |
| Persistencia | D1, R2 y Durable Objects existentes; migraciones históricas inmutables |
| Visual general | `apps/pwa/src/styles/`; estilos exclusivos dentro del módulo |

## 3. Logros conservados

- [x] Un `main`, código modular por carpetas, carga PWA diferida y dos workflows distintos: calidad general y APK solo por lote autorizado.
- [x] Chat Android con `FlatList` virtualizada y Chat PWA con ventana de mensajes; la selección actual del visor recorre fotos/videos **ya cargados** aunque haya textos, audios o diferentes autores entre ellos.
- [x] CSS de HOME/Audio/Perfil reorganizado por responsables en revisión del 22/11. Del Chat se quitaron estilos de botones que ya no existen y se consolidó la barra de grabación de voz.
- [x] API privada de Chat, R2, notificaciones, Calendario, Familia y BOOK conservada; ninguna depuración de archivos destruye historial, R2/D1, sesiones o migraciones.
- [x] Pruebas de selección global, multimedia intercalada, borrado y paridad Android/PWA. Administración comparte el visor continuo, se retiraron los dos antiguos y se aisló el CSS del visor. La subida Android ya tiene su hook propio y el mensaje pendiente se construye con la misma política en ambos clientes.

## 4. Tablero único, por orden de riesgo

- [ ] **P1 · QA físico del Chat:** fotos, videos, mosaicos, gesto horizontal, notas de voz, carga fría y caliente en Android/iPhone; medir tiempos reales y memoria, no aproximaciones.
- [ ] **P2 · APK:** solo después de validar todos los cambios nativos y aprobar un lote explícito; firmar sobre la instalación 0.0.30, preservar rollback y datos. No recompilar por cambios de documentación o CSS web.
- [ ] **P3 · Historial remoto de galería:** añadir navegación y solicitud segura de páginas anteriores cuando el visor alcance un extremo. Hoy solo abarca los archivos ya cargados en el cliente.
- [ ] **P4 · Controladores grandes:** Android ya tiene subida multimedia en `useNativeChatMediaUpload.ts`, equivalente a la PWA, sin otro WebSocket. Seguir dividiendo gradualmente Chat con pruebas de socket, reconexión, sesión, outbox, paginación, escritura y notificaciones; prohibido segundo dueño de sesión.
- [ ] **P5 · CSS y lógica histórica:** contrastar selectores con consumidores vivos y breakpoints reales. No confundir media queries o compatibilidades de Admin con código muerto. Refactorizar únicamente con regresiones y QA visual.
- [ ] **P6 · Integración:** verificar Calendario Admin→Android/iPhone, repertorio por evento, Estados cruzados, reacciones, Familia y BOOK/Recuerdos sin borrar datos reales.
- [ ] **P7 · PWA instalada:** probar cambios de versión, rotación, teclado, modo avión, resync y permisos Web Push iOS; evitar caché privado en Service Worker.
- [ ] **P8 · Gobierno del repositorio:** revisar controles de importación, dependencias, código muerto y protección compatible con trabajo directo en `main`. Revisar Worker fuente vs versión desplegada antes de otro despliegue.

## 5. Política de cierre por bloque

1. Auditar primero si el archivo, selector o export es consumido. **No borrar por nombre antiguo, fecha o tamaño.**
2. Mantener una sola `main` y un commit coherente por bloque. Ninguna limpieza debe modificar datos D1/R2, sesiones, accesos ni migraciones aplicadas.
3. Validar `npm ci`, `check:structure`, `audit:guard`, `typecheck`, pruebas del módulo y `build:pwa`; comprobar deployment SHA en Pages.
4. Publicar Worker con bundle y bindings verificados aparte; liberar APK solo con lote autorizado, firma compatible y prueba de actualización encima.
5. Registrar cambios y pendientes aquí; detalles exhaustivos y versiones históricas quedan en Git, no en otro estado contradictorio.

## 6. Criterios de aceptación final

- Todos los módulos se abren con una sola sesión autorizada, sin datos cruzados entre músicos, sin reacciones que recarguen medios ni notificaciones duplicadas.
- Android y PWA preservan los diseños aprobados; Chat multimedia conserva gesto, baja latencia y carga/descarga privada.
- BOOK 3D y Recuerdos conservan motor y gestos actuales; sin pérdidas en D1/R2 ni regresiones de permisos.
- La compilación y las pruebas técnicas pasan **y** se registran pruebas físicas representativas antes de decir «100 % listo».
