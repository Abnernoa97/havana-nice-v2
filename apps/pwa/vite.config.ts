import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022', rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), visual: fileURLToPath(new URL('./visual.html', import.meta.url)), admin: fileURLToPath(new URL('./admin.html', import.meta.url)) } } },
});
