import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = fileURLToPath(new URL('.', import.meta.url));
const srcDir = path.resolve(apiDir, '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
  test: {
    environment: 'node',
    setupFiles: [],
  },
});
