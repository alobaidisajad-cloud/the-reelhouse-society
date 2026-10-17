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
 *
 * With E2E_SEED_WALK, the writer too: ranked by the service role, then their own
 * open Lounge (create_lounge, a ranked member's alone) and an essay in a series.
 * The fake keeps the Lounges' read as the database has it: a signed-in member's
 * alone (the "Lounges are discoverable" policy, TO authenticated), never a guest's.
 */
import { spawn } from 'child_process';
import { createServer, type IncomingMessage, type Server } from 'http';
import type { AddressInfo } from 'net';
import { join } from 'path';

const SEED = process.env.SEED_SCRIPT ?? join(__dirname, '..', 'db', 'seed.mjs');
const SERVICE = 'service-key';
const ANON = 'anon-key';
/** Each person the seed may make: their id, and the session the fake signs them in with. */
const MEMBER = { id: '00000000-0000-4000-8000-000000000001', token: 'member-session' };
const WRITER_PERSON = { id: '00000000-0000-4000-8000-000000000002', token: 'writer-session' };
const PEOPLE = { e2e_member: MEMBER, e2e_writer: WRITER_PERSON };
/** The person of a username, or no one: a name the seed was never meant to make. */
const personNamed = (name: string | undefined) => Object.entries(PEOPLE).find(([n]) => n === name)?.[1];
const TOKEN = MEMBER.token;
const WRITER = WRITER_PERSON.token;

interface Asked { method: string; path: string; key: string; bearer: string; body: unknown }
interface World {
  asked: Asked[]; created: number; logs: { user_id: string; film_id: number; film_title: string; review?: string }[];
  posts: Record<string, unknown>[]; stacks: string[]; ranked: string[]; lounges: string[];
}

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
    // Who asks: a person by their session and the public key, or no one (a guest, or the service role).
    const who = key === ANON ? Object.values(PEOPLE).find((p) => p.token === bearer) : undefined;
    const mine = () => world.logs.filter((l) => l.user_id === who?.id);
    const mayFile = () => new Set(mine().map((l) => l.film_id)).size >= 5 && Date.now() - world.created >= 2 * 86400 * 1000;
    const idIn = (path: string) => /[?&]id=eq\.([^&]+)/.exec(path)?.[1];
    if (url.startsWith('/auth/v1/admin/users')) {
      const person = personNamed((b as { user_metadata: { username: string } }).user_metadata.username);
      return key === SERVICE && person ? send(200, { id: person.id }) : send(401, {});
    }
    if (url.startsWith('/auth/v1/token')) {
      const person = personNamed((b as { email: string }).email.split('@')[0]);
      return person ? send(200, { access_token: person.token }) : send(400, { error: 'invalid_grant' });
    }
    if (url.startsWith('/rest/v1/profiles') && req.method === 'GET') {
      return send(200, Object.entries(PEOPLE).filter(([, p]) => p.id === idIn(url)).map(([username]) => ({ username })));
    }
    if (url.startsWith('/rest/v1/profiles') && req.method === 'PATCH') {
      if (key !== SERVICE) return send(403, { message: 'protect_privileged_profile_fields' });
      // Answered as written either way: the door, not the answer, says whether it held.
      if (opts.datesProfiles !== false) world.created = Date.parse((b as { created_at: string }).created_at);
      return send(200, [{ created_at: (b as { created_at: string }).created_at }]);
    }
    if (url === '/rest/v1/rpc/grant_entitlement') {
      if (key !== SERVICE) return send(403, { message: 'permission denied for function grant_entitlement' });
      const g = b as { p_user_id: string; p_tier: string };
      world.ranked.push(g.p_user_id);
      return send(200, [{ out_tier: g.p_tier }]);
    }
    if (!who && req.method !== 'GET') return send(401, { message: 'no one signed in' });
    if (url === '/rest/v1/logs' && req.method === 'POST') {
      const log = b as World['logs'][number];
      if (log.user_id !== who?.id) return send(403, { code: '42501', message: 'new row violates row-level security policy for table "logs"' });
      world.logs.push(log);
      return send(201, null);
    }
    if (url.startsWith('/rest/v1/logs?')) {
      const of = /user_id=eq\.([^&]+)/.exec(url)?.[1];
      return send(200, world.logs.filter((l) => l.user_id === of).map((l) => ({ film_id: l.film_id })));
    }
    if (url === '/rest/v1/rpc/dispatch_door') {
      const films = new Set(mine().map((l) => l.film_id)).size;
      return send(200, [{ films, films_needed: 5, days: Math.floor((Date.now() - world.created) / 86400000), days_needed: 2, may_file: mayFile() }]);
    }
    if (url.startsWith('/rest/v1/dispatch_posts') && req.method === 'POST') {
      if (!mayFile()) return send(403, { code: '42501', message: 'new row violates row-level security policy for table "dispatch_posts"' });
      const post = { ...(b as object), id: `post-${world.posts.length + 1}`, is_published: true } as Record<string, unknown>;
      world.posts.push(post);
      return send(201, [{ id: post.id, series_id: post.series_id ?? null }]);
    }
    if (url.startsWith('/rest/v1/dispatch_posts?id=eq.')) {
      return send(200, world.posts.filter((p) => p.id === idIn(url)).map((p) => ({ id: p.id, kind: p.kind, body: p.body, is_published: true })));
    }
    if (url === '/rest/v1/rpc/save_stack') {
      const s = b as { p_id: string; p_create: boolean; p_films: unknown[] };
      if (!s.p_create || !s.p_films?.length) return send(400, { message: 'the fake wants a new stack with a film' });
      world.stacks.push(s.p_id);
      return send(200, { id: s.p_id });
    }
    if (url === '/rest/v1/rpc/get_community_feed_auth_cursor') return send(200, world.logs.filter((l) => l.review).map((l) => ({ user_id: l.user_id })));
    if (url === '/rest/v1/rpc/get_filtered_stacks_auth_cursor_v2') return send(200, world.stacks.map((id) => ({ id })));
    // A Lounge is founded by a ranked member alone (tier_gate_lounges_insert), and read by a signed-in one alone.
    if (url === '/rest/v1/rpc/create_lounge') {
      if (!world.ranked.includes(who?.id ?? '')) return send(403, { code: '42501', message: 'new row violates row-level security policy "tier_gate_lounges_insert"' });
      world.lounges.push(`lounge-${world.lounges.length + 1}`);
      return send(200, world.lounges[world.lounges.length - 1]);
    }
    if (url.startsWith('/rest/v1/lounges?')) return send(200, who ? world.lounges.filter((l) => l === idIn(url)).map((id) => ({ id })) : []);
    return send(404, { message: `the fake has no ${req.method} ${url}` });
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res(server)));
}

