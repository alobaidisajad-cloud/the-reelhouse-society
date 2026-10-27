/**
 * Nothing a member wrote, and no email, handle or member id, leaves the phone in a report (P4.44).
 *
 * Every event, breadcrumb and trace passes sentryScrub on its way out (sentry.ts's beforeSend,
 * beforeBreadcrumb and beforeSendTransaction). Each case here plants an essay, an email and a
 * handle where they arrived before (an exception's message, a check failure's row, extra, tags,
 * contexts, the user, a request address, a breadcrumb, a native http breadcrumb, a trace's spans,
 * an unlisted key) and finds none of it in what would be sent. The logger forwards its leading line
 * alone, and the member is not named.
 */
import { scrubBreadcrumb, scrubEvent, cutUrl } from '../sentryScrub';

const ESSAY = 'The swamp at night is where Murnau keeps his grief';
const EMAIL = 'ana.member@example.com';
const HANDLE = 'nitrate_ana';
const MEMBER = '77777777-7777-4777-8777-777777777777';
const leaks = (sent: unknown) => {
  const text = JSON.stringify(sent);
  return [ESSAY, EMAIL, HANDLE, MEMBER].filter((w) => text.includes(w));
};

describe('an event', () => {
  it('carries none of it, wherever it was put', () => {
    const sent = scrubEvent({
      user: { id: MEMBER, username: HANDLE, email: EMAIL },
      message: `[socialSlice] follow failed for ${EMAIL}`,
      exception: { values: [
        { type: 'PostgrestError', value: `new row for relation "dispatch_comments" violates check constraint "body_len" Failing row contains (${ESSAY}, ${HANDLE}).` },
      ] },
      extra: { scope: 'socialSlice', targetUsername: HANDLE, userId: MEMBER, logId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', body: ESSAY, __serialized__: { details: ESSAY } },
      tags: { host: 'abc.supabase.co', path: '/rest/v1/profiles', who: HANDLE, 'event.origin': 'javascript' },
      contexts: { device: { model: 'iPhone' }, route: { name: 'member/[handle]', params: { handle: HANDLE } }, member: { email: EMAIL } },
      request: { url: `https://abc.supabase.co/rest/v1/profiles?username=eq.${HANDLE}`, query_string: `username=eq.${HANDLE}` },
    });
    expect(leaks(sent)).toEqual([]);
    // What may go, goes: the code's own label, a content id, the house's host and path, the device.
    expect(sent.extra).toEqual({ scope: 'socialSlice', logId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' });
    expect(sent.tags).toEqual({ host: 'abc.supabase.co', path: '/rest/v1/profiles', 'event.origin': 'javascript' });
    expect(sent.contexts).toEqual({ device: { model: 'iPhone' }, route: { name: 'member/[handle]' } });
    expect(sent.request).toEqual({ url: 'https://abc.supabase.co/rest/v1/profiles' });
    expect(sent.exception!.values![0]!.value).toMatch(/violates check constraint "body_len" Failing row contains \[cut\]$/);
  });

  it('a short handle under a key not on the list is dropped, in extra, tags and contexts', () => {
    const sent = scrubEvent({ extra: { h: 'ana' }, tags: { h: 'ana' }, contexts: { h: { v: 'ana' } } });
    expect([sent.extra, sent.tags, sent.contexts]).toEqual([{}, {}, {}]);
  });

  it('a listed key with a value not of its type is dropped too (a label that is a sentence, an id that is an email)', () => {
    const sent = scrubEvent({ extra: { scope: `follow ${HANDLE} failed`, logId: EMAIL, pages: -1 } });
    expect(sent.extra).toEqual({});
  });

  it('a native http breadcrumb merged into the event is cut', () => {
    const sent = scrubEvent({ breadcrumbs: [
      { type: 'http', category: 'http', data: { url: `https://abc.supabase.co/rest/v1/profiles?select=id&username=eq.${HANDLE}`, method: 'GET', status_code: 200 } },
    ] });
    expect(leaks(sent)).toEqual([]);
    expect(sent.breadcrumbs![0]!.data).toEqual({ url: 'https://abc.supabase.co/rest/v1/profiles', method: 'GET', status_code: 200 });
  });
});

describe('a breadcrumb', () => {
  it('a search typed into a PostgREST filter is cut from its address', () => {
    const crumb = scrubBreadcrumb({ category: 'fetch', data: { url: `https://abc.supabase.co/rest/v1/profiles?username=ilike.*${HANDLE}*`, 'http.query': `username=ilike.*${HANDLE}*` } });
    expect(leaks(crumb)).toEqual([]);
  });

  it('a console line keeps that it was written, never its words', () => {
    const crumb = scrubBreadcrumb({ category: 'console', level: 'warning', message: `${ESSAY} ${EMAIL}`, data: { arguments: [ESSAY] } });
    expect(crumb).toEqual({ category: 'console', level: 'warning', message: '[console]' });
  });
});

describe('a trace', () => {
  it('opening a member page by handle and running a search: every address cut', () => {
    const sent = scrubEvent({ spans: [
      { description: `GET https://abc.supabase.co/rest/v1/profiles?username=eq.${HANDLE}`, data: { url: `https://abc.supabase.co/rest/v1/profiles?username=eq.${HANDLE}`, 'http.query': `username=eq.${HANDLE}` } },
      { description: 'POST https://abc.supabase.co/functions/v1/tmdb-proxy', data: { 'url.full': `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(ESSAY)}` } },
    ] });
    expect(leaks(sent)).toEqual([]);
    expect(sent.spans![0]!.description).toBe('GET https://abc.supabase.co/rest/v1/profiles');
  });

  it('an address with no query is kept as it is', () => {
    expect(cutUrl('https://abc.supabase.co/rest/v1/films')).toBe('https://abc.supabase.co/rest/v1/films');
  });
});

describe('the reporting itself', () => {
  const Sentry = jest.requireMock('@sentry/react-native') as Record<string, jest.Mock>;
  let mod: typeof import('../sentry');
  let logger: typeof import('../../utils/logger').logger;

  beforeAll(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://key@o0.ingest.sentry.io/0';
    jest.isolateModules(() => {
      mod = require('../sentry');
      logger = require('../../utils/logger').logger;
    });
  });
  afterAll(() => { delete process.env.EXPO_PUBLIC_SENTRY_DSN; });
  beforeEach(() => jest.clearAllMocks());

  it('hands every event, breadcrumb and trace through the scrub, and keeps no native request record', () => {
    mod.initSentry();
    const options = Sentry.init!.mock.calls[0]![0] as {
      beforeSend: (e: object) => object | null; beforeBreadcrumb: (b: object) => object | null;
      beforeSendTransaction: (e: object) => object | null; enableNetworkBreadcrumbs: boolean;
    };
    expect(options.enableNetworkBreadcrumbs).toBe(false);
    expect(leaks(options.beforeSend({ user: { id: MEMBER }, extra: { body: ESSAY } }))).toEqual([]);
    expect(leaks(options.beforeBreadcrumb({ category: 'console', message: EMAIL }))).toEqual([]);
    const kept = options.beforeSendTransaction({ transaction: 'member/[handle]', spans: [{ description: `GET https://h/rest/v1/profiles?username=eq.${HANDLE}` }] });
    expect(kept === null || leaks(kept).length === 0).toBe(true);
  });

  it('each auth refusal is one report, tagged by its kind alone, and the tag survives the allow-list', () => {
    const tags: [string, string][] = [];
    Sentry.withScope!.mockImplementation((cb: (s: object) => void) => cb({ setLevel: () => {}, setExtras: () => {}, setTag: (k: string, v: string) => tags.push([k, v]) }));
    for (const kind of ['sign_in', 'refresh', 'code'] as const) mod.captureAuthRefusal(kind);
    expect(Sentry.captureMessage!.mock.calls).toEqual([['[auth] refused'], ['[auth] refused'], ['[auth] refused']]);
    expect(tags).toEqual([['auth_refused', 'sign_in'], ['auth_refused', 'refresh'], ['auth_refused', 'code']]);
    expect(scrubEvent({ tags: { auth_refused: 'code' } }).tags).toEqual({ auth_refused: 'code' });
    expect(scrubEvent({ tags: { auth_refused: HANDLE } }).tags).toEqual({});
  });

  it('a session ended without the member\'s hand is reported as a refused refresh', async () => {
    const { answerAuthEvent } = require('../../stores/authEvents') as typeof import('../../stores/authEvents');
    const { useAuthStore } = require('../../stores/auth') as typeof import('../../stores/auth');
    const logout = jest.fn(async () => {});
    useAuthStore.setState({ isAuthenticated: true, logout } as never);
    const refused = jest.spyOn(require('../sentry'), 'captureAuthRefusal');
    await answerAuthEvent('SIGNED_OUT', false);
    expect([refused.mock.calls, logout.mock.calls.length]).toEqual([[['refresh']], 1]);
    refused.mockRestore();
  });

  it('never names the member: no user, no id', () => {
    mod.setSentryUser({ id: MEMBER, username: HANDLE, role: 'archivist' });
    expect(Sentry.setUser!.mock.calls).toEqual([[null]]);
    expect(leaks(Sentry.setTag!.mock.calls)).toEqual([]);
  });

  it('the logger forwards its leading line alone, never the object after it', () => {
    const extras: unknown[] = [];
    Sentry.withScope!.mockImplementation((cb: (s: object) => void) => cb({ setExtras: (x: unknown) => extras.push(x), setLevel: () => {}, setTag: () => {} }));
    const was = (global as { __DEV__?: boolean }).__DEV__;
    (global as { __DEV__?: boolean }).__DEV__ = false;
    try {
      logger.warn('[socialSlice] follow failed', { username: HANDLE, email: EMAIL, body: ESSAY });
      logger.error('[dispatch] file failed', { body: ESSAY });
    } finally {
      (global as { __DEV__?: boolean }).__DEV__ = was;
    }
    const sent = [...Sentry.captureMessage!.mock.calls, ...Sentry.captureException!.mock.calls, ...extras];
    expect(sent.length).toBeGreaterThan(0);
    expect(leaks(sent)).toEqual([]);
  });
});
