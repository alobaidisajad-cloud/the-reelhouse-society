/**
 * seed.rehearsal.test.ts — the real e2e/db/seed.mjs, against a fake local
 * Supabase that keeps the rules the seed must keep.
 *
 * The member must become able to file as a real member does. The fake answers
 * as the auth server and PostgREST do, and holds what the database holds: the
 * filing's door (may_file: an account at least 2 days old, 5 distinct films)
 * refuses a take until both are true. It records every request, so the test can
 * say which key made each one: the service role only makes the member and dates
 * their profile; every log, filing and stack is the member's own, with the
 * public key and their session.
 */
import { spawn } from 'child_process';
import { createServer, type IncomingMessage, type Server } from 'http';
import type { AddressInfo } from 'net';
import { join } from 'path';

const SEED = process.env.SEED_SCRIPT ?? join(__dirname, '..', 'db', 'seed.mjs');
const SERVICE = 'service-key';
const ANON = 'anon-key';
const TOKEN = 'member-session';
const ID = '00000000-0000-4000-8000-000000000001';

interface Asked { method: string; path: string; key: string; bearer: string; body: unknown }
interface World { asked: Asked[]; created: number; logs: { film_id: number; film_title: string; review?: string }[]; posts: Record<string, unknown>[]; stacks: string[] }

