import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/dynalytics/' : '/',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  // elkjs/cytoscape-elk: pre-bundle with esbuild for the dev server.
  // For production (Rollup), modulePreload polyfill is disabled so the
  // build-import-analysis plugin does not try to re-parse the generated chunks
  // that contain inline ELK code (which uses backtick characters inside strings
  // that confuse some parsers when minified into a single line).
  optimizeDeps: {
    include: ['cytoscape-elk', 'elkjs/lib/elk.bundled.js'],
  },
  build: {
    target: 'esnext',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    modulePreload: { polyfill: false },
  },
});
