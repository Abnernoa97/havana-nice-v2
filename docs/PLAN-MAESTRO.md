# HAVANA NICE V2 — PLAN MAESTRO ÚNICO

**Estado de desarrollo: 21 de noviembre de 2026.** Fuente de verdad: repositorio [Abnernoa97/havana-nice-v2](https://github.com/Abnernoa97/havana-nice-v2), rama `main`. Este documento describe lo **vigente**; las versiones anteriores están en el historial de Git, sin copiar expedientes obsoletos dentro del árbol actual. Actualizar este archivo en el mismo commit de cada bloque concluido.

## HOME/Audio iPhone · 22/11/2026

- [x] **HOME PWA:** Estados fijos bajo cabecera, Audio con scroll independiente y degradado blanco→marfil. Compilación y 74/74 pruebas aprobadas en Pages (`5fc9832`).
- [x] **Audio PWA:** reproducción iniciada desde el toque (Safari), indicador real de buffering, sin falso error rojo; portadas preparadas sin competir con streaming.
- [x] **iPhone:** bloqueo reversible del scroll del documento solo en HOME; elimina rebote de la franja blanca sin tocar Estados, Chat o BOOK.
- [x] **Android:** Estados fijos y degradado en código; nueva APK NO autorizada. Pendiente QA físico iPhone/Android y confirmar publicación del último bloque.

## Lote acumulativo en `main` · 21/11 · SIN nueva APK

- **APK 0.0.23**: compilación, firma y publicación CI aprobadas (#16, run 44878578050). El usuario ya mostró capturas de ejecución física; eso confirma instalación, no QA completa. **NO** crear 0.0.24 ni tocar el manifiesto `releases/android-batch.json` hasta nuevo pedido expreso.
- **Android · Inicio**: encabezado más abajo y marca proporcionada respecto a la barra de estado. **Estados**: 48 px de separación inferior para los botones del SO; segmentos de progreso pulsables y flechas de foto anterior/siguiente, conservando misma galería de cinco fotos, 6 segundos, API y R2.
- **Android · Chat**: reacción visible en cada burbuja y toque sobre emojis existentes; ambos reutilizan la única función nativa `react(seq,emoji)`, la conexión Chat vigente y la lluvia visual. Validación física pendiente.
- **Calendario/Recuerdos Android**: al expandir fecha pasada, mostrar de inmediato el **mismo BOOK híbrido 3D PWA**, dentro de la ficha, sin pulsar «Abrir recuerdo». `NativeBook` añade modo inline pero preserva URL canónica, sesión in-memory, PageFlip y modal de BOOK principal. Revisar scroll/gestos en vivo y altura real en teléfonos.
- **Notificaciones, fase inicial en código**: módulo privado `notices` para Android y PWA y contrato compartido; D1 añade solo `0034_member_notifications.sql`, sin borrar tablas. `story-conversation.js` prepara avisos dirigidos exclusivamente al autor del Estado por ❤️/👏/😂, comentarios y audio; deduplicación de reacciones, propia actividad excluida, lectura por destinatario, un solo WS existente de Familia cuando la sección Notificaciones está abierta.
- **NO activar backend de notificaciones sin** aplicar de forma controlada migración 0034, probar lectura/aislamiento/rollback y desplegar Worker desde el **bundle canónico Wrangler construido de main**. Las interfaces están preparadas, pero los avisos NO deben considerarse activos en producción todavía. No añadir sockets Chat alternativos, no almacenar tokens/notificaciones en localStorage y no realizar cambios a R2.
- **Pendientes de extensión**: avisos Chat/Calendario/Familia/Repertorio usando el emisor compartido, indicador de sin leer en menú, acceso al elemento relevante y notificaciones push OS Android/PWA iPhone (permisos/consentimiento por dispositivo). Estas últimas no están implementadas. Ningún cambio Android de este lote está dentro de una APK publicada.

## Administrador con interfaz del músico · 21/11

- [x] Administración reutiliza la interfaz y navegación móvil del músico, incluido Equipo; conserva sesión Admin propia en memoria.
- [x] Chat Admin utiliza la conversación real D1, sin suplantar músicos. Repertorio, Calendario, Familia y BOOK comparten vistas reales y controles autorizados.
- [x] Cambios exclusivamente de interfaz de la **PWA Administración V2**, sin migrar datos ni tocar Supabase original, firma APK, D1, R2 o ChatRoom. Prueba permanente `tests/admin-editorial-parity.test.mjs` agregada al postbuild de Pages. **Pendiente** revisión visual física en Android/iPhone y verificación de compilación de Pages tras el último commit.

## 1. Contrato irrenunciable

- **Una sola rama `main`**, un solo repositorio V2. Sin parches temporales, duplicar rutas o dejar motores alternativos. Borrar lógica verdaderamente sustituida solo después de verificar referencias y equivalencia funcional.
- **No tocar HAVANA CLOUD, PWA original, Drive original, cuentas ni producción ajena a V2.** No migrar datos del sistema anterior. V2 es autónoma.
- **iPhone:** PWA instalable. **Android:** app React Native/Expo con Chat nativo; instalar futura APK acumulativa encima de la anterior. No generar APK por cada mejora. Android APK publicada **0.0.23** (`versionCode 23`), firmada e instalable encima de 0.0.21 según CI; BOOK 3D confirmado por el usuario. QA integral pendiente.
- **Identidad:** Admin autoriza nombres; el músico ingresa una vez y su instalación queda vinculada a una sola sesión/propietario. Rechazar desconocidos y revocados. Hasta 10 músicos, lista inicial Orly, Andy, Jali, Rafa, Noa y Fer. El Admin tiene sesión y permisos propios; un solo dueño de sesión para todos los módulos, sin nuevos accesos secundarios.
- **Módulos independientes:** Chat, Calendario, Repertorio, Familia, BOOK, Músicos y futura Multimedia. HOME como navegación central; datos, estados y componentes separados; compartir contratos, servicios y sesión, no duplicar implementación.
- **Primero funcionamiento, sincronización, velocidad y depuración.** Después pintura/estética. Preservar lo visual que el usuario ya confirmó de BOOK/Calendario.
- **Planes gratuitos siempre que sea viable.** R2 privado compartido con alarma lógica a **9.0 GB** y rechazo de nuevas reservas a **9.5 GB**. No confundir esta protección con una garantía de facturación externa.
- Mantener fotos/videos **originales**; las versiones **WebP derivadas** son exclusivas del visor BOOK/calendario, no sustituyen originales ni comprimen Chat/Familia.
- Publicación PWA en bloques verificados, pruebas automáticas antes de cerrar cada avance; Worker solo desde bundle Wrangler generado por `main` y comparación de SHA/bindings. Nunca subir JS compilado editado a mano.

## 2. Arquitectura implementada

```text
apps/
  pwa/
    index.html          → sesión músico y Chat web
    visual.html         → HOME / módulos visuales
    admin.html          → sesión y módulos Administración
    book.html           → visor 3D de PWA embebido directamente en Android (misma sesión nativa)
    src/app/            → puntos de entrada y controladores
    src/features/       → chat/, calendar/, repertoire/, family/, book/, admin/
    src/services/       → transporte y acceso a APIs
    src/styles/         → CSS modular
    public/sw.js        → caché de recursos públicos, nunca APIs ni medios privados
  android/
    App.tsx             → entrada Expo; app/NativeApp.tsx mantiene sesión, Chat y conexiones
    features/           → chat/, calendar/, repertoire/, family/, musicians/, book/
    services/           → almacenamiento, realtime y subida nativos
packages/shared/src/   → APIs, modelos y políticas comunes
cloudflare/src/index.ts → ÚNICA entrada Worker, CORS/ruteo/identidad
cloudflare/src/modules/ → Admin, ChatRoom, Calendario, Repertorio, Familia, BOOK
cloudflare/src/shared/ → criptografía, tipos y respuestas comunes
cloudflare/migrations/ → historial aditivo D1; NUNCA reescribir migraciones usadas
tests/ + cloudflare/tests/ + scripts/ → reglas de seguridad y CI
```

**HOME social (21/11):** PWA: fotos JPG 720×1280 objetivo ~450KB, 24h, URLs 8min, barra 6s, voz/comentarios y ❤️/👏/😂. Android: React Native nativo separado, mismo backend D1/R2, JPEG 720px, Animated 6s, voz AAC/M4A mediante expo-audio, misma conversación, sin WebView ni otro Chat. Lote APK 0.0.23 autorizado; publicable solo si supera firma incremental de 0.0.21 y pruebas. BOOK 3D intacto. Safari sin zoom por doble toque y campos 16px, pellizco depende del SO.

**Separación de carga PWA:** `React.lazy`/`Suspense` en HOME, Calendario, Repertorio, Familia, BOOK y pestañas Admin. La PWA tiene cuatro entradas HTML históricas, pero **no URLs HTML diferentes por módulo**; cada componente pesado se descarga bajo demanda. Comprobación con manifiesto real de Vite. Usuario aprobó navegación de iPhone el 08/11; pruebas físicas adicionales sin red siguen pendientes.

**Worker y comunicación:** mismo `havana-nice-v2-dev`, D1 único, R2 privado único `MEDIA_BUCKET` y dos Durable Objects: `CHAT_ROOMS` → `ChatRoom`; `CALENDAR_ROOMS` → `CalendarRoom`. Siete bindings efectivos (incluido secreto Admin). No hay puente a Google Drive/Supabase ni Worker segundo.

### Calendario

- Admin crea, edita y elimina fechas y destinatarios; músicos ven solo las suyas. Campos totalmente libres, no forzar date picker. Lecturas HTTP autoritativas con WebSocket de invalidación y reconexión iPhone; respaldo de recuperación a 60 s, **no polling antiguo cada 30 s**.
- Pasado el día en la **zona horaria del evento**, solo fechas confirmadas y válidas muestran cuño «EVENTO REALIZADO». Al desplegar, ficha breve tipo pergamino y álbum de recuerdos con el mismo BOOK 3D. Futuras y canceladas mantienen ficha normal.
- Admin añade, borra y ordena fotos de cada fecha; originales privados + derivado WebP opcional; permisos revalidados por destinatario al usar cada grant. Mismo R2, cuota compartida y cola de borrado duradera.
- **Depuración:** galería Admin se monta sólo al expandir `expanded===item.id`; no se vuelve a pedir el roster cuando llega una invalidación. Las lecturas Admin ahora abortan respuestas antiguas y distinguen 401 para expirar sesión; Android descarta recuerdos sin permiso tras recargar y reinicia conexiones WSS bloqueadas. Las pruebas físicas permanecen pendientes.
- **Datos al control:** cuatro fechas y cuatro fotos de recuerdos, tres copias WebP. No borrar ni reescribir.

### Chat

- Un único Chat General: mensajes/reacciones, reply, edición/borrado con las mismas reglas compartidas en PWA y Android. El Admin puede moderar y borrar definitivamente. Presencia y typing, reconexión, snapshots offline y cola de reenvío con **identificador original** para no duplicar al recuperar red.
- Adjuntos hasta **cinco fotos/videos combinados por selección**, calidad original, R2 privado, multiparte en subidas grandes y visor adecuado a cada plataforma. Nada de audio en los flujos multimedia actualmente aprobados.
- **Refactor del 08/11:** `useNativeMediaSelection.ts` y `usePwaMediaSelection.ts` poseen permisos y selección sin crear otro motor de envío. `packages/shared/src/chat-media-batch.ts` centraliza progreso, secuencia y confirmación de archivos; cada plataforma conserva su transporte, identidad y UI. Controladores App de Android/PWA conservan conexión/reconexión en el mismo propietario.
- **Chat snapshots (P2, bloque 3):** las sincronizaciones completas concurrentes respetan la última solicitud de la misma sesión; respuestas/errores superados no reemplazan historial vigente, reacciones ni estado actual. Sin cambios a API o sockets.
- **Chat reconexión (P2, bloque 2):** ambos controladores cancelan un handshake WebSocket que no abre en 9 s, liberan el temporizador al abrir/cerrar y reutilizan el reintento progresivo existente. Nunca crea segundo socket o dueño. Verificación en dispositivos pendiente.
- **Chat historial / búsquedas (P2, bloque 1):** `chat-history.ts` concentra paginación, unión de reacciones y control de consultas superpuestas. Un solo `ChatHistoryRequestGate` por App invalida respuestas antiguas al cambiar sesión o texto y evita cargas duplicadas. La sesión, socket, D1, R2 y estado siguen en su dueño original; pendiente resto de la separación.
- **Separación de presentación del menú Chat:** controles de reacción/respuesta/editar/borrar ahora en `features/chat/PwaChatMessageMenu.tsx` y `features/chat/NativeChatMessageMenu.tsx`; únicamente props y callbacks, sin credenciales ni sockets paralelos. Verificado con pruebas automáticas; **no** implica que todo el controlador esté ya dividido.
- **Pendiente:** reducir gradualmente la longitud de `apps/android/app/NativeApp.tsx` (~947 líneas) y `apps/pwa/src/app/App.tsx` (~829 líneas) por funciones cohesionadas, con pruebas antes/después. **No mover socket y sesión a nuevos dueños sin prueba de equivalencia y recuperación offline.**

### Familia, BOOK, Repertorio y Multimedia

- **Familia HAVANA NICE:** álbum privado por integrante; subida de fotos/videos originales a R2 muy rápida, miniaturas, visor, grants efímeros y sincronización de avisos dentro de ChatRoom. No modificar este motor rápido que el usuario confirmó.
- **BOOK HAVANA NICE:** mismo StPageFlip 2.0.7 con hojas físicamente curvas, portadas/editorial, scroll vertical compatible con gesto horizontal. `BookReader.tsx` se reutiliza también en recuerdos del Calendario. Admin gestiona fotos privadas, orden, publicación, ajuste y WebP derivado de hasta 2048 px; fuentes originales intactas. **Siete páginas originales y cero derivadas WebP verificadas** en el BOOK general: abrir Admin BOOK para convertir las existentes; no afirmar reducción real antes.
- **Repertorio:** catálogo privado común y asignaciones por evento, editor Admin y lectores PWA/nativo; permisos y datos D1 separados del Chat.
- **Músicos:** directorio autorizado por Admin, baja con limpieza privada; no mantener segundo sistema de autorizaciones. **Multimedia de presentación:** siguiente fase, estética One UI en carpetas propias y BOOK HAVANA NICE editorial; no mezclar con memoria técnica de Familia ni reescribir el BOOK existente.

## 3. Estado de desarrollo y publicación

| Elemento | Estado comprobado |
| --- | --- |
| Git | una `main`; cero PR abiertos en última auditoría |
| GitHub Actions | **2** workflows: `v2-foundation-check.yml` (compilación y QA) y `v2-android-apk.yml` (solo lote explícitamente aprobado) |
| CI de todos los módulos + pruebas contra Worker v66 en vivo | **SUCCESS**, [ejecución 42451952817, segundo intento](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42451952817) |
| Cloudflare Pages | publica `main`; comprobar SHA/deploy tras cada cambio |
| Worker **en vivo** | **Carátulas de Chat, 12/11** `96100737-ce2d-4056-bb1e-bc00bd7067e6` al 100 %. Worker v66 `87e6d28a-f1eb-43ed-974b-eb1884198533` preservado para reversión. Siete bindings equivalentes, sin nueva D1 ni otro R2. |
| Worker **en código** | Refactor publicado a v66 desde el bundle canónico Wrangler `SHA-256 0f67b065b8232a9adb1902711eb8850771ba17b3363dbbcbb8b5c135f714d02d`, idéntico en CI; mantiene los siete bindings y el mismo DO. |
| Android | APK **0.0.21** publicada [aquí](https://github.com/Abnernoa97/havana-nice-v2/releases/download/v2-android-current/HAVANA-NICE-V2-LATEST.apk); firma 0.0.20 compatible, JS integrado, `versionCode` 21 y descarga estable verificados en [CI 42571102335](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42571102335). APK 0.0.20 preservada como PREVIOUS; BOOK 3D confirmado por usuario en Android, Recuerdos en QA pendiente. |
| Colas R2 | BOOK, Calendario y baja de músicos: **0** operaciones pendientes al control |
| Fotos personales | Calendario 4 recuerdos (3 WebP), BOOK 7 originales (0 WebP), Familia 16 archivos al control |

**Pruebas automáticas:** grafos de importación PWA/nativo/Worker y shared, tipos por workspace, tests de sesión, propietario único, moderación, Chat, offline/outbox/ACK, Calendario y recipient grants, libro 3D en Chrome, R2 cuota/borrado/medios, paridad Android/iPhone, CORS, rutas privadas y export nativo sin publicar APK. CI verde significa pruebas cubiertas, **no prueba física exhaustiva**.

## 4. Tablero único, por orden de riesgo

- [x] **A0 Git limpio:** una `main`, cero PR y dos workflows útiles. No tocar sistema original.
- [x] **A1 PWA carga independiente:** componentes grandes on demand, sesión intacta y prueba de navegación de usuario satisfactoria.
- [x] **A2 Calendario:** roster único de Admin, galería sólo desplegada, detección explícita de HTTP 401, cancelación de consultas obsoletas, protección del WebSocket nativo atascado y cierre de recuerdos revocados. Pruebas de regresión añadidas; falta confirmación física iPhone/Android.
- [x] **A3 Chat multimedia:** dos selectores específicos y una política compartida de lote, sin cambiar transportes R2; prueba de fallos/reintento.
- [x] **A4 Código compartido:** añadir a la auditoría el grafo real de `packages/shared/src`, con resolución TypeScript/ESM correcta.
- [x] **A5 Worker reorganizado en código:** ChatRoom extraído a un único módulo, tipos y sesión compartidos, index menor, compila, dry-run y pruebas en CI.
- [x] **A6 Prueba offline de fragmentos PWA:** caché de chunks previamente visitados, fallo explícito de recursos no descargados y sin almacenar APIs privadas. **No equivale a validación iPhone sin conexión**.
- [x] **A7 Datos y borrados R2 auditados:** todas las colas consultadas en 0, límites compartidos vigentes; no ejecutar borrado innecesario.
- [x] **A8 Documentación consolidada:** un plan vigente y continuidad breve; notas obsoletas no deben quedar como segundo estado contradictorio. Git conserva la trazabilidad de cambios antiguos.
- [x] **A8b Estado operativo alineado (09/11):** README, continuidad y Plan Maestro reflejan Worker v66 desplegado y APK 0.0.21 firmada/publicada, **BOOK en Android/PWA confirmado por usuario; Recuerdos y QA entre módulos pendientes**. No se tocó código, sesión, D1, R2 ni producción ajena.
- [x] **C5 Músicos / HOME:** directorio privado funcional con nombres reales de integrantes activos, en PWA y Android; usa la autoridad D1 y eventos privados ya existentes de Familia, sin duplicar tabla, sesiones ni Worker. Perfiles ampliados aún pendientes.
- [x] **C4 Repertorio:** panel Admin descarta resultados de consultas antiguas y detecta expiraciones HTTP 401 originadas por Calendario. Sin cambiar tablas ni listas de canciones.
- [x] **C3 Familia / Multimedia:** recuperación de WebSocket atascado al cambiar de red en iPhone y Android mediante timeout compartido; pruebas de paridad añadidas. Sin cambiar subida R2.
- [x] **C2 Músicos / Admin:** lecturas de lista protegidas contra respuestas HTTP atrasadas: baja, alta, liberación de instalación y salida anulan fetches previos. Sin borrar músicos ni cambiar backend. Pruebas de regresión añadidas.
- [x] **C1 Chat borrado definitivo:** marcadores compartidos evitan resucitar mensajes por respuestas HTTP, búsquedas o WebSocket atrasados en Android y PWA; orden de conciliación de historial nativo corregido. Pruebas de paridad incluidas; verificación física pendiente.
- [x] **S1 Repertorio sincronizado en código:** cambios de asignación/calendario también invalidan listas de evento, evitando fechas y repertorios discordantes;  lectura D1 inmediata antes de conectar WebSocket;  cambios del Admin avisan a PWA, Android y Admin por el CalendarRoom privado ya existente, recuperan de D1 y eliminan polling de 30 s; **Worker v66 publicado y smoke tests CI de rutas privadas/DO superados; QA física entre Admin, PWA y Android pendiente**.
- [x] **S2 Administración:** WebSocket privado con detector de conexión atascada (9 s), reconexión única, recuperación y limpieza de temporizador en segundo plano/cierre, sin borrar sesiones ni duplicar socket.
- [x] **P1 Worker release:** v66 `87e6d28a-f1eb-43ed-974b-eb1884198533` al **100 %** desde el bundle SHA-256 exacto aprobado por CI. Se transfirió sin recompilar ni editar la salida; se verificaron siete bindings heredados con modo estricto, compatibilidad, v65 de respaldo y despliegue gradual. Smoke tests CI y recuentos D1 posteriores aprobados; pruebas físicas todavía pendientes.
- [ ] **P2 Chat estructural profundo:** extracción por capas de socket y estado en PWA/nativo **sin duplicar dueño de sesión**; someter cada cambio a CI y pruebas reales de reconexión.
- [ ] **P3 Offline físico:** modo avión, regresar con red y primer arranque de cada módulo en iPhone PWA; validar que el Service Worker no cargue JS antiguo.
- [ ] **P4 Colas persistentes:** si en el futuro quedan objetos pendientes tras fallo R2, diseñar reintento seguro desde rutas Admin sin introducir tareas de pago ni borrar activos. Ahora las colas están vacías.
- [x] **P6a Familia Android — render de galería:** un `FlatList` vertical con tres columnas, miniaturas virtualizadas en lotes y datos memoizados; HOME elimina el `ScrollView` exterior únicamente en Familia para preservar la virtualización. El visor modal usa el video nativo existente, con fuentes R2 privadas y sin otro motor. Pendiente QA en teléfono.
- [ ] **P6 Músicos / Multimedia:** completar y probar funcionalidad y sincronización antes de estética One UI definitiva.
- [ ] **P7 Métricas reales:** medir tiempos de apertura, descargas por módulo, rendimientos Chat/medios y memoria Android; no inventar números de velocidad.

### Android — organización nativa consolidada (08/11)

- [x] **Raíz de Expo mínima:** `apps/android/App.tsx` es solo la entrada, y `app/NativeApp.tsx` conserva el único controlador de sesión, Chat y navegación.
- [x] **HOME y módulos separados:** `app/NativeMemberHome.tsx` + `features/{chat,calendar,repertoire,musicians,family,book}`. No quedaron copias de `features/home`.
- [x] **Integraciones y persistencia aisladas:** `services/` mantiene transportes nativos; `storage/chatPhotoCache.ts` concentra caché privado y limpieza de transferencias incompletas; `storage/chatStorage.ts` conserva exactamente `havana-v2-chat-local-v1` para sesión, borradores y mensajes pendientes; `hooks/useNativeKeyboardVisibility.ts` centraliza los listeners de teclado; `styles/chat-styles.ts` es la única fuente del estilo Chat Android.
- [x] **Auditoría de estructura:** árbol exacto y detección de código huérfano / importaciones rotas en `scripts/check-structure.mjs`. Se actualizaron las pruebas para inspeccionar el controlador real, no la entrada reducida.
- [x] **Chat Android, primera optimización de render:** mensajes con `FlatList` virtualizada (`windowSize=7`, lotes limitados) para no montar todas las fotos/videos del historial; claves estables, paginación manual y posición visible preservadas; no cambiar sesión, D1, R2 ni caché. Requiere QA física de desplazamiento/60 FPS.
- [ ] **Optimización posterior de Chat:** el controlador sigue siendo grande, pero el timeline YA usa `FlatList`; dividir el controlador restante únicamente tras comprobar desplazamiento, gestos, multimedia y memoria en Android real. No confundir organización con FPS medidos.

- [x] **PWA: presentación de acceso aislada (20/11):** `App.tsx` pasó de 843 a 826 líneas; `PwaMemberAccessPanel.tsx` presenta restauración, acceso denegado de BOOK y entrada por nombre. La sesión, WebSocket, reconexión, rutas, la cola offline y la autorización permanecen en `App.tsx`; comprobación de build Pages exitosa en `bdc018c`. Se incorpora una prueba de límites de responsabilidad. QA física de sesión y modo avión sigue pendiente.

- [x] **PWA `App.tsx` reorganizado (20/11):** de 826 líneas a entrada de 9. `usePwaChatController.ts` conserva el único dueño de sesión, WebSocket, histórico, borrado, ACK y offline; `PwaChatSurface.tsx` contiene la presentación completa; `usePwaMemberNavigation.ts` conserva el historial y retroceso del navegador; `usePwaChatMediaUpload.ts` conserva las llamadas de R2 originales y el progreso. El selector `usePwaMediaSelection`, la galería, IndexedDB y los servicios permanecen intactos. Pruebas de fuente migradas al grafo modular; los comandos de Cloudflare Pages bloquean una compilación con fallas de estructura, auditoría, TypeScript o pruebas del acceso/bundle. CI general y QA físico siguen siendo exigibles antes de declarar sincronización integral.

## 4.1. Matriz de aceptación física antes de declarar sincronización 100 %

- [x] **BOOK 3D Android/PWA:** el usuario confirmó que abrió y que el giro hacia atrás y el deslizamiento mejorado funcionan con 0.0.21 y actualizaciones web.
- [ ] **QA restante Android/PWA:** verificar Recuerdos de Calendario y sincronización real de Chat/Familia/Calendario; no confundir BOOK validado con toda la aplicación validada.
- [ ] **Calendario Admin ↔ PWA ↔ Android:** crear/editar fecha real de prueba, cambiar destinatarios y eliminar únicamente esa fecha de prueba; observar notificación instantánea y que un músico desasignado deja de verla.
- [ ] **Repertorio:** editar catálogo y lista por fecha desde Admin; comprobar actualización en ambos clientes y que quitar fecha invalida su lista.
- [ ] **Chat:** texto, respuestas, reacciones, borrado definitivo, cinco fotos/videos combinados y reconexión al perder/recuperar red; corroborar que nada reaparece tras borrado.
- [ ] **Familia/BOOK:** nueva foto y video de prueba desde permisos autorizados, visor y publicación; comprobar propagación y privacidad sin alterar archivos originales.
- [ ] **iPhone PWA offline:** instalar, entrar previamente a módulos, modo avión, recuperación de red, versión actual y primer acceso a fragmentos no cargados.
- [ ] **Android nativo:** envío y reproducción de fotos/videos, reabrir HOME/Chat y cambio de red; registrar resultados reales y corregir cualquier falla observable.

**Puerta de estética:** pueden comenzar los estilos de módulos funcionales sobre la estructura actual; no cerrar el cartel «sincronización 100 % probada entre dispositivos» hasta esta matriz física. Avisos, Ajustes y Multimedia independiente siguen sin estar terminados y no se deben presentar como listos.

## 5. Política de cierre por bloque

1. Inspeccionar dependencias reales antes de borrar o mover. Nunca eliminar información de D1/R2 como parte de limpieza de código.
2. Usar la **misma `main`**; no formar una colección de fixes temporales. Integrar definitivamente una solución, eliminar duplicados confirmados.
3. Validar `npm run check:structure`, `npm run audit:guard`, `npm run typecheck`, pruebas de dominio, build PWA y Worker dry-run, browser Chrome y export nativo según el bloque.
4. Confirmar CI SUCCESS y desplegar exclusivamente los artefactos cuya aprobación corresponda (Pages automática; Worker controlado; APK solo por lote).
5. Registrar **qué cambió, qué sigue abierto, qué no se tocó**. Mostrar los puntos tachados en este único tablero; no crear otra bitácora paralela.

**Continuación:** `docs/CONTINUIDAD-EXACTA.md` contiene referencias prácticas cortas; este Plan Maestro manda. El historial íntegro de pasos y estados anteriores se recupera de los commits de Git, no de copias obsoletas en `main`.

## 6. BOOK y Recuerdos 3D — estado consolidado

- [x] **Motor único:** StPageFlip compartido entre BOOK y Recuerdos; el lector /book recibe la sesión Android por el puente de memoria tras el mensaje boot, sin otro login, token en URL ni segundo motor.
- [x] **Gesto y vuelta de página:** avance y retroceso, esquina física correcta, deslizamiento horizontal fluido y scroll vertical preservados. BOOK Android/PWA confirmado por el usuario con APK firmada **0.0.21**. CI y experimentos anteriores permanecen en el historial Git.
- [ ] **Recuerdos:** verificar en Android/iPhone el libro de una fecha realizada, cierre y retorno al Calendario. No generar una APK por cada corrección ni tocar datos privados.

## 7. Limpieza estructural y línea única (09/11/2026)

- [x] **Git:** sólo `main`, sin PR abiertos. Dos workflows distintos y necesarios: verificación general y APK por lote expresamente aprobado.
- [x] **Sin código fuente huérfano conocido:** `check:structure` recorre importaciones normales y lazy de PWA, Android, Worker y paquete compartido; la CI vigente es verde. Se conserva la historia de migraciones D1: no es basura.
- [x] **Sin instrucciones de versiones obsoletas:** retiradas de este Plan Maestro las notas ejecutables de APK 0.0.14–0.0.16 y el puente `injectedJavaScriptObject` sustituido. La trazabilidad permanece en el historial Git.
- [x] **Nueva protección de una línea:** la CI consulta directamente GitHub y falla si aparecen ramas adicionales a `main` o PR abiertos. Se conserva el mismo workflow, no se crea otro.
- [x] **NativeApp.tsx separado (20/11):** entrada nativa de 917 a 10 líneas. Controlador único `features/chat/useNativeChatController.ts` para sesión/socket/outbox; `NativeChatSurface.tsx` exclusivamente UI; `useNativeChatViewport.ts` para scroll; `hooks/useNativeMemberNavigation.ts` para botón Atrás/gestos. `chatPendingMedia.ts` era código activo, no basura; actualizada la verificación estructural. **Cloudflare Build `b0cb0fab`: 300/300 tests, TypeScript de los tres workspaces y compilación PWA PASS; Worker y APK no modificados en este bloque.** APK 0.0.21 instalada permanece igual, QA Android físico pendiente.
- [x] **HOME PWA desacoplado (20/11):** la vista `features/home/MemberHome.tsx` se carga bajo demanda desde `VisualApp.tsx`, sin WebSocket, sesión propia ni almacenamiento. Se conservan las mismas tarjetas, botón de Inicio, navegación y restricciones de vista previa. Chat sigue siendo el controlador inicial y su conexión se mantiene independiente de HOME.
- [ ] **QA HOME en iPhone PWA:** entrada, retorno desde Chat, cambio rápido de módulos y actualización del Service Worker, con y sin conexión.
- [ ] **Cloudflare index.ts:** ~270 líneas. Ya es el único router de dominio; auditar acoplamientos y extraer únicamente responsabilidades realmente mezcladas, sin fragmentar por estética ni alterar Worker vivo.
- [x] **Residuos de repositorio:** 210 archivos versionados al control, 112 archivos de fuente; ningún par de blobs idénticos duplicados y ningún APK, build, log o respaldo accidental versionado. Las 23 migraciones D1 son historia aplicada y se conservan.
- [ ] **QA física de integración:** Recuerdos/Calendario, Chat, Repertorio y Familia entre Admin/PWA/Android. Aún no afirmar sincronización total.

