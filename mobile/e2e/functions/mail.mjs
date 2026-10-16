#!/usr/bin/env node
/**
 * mail.mjs — every email the House's Auth sends, caught and used (WORKLIST P0.80).
 *
 * In the functions world, whose Auth sends as production does (place.mjs,
 * withMail: addresses confirmed, the House's templates), and whose mail lands
 * in the stack's own catcher (Mailpit). Each email is asked for as the app asks
 * for it, read back from the catcher, and then used:
 *   · sign-up: the confirmation's link confirms the address;
 *   · reset: the recovery link opens a session;
 *   · the code Settings ask for before an account is deleted or the biometric
 *     lock changed (signInWithOtp, then verifyOtp type email): the House's
 *     template, a 6-digit code and no sign-in link; the code opens a session,
 *     once; a wrong code does not.
 *
 * What it needs, and its means, are world.mjs's; the catcher on 127.0.0.1:54324.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { API, ANON, check, literal, member, section, sql, verdict } from './world.mjs';

const CATCHER = process.env.MAIL_CATCHER_URL ?? 'http://127.0.0.1:54324';
const { templates } = JSON.parse(readFileSync(new URL('../../../supabase/email_templates/templates.json', import.meta.url), 'utf8'));

/** A call to Auth as the app makes it, with the public key. */
const auth = async (path, body) => {
  const res = await fetch(`${API}/auth/v1${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
};

/** The newest email to this address, waited for up to 15 s: its subject, text and HTML. */
const mailTo = async (address, after = 0) => {
  for (let i = 0; i < 30; i++) {
    const found = await fetch(`${CATCHER}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`).then((r) => r.json()).catch(() => null);
    const newest = (found?.messages ?? []).filter((m) => Date.parse(m.Created) >= after).sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
    if (newest) {
      const message = await fetch(`${CATCHER}/api/v1/message/${newest.ID}`).then((r) => r.json());
      return { subject: message.Subject, text: message.Text ?? '', html: message.HTML ?? '' };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
};

/** The Auth link an email carries (its verify address, the HTML's escapes undone). */
const linkIn = (mail) => (/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/.exec(`${mail.html} ${mail.text}`)?.[0] ?? '').replace(/&amp;/g, '&');

/** Follows an Auth link as a phone's browser would, to where it sends the member: the session in its address. */
const follow = async (link) => {
  const res = await fetch(link.replace(/^https?:\/\/[^/]+/, API), { redirect: 'manual' });
  return { status: res.status, to: res.headers.get('location') ?? '' };
};

const fresh = (what) => `mail_${what}_${randomBytes(4).toString('hex')}@e2e.test`;

section('sign-up — the confirmation confirms the address');
{
  const email = fresh('signup');
  const sent = Date.now() - 1000;
  const up = await auth('/signup', { email, password: randomBytes(12).toString('base64url'), data: { username: `mail_${randomBytes(3).toString('hex')}` } });
  check(up.status === 200 && !up.json?.access_token, 'a sign-up is taken, with no session before the address is confirmed', `HTTP ${up.status}`);
  const mail = await mailTo(email, sent);
  check(!!mail, 'its confirmation arrives', email);
  const link = mail ? linkIn(mail) : '';
  check(/type=signup/.test(link), 'carrying the link that confirms it', link.slice(0, 80));
  if (link) {
    const opened = await follow(link);
    check(opened.status === 303 && /access_token=|[?&]code=/.test(opened.to) && opened.to.startsWith('reelhouse://'),
      'the link opens the app, signed in', `${opened.status} ${opened.to.slice(0, 40)}`);
    check(sql(`SELECT email_confirmed_at IS NOT NULL FROM auth.users WHERE email = ${literal(email)}`) === 't', 'and the address is confirmed');
  }
}

section('reset — the recovery link opens a session');
{
  const someone = await member(`mail_reset_${randomBytes(3).toString('hex')}`);
  const sent = Date.now() - 1000;
  const asked = await auth('/recover', { email: someone.email });
  check(asked.status === 200, 'a reset is asked for', `HTTP ${asked.status}`);
  const mail = await mailTo(someone.email, sent);
  check(!!mail, 'its email arrives', someone.email);
  const link = mail ? linkIn(mail) : '';
  check(/type=recovery/.test(link), 'carrying the recovery link', link.slice(0, 80));
  if (link) {
    const opened = await follow(link);
    check(opened.status === 303 && /access_token=|[?&]code=/.test(opened.to), 'the link opens a session to set a new password', `${opened.status} ${opened.to.slice(0, 40)}`);
  }
}

section('the code Settings ask for — before a deletion, or a change of the lock');
{
  const someone = await member(`mail_code_${randomBytes(3).toString('hex')}`);
  const sent = Date.now() - 1000;
  const asked = await auth('/otp', { email: someone.email, create_user: false });
  check(asked.status === 200, 'a code is asked for, as the app asks (no account made)', `HTTP ${asked.status} ${asked.text.slice(0, 120)}`);
  const mail = await mailTo(someone.email, sent);
  check(!!mail && mail.subject === templates.magic_link.subject, "it arrives in the House's own letter", mail?.subject ?? 'no mail');
  const code = mail ? (/\b(\d{6})\b/.exec(mail.text || mail.html.replace(/<[^>]+>/g, ' ')) ?? [])[1] ?? '' : '';
  check(/^\d{6}$/.test(code), 'carrying a 6-digit code, as the app asks for', code ? 'found' : 'none');
  check(!!mail && linkIn(mail) === '', 'and no sign-in link: the code alone confirms the act');

  const wrong = await auth('/verify', { type: 'email', email: someone.email, token: code === '000000' ? '111111' : '000000' });
  check(wrong.status >= 400 && wrong.status < 500 && !wrong.json?.access_token, 'a wrong code is refused', `HTTP ${wrong.status}`);
  const right = await auth('/verify', { type: 'email', email: someone.email, token: code });
  check(right.status === 200 && typeof right.json?.access_token === 'string', 'the code is accepted, as verifyOtp asks for it', `HTTP ${right.status}`);
  const again = await auth('/verify', { type: 'email', email: someone.email, token: code });
  check(again.status >= 400 && !again.json?.access_token, 'and only once', `HTTP ${again.status}`);

  const nobody = fresh('nobody');
  const askedAt = Date.now() - 1000;
  const stranger = await auth('/otp', { email: nobody, create_user: false });
  check(!stranger.json?.access_token && sql(`SELECT count(*) FROM auth.users WHERE email = ${literal(nobody)}`) === '0'
    && (await mailTo(nobody, askedAt)) === null, 'an address with no account is never made one, nor mailed', `HTTP ${stranger.status}`);
}

verdict();
