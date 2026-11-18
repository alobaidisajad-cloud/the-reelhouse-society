/**
 * thePushedPhoneRegistersAsTheAppDoes.test.ts — review round 13 (e2e/push-present.mjs)
 *
 * The push flows laid the member's token straight into push_tokens, with no session. From round 13
 * notify-push sends only to a token whose session still stands (push_tokens_of), so a row laid that
 * way proved nothing of the phone's own path and was sent to only by chance. The run now registers
 * the phone as the app does: signed in as the member, through register_push_token, and reads back
 * that the token stands under that session. Asked through node, as the run asks it, with the house's
 * two doors played here.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = pathToFileURL(join(__dirname, '..', 'push-present.mjs')).href;

/** Runs registerAsThePhone with the network played: each request kept, the read-back answered `held`. */
function register(opts: { email?: string; password?: string; held?: string; refuse?: boolean }) {
  const code = `import * as m from ${JSON.stringify(SCRIPT)};
    const o = JSON.parse(process.argv[1]); const asked = [];
    globalThis.fetch = async (url, init) => {
      asked.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
      if (String(url).includes('/auth/v1/token')) return new Response(JSON.stringify({ access_token: 'the-members-session' }), { status: 200 });
      return o.refuse ? new Response('refused', { status: 401 }) : new Response(null, { status: 204 });
    };
    let said = null;
    try {
      await m.registerAsThePhone('member-1', { api: 'http://127.0.0.1:54321', anon: 'anon-key', email: o.email, password: o.password, run: () => o.held });
    } catch (e) { said = e.message; }
    process.stdout.write(JSON.stringify({ asked, said, token: m.TOKEN }));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code, JSON.stringify(opts)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout) as { asked: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[]; said: string | null; token: string };
}

it('signs in as the member and registers the phone\'s token under that session, as the app does', () => {
  const { asked, said, token } = register({ email: 'e2e_member@e2e.test', password: 'pw', held: '1' });
  expect(said).toBeNull();
  expect(asked.map((a) => a.url)).toEqual([
    'http://127.0.0.1:54321/auth/v1/token?grant_type=password',
    'http://127.0.0.1:54321/rest/v1/rpc/register_push_token',
  ]);
  const signIn = asked[0];
  const registration = asked[1];
  expect(signIn).toBeDefined();
  expect(registration).toBeDefined();
  expect(signIn!.body).toEqual({ email: 'e2e_member@e2e.test', password: 'pw' });
  expect(registration!.headers.Authorization).toBe('Bearer the-members-session');
  expect(registration!.body).toEqual({ p_token: token, p_platform: 'android' });
});

it('stops the run when the token does not stand under a session the house still holds', () => {
  expect(register({ email: 'e2e_member@e2e.test', password: 'pw', held: '0' }).said)
    .toBe('the member\'s phone is not registered under a session that stands');
});

it('stops the run when the house refuses the registration, or the member cannot sign in to make it', () => {
  expect(register({ email: 'e2e_member@e2e.test', password: 'pw', held: '1', refuse: true }).said).toMatch(/^register_push_token refused the member's phone: HTTP 401/);
  expect(register({ held: '1' }).said).toMatch(/E2E_MEMBER_EMAIL and E2E_MEMBER_PASSWORD are needed/);
});
