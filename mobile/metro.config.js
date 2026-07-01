// Sentry's Metro wrapper injects Debug IDs and emits the source maps that
// `@sentry/react-native` uploads on EAS builds — required for deminified
// (file:line) stack traces. It delegates to Expo's getDefaultConfig internally.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

// Add support for processing .mjs files, heavily used by module libraries like lucide-react-native
config.resolver.sourceExts.push('mjs');
config.resolver.sourceExts.push('cjs');

// Expose the web project's public folder to Metro so we can directly import the rating images
config.watchFolders = [path.resolve(__dirname, '../public')];

module.exports = config;
