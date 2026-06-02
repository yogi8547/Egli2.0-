import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: true,
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      include: ['src/components/**/*.jsx'],
    },
  },
});
