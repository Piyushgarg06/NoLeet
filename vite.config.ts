import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== 'production',
    minify: false, // Keep readable for extension review; enable for prod if needed
    rollupOptions: {
      input: {
        'background/index': resolve(__dirname, 'src/background/index.ts'),
        'panel/main': resolve(__dirname, 'src/panel/main.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'panel/styles.css';
          }
          return 'assets/[name].[ext]';
        },
        format: 'esm',
        manualChunks: undefined,
      },
    },
    // Prevent Vite from splitting things into chunks that Chrome can't load
    chunkSizeWarningLimit: 1000,
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
    // Gate debug logging: set to true during dev, false in production
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
});
