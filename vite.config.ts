import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { normalizeBasePath } from './src/basePath.ts';

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const base = normalizeBasePath(process.env.BASE_PATH ?? fileEnv.BASE_PATH);
  return {
    base,
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
    server: {
      host: '0.0.0.0',
      port: 4738,
      strictPort: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 4738,
      strictPort: true,
    },
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        // Resolved against the page, so a /solitaire/ deploy does not claim the whole origin.
        scope: './',
        buildBase: './',
        includeAssets: ['favicon.svg', 'icons/*.png'],
        manifest: {
          id: './',
          name: 'Klondike Solitaire',
          short_name: 'Solitaire',
          description: 'Classic Klondike solitaire. No ads, no accounts, plays offline.',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'any',
          background_color: '#146b3c',
          theme_color: '#0c4e2b',
          lang: 'en',
          categories: ['games'],
          icons: [
            {
              src: 'icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/icon-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,ico}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
  };
});
