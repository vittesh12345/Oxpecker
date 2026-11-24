import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build is inlined into a single dist/index.html so the tool can be
// opened straight from a file, a USB stick or any static host, with no server.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
