import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Standalone Vitest config for pure unit tests (no Nuxt runtime needed).
// The `~` alias mirrors Nuxt's srcDir so imports like `~/utils/...` resolve.
export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./', import.meta.url)),
      '@': fileURLToPath(new URL('./', import.meta.url))
    }
  },
  // Don't read the project tsconfig (it extends the Nuxt-generated .nuxt/tsconfig,
  // which may not exist before `nuxt prepare`). Types are stripped for tests anyway.
  esbuild: {
    tsconfigRaw: {}
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    globals: true
  }
})
