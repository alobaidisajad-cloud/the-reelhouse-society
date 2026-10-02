/**
 * sentryMeasures — what the app asks Sentry to measure, and what it never sends.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as SentrySDK from '@sentry/react-native';

const SDK = SentrySDK as unknown as {
  init: jest.Mock; appLoaded: jest.Mock; expoRouterIntegration: jest.Mock;
};

/** The module with a DSN, as a release build has one. */
function loadWithDsn(): typeof import('../sentry') {
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://key@example.ingest.sentry.io/1';
  let mod!: typeof import('../sentry');
  jest.isolateModules(() => { mod = require('../sentry'); });
  return mod;
}

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  SDK.init.mockClear(); SDK.appLoaded.mockClear(); SDK.expoRouterIntegration.mockClear();
});

describe('what Sentry is asked to measure', () => {
  it("the app's start, each screen to its first frame, and slow, frozen and stalled frames", () => {
    loadWithDsn().initSentry();
    const options = SDK.init.mock.calls[0][0];
    expect(options.enableAppStartTracking).toBe(true);
    expect(options.enableNativeFramesTracking).toBe(true);
    expect(options.enableStallTracking).toBe(true);
    expect(SDK.expoRouterIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ enableTimeToInitialDisplay: true }),
    );
    expect(options.integrations).toContain(SDK.expoRouterIntegration.mock.results[0].value);
  });

  it('ends the app start once, at the first screen', () => {
    const { markAppLoaded } = loadWithDsn();
    markAppLoaded();
    markAppLoaded();
    expect(SDK.appLoaded).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all without a DSN', () => {
    let mod!: typeof import('../sentry');
    jest.isolateModules(() => { mod = require('../sentry'); });
    mod.initSentry();
    mod.markAppLoaded();
    expect(SDK.init).not.toHaveBeenCalled();
    expect(SDK.appLoaded).not.toHaveBeenCalled();
  });
});

describe('what Sentry is never sent', () => {
  it('no IP address, cookies or headers: a member is only their id', () => {
    loadWithDsn().initSentry();
    expect(SDK.init.mock.calls[0][0].sendDefaultPii).toBe(false);
  });

  it("no member's words: the touch recorder, which reads accessibility labels, is never mounted", () => {
    // Sentry.wrap and TouchEventBoundary record the label of what was touched,
    // and a lounge message's label is the message.
    const root = path.join(__dirname, '..', '..', '..');
    const offenders: string[] = [];
    let scanned = 0;
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(e.name)) {
          const src = fs.readFileSync(p, 'utf8');
          scanned++;
          if (/Sentry\.wrap\(|TouchEventBoundary/.test(src)) offenders.push(path.relative(root, p));
        }
      }
    };
    walk(path.join(root, 'app'));
    walk(path.join(root, 'src'));
    expect(scanned).toBeGreaterThan(300); // the app was read, so none found means none
    expect(offenders).toEqual([]);
  });
});
