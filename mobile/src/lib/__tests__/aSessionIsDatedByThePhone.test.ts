/**
 * A session is dated by the phone that holds it (WORKLIST P4.32).
 *
 * The server dates a token by its own clock and supabase-js weighs that date against the phone's:
 * a phone three hours ahead read every new token as spent and renewed it at every request, and
 * one three hours behind kept using a token the server had refused an hour in. First the rule, on
 * the store itself; then the app's real client, signed in by address and by username, against a
 * stand-in server whose clock is not the phone's.
 */
import { authSessionStorage, datedByThePhone, trustedByThePhone } from '../authSessionStorage';
import { supabase } from '@/src/lib/supabase';

// The real client: its own sign-in, renewal and reads, over the network this test plays.
jest.unmock('@supabase/supabase-js');

const mockDisk = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockDisk.get(k),
    set: (k: string, v: string) => { mockDisk.set(k, String(v)); },
    delete: (k: string) => { mockDisk.delete(k); },
    getAllKeys: () => [...mockDisk.keys()],
    contains: (k: string) => mockDisk.has(k),
  },
  setSensitive: (k: string, v: string) => { mockDisk.set(k, v); },
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  storageReady: () => Promise.resolve(),
}));

const KEY = (supabase.auth as unknown as { storageKey: string }).storageKey;
const ME = '11111111-1111-4111-8111-111111111111';
const USER = { id: ME, aud: 'authenticated', role: 'authenticated', email: 'member@example.com' };
/** The server's clock when each test begins, on a whole second. */
const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const HOUR = 3_600_000;
const MINUTE = 60_000;

/** A token as the server signs one: issued and expiring by the server's clock. */
const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenFor = (n: number, iat: number, life = 3600) =>
  `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: ME, iat, exp: iat + life, n })}.c2lnbmVk`;
const stored = (fields: Record<string, unknown>) => JSON.stringify({ refresh_token: 'r', token_type: 'bearer', user: USER, ...fields });

afterEach(() => jest.restoreAllMocks());

describe('the rule, on the store', () => {
  const now = T0 + 3 * HOUR; // the phone, three hours ahead of the server that issued the token
  const token = tokenFor(1, T0 / 1000);

  it("dates a new token by the phone's clock, its life read from the token itself", () => {
    const written = stored({ access_token: token, expires_in: 3600, expires_at: T0 / 1000 + 3600 });
    expect(JSON.parse(datedByThePhone(written, null, now)).expires_at).toBe(now / 1000 + 3600);
  });

  it('reads the life from the token, not from an expires_in that carries the server\'s date (setSession)', () => {
    const written = stored({ access_token: token, expires_in: 3600 - 3 * 3600, expires_at: T0 / 1000 + 3600 });
    expect(JSON.parse(datedByThePhone(written, null, now)).expires_at).toBe(now / 1000 + 3600);
  });

  it('keeps the date it first gave when the same token is saved again', () => {
    const first = datedByThePhone(stored({ access_token: token, expires_in: 3600 }), null, now);
    const later = datedByThePhone(stored({ access_token: token, expires_in: 3600, user: { ...USER, email: 'new@example.com' } }), first, now + 20 * MINUTE);
    expect(JSON.parse(later)).toMatchObject({ expires_at: now / 1000 + 3600, user: { email: 'new@example.com' } });
  });

  it('dates a token it cannot read by its expires_in', () => {
    const written = stored({ access_token: 'opaque', expires_in: 1800, expires_at: 1 });
    expect(JSON.parse(datedByThePhone(written, null, now)).expires_at).toBe(now / 1000 + 1800);
  });

  it('writes what is not a session as it was given', () => {
    for (const written of ['not json', 'null', '"text"', JSON.stringify({ user: USER }), stored({ access_token: 'opaque' })]) {
      expect(datedByThePhone(written, null, now)).toBe(written);
    }
  });

  it("reads a date further off than the token's whole life as due now, and a nearer one as it is", () => {
    const farther = stored({ access_token: token, expires_in: 3600, expires_at: now / 1000 + 3601 });
    expect(JSON.parse(trustedByThePhone(farther, now) ?? '').expires_at).toBe(now / 1000);
    const within = stored({ access_token: token, expires_in: 3600, expires_at: now / 1000 + 3600 });
    expect(trustedByThePhone(within, now)).toBe(within);
    expect(trustedByThePhone(null, now)).toBeNull();
  });

  it('dates through the store, and leaves a code verifier untouched', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await authSessionStorage.setItem(KEY, stored({ access_token: token, expires_in: 3600, expires_at: T0 / 1000 + 3600 }));
    expect(JSON.parse(mockDisk.get(KEY) ?? '').expires_at).toBe(now / 1000 + 3600);
    const farther = stored({ access_token: token, expires_in: 3600, expires_at: now / 1000 + 9 * 3600 });
    mockDisk.set(KEY, farther);
    expect(JSON.parse((await authSessionStorage.getItem(KEY)) ?? '').expires_at).toBe(now / 1000);
    await authSessionStorage.setItem(`${KEY}-code-verifier`, '"v"');
    expect(mockDisk.get(`${KEY}-code-verifier`)).toBe('"v"');
    mockDisk.set(`${KEY}-code-verifier`, farther);
    await expect(authSessionStorage.getItem(`${KEY}-code-verifier`)).resolves.toBe(farther);
  });
});

