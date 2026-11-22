import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit tests run in plain Node (no browser). Pure modules only: OCR helpers, checklist mapping,
// device id, haptics logic. UI is checked against the Doop frames in a browser instead.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 120000,
  },
});
