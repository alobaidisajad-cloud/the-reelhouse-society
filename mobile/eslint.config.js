// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// flash-list's AnimatedFlashList is React Native's Animated: fed a Reanimated scroll
// worklet, it crashes RecyclerView on the New Architecture.
const FLASH_LIST_RULE = {
  name: '@shopify/flash-list',
  importNames: ['AnimatedFlashList'],
  message: "Don't use flash-list's AnimatedFlashList (RN-Animated based) with Reanimated worklets — it crashes RecyclerView on the New Architecture. Use CinematicFlashList (src/components/layout) instead.",
};

// React Native's own Text applies neither the house ceiling nor Android's
// letter spacing on a phone (see src/components/text).
const TEXT_RULE = {
  name: 'react-native',
  importNames: ['Text', 'TextInput'],
  message: "Import Text / TextInput from '@/src/components/text'. React Native's own grow to the system's largest size (3.1x on iOS) and double Android's letter spacing: the app's carry the 1.35 ceiling and iOS's spacing.",
};

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
      'no-restricted-imports': ['error', {
        paths: [FLASH_LIST_RULE, TEXT_RULE],
      }],
      'no-restricted-syntax': ['error', {
        selector: "MemberExpression[object.name='Animated'][property.name='Text']",
        message: "Use AnimatedText from '@/src/components/text' — it is Reanimated's animated Text made from the app's Text, so it keeps the ceiling and the spacing.",
      }, {
        // react-native-svg on Android reads these as numbers and throws on a word.
        selector: "JSXAttribute[name.name=/^(fontSize|letterSpacing|wordSpacing|kerning)$/] > Literal[value=/[^0-9.\\s-]/]",
        message: 'An SVG font size or spacing must be a number — Android throws on a word such as "none".',
      }, {
        selector: "JSXAttribute[name.name=/^(fontFamily|fontWeight|fontStyle|textAnchor)$/] > Literal[value='none']",
        message: 'Leave the attribute out instead of "none" — a design tool\'s "none" is not an SVG value, and Android does not forgive it.',
      }, {
        // Hermes has no Intl polyfill: a date right in Node can be wrong on the phone.
        selector: "MemberExpression[object.name='Intl']",
        message: "No Intl: the phone's Hermes has no polyfill. Dates and times come from src/utils/timeAgo.ts, which builds them from tables.",
      }, {
        selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]",
        message: "toLocale…String is Intl underneath, and the phone's Hermes has no polyfill. Use src/utils/timeAgo.ts (dates, times) or a house formatter (numbers).",
      }],
    },
  },
  {
    // The one place React Native's Text and TextInput are wrapped — and where a
    // name is both the component and the type of its ref, on purpose.
    files: ['src/components/text/index.tsx'],
    rules: { 'no-restricted-imports': 'off', 'no-restricted-syntax': 'off', '@typescript-eslint/no-redeclare': 'off' },
  },
  {
    // CinematicFlashList is the sanctioned Reanimated wrapper around FlashList —
    // it may import AnimatedFlashList, and nothing else changes.
    files: ['src/components/layout/CinematicFlashList.tsx'],
    rules: { 'no-restricted-imports': ['error', { paths: [TEXT_RULE] }] },
  },
  {
    files: ['scripts/**/*.js', 'test-utils/**/*.js', 'mockups/tools/**/*.cjs', '.claude/hooks/**/*.cjs'],
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
    // mockups/*.ts is test support too: the generators' and the capture's
    // shared paths, loaded inside jest.
    files: ['**/__tests__/**', 'jest.setup.ts', 'jest.afterEnv.ts', 'mockups/*.ts'],
    rules: {
      // Tests find React Native's own Text by type — that is what renders.
      'no-restricted-imports': ['error', { paths: [FLASH_LIST_RULE] }],
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'react/display-name': 'off',
      // fast-check's documented usage is `import fc from 'fast-check'; fc.assert(...)`.
      'import/no-named-as-default-member': 'off',
    },
  },
]);
