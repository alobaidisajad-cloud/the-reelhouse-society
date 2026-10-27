/**
 * whatSentryKeeps.test.ts — the phones' measures Sentry is given: every scroll,
 * every opening of a main screen, and the rest at OTHER_RATE.
 *
 * A screen's transaction starts as "Route Change" and is named for its route
 * only after it was sampled, so the sampler keeps every one and
 * keepTransaction thins the others once their route is known. Each name in
 * MAIN_ROUTES must be a route the app has, so a renamed screen fails here.
 */
import { basename, join, relative } from 'path';
import { MOBILE } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

type SentryModule = typeof import('@/src/lib/sentry');

/** The module as a production build loads it, with a DSN. */
function production(): { m: SentryModule; init: jest.Mock } {
  let m!: SentryModule;
  let init!: jest.Mock;
  const dev = (global as { __DEV__?: boolean }).__DEV__;
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://key@o0.ingest.sentry.io/0';
  (global as { __DEV__?: boolean }).__DEV__ = false;
  try {
    jest.isolateModules(() => {
      init = require('@sentry/react-native').init;
      m = require('@/src/lib/sentry');
    });
  } finally {
    (global as { __DEV__?: boolean }).__DEV__ = dev;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  }
  return { m, init };
}

it('keeps every scroll and every screen’s opening, and samples the rest', () => {
  const { m } = production();
  expect(m.tracesSampler({ name: 'scroll reels logs' })).toBe(1);
  expect(m.tracesSampler({ name: 'Route Change', attributes: { 'sentry.op': 'navigation' } })).toBe(1);
  expect(m.tracesSampler({ name: 'Route Change' })).toBe(1);
  expect(m.tracesSampler({ name: 'App Start' })).toBe(m.OTHER_RATE);
  expect(m.tracesSampler({ name: 'scrolled' })).toBe(m.OTHER_RATE);
  expect(m.OTHER_RATE).toBe(0.2);
});

it('sends a main screen’s opening always, another’s at OTHER_RATE, and anything else as it is', () => {
  const { m } = production();
  const route = (name: string) => ({ transaction: name, contexts: { trace: { op: 'navigation' } } });
  const never = () => 0.99;
  const always = () => 0.01;
  expect(m.keepTransaction(route('reels'), never)).not.toBeNull();
  expect(m.keepTransaction(route('film/[id]'), never)).not.toBeNull();
  expect(m.keepTransaction(route('settings'), never)).toBeNull();
  expect(m.keepTransaction(route('settings'), always)).not.toBeNull();
  const scroll = { transaction: 'scroll settings', contexts: { trace: { op: 'ui.scroll' } } };
  expect(m.keepTransaction(scroll, never)).toBe(scroll);
});

it('is what Sentry is started with: the sampler, no flat rate, and the thinning before sending', () => {
  const { m, init } = production();
  m.initSentry();
  const options = init.mock.calls.at(-1)[0];
  expect(options.tracesSampler).toBe(m.tracesSampler);
  expect(options).not.toHaveProperty('tracesSampleRate');
  expect(options.enableNativeFramesTracking).toBe(true);
  const other = { transaction: 'settings', contexts: { trace: { op: 'navigation' } } };
  const kept = Array.from({ length: 400 }, () => options.beforeSendTransaction(other)).filter(Boolean).length;
  // About one in five, never all and never none.
  expect(kept).toBeGreaterThan(40);
  expect(kept).toBeLessThan(120);
});

it('drops a phone with no network and a member\'s own cancel, and keeps a request past its deadline (P4.6)', () => {
  const { m, init } = production();
  m.initSentry();
  const options = init.mock.calls.at(-1)[0];
  const event = (type: string, value: string) => ({ exception: { values: [{ type, value }] } });
  expect(options.beforeSend(event('TypeError', 'Network request failed'))).toBeNull();
  expect(options.beforeSend(event('AbortError', 'Aborted'))).toBeNull();
  const late = event('DeadlineExceeded', 'The request timed out after 15000 ms');
  // Kept, as the allow-list hands it on (a copy: nothing in it was cut).
  expect(options.beforeSend(late)).toEqual(late);
});

/** Every route the router names, from app/'s files: folders and file, groups and the extension left out. */
function routes(): string[] {
  return universe('routes')
    .filter((p) => !p.endsWith('.d.ts') && !basename(p).startsWith('_') && !basename(p).startsWith('+'))
    .map((p) => relative(join(MOBILE, 'app'), p).replace(/\.[jt]sx?$/, '').split(/[\\/]/).filter((s) => !s.startsWith('(')).join('/'));
}

it('names only routes the app has', () => {
  const { m } = production();
  const all = routes();
  expect(all.length).toBeGreaterThan(30);
  expect(m.MAIN_ROUTES.filter((r) => !all.includes(r))).toEqual([]);
});
