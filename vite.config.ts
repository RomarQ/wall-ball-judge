import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Imported rather than read, so the dev server restarts when a version or a model revision changes.
import pkg from './package.json' with { type: 'json' };
import models from './models/manifest.json' with { type: 'json' };

/**
 * A name for the copy of the runtimes this build carries.
 *
 * The service worker keeps them cache-first and forever, so a cache named the
 * same across two builds is never refetched. That is right while the bytes are
 * the same and wrong the moment they are not, whether because a dependency
 * moved or because the last copy was fetched from a server answering with the
 * wrong content type. The versions of the packages they come from name them.
 */
const runtimes = ['@mediapipe/tasks-vision', '@litertjs/core']
  .map(
    (name) =>
      (JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')) as { version: string }).version,
  )
  .join('-');

export default defineConfig({
  // Reachable from a phone on the same network. The camera still wants a secure
  // origin, so a plain http address serves the board but not the video.
  server: { host: true },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __MODELS_REVISION__: JSON.stringify(models.revision),
    __RUNTIMES_REVISION__: JSON.stringify(runtimes),
  },
  // The detector's worker loads its runtime as a module, as the page does.
  worker: { format: 'es' },
  build: {
    target: 'es2022',
  },
  plugins: [
    // The WASM runtimes ship in the npm packages; they are copied beside the app and cached on first use.
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@mediapipe/tasks-vision/wasm/*',
          dest: 'vendor/mediapipe',
          rename: { stripBase: true },
        },
        {
          // The two LiteRT.js picks between by relaxed SIMD; see litert-worker.ts.
          src: 'node_modules/@litertjs/core/wasm/litert_wasm{,_compat}_internal.{js,wasm}',
          dest: 'vendor/litert',
          rename: { stripBase: true },
        },
      ],
    }),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Wall Ball Judge',
        short_name: 'Wall Ball',
        description:
          'Judges wall-ball reps from the camera: squat depth and the ball reaching the target, on the device itself.',
        id: './',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#000000',
        theme_color: '#000000',
        categories: ['sports', 'fitness'],
        // A long press on the icon opens the board straight away.
        shortcuts: [
          {
            name: 'Judge board',
            short_name: 'Board',
            url: './#judge',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // The shell is precached; the runtimes and the models are large and cached on first use instead.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,woff2}'],
        globIgnores: ['**/vendor/**', '**/models/**'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
