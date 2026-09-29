/**
 * Stands in for @revenuecat/purchases-js-hybrid-mappings in the phone builds.
 *
 * react-native-purchases loads its web mode (740 KB) at import, but uses it
 * only in Expo Go, Rork or a web build (its utils/environment.js); a phone
 * build with the native module never calls it. metro.config.js swaps it for
 * this on iOS and Android. Should that ever change, the first call says so
 * rather than failing somewhere quieter.
 */
const refuse = () => {
  throw new Error('RevenueCat web mode is not bundled in the phone app (metro.config.js).');
};

module.exports = new Proxy({}, {
  get(_target, key) {
    // Not a module-shaped or thenable object to anything that inspects it.
    if (key === '__esModule' || key === 'then' || typeof key === 'symbol') return undefined;
    return new Proxy(refuse, { get: refuse, apply: refuse, construct: refuse });
  },
});
