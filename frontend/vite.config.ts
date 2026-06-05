import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), sveltekit()],
  server: {
    port: 5173,
    strictPort: true,
    host: process.env.NODE_ENV === 'production' ? false : true,
    hmr: {
      overlay: false
    },
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  preview: {
    port: 4173,
    strictPort: true,
    host: process.env.NODE_ENV === 'production' ? false : true
  },
  build: {
    sourcemap: false,
    target: 'es2022'
  }
});
