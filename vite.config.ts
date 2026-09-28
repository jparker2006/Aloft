import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base: the build runs from any path (a static host, a hosted preview), not only a site root.
  base: './',
  build: { target: 'esnext', chunkSizeWarningLimit: 2000 },
  server: { host: '127.0.0.1' },
});
