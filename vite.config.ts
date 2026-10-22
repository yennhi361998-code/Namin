import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const buildId = `${Date.now()}`;

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    // Service worker so the installed app opens offline. The manifest stays hand-written in
    // public/manifest.webmanifest (manifest: false), the plugin only generates the worker.
    VitePWA({
      manifest: false,
      // Automatically updates service worker and activates without waiting
      registerType: 'autoUpdate',
      injectRegister: false,
      workbox: {
        // Precache the whole app shell. Fonts: woff2 only (every browser with service workers supports it).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Client-side routes (/tasks, /items/:id, ...) load index.html when offline.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ['/sw-notifications.js'],
      },
    }),
  ],
});
