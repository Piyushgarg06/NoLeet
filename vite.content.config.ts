import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: process.env.NODE_ENV !== 'production',
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/content/gemini/index.ts'),
      name: 'GeminiContentScript',
      formats: ['iife'],
      fileName: () => 'content/gemini/index.js',
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@background': resolve(__dirname, 'src/background'),
      '@content': resolve(__dirname, 'src/content'),
      '@panel': resolve(__dirname, 'src/panel'),
      '@injected': resolve(__dirname, 'src/injected'),
    },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
});
