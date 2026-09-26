#!/usr/bin/env node
/**
 * seed.mjs — the people who live in the sealed E2E world.
 *
 * Made through the local auth server's admin API, exactly as a sign-up would
 * make them, so production's own trigger (on_auth_user_created) makes each
 * profile — the seed never writes a profile row itself. Then each one is
 * proved: signs in with the password, and reads its own profile through RLS.
 *
 * Passwords are made fresh for every run and handed to the flows through
 * $GITHUB_ENV (masked in the log). The addresses use the reserved .test
 * domain, which can never be a real inbox; check:backend refuses any account
 * at it in production.
 *
 * Needs API_URL and SERVICE_ROLE_KEY / ANON_KEY from `supabase status -o env`.
 */
import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const API = process.env.API_URL;
const SERVICE = process.env.SERVICE_ROLE_KEY;
const ANON = process.env.ANON_KEY;
if (!API || !SERVICE || !ANON) {
  console.error('API_URL, SERVICE_ROLE_KEY and ANON_KEY are needed (from `supabase status -o env`).');
  process.exit(2);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error(`Refusing to seed ${API}: the seed only ever runs against a local stack.`);
  process.exit(2);
}

/** The E2E domain. Reserved by RFC 2606 — no real person can ever own an address here. */
export const E2E_DOMAIN = 'e2e.test';

const PEOPLE = [
  // A member with no rank: the ordinary path through the app.
  { env: 'E2E_MEMBER', username: 'e2e_member' },
];

const fail = (who, detail) => {
  console.log(`::error title=E2E seed — ${who}::${detail}`);
  process.exit(1);
};
const call = async (path, { key, token, ...init } = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${token ?? key}`, ...init.headers },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};

for (const p of PEOPLE) {
  const email = `${p.username}@${E2E_DOMAIN}`;
  const password = randomBytes(18).toString('base64url');

  const made = await call('/auth/v1/admin/users', {
    key: SERVICE, method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username: p.username } }),
  });
  if (made.status !== 200) fail(p.username, `could not be made: HTTP ${made.status} ${JSON.stringify(made.body).slice(0, 200)}`);

  const session = await call('/auth/v1/token?grant_type=password', { key: ANON, method: 'POST', body: JSON.stringify({ email, password }) });
  if (session.status !== 200 || !session.body.access_token) fail(p.username, `cannot sign in: HTTP ${session.status}`);

  const profile = await call(`/rest/v1/profiles?id=eq.${made.body.id}&select=username`, { key: ANON, token: session.body.access_token });
  if (profile.status !== 200 || profile.body?.[0]?.username !== p.username) {
    fail(p.username, `the profile trigger did not give them a readable profile: HTTP ${profile.status} ${JSON.stringify(profile.body).slice(0, 200)}`);
  }

  if (process.env.GITHUB_ENV) {
    console.log(`::add-mask::${password}`);
    appendFileSync(process.env.GITHUB_ENV, `${p.env}_EMAIL=${email}\n${p.env}_PASSWORD=${password}\n${p.env}_USERNAME=${p.username}\n`);
  }
  console.log(`✓ ${p.username}: made, signs in, reads their own profile`);
}
