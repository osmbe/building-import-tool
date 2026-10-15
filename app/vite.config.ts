import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'

// Vite+ toolchain config (vp test / vp lint / vp fmt). Nuxt does not read this file;
// the app build is configured in nuxt.config.ts.
export default defineConfig({
  // Unit tests are pure (no Nuxt runtime needed).
  // The `~` alias mirrors Nuxt's srcDir so imports like `~/utils/...` resolve.
  // Don't use the project tsconfig (it extends the Nuxt-generated .nuxt/tsconfig,
  // which may not exist before `nuxt prepare`).
  tsconfig: './tsconfig.test.json',
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./', import.meta.url)),
      '@': fileURLToPath(new URL('./', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    globals: true,
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      // Logic modules. Vue components (OpenLayers map UI) are not unit-tested; keep logic out of them.
      include: ['utils/**/*.ts', 'server/**/*.ts', 'composables/**/*.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 }
    }
  },
  fmt: {
    singleQuote: true,
    semi: false,
    trailingComma: 'none',
    printWidth: 120
  },
  lint: {
    plugins: ['typescript', 'vue'],
    categories: {
      correctness: 'error',
      suspicious: 'warn',
      pedantic: 'warn',
      perf: 'warn',
      style: 'warn'
    },
    rules: {
      'no-shadow': 'warn',
      'default-case-last': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: 'error',
      curly: 'off',
      'id-length': 'off',
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      'max-statements': 'off',
      'func-style': 'off',
      'no-magic-numbers': 'off',
      'no-ternary': 'off',
      'no-nested-ternary': 'off',
      'sort-keys': 'off',
      'no-inline-comments': 'off',
      'init-declarations': 'off',
      'no-continue': 'off',
      'no-await-in-loop': 'off',
      'unicorn/no-nested-ternary': 'off',
      'capitalized-comments': 'off',
      'sort-imports': ['warn', { ignoreDeclarationSort: true }],
      'vite-plus/prefer-vite-plus-imports': 'error'
    },
    env: {
      browser: true
    },
    ignorePatterns: ['.nuxt', '.output', 'node_modules'],
    options: {
      typeAware: true,
      typeCheck: true
    },
    jsPlugins: [
      {
        name: 'vite-plus',
        specifier: 'vite-plus/oxlint-plugin'
      }
    ]
  }
})
