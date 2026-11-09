# HAVANA NICE V2 · Dirección visual HOME

**Alcance:** únicamente HOME y navegación; sin cambios a Chat, BOOK 3D, Familia, Calendario, Repertorio, autenticación, carga multimedia o almacenamiento.

**Identidad:** verde esmeralda profundo y oro suave, sobre blanco cálido. Estilo limpio, moderno, de alta calidad, sin adornos teatrales.

**Tokens base:** fondo `#F7F4ED`, papel `#FFFCF7`, esmeralda `#133B30`, verde profundo `#0D2A23`, oro `#B69358`, oro claro `#DBC59A`, texto `#1B332B`, secundarios `#657269`, divisores `#E4DDD1`.

**Jerarquía:** marca y acceso en cabecera, bienvenida breve, accesos directos amplios, navegación persistente. Fotografías reales se conservan en Familia, sin imágenes decorativas ni nuevos assets pesados.

**Accesibilidad:** foco visible en botones web, contraste suficiente, respeto a `prefers-reduced-motion`, nombres de accesibilidad y zonas táctiles. Mantener la navegación y la misma sesión; no introducir pantallas de login.

**Publicación:** PWA HOME puede publicarse al verificar CI; HOME nativa es código React Native independiente y necesita un siguiente lote Android explícito. El BOOK 3D sí sigue compartido con PWA por WebView.

**Validación:** comprobar HOME en móvil/escritorio y navegación PWA real; para Android, inspección física después de una futura APK. No afirmar paridad visual entre ambas hasta entonces.

## Estado de entrega · 9 noviembre 2026

- **PWA HOME:** publicada en Cloudflare Pages desde commit `c800fbd917226a5d1cf0d9c83c5d91408254bc65`; diseño y navegación validados en [CI 42662730036 · SUCCESS](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42662730036). La misma revisión probó módulos y límites de sesión; no equivale a prueba visual física.
- **Android 0.0.22:** compilada, firmada, enlace y firma de actualización verificados en [GitHub Actions 42661357387 · SUCCESS](https://github.com/Abnernoa97/havana-nice-v2/actions/runs/42661357387). Conserva 0.0.21 como PREVIOUS. Es el paquete funcional y de seguridad; **no incorpora todavía el nuevo estilo HOME**.
- **HOME nativa visual:** estilos preparados en `apps/android/app/NativeMemberHome.tsx` y TypeScript validado. Para verlos en un Android instalado hará falta una próxima APK acumulativa expresamente aprobada; no publicar sólo por cambiar colores.
- **Próxima fase:** Chat (solo aspecto visual), luego Calendario y Repertorio, con navegación y acciones intactas. Mantener el mismo esquema de color y pruebas de accesibilidad.

