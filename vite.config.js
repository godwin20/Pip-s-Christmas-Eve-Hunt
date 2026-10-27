import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths, so dist/ works from any folder or host (itch.io, GitHub Pages, a zip)
  base: './',
  build: {
    // three.js alone is ~700 kB, so the default 500 kB warning always fires
    chunkSizeWarningLimit: 1200,
  },
});
