# HAVANA NICE V2 — Auditoría de código y primera depuración · 22/11/2026

**Alcance:** repositorio `main`, árbol de GitHub y revisión dirigida de HOME, Audio, orientación iPhone, estilos compartidos, Android y controles de compilación. Esta revisión no sustituye una auditoría línea por línea de todos los módulos ni QA físico.

## Inventario comprobado
- 361 archivos versionados, 75 carpetas y aproximadamente 2.41 MB de contenido Git (datos del árbol `main` después del primer bloque).
- Una sola rama `main`, cero pull requests abiertos y dos workflows separados: CI general y APK mediante lote autorizado.
- **0 archivos idénticos** según hash SHA de Git: esto descarta copias exactas de archivos, **no** funciones o declaraciones CSS parcialmente repetidas.
- 30 migraciones D1 históricas. No son basura: se deben preservar, no compactar ni borrar.
- 17 archivos CSS en la PWA, con las responsabilidades por módulo todavía por revisar.

## Cambios implementados en este lote
1. **Audio:** eliminado del DOM el pliegue nunca visible y pétalos/seda dibujados por CSS que quedaron detrás del diseño aprobado. Se eliminaron las reglas de esos elementos y el surco de vinilo oculto. Total: **21 reglas CSS obsoletas retiradas**. Se conservan las imágenes reales `floral-clean.webp`, `tear.webp`, `corner.webp`, portada privada, controles, animación de vinilo y streaming.
2. **Orientación PWA:** `features/viewport/musician-portrait.ts` contiene exclusivamente la lógica del iPhone instalado y `features/viewport/musician-portrait.css` sus estilos. `app/main.tsx` vuelve a ser la entrada de composición y `styles/mobile-viewport.css` vuelve a compartir únicamente reglas táctiles y de zoom (703 caracteres). El módulo no se importa en entradas Admin, visual o BOOK.
3. **HOME:** eliminado de `MemberHome.tsx` el `hn-home-blank` invisible (antiguo espaciador de 55vh). Eliminadas las reglas de tamaño/padding que ya eran sustituidas por el HOME fijo y scroll independiente; mantiene los perfiles y el degradado.
4. **Consolidación Audio/HOME:** 24 bloques de selectores globales de Audio unificados y 42 propiedades sobrescritas retiradas; `audio-player.css` pasó de 14 193 a 11 128 caracteres. Comprobación estática de mismas propiedades finales en 11 anchuras (320–1440 px), sin sustituir QA visual física. Eliminados los márgenes negativos ya anulados por el scroll de HOME. El marfil pasa a HOME y los ajustes del reproductor quedan en Audio.
5. **Propietarios CSS claros:** `features/profile/profile.css` conserva solo cabecera y perfil; `features/home/home-stage.css` controla únicamente la fila de Estados y scroll del HOME; `features/audio/audio-player.css` es la fuente del Lounge. Se quitaron de Perfil selectores `hn-moment-*` y se unificaron espaciamientos de Estados sin cambiar las dimensiones.
6. **Regresión:** pruebas para Audio, HOME, perfiles y orientación; la verificación final de CI/Pages debe comprobarse por el SHA de `main`.

## Hallazgos pendientes (NO declarar limpieza 100 %)
- **Audio editorial:** los bloques globales repetidos ya están consolidados; queda confirmar en iPhone real que el render y los tiempos percibidos de Audio coinciden con las capturas aprobadas.
- **HOME/perfiles:** estilos redistribuidos por responsable. Sigue pendiente QA física de Estados fijos, degradado, cambio de músico y vista en horizontal.
- **Chat PWA y Android:** los controladores siguen siendo grandes. Una separación adicional requiere cubrir socket, outbox, media, reconexión y scroll para evitar duplicación de dueños de sesión.
- **Audio privado/Worker:** los cambios de creación/limpieza de grants en el código de `main` no son iguales al último Worker desplegado. Preparar validación Wrangler y migraciones antes de plantear actualización del backend.
- **Rendimiento:** build y pruebas no demuestran tiempo real de inicio de Audio, jank ni fluidez en un iPhone concreto; requieren medición de dispositivo.
- **Docs:** sustituir métricas y estado histórico que contradigan la versión vigente (APK 0.0.23, Worker real). Mantener historia en Git, no en instrucciones activas.

## Límites de seguridad de la depuración
**No tocar ni borrar:** datos R2, D1, migraciones, Durable Objects, sesiones, identificadores de acceso, libretas de usuario, APK firmada instalada, motor de BOOK 3D y el historial de Git. No generar rama ni APK. El despliegue Pages se valida por SHA, typecheck y tests antes de declararlo publicado.

**Criterio de cierre futuro:** para cada bloque, contrastar código ejecutado, referencias/importaciones, pruebas automáticas y comportamiento físico; borrar solamente código sin usos reales verificados. La auditoría estructural existente `scripts/check-structure.mjs` se conserva.
