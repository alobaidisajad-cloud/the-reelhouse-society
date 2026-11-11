#!/usr/bin/env node
/**
 * email-link.mjs — an email's link opened on the phone as a member's mail app opens it (WORKLIST
 * P4.21): Gmail opens a link in a Chrome Custom Tab, which may refuse to hand a redirect to the
 * app's own scheme with no tap of the member's; plain Chrome is the other way.
 *
 *   node e2e/email-link.mjs <customtab|chrome>
 *
 * A password reset is asked for the seeded member as a phone asks it (a PKCE challenge, the app's
 * own return address), from this runner: so the link belongs to another phone, and the app it opens
 * must say so (the 'code verifier' answer, useAuthFlow mapAuthError). The email is read back from the
 * stack's mail catcher (Mailpit), its address pointed at the stack as the emulator reaches it
 * (10.0.2.2), and opened on the phone: as a Custom Tab (Chrome, with a session extra, as
 * CustomTabsIntent sends one), or in Chrome. run-flows.sh runs it before email_link_<how>, which
 * waits for the app's own email screen. Chrome's first run is switched off first, so no welcome
 * stands between the link and the hand-off.
 *
 * Prints how it was opened (and whether Chrome showed it as a Custom Tab) on stdout; fails by name.
 */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const API = process.env.API_URL ?? '';
const ANON = process.env.ANON_KEY ?? '';
const EMAIL = process.env.E2E_MEMBER_EMAIL ?? '';
const CATCHER = process.env.MAIL_CATCHER_URL ?? 'http://127.0.0.1:54324';
/** The stack as the emulator reaches it: the fault proxy on the runner, as the app is built to. */
const PHONE_API = process.env.E2E_PHONE_API ?? 'http://10.0.2.2:54330';
const RETURN = 'reelhouse://auth-callback';

/** The link an email carries to Auth (its verify address, the HTML's escapes undone). */
export const linkIn = (text) => (/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/.exec(text)?.[0] ?? '').replace(/&amp;/g, '&');

/** The link pointed at the stack as the phone reaches it: the address Auth wrote is the runner's. */
export const forThePhone = (link, phoneApi = PHONE_API) => link.replace(/^https?:\/\/[^/]+/, phoneApi);

/** The am start that opens a link as a Custom Tab (Chrome, a session extra) or in plain Chrome. */
export function openArgs(how, link) {
  if (how === 'customtab') {
    return ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${link}'`, '-p', 'com.android.chrome',
      '--es', 'android.support.customtabs.extra.SESSION', "''", '--ez', 'android.support.customtabs.extra.SHARE_STATE_ON', 'false'];
  }
  if (how === 'chrome') return ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${link}'`, '-p', 'com.android.chrome'];
  throw new Error(`no way to open a link called ${how} (customtab, chrome)`);
}

const adb = (args) => execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

async function main(how) {
  if (!API || !ANON || !EMAIL) throw new Error('needs API_URL, ANON_KEY and E2E_MEMBER_EMAIL, as run-flows.sh has them');
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) throw new Error(`refusing ${API}: only the sealed stack`);
  openArgs(how, 'x');
  // As a phone asks it: a PKCE challenge whose verifier this runner keeps, so the link is another phone's.
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const asked = Date.now();
  const res = await fetch(`${API}/auth/v1/recover?redirect_to=${encodeURIComponent(RETURN)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: EMAIL, code_challenge: challenge, code_challenge_method: 's256' }),
  });
  if (!res.ok) throw new Error(`the reset was refused: ${res.status} ${(await res.text()).slice(0, 200)}`);
  let link = '';
  for (let i = 0; i < 40 && !link; i++) {
    const found = await fetch(`${CATCHER}/api/v1/search?query=${encodeURIComponent(`to:"${EMAIL}"`)}`).then((r) => r.json()).catch(() => null);
    const newest = (found?.messages ?? []).filter((m) => Date.parse(m.Created) >= asked - 2000)
      .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
    if (newest) {
      const mail = await fetch(`${CATCHER}/api/v1/message/${newest.ID}`).then((r) => r.json());
      link = linkIn(`${mail.HTML ?? ''} ${mail.Text ?? ''}`);
    }
    if (!link) await new Promise((r) => setTimeout(r, 500));
  }
  if (!link) throw new Error(`no reset email reached ${CATCHER} within 20 s`);
  // Chrome's first run asks things a member answered long ago: switched off, so the link goes straight on.
  adb(['shell', 'am', 'set-debug-app', '--persistent', 'com.android.chrome']);
  adb(['shell', "echo 'chrome --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line"]);
  adb(['shell', 'am', 'force-stop', 'com.android.chrome']);
  adb(['shell', 'am', 'force-stop', 'com.reelhouse.society']);
  adb(openArgs(how, forThePhone(link)));
  // Seen as a Custom Tab, or not, before it hands the link on: said, for the record of the run.
  await new Promise((r) => setTimeout(r, 1500));
  const shown = adb(['shell', 'dumpsys', 'activity', 'activities']);
  const tab = /CustomTabActivity/.test(shown);
  console.log(`${how}${tab ? ' (seen as a Custom Tab)' : ''}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv[2] ?? '').catch((e) => { console.error(`email-link: ${e.message}`); process.exit(1); });
}
