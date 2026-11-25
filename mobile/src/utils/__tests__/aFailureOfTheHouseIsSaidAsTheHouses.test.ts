/**
 * Two functions run as deployed, each with what it leans on failing: the house's failure is said
 * as the house's (5xx), and the caller's own refusal stays the caller's (4xx).
 * ─────────────────────────────────────────────────────────────────────────────
 * Each function's own source is transpiled and run here, its imports answered by this test (the
 * outside's answer, Auth's answer); theHousesFailureIsTheHouses.guard.test.ts finds the shapes in
 * every function, and this shows two of them answering.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

/** A Response as the functions use it: its body, its status, and headers read and set by any case. */
class Answer {
  status: number;
  body: string;
  headers: { get: (k: string) => string | null; set: (k: string, v: string) => void };
  constructor(body: string, init?: { status?: number; headers?: Record<string, string> }) {
    this.body = body;
    this.status = init?.status ?? 200;
    const map = new Map(Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    this.headers = { get: (k) => map.get(k.toLowerCase()) ?? null, set: (k, v) => { map.set(k.toLowerCase(), v); } };
  }
}

/** A function's source, run with its imports, its environment and its fetch answered here. */
function run(rel: string, modules: [RegExp, unknown][], env: Record<string, string>, fetchStub: unknown) {
  const ts = jest.requireActual('typescript') as typeof import('typescript');
  const js = ts.transpileModule(read(rel), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  let handler: ((req: unknown) => Promise<Answer>) | null = null;
  const all: [RegExp, unknown][] = [[/^https:\/\/deno\.land\/std@[^/]+\/http\/server\.ts$/, { serve: (h: typeof handler) => { handler = h; } }], ...modules];
  new Function('require', 'exports', 'Deno', 'fetch', 'Response', 'AbortSignal', 'console', js)(
    (id: string) => {
      const found = all.find(([pattern]) => pattern.test(id));
      if (!found) throw new Error(`${rel} imports what this test does not answer: ${id}`);
      return found[1];
    },
    {},
    { env: { get: (k: string) => env[k] } },
    fetchStub,
    Answer,
    { timeout: () => undefined },
    { error: () => {}, log: () => {} },
  );
  return async (req: Record<string, unknown>) => {
    const res = await handler!({ headers: { get: () => null }, ...req });
    return { status: res.status, json: JSON.parse(res.body), cache: res.headers.get('x-cache') };
  };
}

describe('the TMDB proxy', () => {
  const proxy = (tmdbStatus: () => number) => {
    const asked: string[] = [];
    const call = run('supabase/functions/tmdb-proxy/index.ts', [
      [/^\.\/paths\.js$/, jest.requireActual(join(REPO, 'supabase/functions/tmdb-proxy/paths.js'))],
      [/^\.\/rate\.js$/, jest.requireActual(join(REPO, 'supabase/functions/tmdb-proxy/rate.js'))],
      [/^\.\.\/_shared\/callerAddress\.js$/, jest.requireActual(join(REPO, 'supabase/functions/_shared/callerAddress.js'))],
    ], { TMDB_API_KEY: 'the-house-key' }, async (url: string) => {
      asked.push(url);
      const status = tmdbStatus();
      const body = status === 200 ? { id: 603, title: 'A film' } : { status_code: 7, status_message: 'Invalid API key', success: false };
      return { status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body };
    });
    const ask = (path: string) => call({ method: 'POST', url: 'https://house.example/functions/v1/tmdb-proxy', clone: () => ({ json: async () => ({ path }) }) });
    return { ask, asked };
  };

  it('TMDB refusing the house\'s key is 503, naming the secret: never the caller\'s 401, and never kept', async () => {
    let status = 401;
    const { ask, asked } = proxy(() => status);
    const refused = await ask('/movie/603?append_to_response=credits');
    expect([refused.status, refused.json]).toEqual([503, { error: 'TMDB refused the key', need: 'TMDB_API_KEY' }]);
    status = 403;
    expect((await ask('/movie/604')).status).toBe(503);
    // Not kept: with the key mended, the same question is asked of TMDB again and answered.
    status = 200;
    const mended = await ask('/movie/603?append_to_response=credits');
    expect([mended.status, mended.cache, mended.json.title]).toEqual([200, 'MISS', 'A film']);
    expect(asked.length).toBe(3);
  });

  it('TMDB\'s own "not there" is still handed on as it is', async () => {
    const { ask } = proxy(() => 404);
    expect((await ask('/movie/605')).status).toBe(404);
  });
});

describe('the store sync', () => {
  const sync = (auth: { error?: { status?: number; name: string; message: string }; user?: { id: string } | null }) => {
    const applied: string[] = [];
    const paced: unknown[] = [];
    const call = run('mobile/supabase/functions/sync-entitlement/index.ts', [
      [/^https:\/\/esm\.sh\/@supabase\/supabase-js@2$/, {
        createClient: () => ({
          auth: { getUser: async () => ({ data: { user: auth.user ?? null }, error: auth.error ?? null }) },
          // The member's pace, asked before the store: room left here.
          rpc: async (name: string, args: unknown) => { paced.push([name, args]); return { error: null }; },
        }),
      }],
      [/^\.\.\/_shared\/storeRecord\.ts$/, {
        applyStoreRecord: async (_admin: unknown, userId: string) => {
          applied.push(userId);
          return { ok: true, storeTier: 'auteur', tier: 'auteur', seatClaimed: true, changed: true };
        },
      }],
    ], { SUPABASE_URL: 'https://house.example', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', REVENUECAT_SECRET_KEY: 'store' }, null);
    const ask = () => call({ method: 'POST', headers: { get: (k: string) => (k === 'Authorization' ? 'Bearer member' : null) } });
    return { ask, applied, paced };
  };

  it('Auth unreachable, or failing on its side, is 503: the purchase is kept and asked again, never refused as the member\'s', async () => {
    for (const error of [
      { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 },
      { name: 'AuthRetryableFetchError', message: 'Bad Gateway', status: 502 },
      { name: 'AuthUnknownError', message: 'unknown' },
    ]) {
      const { ask, applied } = sync({ error });
      const answer = await ask();
      expect([error.name, answer.status, applied]).toEqual([error.name, 503, []]);
    }
  });

  it('Auth refusing the token is 401, and a token Auth accepts is synced', async () => {
    const refused = sync({ error: { name: 'AuthApiError', message: 'invalid JWT', status: 403 } });
    expect([(await refused.ask()).status, refused.applied]).toEqual([401, []]);
    const member = sync({ user: { id: 'member-1' } });
    const answer = await member.ask();
    expect([answer.status, answer.json.tier, member.applied]).toEqual([200, 'auteur', ['member-1']]);
    expect([refused.paced, member.paced]).toEqual([[], [['a_members_call_is_paced', { p_member: 'member-1', p_kind: 'store_read' }]]]);
  });
});
