module.exports = {
  preset: 'jest-expo',
  setupFilesAfterSetup: ['./jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|@sentry/react-native|@shopify/flash-list|@supabase/supabase-js|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-mmkv|react-native-svg|lucide-react-native|expo-.*)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  collectCoverageFrom: [
    'src/stores/**/*.ts',
    'src/utils/**/*.ts',
    'src/hooks/**/*.ts',
    'src/lib/**/*.ts',
    '!src/**/*.d.ts',
  ],
};
