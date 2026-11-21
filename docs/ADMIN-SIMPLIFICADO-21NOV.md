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
