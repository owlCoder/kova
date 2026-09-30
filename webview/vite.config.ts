import { defineConfig } from 'vite';

export default defineConfig({
  root: 'webview',
  base: './',
  build: {
    outDir: '../dist/extension/webview',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
