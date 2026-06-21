/**
 * react-native-purchases Stub Declaration
 *
 * The RevenueCat SDK is dynamically imported at runtime (revenueCat.ts line 83).
 * This stub declaration prevents TS2307 "cannot find module" errors when the
 * package is not yet installed (it's added via `npx expo install` during
 * production setup).
 */
declare module 'react-native-purchases' {
  const Purchases: unknown;
  export default Purchases;
}
