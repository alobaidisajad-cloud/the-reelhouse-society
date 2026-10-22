/**
 * app.json, unchanged — except in the sealed E2E build and the development build.
 *
 * Every real build (EAS, TestFlight, the stores) runs without E2E, and gets
 * app.json exactly: appConfig.guard.test.ts proves the two are equal.
 *
 * With E2E=1 (set only by e2e.yml for its APK, ios-launch.yml for its simulator app and
 * speed-lab.yml for its builds; none leaves its runner):
 *   · plain http is allowed, because the local backend on the runner is
 *     http://10.0.2.2:54321 (the emulator's name for the runner)
 *   · over-the-air updates are off, so the build runs the code it was built
 *     with and never asks Expo's servers for anything
 *   · extra.e2e is true, which turns on e2eTrace (src/utils/e2eTrace.ts): lines
 *     in the device log that the run's report reads
 *   · with LAB=1 as well (set by speed-lab.yml alone), extra.lab is true, which mounts the
 *     lab's frame record (src/components/layout/LabFrameLog.tsx); the other E2E builds are
 *     measured without it
 *
 * The development build (EAS's `development` profile, which EAS names in
 * EAS_BUILD_PROFILE) gets back the two things a development client lives by and
 * a store build must never hold: the exp+reelhouse scheme that opens it from the
 * dev server's link, and iOS's plain-http allowance for the local network the
 * dev server is on. release-guard.cjs refuses both in anything submitted.
 */
module.exports = ({ config }) => {
  if (process.env.EAS_BUILD_PROFILE === 'development') {
    return {
      ...config,
      plugins: (config.plugins ?? []).map((p) => (Array.isArray(p) && p[0] === 'expo-dev-client' ? 'expo-dev-client' : p)),
      ios: {
        ...config.ios,
        infoPlist: {
          ...config.ios?.infoPlist,
          NSAppTransportSecurity: { ...config.ios?.infoPlist?.NSAppTransportSecurity, NSAllowsLocalNetworking: true },
        },
      },
    };
  }
  if (process.env.E2E !== '1') return config;
  return {
    ...config,
    updates: { ...config.updates, enabled: false },
    plugins: [...(config.plugins ?? []), './e2e/plugins/withCleartextTraffic'],
    extra: { ...config.extra, e2e: true, ...(process.env.LAB === '1' ? { lab: true } : {}) },
  };
};