describe("the app's client, against a server whose clock is not the phone's", () => {
  /** Time gone by since the test began, on both clocks. */
  let elapsed = 0;
  /** Each token the server issued, and when it ends by the server's clock (seconds). */
  let issued = new Map<string, number>();
  let refreshes = 0;
  let answered: number[] = [];

  const serverNowS = () => Math.floor((T0 + elapsed) / 1000);
  const grant = () => {
    const iat = serverNowS();
    const access_token = tokenFor(issued.size + 1, iat);
    issued.set(access_token, iat + 3600);
    return { access_token, refresh_token: `r${issued.size}`, token_type: 'bearer', expires_in: 3600, expires_at: iat + 3600, user: USER };
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  /** The phone's clock is `skew` from the server's; the network answers as the house would. */
  const phoneAt = (skew: number) => {
    jest.spyOn(Date, 'now').mockImplementation(() => T0 + skew + elapsed);
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const bearer = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /, '') ?? '';
      const valid = (issued.get(bearer) ?? 0) > serverNowS();
      if (url.pathname.endsWith('/auth/v1/token')) {
        if (url.searchParams.get('grant_type') === 'refresh_token') refreshes += 1;
        return json(grant());
      }
      if (url.pathname.endsWith('/auth/v1/user')) return valid ? json(USER) : json({ msg: 'JWT expired' }, 401);
      return valid ? json([]) : json({ message: 'JWT expired', code: 'PGRST301' }, 401);
    });
  };
  /** A read every `every` for `span`, each answer's status kept. */
  const readEvery = async (every: number, span: number) => {
    for (let t = every; t <= span; t += every) {
      elapsed += every;
      const { status } = await supabase.from('films').select('id');
      answered.push(status);
    }
  };

  // Off a browser, the client renews on a ticker of its own, which weighs the same dates; stood
  // still here, so each renewal counted is one a request asked for.
  beforeAll(async () => {
    mockDisk.clear();
    await supabase.auth.getSession();
    await supabase.auth.stopAutoRefresh();
  });
  afterAll(() => supabase.auth.stopAutoRefresh());

  beforeEach(() => {
    mockDisk.clear();
    elapsed = 0;
    issued = new Map();
    refreshes = 0;
    answered = [];
  });

  it('a phone three hours ahead keeps a token its hour, signed in by address', async () => {
    phoneAt(3 * HOUR);
    await supabase.auth.signInWithPassword({ email: USER.email, password: 'pw' });
    await readEvery(MINUTE, 10 * MINUTE);
    expect({ refreshes, answered }).toEqual({ refreshes: 0, answered: Array(10).fill(200) });
  });

  it('a phone three hours behind renews a token as its hour ends, signed in by address', async () => {
    phoneAt(-3 * HOUR);
    await supabase.auth.signInWithPassword({ email: USER.email, password: 'pw' });
    await readEvery(5 * MINUTE, 2 * HOUR);
    expect({ refreshes, answered }).toEqual({ refreshes: 2, answered: Array(24).fill(200) });
  });

  it('a phone three hours behind renews a token as its hour ends, signed in by username', async () => {
    phoneAt(-3 * HOUR);
    const { access_token, refresh_token } = grant();
    await supabase.auth.setSession({ access_token, refresh_token });
    await readEvery(5 * MINUTE, 2 * HOUR);
    expect({ refreshes, answered }).toEqual({ refreshes: 2, answered: Array(24).fill(200) });
  });

  it('a phone three hours ahead renews a username sign-in once, then keeps it its hour', async () => {
    phoneAt(3 * HOUR);
    const { access_token, refresh_token } = grant();
    await supabase.auth.setSession({ access_token, refresh_token });
    await readEvery(MINUTE, 10 * MINUTE);
    expect({ refreshes, answered }).toEqual({ refreshes: 1, answered: Array(10).fill(200) });
  });

  it('a session an earlier build kept by the server\'s date is renewed once on a phone behind', async () => {
    phoneAt(-3 * HOUR);
    const kept = grant();
    mockDisk.set(KEY, JSON.stringify(kept));
    await readEvery(5 * MINUTE, 30 * MINUTE);
    expect({ refreshes, answered }).toEqual({ refreshes: 1, answered: Array(6).fill(200) });
  });
});