/** A fake Supabase; `datesProfiles: false` is a database that ignores the age set-up. */
function fakeSupabase(world: World, opts: { datesProfiles?: boolean } = {}): Promise<Server> {
  const body = (req: IncomingMessage) => new Promise<unknown>((res) => {
    let text = '';
    req.on('data', (c) => { text += c; });
    req.on('end', () => { try { res(text ? JSON.parse(text) : null); } catch { res(text); } });
  });
  const server = createServer(async (req, res) => {
    const url = req.url ?? '';
    const b = await body(req);
    const key = String(req.headers.apikey ?? '');
    const bearer = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    world.asked.push({ method: req.method ?? '', path: url, key, bearer, body: b });
    const send = (status: number, json: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
    const member = key === ANON && bearer === TOKEN;
    const mayFile = () => new Set(world.logs.map((l) => l.film_id)).size >= 5 && Date.now() - world.created >= 2 * 86400 * 1000;
    if (url.startsWith('/auth/v1/admin/users')) return key === SERVICE ? send(200, { id: ID }) : send(401, {});
    if (url.startsWith('/auth/v1/token')) return send(200, { access_token: TOKEN });
    if (url.startsWith('/rest/v1/profiles') && req.method === 'GET') return send(200, [{ username: 'e2e_member' }]);
    if (url.startsWith('/rest/v1/profiles') && req.method === 'PATCH') {
      if (key !== SERVICE) return send(403, { message: 'protect_privileged_profile_fields' });
      // Answered as written either way: the door, not the answer, says whether it held.
      if (opts.datesProfiles !== false) world.created = Date.parse((b as { created_at: string }).created_at);
      return send(200, [{ created_at: (b as { created_at: string }).created_at }]);
    }
    if (!member && req.method !== 'GET') return send(401, { message: 'not the member' });
    if (url === '/rest/v1/logs' && req.method === 'POST') { world.logs.push(b as World['logs'][number]); return send(201, null); }
    if (url.startsWith('/rest/v1/logs?')) return send(200, world.logs.map((l) => ({ film_id: l.film_id })));
    if (url === '/rest/v1/rpc/dispatch_door') {
      const films = new Set(world.logs.map((l) => l.film_id)).size;
      return send(200, [{ films, films_needed: 5, days: Math.floor((Date.now() - world.created) / 86400000), days_needed: 2, may_file: mayFile() }]);
    }
    if (url.startsWith('/rest/v1/dispatch_posts') && req.method === 'POST') {
      if (!mayFile()) return send(403, { code: '42501', message: 'new row violates row-level security policy for table "dispatch_posts"' });
      world.posts.push({ ...(b as object), id: 'filing-1', is_published: true });
      return send(201, [{ id: 'filing-1' }]);
    }
    if (url.startsWith('/rest/v1/dispatch_posts?id=eq.')) return send(200, world.posts.map((p) => ({ kind: p.kind, body: p.body, is_published: true })));
    if (url === '/rest/v1/rpc/save_stack') {
      const s = b as { p_id: string; p_create: boolean; p_films: unknown[] };
      if (!s.p_create || !s.p_films?.length) return send(400, { message: 'the fake wants a new stack with a film' });
      world.stacks.push(s.p_id);
      return send(200, { id: s.p_id });
    }
    if (url === '/rest/v1/rpc/get_community_feed_auth_cursor') return send(200, world.logs.filter((l) => l.review).map(() => ({ user_id: ID })));
    if (url === '/rest/v1/rpc/get_filtered_stacks_auth_cursor_v2') return send(200, world.stacks.map((id) => ({ id })));
    return send(404, { message: `the fake has no ${req.method} ${url}` });
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res(server)));
}

async function seed(opts: { datesProfiles?: boolean } = {}) {
  const world: World = { asked: [], created: Date.now(), logs: [], posts: [], stacks: [] };
  const server = await fakeSupabase(world, opts);
  const { port } = server.address() as AddressInfo;
  // No GITHUB_ENV: the rehearsal hands no password to a workflow.
  const env: NodeJS.ProcessEnv = { ...process.env, API_URL: `http://127.0.0.1:${port}`, SERVICE_ROLE_KEY: SERVICE, ANON_KEY: ANON };
  delete env['GITHUB_ENV'];
  const out = await new Promise<{ code: number | null; text: string }>((res) => {
    const child = spawn(process.execPath, [SEED], { env });
    let text = '';
    child.stdout.on('data', (d) => { text += d; });
    child.stderr.on('data', (d) => { text += d; });
    child.on('close', (code) => res({ code, text }));
  });
  await new Promise((res) => server.close(res));
  return { ...out, world };
}

jest.setTimeout(30_000);

it('makes the member able to file, then files, logs and stacks as the member, and reads each back', async () => {
  const { code, text, world } = await seed();
  expect(text).toContain('✓ e2e_member: made, signs in, reads their own profile, files, and is read back');
  expect(code).toBe(0);
  expect(world.posts.map((p) => p.kind)).toEqual(['take']);
  expect(world.stacks).toHaveLength(1);
  const films = world.logs.map((l) => l.film_id);
  expect(new Set(films).size).toBe(5);
  // No film a flow logs or names: a flow's film must still be new to the member.
  const FLOW_FILMS = [238, 240, 78, 603, 289];
  expect(films.filter((f) => FLOW_FILMS.includes(f))).toEqual([]);
  expect(world.logs.filter((l) => /^(The Godfather|Blade Runner|The Matrix|Casablanca)/.test(l.film_title))).toEqual([]);
  // The Reel shows only logs with words.
  expect(world.logs.every((l) => (l.review ?? '').length > 0)).toBe(true);
});

it('the service role only makes the member and dates their profile; every act is the member\'s own, with RLS on', async () => {
  const { world } = await seed();
  const byService = world.asked.filter((a) => a.key === SERVICE).map((a) => `${a.method} ${a.path.split('?')[0]}`);
  expect(byService).toEqual(['POST /auth/v1/admin/users', 'PATCH /rest/v1/profiles']);
  const acts = world.asked.filter((a) => a.method === 'POST' && /\/rest\/v1\/(logs|dispatch_posts|rpc\/save_stack)/.test(a.path));
  expect(acts.length).toBe(5 + 1 + 1);
  expect(acts.filter((a) => a.key !== ANON || a.bearer !== TOKEN)).toEqual([]);
  // The take is read back by a guest too: the public key, no session.
  expect(world.asked.some((a) => a.path.startsWith('/rest/v1/dispatch_posts?id=eq.') && a.bearer === ANON)).toBe(true);
});

it('says NO, by name, when the door refuses the filing — never leaving it for the Dispatch flow to find nothing', async () => {
  const { code, text, world } = await seed({ datesProfiles: false });
  expect(code).toBe(1);
  expect(text).toContain("the filing's door (may_file) refuses them: films 5/5, days 0/2");
  expect(world.posts).toEqual([]);
});
