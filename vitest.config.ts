import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fromRoot('./src'),
      '@messages': fromRoot('./messages'),
      // `server-only` throws unless a bundler marks the import as server code. Tests are not bundled.
      'server-only': fromRoot('./src/test/server-only.ts'),
    },
  },
  test: {
    projects: [
      {
        // Rules and plain modules: no browser.
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          setupFiles: ['./src/test/no-network.ts'],
        },
      },
      {
        // Components, in a simulated browser.
        extends: true,
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
})
