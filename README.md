# HAVANA NICE V2 — REPOSITORIO INDEPENDIENTE

**Fuente única:** `Abnernoa97/havana-nice-v2`, rama `main`. Todo el código V2 está en la raíz de este repositorio: `apps`, `cloudflare`, `packages`, `tests`, `scripts` y `docs`. El proyecto original y HAVANA CLOUD tienen sus propios repositorios y no forman parte de este árbol.

**APK Android:** únicamente GitHub Releases de este repositorio, etiqueta `v2-android-current`, con `HAVANA-NICE-V2-LATEST.apk`, `HAVANA-NICE-V2-PREVIOUS.apk` y comprobación SHA-256. Publicación siguiente solo por paquete explícitamente aprobado.

**Infraestructura de ejecución:** Worker, D1, Durable Objects y bucket R2 pertenecen exclusivamente a V2. El sitio y CI nuevos ya se validaron con el repositorio nuevo; el antiguo alojamiento de pruebas fue eliminado tras confirmar que solo el propietario lo utilizaba. Los enlaces del repositorio anterior en la bitácora son históricos, no dependencias activas.

## Organización y velocidad interna (07/11/2026)

Administración separa el directorio de músicos en `AdminMemberDirectory.tsx`, con un único controlador autenticado y el mismo comportamiento de borrado, historial y gestión de teléfonos. PWA y Android comparten `packages/shared/src/chat-display.ts`, que evita recorrer repetidamente todo el historial y las reacciones por cada burbuja. Se añadieron pruebas de equivalencia: [Administrador](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42402605011) y [Chat en dos plataformas](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42403079725), ambos SUCCESS. Ninguna API, D1/R2, Worker desplegado ni APK fue modificada en esta ronda; falta QA física y continuar con los controladores grandes.

**Android V2 (tercer bloque):** el timeline visual se separó en `apps/android/features/chat/NativeChatTimeline.tsx` y el controlador Expo pasó de aproximadamente 1,040 a 991 líneas. Teclado, scroll, sesión y WebSocket conservan la misma lógica. [CI 42403928584: SUCCESS](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42403928584), incluida exportación Android sin crear una APK nueva.

## Baja de músicos y limpieza R2 — Worker V2 v60

El Administrador ahora puede eliminar músicos con adjuntos privados: la base D1 registra primero todas las claves que deben retirarse de R2 en la misma transacción, elimina dependencias y después limpia R2. El diálogo informa del efecto en Chat, Familia, subidas y Calendario. Si R2 falla, la limpieza pendiente queda registrada, continúa en la cuota y puede reintentarse desde Administración. [Pruebas integrales aprobadas](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42387212879). Esta corrección no ha borrado usuarios reales ni ha cambiado la APK.

## Estado verificado de la separación — 07/11/2026

