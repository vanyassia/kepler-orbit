/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Относительный base — собранное приложение можно открыть из любой папки/хостинга.
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    dir: './src',
    include: ['**/*.test.ts'],
  },
});
