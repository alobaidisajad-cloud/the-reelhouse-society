/**
 * app.json, unchanged — except in the sealed E2E build.
 *
 * Every real build (EAS, TestFlight, the stores) runs without E2E, and gets
 * app.json exactly: appConfig.guard.test.ts proves the two are equal.
 *
 * With E2E=1 (only e2e.yml sets it, for an APK that never leaves the runner):
 *   · plain http is allowed, because the local backend on the runner is
 *     http://10.0.2.2:54321 (the emulator's name for the runner)
 *   · over-the-air updates are off, so the build runs the code it was built
 *     with and never asks Expo's servers for anything
 */
module.exports = ({ config }) => {
  if (process.env.E2E !== '1') return config;
  return {
    ...config,
    updates: { ...config.updates, enabled: false },
    plugins: [...(config.plugins ?? []), './e2e/plugins/withCleartextTraffic'],
  };
};