- **Fuente única:** [Abnernoa97/havana-nice-v2](https://github.com/Abnernoa97/havana-nice-v2), rama `main` (solo una rama), con fuente V2 en la raíz y sin historial de commits del proyecto original.
- **Verificación integral:** [GitHub Actions 42349800263](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42349800263), **SUCCESS**, incluida PWA publicada, Android exportado, pruebas de seguridad, módulos, API privada y permiso CORS del nuevo dominio.
- **Web V2 autónoma:** [havana-nice-v2.pages.dev](https://havana-nice-v2.pages.dev), proyecto Cloudflare Pages `havana-nice-v2` asociado únicamente a `Abnernoa97/havana-nice-v2`/`main`, compilación desde raíz y resultado `apps/pwa/dist`.
- **Backend V2:** Worker existente `havana-nice-v2-dev`, versión **60** desplegada al 100 %, acepta origen nuevo y antiguo durante la transición. Se preservaron los **7 bindings**, D1, R2 privado, ambos Durable Objects y secreto Admin; no se copiaron ni borraron datos.
- **Android:** Releases [v2-android-current](https://github.com/Abnernoa97/havana-nice-v2/releases/tag/v2-android-current), con la APK firmada actual **0.0.13**, la anterior y SHA256SUMS; la actualización nativa futura permanece bajo manifiesto de lote explícitamente aprobado, no por cada commit.
- **Eliminación comprobada:** el repositorio original `havana-nice-pwa` perdió **solo** sus ramas `havana-nice-v2-foundation` y `havana-nice-v2-apk-downloads` ([acción 42349978136](https://github.com/Abnernoa97/havana-nice-pwa/actions/runs/42349978136), SUCCESS). Original `main` permanece en commit `3f2d2379d0ed855a025d8e7162cd5c00cd2a8be9`; HAVANA CLOUD intocable.
- **Alojamiento V2 antiguo retirado:** el proyecto Cloudflare Pages `havana-nice-v2-dev` fue eliminado tras depurar 1,185 despliegues históricos; ya solo existe el Pages independiente `havana-nice-v2.pages.dev`. Únicamente el propietario había instalado la PWA de pruebas anterior y aceptó su retirada; la nueva instalación de iPhone debe abrir el dominio nuevo y autorizar sesión de nuevo.
- **Pendiente de pruebas físicas:** probar en iPhone nueva PWA, autorización de integrante y Admin, notificaciones de Calendario en vivo, Chat y vídeos R2; comprobar Android versión actual y preparar paquete nativo nuevo solo tras aprobación. **Plan funcional de V2 sigue en 12/46, no se cierra QA por migrar GitHub.**

---

## Arquitectura modular vigente · 07/11/2026

La base V2 utiliza la misma separación de responsabilidades que HAVANA CLOUD, pero **no comparte ningún código ni repositorio con CLOUD**. La estructura fue verificada en [GitHub Actions 42355021691](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42355021691).

- `apps/pwa/src/app`: tres entradas React (músicos, Administración, vista visual) y sus pantallas principales.
- `apps/pwa/src/features`: Chat, Calendario, Repertorio, Familia y Administración; `services`: API, tiempo real, multimedia y caché; `styles`: CSS por módulo.
- `apps/android/features`: pantallas nativas por módulo; `services`: comunicación y almacenamiento. `apps/android/App.tsx` permanece como única entrada Expo.
- `cloudflare/src/index.ts`: **único Worker**; `modules`: dominios de Administración, Chat, Calendario, Familia y Repertorio; `shared`: hash SHA-256 canónico.
- `packages/shared/src`: contratos y funciones API compartidas entre PWA y Android. Un solo `main`; cero ramas V2 alternativas.

**Depuración interna de Chat (07/11/2026):** ahora `packages/shared/src/chat-menu.ts` concentra permisos y posicionamiento del menú de mensajes; `packages/shared/src/chat-outbox.ts` mantiene una única política de orden, estados y espera de ACK para PWA y Android. La interfaz de mensajes de la PWA vive en `features/chat/ChatTimeline.tsx` sin otro WebSocket, y el diseño nativo en `features/chat/chat-styles.ts` sin cambiar el ajuste Android 16. La suite integral pasó en [42381952214](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42381952214), [42382368718](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42382368718), [42382786988](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42382786988) y [42382918524](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42382918524). No se generó APK ni se cambió el Worker remoto. El control de sesión y reconexión permanece uno por plataforma; su división en componentes internos sigue pendiente.

**Chat — limpieza profunda posterior (07/11):** se consolidaron tres reglas más en `packages/shared/src/`: `chat-connection.ts` (caducidad/reintentos), `chat-events.ts` (confirmaciones de lectura y reacciones borradas) y `chat-offline.ts` (sesión/borrador/cola/edición guardada). Cada uno cuenta con pruebas de CI aprobadas ([sesión](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42384099588), [eventos](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42384369213), [offline](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42384747376)). **No hubo migración de almacenamiento**: claves originales de IndexedDB y SQLite intactas, IDs de mensaje preservados, sin nueva APK ni despliegue Worker. Sigue pendiente subdividir el controlador de WebSocket de PWA/Android sin duplicar sesiones.

Se reubicaron **52 archivos** con eliminación de sus rutas antiguas (4 CSS, 5 servicios PWA, 12 pantallas PWA, 6 pantallas/entradas React, 10 módulos Android y 15 módulos Worker). `scripts/check-structure.mjs` impide archivos huérfanos por grafo de imports estáticos, referencias locales inexistentes o nuevos módulos sueltos en la raíz. El CI confirma compilación PWA, exportación Android y pruebas de Worker; no sustituye la QA física. No se publicó una APK nueva ni se redeplegó el Worker por esta reorganización.

# HAVANA NICE V2 — ÚNICA LÍNEA DE DESARROLLO

**Fuente de verdad:** [Plan Maestro](docs/PLAN-MAESTRO.md) y [Continuidad Exacta](docs/CONTINUIDAD-EXACTA.md). No reintroducir decisiones, pruebas ni pantallas descartadas. Auditoría cruzada: 29 de octubre de 2026. **La lista de prioridades y los 46 hitos (27 originales + 9 modulares + 6 de Familia HAVANA NICE + 4 de BOOK HAVANA NICE) viven únicamente en el Plan Maestro**.

**Estado operativo Chat R2 (01/11/2026):** Worker **v56** al 100 %, siete bindings y clases `ChatRoom`/`CalendarRoom` intactas. La migración `0025_chat_media_r2.sql` se aplicó sin modificar los **47 mensajes** ni los **23 originales** de Familia; 0 violaciones de integridad. Solo hay **un bucket R2 privado**, compartido con Chat y Familia y con **presupuesto global de 9.5 GB**. Chat PWA ahora envía originales hasta cinco por selección mediante ruta directa y videos grandes en fragmentos de 5 MiB/3 simultáneos, reanudables, con progreso y lectura de video HTTP Range. **El envío Android nativo espera el próximo paquete APK**; la prueba real en PWA/iPhone está pendiente. [CI 41389821939](https://github.com/Abnernoa97/havana-nice-pwa/actions/runs/41389821939) SUCCESS. No declarar velocidad medida sin prueba física. 

**Paridad de código Android preparada (01/11/2026):** el siguiente lote nativo incorpora el mismo `CalendarRoom` en tiempo real que PWA (**sin el sondeo antiguo de 30 s**), Repertorio del músico por eventos, Familia HAVANA NICE con fotos/videos privados y subvista BOOK, Chat con envío de originales al R2 existente (**5 MiB × 3 partes simultáneas**, reintento y progreso), y HOME móvil de una columna con barra de cinco accesos. [Prueba de CI aprobada 41392761808](https://github.com/Abnernoa97/havana-nice-pwa/actions/runs/41392761808); QA físico/píxel pendiente. **No es todavía una APK instalable nueva: la publicada sigue siendo 0.0.13**, y no se ha creado el manifiesto de release. La entrega se hace en un solo paquete firmado tras aprobación expresa y controles de compatibilidad, sin perder sesión ni caché.

## Arquitectura que debe mantenerse

- Una sola rama fuente: `main` en `Abnernoa97/havana-nice-v2`. Nunca usar el repositorio ni la rama de la app original para el desarrollo V2.
- Un solo backend V2: Worker `havana-nice-v2-dev`, base D1 `havana-nice-v2-dev` y Durable Object `CHAT_ROOMS`.
- Acceso Administrador: secreto remoto privado `V2_ADMIN_LOGIN_SECRET` en Cloudflare, **mínimo 8 caracteres** para la contraseña humana (12+ recomendable), comparación segura y rate limit de 5 intentos/15 min. El Worker V2 **v48** restauró el acceso con las contraseñas cambiadas desde el panel Cloudflare, sin exponer su valor. Los tokens de sesión siguen siendo aleatorios e independientes.
- Chat Android 100 % React Native, sin WebView, conservando firma del paquete `com.havananice.v2`, sesiones SQLite, historial y borradores; la actualización se instala sobre la aplicación existente. No reinstalar.
- Chat iPhone PWA, sincronizado con el Chat nativo mediante contratos, mensajes, sesión y WebSocket del mismo Worker/D1.
- Administrador real e independiente en `/admin.html`: «Acceso a músicos», «Chat general» y panel funcional de **Calendario** (crear/editar/eliminar/seleccionar destinatarios). El Chat Admin modera los mensajes sin iniciar sesión como músico ni escribir; comparte D1 y WebSocket. Repertorio, Músicos, Avisos y Ajustes están pendientes.
- `/visual.html` es únicamente una **maqueta sin datos privados ni permisos de Chat o Administrador** destinada a futuros módulos no-Chat de Android WebView/PWA (H02–H04). No es una segunda puerta de ingreso.
- R2 privado de V2 **activado el 01/11/2026**: bucket único `havana-nice-v2-media`, binding `MEDIA_BUCKET` activo en el Worker; su dominio público está deshabilitado. Las tablas independientes de Familia ya están creadas en D1 y las rutas de carga/lectura y las miniaturas reales de video **ya se publicaron en Worker V2 versión 53**. CI contra el Worker publicado aprobó Chat, Admin, Calendario, Repertorio y permisos de Familia; **la carga rápida, los visores y las portadas reales están confirmados físicamente en músico y Administración: Noa 8 fotos/13 videos; 13 miniaturas en D1**. Chat multimedia **ya reutiliza este R2 privado en el mismo Worker v56**, con sus tablas separadas, carga PWA rápida, privacidad y visor existente; envío nativo Android sigue pendiente del paquete acumulado.

## Familia HAVANA NICE — álbumes por integrante inspirados en One UI

La sección independiente de HOME se llama **Familia HAVANA NICE**. Cada integrante tendrá su propio álbum, con **portada fotográfica grande, degradado negro suave en la parte inferior, nombre y contador superpuestos**, y debajo una cuadrícula móvil de cuatro columnas con imágenes y videos. Referencia aprobada del propietario: capturas de Samsung Galería «Zirandaro» y «Vacaciones» (1 de noviembre de 2026). El diseño se inspira en esa experiencia sin copiar recursos propietarios.

**Ya existe la galería visual y un visor de cuatro columnas en PWA/Admin, con subida privada por el Worker R2 publicada y tablas D1 creadas.** Existen archivos reales de fotos y videos en teléfonos, con carga por partes y vistas a pantalla completa; el contador privado de Familia 9.5 GB está cotejado con D1; faltan QA de todos los formatos MOV, casos extremos de archivos y paginación; BOOK 3D todavía no funciona. Los hitos M06–M15 siguen abiertos. El acceso será el mismo de HOME, con autorizaciones administradas y aislamiento respecto del Chat y la sección Músicos. El desarrollo se acumulará en PWA/Administrador y la integración Android se hará únicamente en un paquete aprobado. La infraestructura de adjuntos del Chat (M01–M05) no debe confundirse con los álbumes personales.

### BOOK HAVANA NICE — revista 3D dentro de Multimedia (planificada)

Dentro de Multimedia, separado de los álbumes de integrantes, habrá un acceso destacado llamado exactamente **BOOK HAVANA NICE**. Contendrá fotografías editoriales muy producidas, presentadas como libro/revista real. Se exige el mismo **Page Flip 3D + Page Curl** de HAVANA NICE Quotes Studio: arrastrar la esquina inferior derecha para doblar y pasar una hoja con curvatura, sombra y reverso físico; swipe, flechas, contador, retrato/apaisado y alternativa **Revista 3D / Scroll**. **No reemplazar por carrusel ni giro 2D.**

**Referencia original verificada sin modificaciones:** repositorio `Abnernoa97/havana-nice-quotes`, `src/FlipMagazine.tsx` y `src/flip-magazine.css`, dependencia `page-flip@2.0.7` (StPageFlip, `PageFlip`/`loadFromHTML`), con instancia persistente entre vueltas de página. No importar los clientes, textos ni imágenes de Quotes Studio; el BOOK tendrá sus propias ediciones y contenido administrable desde V2. **M12–M15 siguen abiertos**: botón/entrada, motor real, publicación editorial desde Admin y QA. No hay dependencia ni pantallas nuevas en V2 todavía, ni APK nueva por este acuerdo.

### Familia HAVANA NICE — nombre definitivo de la sección de álbumes

El propietario cambió el nombre provisional **Multimedia** por **Familia HAVANA NICE**, tanto para Administración como para la HOME del músico. La sección mantiene álbumes separados por integrante autorizado y el acceso interno **BOOK HAVANA NICE**; **Músicos** sigue siendo un módulo distinto. El primer desarrollo de PWA/Admin usa `MemberFamily.tsx`, `AdminFamily.tsx` y el directorio de miembros activos del mismo Worker, token de acceso y D1, sin otra cuenta. El bucket R2 privado ya existe y está conectado al Worker. Los metadatos de Familia están creados en D1 y el Worker con la API privada está publicado, con pruebas automatizadas y privacidad HTTP favorables; **la subida de fotos y videos ya fue verificada con contenido real; faltan las pruebas físicas de las portadas generadas**. **No interpretar la interfaz inicial sin fotos como galería terminada.**

## Publicación por paquetes — no APK automática

Desarrollar primero cada sección en la **PWA V2 y su Administrador**, integrando Worker/D1 y pasando las pruebas, y acumular las mejoras en el mismo proyecto V2. **No generar o publicar APK Android por cambios rutinarios**, aunque se cambien componentes o `app.json`. Android V2 se actualiza solo como **lote aprobado explícitamente por el propietario**. El release workflow escucha únicamente el manifiesto `v2/releases/android-batch.json` creado/actualizado con aprobación, versión y notas coincidentes (o inicio manual sujeto al mismo requisito). **No crear el manifiesto hasta recibir instrucción de lanzamiento.**

El CI normal sigue verificando compilación/export de JavaScript Android, pero **sin producir un instalador firmado**. La última APK publicada es 0.0.13, y la rama de binarios `havana-nice-v2-apk-downloads` conserva `LATEST` y `PREVIOUS`. Para evitar expectativas falsas, los cambios de PWA en línea no se incorporan por sí solos a la APK React Native actual; el paquete posterior los integrará y comprobará la navegación HOME→módulos y el Chat nativo.

## Regla obligatoria — módulos independientes, HOME única

Cada módulo (Chat, Calendario, Repertorio, Músicos, Avisos, Ajustes) contiene su lógica, vista y estado propios, su contrato/API y pruebas cuando corresponda. **Solo HOME conecta la navegación**; los módulos no deben importar motores de otras secciones ni revocar la sesión por errores locales. El Administrador gestiona cada módulo desde su sección de control. **Una sola entrada de músico, un solo vínculo de dispositivo y un único Worker/D1.** No confundir «sección independiente» con segunda autenticación o segundo backend. A01–A09 recogen los criterios pendientes en el Plan Maestro; `tests/module-boundaries.test.mjs` añade controles automáticos en GitHub Actions.

## Acceso a músicos actual — sin mecanismos paralelos

1. El Administrador autenticado crea el nombre en `POST /api/chat/admin/members` (no existe autoservicio de registro).
2. La entrada nueva de músico se realiza **solo** con `POST /api/chat/session`, nombre exacto normalizado y registro activo en D1. No contraseñas por músico, solicitudes de teléfonos, aprobaciones individuales ni otros formularios.
3. `GET /api/chat/session` revalida el token persistente del mismo cliente. `DELETE /api/chat/session` no puede soltar la vinculación del único dispositivo nuevo; solo el Administrador puede liberar la instalación.
4. Los músicos tienen un único vínculo en `chat_single_device_owners`: el primer cliente queda vinculado y un segundo recibe `409 name_already_bound`, con alerta para Administrador. La columna antigua `single_device_mode` ya fue eliminada.
5. **Estado comprobado 29/10/2026:** 3 músicos, 3 sesiones, 3 vínculos, 47 mensajes y 2 alertas duplicadas en D1 al terminar el QA de Chat. Los siguientes músicos solo los incorpora el Administrador. Estos recuentos son una lectura puntual, no constantes de código.
6. El login del Administrador, con un secreto servidor independiente y sesiones separadas, es intencionado y no constituye una segunda entrada de músicos.

**S02 y QA funcional de Chat aceptados:** bloqueo duplicado desde PWA, alerta Admin, envío Android→Admin y cola offline/reconexión probados físicamente. **Estado oficial: 12/46 hitos; galería Multimedia M06–M11 y BOOK HAVANA NICE M12–M15 pendientes.** Q01 integral permanece abierto para funciones futuras.

## Limpieza y archivos históricos

- El código de aprobación antigua de teléfonos, peticiones individuales y contraseñas de laboratorio **no forma parte de la aplicación V2 actual**. El guard de CI prohíbe revivir sus rutas.
- Las migraciones SQL y tablas del sistema se conservan. La migración histórica `0007` ya no contiene altas automáticas de los seis músicos: una base V2 nueva comienza con cero nombres hasta que el Administrador los agregue.
- **Rama V2 limpia:** se retiraron de `havana-nice-v2-foundation` 55 copias idénticas de los archivos históricos de la raíz (19 704 817 bytes), tras comprobar cada hash contra `main`. Se conservan intactas en `main` y en el historial Git. Esto reduce archivos en el checkout de V2, pero no elimina objetos históricos del repositorio. Cloudflare Pages de V2 compila únicamente `v2`.
- No crear otra rama, otro backend, login paralelo, APK de prueba innecesaria ni cambios destructivos de datos.

**Estado actual:** saneamiento 10/10. Android **0.0.13** es la última APK firmada/publicada por [41101348020](https://github.com/Abnernoa97/havana-nice-pwa/actions/runs/41101348020); Android 0.0.11 con HOME y Chat fue aprobado físicamente, pero **la instalación de 0.0.13 en el teléfono no está confirmada**. Nuevas mejoras se acumularán en PWA/Administrador hasta el siguiente lote expresamente aprobado. Calendario V2 dispone de panel Administrador, vista acordeón, API privada y tablas D1, pendiente de QA real Admin ↔ músico. R2 privado y la API Familia están publicados y probados con videos reales. Worker v51 mantiene portadas ligeras y controla el cupo global de 9.5 GB WebP/JPEG asociadas al mismo video; faltan generar y comprobar las portadas de los archivos existentes en Administración. El Chat multimedia continúa deshabilitado y separado. Continuar P02/A03/A09 según el [Plan Maestro](docs/PLAN-MAESTRO.md), sin modificar la aplicación original ni crear infraestructura paralela.


### Presupuesto de almacenamiento R2 privado (V2)

- **Sin compresión automática:** fotos y videos conservan su archivo original; los grandes siguen usando el multipart R2 ya aprobado, sin el antiguo límite fijo de **80 MiB**. Cinco archivos máximo por selección.
- **Un único control global:** aviso visible en Administración desde **9.00 GB**, y bloqueo preventivo de nuevas cargas al alcanzar **9.50 GB** (GB decimales). El cálculo incluye videos, fotos, posters privados y reservas de transferencias aún abiertas. Administración muestra uso y espacio libre, también cuando se navega entre álbumes.
- **Worker V2 versión 53**, un solo bucket privado `havana-nice-v2-media`, migración `0024_family_storage_budget.sql` conservadora; último conteo D1 verificado: 23 originales, 13 portadas de video y 0 transferencias pendientes. Cloudflare R2 aborta automáticamente multipart abandonados tras 24 horas. El Chat original, HOME y HAVANA CLOUD siguen intocables.
- **Costo:** los 10 GB gratuitos son en **GB-mes**, con cuotas independientes de operaciones Clase A y B. El bloqueo interno evita pasarnos voluntariamente de 9.5 GB de datos registrados, pero **no garantiza por sí solo una factura de $0**. Revisar Uso/Facturación de Cloudflare si se busca control financiero absoluto.