async function seed(opts: { datesProfiles?: boolean; walk?: boolean } = {}) {
  const world: World = { asked: [], created: Date.now(), logs: [], posts: [], stacks: [], ranked: [], lounges: [] };
  const server = await fakeSupabase(world, opts);
  const { port } = server.address() as AddressInfo;
  // No GITHUB_ENV: the rehearsal hands no password to a workflow.
  const env: NodeJS.ProcessEnv = { ...process.env, API_URL: `http://127.0.0.1:${port}`, SERVICE_ROLE_KEY: SERVICE, ANON_KEY: ANON };
  delete env['GITHUB_ENV'];
  delete env['E2E_SEED_WALK'];
  if (opts.walk) env['E2E_SEED_WALK'] = '1';
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
  // The flows' world alone: no writer, no Lounge, no rank.
  expect([world.ranked, world.lounges]).toEqual([[], []]);
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

describe('the route walk\'s world (E2E_SEED_WALK)', () => {
  it('ranks the writer, who founds an open Lounge and files an essay in a series as themself', async () => {
    const { code, text, world } = await seed({ walk: true });
    expect(text).toContain('✓ e2e_writer: made, signs in, reads their own profile, files, and is read back');
    expect(code).toBe(0);
    expect([world.ranked, world.lounges]).toEqual([[WRITER_PERSON.id], ['lounge-1']]);
    expect(world.posts.filter((p) => p.series_id).map((p) => [p.kind, p.user_id, p.part_number])).toEqual([['dossier', WRITER_PERSON.id, 1]]);
    const byService = world.asked.filter((a) => a.key === SERVICE).map((a) => `${a.method} ${a.path.split('?')[0]}`);
    expect(byService).toEqual(['POST /auth/v1/admin/users', 'PATCH /rest/v1/profiles', 'POST /auth/v1/admin/users', 'POST /rest/v1/rpc/grant_entitlement', 'PATCH /rest/v1/profiles']);
    const founded = world.asked.filter((a) => /\/rpc\/create_lounge$|dispatch_posts\?select=id,series_id/.test(a.path));
    expect(founded.map((a) => [a.key, a.bearer])).toEqual([[ANON, WRITER], [ANON, WRITER]]);
  });

  it('reads each room back as the member the walk opens it as: the Lounge is never a guest\'s to read', async () => {
    const { world } = await seed({ walk: true });
    const readBack = world.asked.filter((a) => a.method === 'GET' && /^\/rest\/v1\/(lounges|dispatch_posts)\?id=eq\.(lounge-1|post-3)&/.test(a.path));
    expect(readBack.map((a) => [a.path.split('?')[0], a.key, a.bearer])).toEqual([
      ['/rest/v1/lounges', ANON, TOKEN],
      ['/rest/v1/dispatch_posts', ANON, TOKEN],
    ]);
  });
});
