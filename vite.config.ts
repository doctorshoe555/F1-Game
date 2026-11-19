import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// base './' → läuft unter jedem GitHub-Pages-Pfad (user.github.io/repo/) ohne Anpassung.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [
    // PWA: Nach dem ersten Laden liegen App, Fragen, Schriften und Streckenumrisse im Cache –
    // Solo, Pass-and-Play und Jeopardy an einem Gerät laufen dann auch ohne Netz.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Boxenfunk – das F1-Quiz',
        short_name: 'Boxenfunk',
        description: 'Das F1-Quiz mit Augenzwinkern. Inoffizielles Fanprojekt.',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#08080b',
        theme_color: '#08080b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], cleanupOutdatedCaches: true },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
