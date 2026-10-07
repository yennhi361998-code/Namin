import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Service worker so the installed app opens offline. The manifest stays hand-written in
    // public/manifest.webmanifest (manifest: false), the plugin only generates the worker.
    VitePWA({
      manifest: false,
      // New builds take over silently on the next launch; data lives in localStorage, so nothing is lost.
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      workbox: {
        // Precache the whole app shell. Fonts: woff2 only (every browser with service workers supports it).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Client-side routes (/tasks, /items/:id, ...) load index.html when offline.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
