/**
 * A script naming a new address on each call is still one caller; no caller is ever paced as the
 * whole house; and a handle's guesses are counted where they come from (review round 14).
 * ─────────────────────────────────────────────────────────────────────────────
 * The handle sign-in, the TMDB proxy and the feed reader each paced a caller by the FIRST entry of
 * X-Forwarded-For. The caller writes that entry: the platform keeps it and adds the real address
 * after it. So a script naming a new address each call guessed any member's password without end
 * and was never held by the proxy or the reader. Now each reads only the address the platform vouches
 * for (_shared/callerAddress.js: Cloudflare's CF-Connecting-IP; an IPv6 caller by its /64), and with
 * none paces no address at all, never one bucket every caller shares; each answer names the source it
 * read (x-rh-caller-source), never the address. The sign-in asks the house to count each attempt per
 * door and in the member's shared pail before it tries a password, gives back an attempt the house
 * could not answer, and hands the phone its key after the right password.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { stripComments } from '@/test-utils/readCode';
import { callerAddress as webCaller, paceKey as webPace } from '../../../../supabase/functions/_shared/callerAddress.js';
import { callerAddress as mobileCaller, paceKey as mobilePace } from '../../../supabase/functions/_shared/callerAddress.js';

const REPO = join(__dirname, '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (rel: string) => stripComments(read(rel), rel);

/** Headers as a request carries them: names any case, a missing one null. */
const headers = (h: Record<string, string>) => {
  const lower = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower.get(name.toLowerCase()) ?? null };
};

const FUNCTIONS = [
  'supabase/functions/sign-in-with-username/index.ts',
  'supabase/functions/tmdb-proxy/index.ts',
  'mobile/supabase/functions/fetch-rss/index.ts',
];

