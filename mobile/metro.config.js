// Sentry's Metro wrapper injects Debug IDs and emits the source maps that
// `@sentry/react-native` uploads on EAS builds — required for deminified
// (file:line) stack traces. It delegates to Expo's getDefaultConfig internally.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const fs = require('fs');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname, {
  // Sentry's web session replay and feedback widget: the phone app uses neither.
  includeWebReplay: false,
  includeWebFeedback: false,
});

// Add support for processing .mjs files, heavily used by module libraries like lucide-react-native
config.resolver.sourceExts.push('mjs');
config.resolver.sourceExts.push('cjs');

// Expose the web project's public folder to Metro so we can directly import the rating images
config.watchFolders = [path.resolve(__dirname, '../public')];

// ── What the phone bundle leaves out (npm run bundle:size keeps it honest) ──
const LUCIDE_USED = path.resolve(__dirname, 'src/generated/lucideIcons.js');
const REVENUECAT_WEB_STUB = path.resolve(__dirname, 'src/lib/nativeOnly/revenuecatWebStub.js');
const LUCIDE_DIR = `${path.sep}lucide-react-native${path.sep}`;
/** Bundled once, as ES modules: a `require` of them would add their CommonJS copies. */
const ONE_COPY = /^(zod|react-hook-form)(\/|$)/;
/**
 * The speed lab's feel build alone (FEEL=1, app.config.js): React Native's profiling renderer in
 * place of its production one, so a Profiler times each commit (src/components/layout/LabFeelProbe.tsx).
 */
const FEEL = process.env.FEEL === '1' && process.env.LAB === '1' && process.env.E2E === '1';
const RENDERER_SHIM = `${path.sep}Renderer${path.sep}shims${path.sep}ReactFabric.js`;

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  if (platform === 'ios' || platform === 'android') {
    // Only the icons the app imports (scripts/lucide-icons.js), not all 1,700.
    if (moduleName === 'lucide-react-native' && !context.originModulePath.includes(LUCIDE_DIR)) {
      return { type: 'sourceFile', filePath: LUCIDE_USED };
    }
    // RevenueCat's web mode, which a phone build never runs (the stub says why).
    if (moduleName === '@revenuecat/purchases-js-hybrid-mappings') {
      return { type: 'sourceFile', filePath: REVENUECAT_WEB_STUB };
    }
    if (FEEL && moduleName === '../implementations/ReactFabric-prod' && context.originModulePath.endsWith(RENDERER_SHIM)) {
      return { type: 'sourceFile', filePath: path.join(path.dirname(context.originModulePath), '..', 'implementations', 'ReactFabric-profiling.js') };
    }
  }
  if (ONE_COPY.test(moduleName)) {
    const found = resolve({ ...context, isESMImport: true }, moduleName, platform);
    // zod/v4/core has its own package.json whose "main" is the CommonJS file,
    // and Metro follows it (for @hookform/resolvers): take its ES twin.
    if (found.type === 'sourceFile' && found.filePath.endsWith('.cjs')) {
      const esm = `${found.filePath.slice(0, -'.cjs'.length)}.js`;
      if (fs.existsSync(esm)) return { type: 'sourceFile', filePath: esm };
    }
    return found;
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
