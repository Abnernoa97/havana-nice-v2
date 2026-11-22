# HAVANA NICE V2 · Administrador simplificado · 21 noviembre 2026

## Solicitud y estado
- Administrador PWA usa exactamente seis módulos, sin portada verde, sin bienvenida, ni recuadro de salud en Inicio: **Chat, Repertorio, Calendario, Familia, Acceso a músicos, Resumen de memoria**.
- Navegación inferior con seis módulos en móvil; tocar logo regresa al menú. La sesión Admin se conserva en memoria al navegar; no se inventó ninguna sesión de músico.
- Módulos existentes mantienen autorización y acciones de crear/editar/eliminar en sus respectivos servicios. BOOK híbrido 3D permanece sin cambios; Android APK permanece 0.0.23.
- Resumen memoria: GET `/api/chat/admin/storage/summary`, solo con sesión Admin, desglose D1 en 6 módulos + colas de limpieza; reporta total controlado, reservas y notas sobre archivos de Estados/Perfiles fuera de ese límite. Mientras Worker siga anterior, PWA muestra **solo** el total real del endpoint existente `/api/family/admin/albums`; el desglose no se simula.
- Acceso sin contraseña: pareja de claves P-256 generada en navegador; clave privada **no exportable** guardada como CryptoKey en IndexedDB del origen oficial, pública D1. Enrolamiento tras un login Admin válido; cada ingreso siguiente firma un challenge aleatorio de un solo uso y se crea la misma sesión de 8 horas. Origen oficial `https://havana-nice-v2.pages.dev`, no en previews, máximo 3 dispositivos; revocación desde Equipo. El inicio con contraseña permanece como mecanismo de recuperación. **No quitar verificación Admin del Worker**.
- Migración agregada `0035_admin_trusted_devices.sql`, no cambia sesiones ni cuentas antiguas.

## Pendiente para activar el login sin contraseña y desglose
1. **Completado**: compilación Pages `a4b10c0e` y 63 pruebas sin fallos, incluyendo paridad visual, firma por dispositivo y memoria privada.
2. **Aplicado y verificado el 21/11**: D1 0035 creó únicamente `chat_admin_trusted_devices`, `chat_admin_device_challenges` y su índice, tras comprobar el bookmark previo. Las tablas existentes siguen intactas. El historial de Wrangler debe reconciliar esta migración idempotente en el siguiente despliegue.
3. Preparar bundle canónico con Wrangler desde el mismo commit `main`, ejecutar pruebas de regresión de Worker (sessions, DO, Calendar, Chat, R2). Publicar **únicamente** si el hash y los bindings actuales son compatibles; conservar versión rollback.
4. Validar en el teléfono oficial: primer login con contraseña, vinculación, cerrar/salir, recargar, auto-login, desvincular, revocación y acceso no autorizado con navegador nuevo.
5. Hasta entonces **no declarar activo el ingreso sin contraseña** y no quitar el login por contraseña. El frontend mantiene fallback seguro; el resumen muestra la cuota total real del endpoint existente de Familia mientras espera el detalle del nuevo Worker.

## Publicación verificada 22/11/2026

- Worker completo desplegado al 100%: versión `de7e23ad-23f0-4e57-ac1f-d6df222e04be`, anterior `425f808f-aadd-4426-8313-87e58b2a3560` disponible para rollback. Se conservaron D1, R2, los dos Durable Objects y la credencial secreta Admin (7/7 bindings).
- Compilación canónica desde `main` (`8ce18e5607b45b82c6d04cafa294db5954457a2e`) con Wrangler dry-run y pruebas de autenticación y Audio exitosas. El workflow temporal y el bundle exportado ya se retiraron del repositorio.
- La base D1 mostraba cero dispositivos vinculados antes del despliegue; para entrar sin contraseña hace falta autorizar este teléfono UNA VEZ con credencial vigente. Sin esa prueba no puede otorgarse acceso seguro de forma remota.
- Después, la PWA renueva automáticamente la sesión temporal con el par de claves no exportables del teléfono. No se almacena el password ni bearer permanente. Cerrar sesión de forma explícita evita recuperación automática en esa vista.
- Pendiente comprobar físicamente desde `https://havana-nice-v2.pages.dev/admin.html`: iniciar sesión una última vez, cerrar/reabrir y verificar que se reingresa automáticamente. No declarar QA realizada sin esa prueba.
