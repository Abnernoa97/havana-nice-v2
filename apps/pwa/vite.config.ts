import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // Make initial-versus-on-demand dependency graphs measurable by CI.
  // Manifest is build metadata only; it does not load extra JavaScript.
  build: { target: 'es2022', manifest:true, rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), visual: fileURLToPath(new URL('./visual.html', import.meta.url)), admin: fileURLToPath(new URL('./admin.html', import.meta.url)), book: fileURLToPath(new URL('./book.html', import.meta.url)) } } },
});
