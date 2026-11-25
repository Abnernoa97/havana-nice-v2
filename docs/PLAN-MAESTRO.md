# HAVANA NICE V2 — PLAN MAESTRO ÚNICO

**Estado vigente: 24 de noviembre de 2026.** Una sola fuente de verdad para pendientes y decisiones. Historial de versiones, pruebas y cambios anteriores en Git. La [auditoría del 23/11](./AUDITORIA-DEPURACION-2026-11-23.md) documenta hallazgos y límites; [CONTINUIDAD-EXACTA.md](./CONTINUIDAD-EXACTA.md) describe arquitectura y despliegues.

## 1. Estado comprobado

- **Repositorio:** `Abnernoa97/havana-nice-v2`, solo rama `main`, cero PR abiertos. Android nativo, PWA iPhone/Admin, paquete compartido y backend separados por dominio.
- **Android publicado:** APK firmada **0.0.31** (`versionCode 31`), [run #45540109025](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/45540109025), commit `11c8231`. Actualización física instalada por usuario; QA parcial: Estados, galería horizontal y BOOK 3D visibles; nota de voz bloquea Chat, y cuatro defectos visuales pendientes. No dar la versión por estable.
- **PWA:** `https://havana-nice-v2.pages.dev`, Pages publica automáticamente desde `main`. Referencia recuperada previa a P0: `450ff6e`; estado del nuevo candidato pendiente de verificación Pages/QA físico. Histórico del primer bloque de galería `1297588` validado: controles estructurales, TypeScript Android/PWA y **194/194 pruebas** correctas al último despliegue verificado antes de la siguiente fase (la cobertura puede ampliarse).
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

### P0 · Recuperación de rendimiento PWA — prioridad anterior a toda limpieza

**Referencia de producción previa:** `450ff6e`, lunes 23/11 a las 10:56 CDMX (Pages rollback verificado). La fuente en `main` previa a esta intervención era `f021726`, 77 commits posteriores; no son la misma compilación. Se conserva el historial y la publicación de recuperación, sin reset ni force-push.

Evidencia de producción (23/11, 22:40–23:00 CDMX): 9 estados, 897606 bytes en conjunto, 9/9 objetos R2 y tamaños verificados. 60 GET de fotografías en iPhone: HTTP 200; mediana de tiempo de Worker 81 ms, p95 121 ms. 54 listados: mediana 356 ms. Cinco videos MP4 originales del Chat presentes; 0/5 carátulas R2 y cinco 404 observados. Calendario: 14 eventos. Estos tiempos no son tiempos de pintado. La causa de cierres WebKit/RAM requiere diagnóstico de dispositivo.

- [x] P0.0: auditoría de R2, D1, registros Worker, código nativo vs PWA y referencia de rollback.
- [x] P0.1 (candidato de código): usar ruta directa del visor, evitar segunda descarga especulativa de portadas en frío, una sola precarga prioritaria con plazo y cancelación, proteger Blob visible, volver a URL autorizada si falla la copia local, agrupar lecturas de estados, mantener actualización tras mutaciones y limitar espera de imagen. Android y Worker no se editan; AbortSignal opcional en cliente compartido. Nueve pruebas locales del pool exacto verificadas por SHA Git (simulación de navegador, no medición Safari real).
- [ ] P0.2: **Prueba física negativa** del commit `107cdc4`: persiste la lentitud en Wi-Fi y datos móviles. 30/30 GET de foto HTTP 200 (mediana Worker 116 ms, máximo 175 ms) en el intervalo 23:20–23:26 CDMX, sin medición de pintado. Añadir diagnóstico local en el encabezado del visor (D1), con duración del recurso, carga real, dimensiones, aviso, retraso del hilo y prueba reversible sin reproductor. No enviar telemetría privada. Pendiente resultado físico.
- [ ] P0.2a: captura física iPhone D1: foto local lista en 5 ms, 720×1279, cero solicitudes de foto, retardo de hilo observado 6 ms. Intermitencia también en PWA Android. Datos móviles no disponibles (Wi-Fi no descartado). Candidato: precarga secuencial acotada de estados activos con prioridad al primero y portada por músico, adopción de caché lista solo mientras espera la imagen remota, no sustituir la imagen mostrada. D2 mide desde selección de estado sin reiniciar al cambiar de fuente. Validar arranque frío/caliente y casos lentos antes de declarar resuelto.
- [ ] P0.2 (continuación): compilación Pages y QA físico iPhone: frío/caliente, cinco estados, reacciones, reapertura, pérdida de conexión, cambios de usuario y caducidad. Objetivos: foto preparada <100 ms, foto nueva <1 s en red estable.
- [ ] P0.3: Chat: carátulas persistentes para los cinco MP4 existentes y nuevos; miniaturas privadas ligeras, originales conservados, video por rangos y arranque objetivo 1–2 s.
- [ ] P0.4: Familia: miniaturas reales separadas de originales; precarga limitada al contenido visible. Preservar BOOK 3D.
- [ ] P0.5: inicio y Calendario/Repertorio: eliminar consultas redundantes, priorizar contenido visible, evitar competencia de Audio, medir recargas y memoria, preservar push/sesión. Objetivo Calendario caliente <200 ms.
- [ ] P0.6: pruebas integrales físicas, comparación de latencias y estabilidad, privacidad y revocación; limpieza únicamente después de aprobación. No contratar servicios ni publicar APK o Worker como efecto secundario de Pages.


- [ ] **P1 · QA físico del Chat:** fotos, videos, mosaicos, gesto horizontal, notas de voz, carga fría y caliente en Android/iPhone; medir tiempos reales y memoria, no aproximaciones.
- [x] **P2 · APK 0.0.31:** firma y publicación verificadas en #45540109025. Correcciones de fixtures de pruebas y aserciones obsoletas de galería/reconexión sin alterar runtime. APK 0.0.30 preservada. QA físico parcial registrado arriba.
- [ ] **P2.1 · Bloque visual Android (lote 0.0.32):** controles de video se ocultan al reproducir y regresan por toque, swipe horizontal intacto; una sola implementación de reproductor de galería y fallback. Estados: pista de 3dp, área táctil independiente, sombra superior degradada, sin rectángulo alto. Bolitas visibles solo Inicio; mantener un único componente autorizado montado y ocultarlo con display:none y accesibilidad desactivada en módulos internos para no perder su caché. Encabezado interno compacto y sin título duplicado. Header Inicio con texturas locales suaves, animación nativa sin bloquear interacciones, reducción de movimiento. PWA, reproductor musical, lector BOOK 3D, Worker y datos sin modificaciones funcionales. Validar TypeScript, pruebas, firma y QA físico antes del siguiente bloque.
- [ ] **P2.2 · Chat:** reparar bloqueo al enviar voz (crítico), leído por discreto en ambos clientes, miniaturas/álbumes minimalistas y recuperación de posters. No mezclar con el lote visual.
- [ ] **P3 · Historial remoto de galería:** añadir navegación y solicitud segura de páginas anteriores cuando el visor alcance un extremo. Hoy solo abarca los archivos ya cargados en el cliente.
- [ ] **P4 · Controladores grandes:** Android mantiene subida multimedia aislada; PWA y Android comparten esquema offline, historial/snapshot, reglas de edición/borrado, elegibilidad de acciones y timeout de confirmación. Se mantienen los controladores principales como únicos dueños de sesión/ACK/socket. Pendiente: QA físico de reconexión, scroll y notificaciones; separar estados por bloques pequeños y probados, nunca crear un segundo dueño de sesión.
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
