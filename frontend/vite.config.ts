import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), sveltekit()],
  server: {
    port: 5173,
    strictPort: true,
    host: true
  },
  preview: {
    port: 4173,
    strictPort: true,
    host: true
  },
  build: {
    sourcemap: false,
    target: 'es2022'
  }
});