describe('the caller is the address the platform vouches for, or none', () => {
  for (const [tree, callerAddress, paceKey] of [['the web tree', webCaller, webPace], ['the mobile tree', mobileCaller, mobilePace]] as const) {
    describe(tree, () => {
      it('Cloudflare\'s own CF-Connecting-IP is the caller, whatever X-Forwarded-For says', () => {
        expect(callerAddress(headers({ 'CF-Connecting-IP': '203.0.113.60', 'x-forwarded-for': '192.0.2.1, 198.51.100.2' })))
          .toEqual({ address: '203.0.113.60', source: 'cf', written: '192.0.2.1' });
      });

      it('a new address written on every call is still the one caller', () => {
        const seen = new Set(Array.from({ length: 25 }, (_, i) =>
          paceKey(callerAddress(headers({ 'cf-connecting-ip': '203.0.113.50', 'x-forwarded-for': `192.0.2.${i + 1}` })).address)));
        expect([...seen]).toEqual(['203.0.113.50']);
      });

      it('with no vouched address, no entry of X-Forwarded-For is ever taken as the caller: none, never a bucket all share', () => {
        expect(callerAddress(headers({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }))).toEqual({ address: null, source: 'xff', written: '198.51.100.7' });
        expect(callerAddress(headers({ 'x-forwarded-for': '10.0.0.1' })).address).toBeNull();
        expect(callerAddress(headers({}))).toEqual({ address: null, source: 'none', written: null });
        expect(paceKey(null)).toBeNull();
      });

      it('nothing that is not an address becomes one', () => {
        expect(callerAddress(headers({ 'cf-connecting-ip': 'not an address', 'x-forwarded-for': '<script>' }))).toEqual({ address: null, source: 'xff', written: null });
        expect(callerAddress(headers({ 'cf-connecting-ip': '1'.repeat(46) })).address).toBeNull();
        for (const bad of ['999.1.1.1', '1.2.3', '1::2::3', '2001:db8:1:2:3:4:5:6:7', 'fe80::1%eth0', '::ffff:999.1.1.1']) {
          expect([bad, paceKey(bad)]).toEqual([bad, null]);
        }
      });

      it('an IPv6 caller is paced by its /64, however it is written; an IPv4 one whole', () => {
        expect(paceKey('203.0.113.9')).toBe('203.0.113.9');
        expect(paceKey('::ffff:198.51.100.7')).toBe('198.51.100.7');
        expect(paceKey('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
        expect(paceKey('2001:0DB8:0001:0002:ffff::1')).toBe('2001:db8:1:2::/64');
        expect(paceKey('2001:db8:1:2::')).toBe('2001:db8:1:2::/64');
        expect(paceKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
        expect(paceKey('2001:db8:1:3::1')).not.toBe(paceKey('2001:db8:1:2::1'));
      });
    });
  }

  it('the two folders hold the same file, each deployed beside its own functions', () => {
    expect(read('mobile/supabase/functions/_shared/callerAddress.js')).toBe(read('supabase/functions/_shared/callerAddress.js'));
  });

  it('every function that paces by address asks callerAddress and paces only a vouched one, and none reads X-Forwarded-For itself', () => {
    for (const rel of FUNCTIONS) {
      const text = code(rel);
      expect([rel, /callerAddress\(req\.headers\)/.test(text), /paceKey\(caller\.address\)/.test(text)]).toEqual([rel, true, true]);
      expect([rel, /x-forwarded-for|cf-connecting-ip/i.test(text)]).toEqual([rel, false]);
    }
  });

  it('every answer names the source it read, never the address, and lets the website read it', () => {
    for (const rel of FUNCTIONS) {
      const text = code(rel);
      expect([rel, /'x-rh-caller-source', caller\.source|'x-rh-caller-source': caller\.source/.test(text)]).toEqual([rel, true]);
      expect([rel, /'Access-Control-Expose-Headers': '[^']*x-rh-caller-source/.test(text)]).toEqual([rel, true]);
      expect([rel, /x-rh-caller-source'?[,:]\s*caller\.(address|written)/.test(text)]).toEqual([rel, false]);
    }
  });

  it('the proxy and the reader pace no address when none is vouched', () => {
    expect(code('supabase/functions/tmdb-proxy/index.ts')).toMatch(/const verdict = door \? admit\(\{ address: door, now: Date\.now\(\) \}\) : \{ ok: true/);
    expect(code('mobile/supabase/functions/fetch-rss/index.ts')).toMatch(/if \(door && isRateLimited\(door\)\)/);
  });
});

describe('the handle sign-in counts a handle\'s guesses at the house', () => {
  const SIGN_IN = code('supabase/functions/sign-in-with-username/index.ts');

  it('asks the count, by door and with the phone\'s key, before the handle is looked up or any password is tried', () => {
    const count = SIGN_IN.indexOf("admin.rpc('sign_in_attempt', { p_handle: lookupUsername, p_door: door, p_device: device })");
    expect(count).toBeGreaterThan(0);
    expect(SIGN_IN.indexOf("admin.rpc('get_email_by_username'")).toBeGreaterThan(count);
    expect(SIGN_IN.indexOf('/auth/v1/token?grant_type=password')).toBeGreaterThan(count);
    expect(SIGN_IN).toMatch(/if \(door && throttled\(door\)\)/);
  });

  it('an attempt held back is told as that, from where and for how long, its password never tried', () => {
    expect(SIGN_IN).toMatch(/if \(rest\.wait > 0\) \{/);
    expect(SIGN_IN).toMatch(/paused: 'handle', from, retry_after: rest\.wait/);
    expect(SIGN_IN).toMatch(/\{ 'Retry-After': String\(rest\.wait\) \}/);
  });

  it('a count that could not be asked is the house\'s failure: never a password tried uncounted', () => {
    expect(SIGN_IN).toMatch(/if \(restError \|\| typeof rest\?\.wait !== 'number'\) \{[^}]*return json\(UNAVAILABLE, 503\)/);
  });

  it('every answer the house or Auth could not give is given back, never counted', () => {
    const unansweredAt = [...SIGN_IN.matchAll(/return json\(UNAVAILABLE, 503\)|return json\(TOO_MANY, 429\)/g)].map((m) => m.index ?? 0);
    const counted = SIGN_IN.indexOf('counted = {');
    const after = unansweredAt.filter((at) => at > counted);
    expect(after.length).toBe(5);
    for (const at of after) expect(SIGN_IN.slice(Math.max(0, at - 60), at)).toMatch(/await unasked\(\)\s*$/);
    expect(SIGN_IN).toMatch(/catch \(err\) \{[^}]*await unasked\(\)[^}]*return json\(UNAVAILABLE, 503\)/);
  });

  it('the right password clears this door, gives the attempt back and hands the phone its key, after the session is in hand', () => {
    const cleared = SIGN_IN.indexOf("admin.rpc('sign_in_cleared'");
    expect(cleared).toBeGreaterThan(SIGN_IN.indexOf("typeof session?.access_token !== 'string'"));
    expect(cleared).toBeLessThan(SIGN_IN.indexOf('access_token: session.access_token'));
    expect(SIGN_IN).toMatch(/typeof kept === 'string' && DEVICE\.test\(kept\) \? \{ device: kept \}/);
  });

  it('Auth is told the vouched address, or the caller\'s own written one, never a hop the platform added', () => {
    expect(SIGN_IN).toMatch(/const forAuth = caller\.address \?\? caller\.written/);
    expect(SIGN_IN).toMatch(/'Sb-Forwarded-For': forAuth/);
  });
});

/**
 * The sign-in run as deployed: its own source, transpiled, its imports answered here (the house's
 * rpc, Auth's token door), callerAddress the real file. It goes to production before round 14's
 * train, so first against a house with no count at all: PostgREST answers a function it does not
 * have as supabase-js hands it back, 404 with code PGRST202.
 */
type RpcAnswer = { data?: unknown; error?: { code?: string; message?: string } | null } | 'throws';
type Rpc = (name: string, args: Record<string, unknown>) => RpcAnswer;

const MEMBER = { handle: 'orson', email: 'orson@example.com', password: 'rosebud-1941' };
const NOT_THERE = (name: string) => ({
  error: { code: 'PGRST202', message: `Could not find the function public.${name}(...) in the schema cache` },
});
/** The house before round 14's train: the handle resolves; none of the count's functions exist. */
const BEFORE_THE_TRAIN: Rpc = (name) =>
  name === 'get_email_by_username' ? { data: MEMBER.email } : NOT_THERE(name);
const KEY = 'ab'.repeat(32);
/** The house after it: the count lets the attempt through, counted at the door and in the pail. */
const AFTER_THE_TRAIN: Rpc = (name) => {
  if (name === 'get_email_by_username') return { data: MEMBER.email };
  if (name === 'sign_in_attempt') return { data: { wait: 0, door: true, pail: true } };
  if (name === 'sign_in_cleared') return { data: KEY };
  return { data: null };
};

class Answer {
  status: number;
  headers: Map<string, string>;
  body: string;
  constructor(body: string, init?: { status?: number; headers?: Record<string, string> }) {
    this.body = body;
    this.status = init?.status ?? 200;
    this.headers = new Map(Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  }
}

function signInFunction(rpc: Rpc, auth: (password: string) => number = (p) => (p === MEMBER.password ? 200 : 400)) {
  const ts = jest.requireActual('typescript') as typeof import('typescript');
  const js = ts.transpileModule(read('supabase/functions/sign-in-with-username/index.ts'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  let handler: ((req: unknown) => Promise<Answer>) | null = null;
  const asked: { name: string; args: Record<string, unknown> }[] = [];
  const authSaw: { password: string; forwarded: string | null }[] = [];
  const modules: [RegExp, unknown][] = [
    [/^https:\/\/deno\.land\/std@[^/]+\/http\/server\.ts$/, { serve: (h: typeof handler) => { handler = h; } }],
    [/^https:\/\/esm\.sh\/@supabase\/supabase-js@2$/, {
      createClient: () => ({
        rpc: async (name: string, args: Record<string, unknown>) => {
          asked.push({ name, args });
          const answer = rpc(name, args);
          if (answer === 'throws') throw new TypeError('fetch failed');
          return { data: null, error: null, ...answer };
        },
      }),
    }],
    [/^\.\.\/_shared\/callerAddress\.js$/, jest.requireActual(join(REPO, 'supabase/functions/_shared/callerAddress.js'))],
  ];
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://house.example', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_house' }),
  };
  const fetchAuth = async (_url: string, init: { headers: Record<string, string>; body: string }) => {
    const { password } = JSON.parse(init.body);
    authSaw.push({ password, forwarded: init.headers['Sb-Forwarded-For'] ?? null });
    const status = auth(password);
    return { status, ok: status >= 200 && status < 300, json: async () => ({ access_token: 'access', refresh_token: 'refresh' }) };
  };
  new Function('require', 'exports', 'Deno', 'fetch', 'Response', 'AbortSignal', 'crypto', 'console', js)(
    (id: string) => {
      const found = modules.find(([pattern]) => pattern.test(id));
      if (!found) throw new Error(`the sign-in imports what this test does not answer: ${id}`);
      return found[1];
    },
    {},
    { env: { get: (k: string) => env[k] } },
    fetchAuth,
    Answer,
    { timeout: () => undefined },
    { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
    { error: () => {}, log: () => {} },
  );
  const call = async (body: Record<string, unknown>, from: Record<string, string>) => {
    const res = await handler!({ method: 'POST', headers: headers(from), json: async () => body });
    return { status: res.status, source: res.headers.get('x-rh-caller-source'), json: JSON.parse(res.body) };
  };
  return { call, asked, authSaw };
}

describe('the handle sign-in, deployed before round 14\'s train, paces by the vouched address alone and signs in as before', () => {
  it('a caller writing a new X-Forwarded-For on each attempt is still held by its vouched address, at the old pace (20 a minute)', async () => {
    const fn = signInFunction(BEFORE_THE_TRAIN);
    const tries = [];
    for (let i = 0; i < 21; i++) {
      tries.push(await fn.call({ username: MEMBER.handle, password: `guess-${i}` }, { 'cf-connecting-ip': '203.0.113.60', 'x-forwarded-for': `192.0.2.${i + 1}` }));
    }
    expect(tries.slice(0, 20).map((t) => t.status)).toEqual(Array(20).fill(401));
    expect(tries[20]?.status).toBe(429);
    expect(tries[20]?.json.paused).toBeUndefined();
    expect(tries.every((t) => t.source === 'cf')).toBe(true);
    expect(fn.authSaw.map((a) => a.forwarded)).toEqual(Array(20).fill('203.0.113.60'));
    // Another vouched address is its own caller; nothing was counted or given back at the house.
    expect((await fn.call({ username: MEMBER.handle, password: 'guess' }, { 'cf-connecting-ip': '203.0.113.61', 'x-forwarded-for': '192.0.2.1' })).status).toBe(401);
    expect(fn.asked.filter((a) => a.name !== 'sign_in_attempt' && a.name !== 'get_email_by_username')).toEqual([]);
  });

  it('an IPv6 caller is held by its /64, whatever address in it it calls from', async () => {
    const fn = signInFunction(BEFORE_THE_TRAIN);
    const statuses = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await fn.call({ username: MEMBER.handle, password: `guess-${i}` }, { 'cf-connecting-ip': `2001:db8:1:2::${(i + 1).toString(16)}` })).status);
    }
    expect(statuses).toEqual([...Array(20).fill(401), 429]);
  });

  it('the right password signs in, no key handed, nothing to clear or give back', async () => {
    const fn = signInFunction(BEFORE_THE_TRAIN);
    const right = await fn.call({ username: ` ${MEMBER.handle.toUpperCase()} `, password: MEMBER.password, device: 'cd'.repeat(32) }, { 'cf-connecting-ip': '203.0.113.62' });
    expect(right).toEqual({ status: 200, source: 'cf', json: { access_token: 'access', refresh_token: 'refresh' } });
    expect(fn.asked.map((a) => a.name)).toEqual(['sign_in_attempt', 'get_email_by_username']);
  });

  it('with no vouched address, no pace by address at all: never one bucket every caller shares', async () => {
    const fn = signInFunction(BEFORE_THE_TRAIN);
    const tries = [];
    for (let i = 0; i < 25; i++) tries.push(await fn.call({ username: MEMBER.handle, password: `guess-${i}` }, { 'x-forwarded-for': '192.0.2.250' }));
    expect(tries.map((t) => `${t.status}:${t.source}`)).toEqual(Array(25).fill('401:xff'));
    const right = await fn.call({ username: MEMBER.handle, password: MEMBER.password }, {});
    expect([right.status, right.source]).toEqual([200, 'none']);
  });

  it('only a function the house does not have is that: every other failure to ask the count is 503, no password tried', async () => {
    const from = { 'cf-connecting-ip': '203.0.113.63' };
    const missing = signInFunction(BEFORE_THE_TRAIN);
    expect((await missing.call({ username: MEMBER.handle, password: MEMBER.password }, from)).status).toBe(200);
    const failures: [string, RpcAnswer][] = [
      ['refused to the function\'s key', { error: { code: '42501', message: 'permission denied for function sign_in_attempt' } }],
      ['the key refused at the gateway', { error: { code: 'PGRST301', message: 'JWSError' } }],
      ['the house unreachable', { error: { code: '', message: 'TypeError: fetch failed' } }],
      ['past its time limit', { error: { code: '57014', message: 'canceling statement due to statement timeout' } }],
      ['a 404 with no body (no error, no data)', { data: null }],
      ['an answer without a wait', { data: { door: true } }],
      ['a throw', 'throws'],
    ];
    for (const [what, answer] of failures) {
      const fn = signInFunction((name, args) => (name === 'sign_in_attempt' ? answer : BEFORE_THE_TRAIN(name, args)));
      const r = await fn.call({ username: MEMBER.handle, password: MEMBER.password }, from);
      expect([what, r.status, r.json]).toEqual([what, 503, { error: 'Sign-in is unavailable right now. Please try again.' }]);
      expect([what, fn.authSaw.length, fn.asked.map((a) => a.name)]).toEqual([what, 0, ['sign_in_attempt']]);
    }
  });
});

describe('the handle sign-in after round 14\'s train counts at the house, unchanged', () => {
  const from = { 'cf-connecting-ip': '203.0.113.70', 'x-forwarded-for': '192.0.2.9' };

  it('the right password is counted at the vouched door, cleared, and the phone handed its key', async () => {
    const fn = signInFunction(AFTER_THE_TRAIN);
    const right = await fn.call({ username: MEMBER.handle, password: MEMBER.password }, from);
    expect(right).toEqual({ status: 200, source: 'cf', json: { access_token: 'access', refresh_token: 'refresh', device: KEY } });
    expect(fn.asked).toEqual([
      { name: 'sign_in_attempt', args: { p_handle: 'orson', p_door: '203.0.113.70', p_device: null } },
      { name: 'get_email_by_username', args: { lookup_username: 'orson' } },
      { name: 'sign_in_cleared', args: { p_handle: 'orson', p_door: '203.0.113.70', p_pail: true, p_device: null } },
    ]);
  });

  it('an attempt the house holds back is said as that, its password never tried', async () => {
    const fn = signInFunction((name, args) => (name === 'sign_in_attempt' ? { data: { wait: 120, from: 'here' } } : AFTER_THE_TRAIN(name, args)));
    const held = await fn.call({ username: MEMBER.handle, password: MEMBER.password }, from);
    expect([held.status, held.json.paused, held.json.from, held.json.retry_after]).toEqual([429, 'handle', 'here', 120]);
    expect(fn.authSaw).toEqual([]);
  });

  it('an attempt Auth could not answer is given back; sign_in_cleared failing still signs in, no key handed', async () => {
    const down = signInFunction(AFTER_THE_TRAIN, () => 500);
    expect((await down.call({ username: MEMBER.handle, password: MEMBER.password }, from)).status).toBe(503);
    expect(down.asked.at(-1)).toEqual({ name: 'sign_in_unasked', args: { p_handle: 'orson', p_door: '203.0.113.70', p_pail: true } });
    const noClear = signInFunction((name, args) => (name === 'sign_in_cleared' ? NOT_THERE(name) : AFTER_THE_TRAIN(name, args)));
    expect((await noClear.call({ username: MEMBER.handle, password: MEMBER.password }, from)).json).toEqual({ access_token: 'access', refresh_token: 'refresh' });
  });
});
