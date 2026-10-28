import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The short build id sent with player feedback (src/cloud/feedback.js): the
// package version, plus the commit on the GitHub Actions build of the live site.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = (process.env.GITHUB_SHA || '').slice(0, 7);
const APP_VERSION = commit ? `${version}+${commit}` : version;

export default defineConfig({
  // relative asset paths, so dist/ works from any folder or host (itch.io, GitHub Pages, a zip)
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    // three.js alone is ~700 kB, so the default 500 kB warning always fires
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    // Installable + offline (README "Install as an app", docs/CONTRACT.md pwa.js).
    // With base './' the plugin keeps every path relative too: sw.js, its scope
    // and the manifest sit next to index.html, so the same build works on the
    // GitHub Pages sub-path and any other folder.
    VitePWA({
      // a new version waits until the player taps "Refresh" on a menu
      registerType: 'prompt',
      // src/core/pwa.js registers it through virtual:pwa-register
      injectRegister: false,
      manifest: {
        name: "Pip's Christmas Eve Hunt",
        short_name: "Pip's Hunt",
        description: 'A cosy 3D Christmas hunt: help Pip the penguin find crackers and presents before morning.',
        // relative to the manifest, so the installed app opens the sub-path it came from
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        // the night palette in src/styles.css (--night, --night-deep)
        theme_color: '#1b2450',
        background_color: '#0f1533',
        lang: 'en',
        categories: ['games', 'kids', 'entertainment'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // the manifest icons are precached already; these are linked from index.html
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon-64.png'],
      workbox: {
        // Every built file, including the lazy Firebase chunk and the Fredoka
        // woff2 files. The .woff copies are only for browsers too old to run
        // the game, so they are not precached.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        // No runtimeCaching on purpose: Firebase and Google (sign-in, Firestore,
        // apis.google.com) are other origins that no route matches, so they
        // always go straight to the network and are never cached.
        // Firebase's reserved /__/ paths (auth handler) are never answered with the game.
        navigateFallbackDenylist: [/\/__\//],
      },
    }),
  ],
});
