// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['**/dist/**', '**/supabase/functions/**', '*.config.js'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Match Expo's defaults (unused args allowed) but also don't flag
      // intentionally-unused caught errors or _-prefixed placeholders.
      '@typescript-eslint/no-unused-vars': ['warn', {
        args: 'none',
        caughtErrors: 'none',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_',
      }],
      // flash-list's exported `AnimatedFlashList` is built on React Native's
      // Animated. Feeding it a Reanimated `useAnimatedScrollHandler` worklet
      // crashes RecyclerView with "undefined is not a function" on the New
      // Architecture (Sentry REACT-NATIVE-6, build 31/34). Use CinematicFlashList
      // — or Reanimated's own Animated.createAnimatedComponent(FlashList) — instead.
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@shopify/flash-list',
          importNames: ['AnimatedFlashList'],
          message: "Don't use flash-list's AnimatedFlashList (RN-Animated based) with Reanimated worklets — it crashes RecyclerView on the New Architecture. Use CinematicFlashList (src/components/layout) instead.",
        }],
      }],
    },
  },
  {
    // CinematicFlashList is the sanctioned Reanimated wrapper around FlashList.
    files: ['src/components/layout/CinematicFlashList.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['scripts/**/*.js', 'test-utils/**/*.js'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
      },
    },
  },
  {
    // Domain store slices use lazy require() to break circular dependencies.
    files: ['src/stores/**/*.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // moderation.ts intentionally pairs `export const X` with `export type X`.
    files: ['src/types/moderation.ts'],
    rules: { '@typescript-eslint/no-redeclare': 'off' },
  },
  {
    // Test files and the Jest setup use inline mock components that don't need
    // display names, and CommonJS-style requires.
    files: ['**/__tests__/**', 'jest.setup.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'react/display-name': 'off',
      // fast-check's documented usage is `import fc from 'fast-check'; fc.assert(...)`.
      'import/no-named-as-default-member': 'off',
    },
  },
]);
