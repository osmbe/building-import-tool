import { defineConfig } from 'vite-plus'

// Vite+ toolchain config (vp test / vp lint / vp fmt). Nuxt does not read this file;
// The app build is configured in nuxt.config.ts.
export default defineConfig({
  // Unit tests are pure (no Nuxt runtime needed).
  // The `~` alias mirrors Nuxt's srcDir so imports like `~/utils/...` resolve.
  // Don't use the project tsconfig (it extends the Nuxt-generated .nuxt/tsconfig,
  // Which may not exist before `nuxt prepare`).
  tsconfig: './tsconfig.test.json',
  resolve: {
    alias: {
      '@': import.meta.dirname,
      '~': import.meta.dirname
    }
  },
  test: {
    coverage: {
      provider: 'v8',
      // Logic modules. Vue components (OpenLayers map UI) are not unit-tested; keep logic out of them.
      include: ['utils/**/*.ts', 'server/**/*.ts', 'composables/**/*.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { branches: 90, functions: 95, lines: 95, statements: 95 }
    },
    environment: 'node',
    globals: true,
    include: ['tests/**/*.{test,spec}.ts'],
    restoreMocks: true,
    unstubGlobals: true
  },
  fmt: {
    // Snapshots are written by vitest and compared byte for byte
    ignorePatterns: ['tests/**/__snapshots__/**'],
    singleQuote: true,
    semi: false,
    trailingComma: 'none',
    printWidth: 120
  },
  lint: {
    categories: {
      correctness: 'error',
      pedantic: 'warn',
      perf: 'warn',
      restriction: 'warn',
      style: 'warn',
      suspicious: 'warn'
    },
    env: {
      browser: true
    },
    ignorePatterns: ['.nuxt', '.output', 'node_modules'],
    jsPlugins: [
      {
        name: 'vite-plus',
        specifier: 'vite-plus/oxlint-plugin'
      }
    ],
    options: {
      typeAware: true,
      typeCheck: true
    },
    plugins: ['eslint', 'oxc', 'typescript', 'vue'],
    rules: {
      curly: ['error', 'multi', 'consistent'],
      eqeqeq: 'error',
      'no-magic-numbers': 'allow',
      'no-var': 'error',
      'one-var': 'allow',
      'prefer-const': 'error'
    }
  }
})
