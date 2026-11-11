/**
 * email-link.mjs (WORKLIST P4.21): a reset email's link, read from the mail catcher, pointed at the
 * stack as the emulator reaches it, and opened as a Chrome Custom Tab (as Gmail opens a link) or in
 * plain Chrome; run-flows.sh runs it before each email_link_<how> flow.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = join(__dirname, '..', 'email-link.mjs');
/** One of the script's own values, asked in a Node of its own (jest cannot load an ES module here). */
const ask = (expression: string): unknown => {
  const code = `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); console.log(JSON.stringify(${expression}));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
};

const MAIL = '<a href="http://127.0.0.1:54321/auth/v1/verify?token=abc&amp;type=recovery&amp;redirect_to=reelhouse://auth-callback">Reset</a>';

it('reads the Auth link an email carries, its escapes undone, and points it at the stack as the phone reaches it', () => {
  const link = ask(`m.linkIn(${JSON.stringify(MAIL)})`) as string;
  expect(link).toBe('http://127.0.0.1:54321/auth/v1/verify?token=abc&type=recovery&redirect_to=reelhouse://auth-callback');
  expect(ask(`m.forThePhone(${JSON.stringify(link)}, 'http://10.0.2.2:54330')`))
    .toBe('http://10.0.2.2:54330/auth/v1/verify?token=abc&type=recovery&redirect_to=reelhouse://auth-callback');
  expect(ask(`m.linkIn('no link here')`)).toBe('');
});

it('opens a link as a Custom Tab (Chrome, with the session extra a CustomTabsIntent sends) or in plain Chrome, and no other way', () => {
  const tab = ask(`m.openArgs('customtab', 'http://x/v')`) as string[];
  expect(tab.slice(0, 7)).toEqual(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', "'http://x/v'"]);
  expect(tab).toEqual(expect.arrayContaining(['-p', 'com.android.chrome', '--es', 'android.support.customtabs.extra.SESSION']));
  const plain = ask(`m.openArgs('chrome', 'http://x/v')`) as string[];
  expect(plain).toEqual(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', "'http://x/v'", '-p', 'com.android.chrome']);
  expect(plain.join(' ')).not.toMatch(/customtabs/);
  expect(() => ask(`m.openArgs('gmail', 'x')`)).toThrow(/no way to open a link called gmail/);
});

it('refuses to ask anything of a stack but a local one, and says what it needs', () => {
  const run = (env: Record<string, string>) => spawnSync(process.execPath, [SCRIPT, 'chrome'], { encoding: 'utf8', env: { ...process.env, ...env } });
  expect(run({ API_URL: '', ANON_KEY: '', E2E_MEMBER_EMAIL: '' }).stderr).toMatch(/needs API_URL, ANON_KEY and E2E_MEMBER_EMAIL/);
  const away = run({ API_URL: 'https://x.supabase.co', ANON_KEY: 'k', E2E_MEMBER_EMAIL: 'm@e2e.test' });
  expect([away.status, away.stderr]).toEqual([1, expect.stringMatching(/refusing https:\/\/x\.supabase\.co: only the sealed stack/)]);
});
