const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'supabase/functions/**',
      '.expo/**',
      '.expo-export-check/**',
      'dist/**',
      'coverage/**',
    ],
  },
  {
    files: ['*.config.js', 'babel.config.js', 'eslint.config.js', 'jest.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/__tests__/**/*', 'jest.setup.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
]);
