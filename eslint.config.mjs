import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Jest's config loader and its mock-hoisting rules require CommonJS
    // `require()` here, not import syntax.
    files: ['jest.config.js', 'jest.setup.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    '.next.stale-bak-*/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'coverage/**',
    'archive/**',
    'design_handoff_personal_site/**',
    'screenshots/**',
  ]),
])

export default eslintConfig
