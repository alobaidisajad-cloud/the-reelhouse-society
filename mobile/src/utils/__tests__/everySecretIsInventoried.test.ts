/**
 * everySecretIsInventoried.test.ts — mobile/register/secrets.json names every
 * secret and setting the House's code reads (WORKLIST P0.60), with who holds
 * it, and how a secret is rotated. A name the code starts reading tomorrow
 * fails here until it is written down; a name no code reads any more fails
 * until it is taken out. Names only: the inventory never holds a value.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { readCode } from '@/test-utils/readCode';
import { files, repoRel } from '@/test-utils/universe';

const ROOT = join(__dirname, '..', '..', '..', '..');
type Entry = { name: string; kind: string; is: string; holders: string[]; rotation?: string; byHand?: boolean };
const { entries } = JSON.parse(readFileSync(join(ROOT, 'mobile', 'register', 'secrets.json'), 'utf8')) as { entries: Entry[] };
const listed = new Set(entries.map((e) => e.name));

/** Each name the given files read with this pattern, its first capture or second. */
const namesIn = (paths: string[], pattern: RegExp, read: (p: string) => string = readCode) => {
  const found = new Set<string>();
  for (const p of paths) for (const m of read(p).matchAll(pattern)) found.add(m[1] ?? m[2] ?? '');
  found.delete('');
  return found;
};

const ENV_READ = /process\.env(?:\.([A-Z0-9_]+)|\[['"]([A-Z0-9_]+)['"]\])/g;
const read = {
  'a Deno.env name in either functions tree': namesIn(files('functions'), /Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]/g),
  'a process.env name in api/, mobile/scripts/, mobile/supabase/diagnostics/ or mobile/e2e/': namesIn(
    [...files('website'), ...files('scripts')].filter((p) => /^(api|mobile\/scripts|mobile\/supabase\/diagnostics|mobile\/e2e)\//.test(repoRel(p)) && !/__tests__/.test(p)),
    ENV_READ,
  ),
  'a name the scripts read from the private settings file': namesIn(
    files('scripts').filter((p) => !/__tests__/.test(p)),
    /readPrivate\(\s*['"]([A-Z0-9_]+)['"]/g,
  ),
  'a secret a workflow names': namesIn(files('workflows'), /secrets\.([A-Za-z0-9_]+)/g, (p) => readFileSync(p, 'utf8')),
  'a Vault secret the schema reads': namesIn(files('snapshot'), /decrypted_secrets[\s\S]{0,80}?name\s*=\s*'([a-z0-9_-]+)'/g, (p) => readFileSync(p, 'utf8')),
  'a setting eas.json builds in': new Set(Object.values((JSON.parse(readFileSync(join(ROOT, 'mobile', 'eas.json'), 'utf8')) as { build: Record<string, { env?: object }> }).build)
    .flatMap((b) => Object.keys(b.env ?? {}))),
};

describe('the inventory', () => {
  it.each(Object.entries(read))('lists %s', (_, names) => {
    expect(names.size).toBeGreaterThan(0);
    expect([...names].filter((n) => !listed.has(n)).sort()).toEqual([]);
  });

  it('lists nothing the code no longer reads, but the credentials held only in a dashboard, each marked', () => {
    const anywhere = new Set(Object.values(read).flatMap((s) => [...s]));
    expect(entries.filter((e) => !e.byHand && !anywhere.has(e.name)).map((e) => e.name)).toEqual([]);
  });

  it('says what each is and who holds it, and how each secret is rotated', () => {
    const KINDS = ['secret', 'public', 'setting', 'made'];
    for (const e of entries) {
      expect([e.name, KINDS.includes(e.kind), e.is.length > 15, e.holders.length > 0]).toEqual([e.name, true, true, true]);
      if (e.kind === 'secret') expect([e.name, (e.rotation ?? '').length > 30]).toEqual([e.name, true]);
    }
    expect(new Set(entries.map((e) => e.name)).size).toBe(entries.length);
  });

  it('names, by hand, every credential the plan says lives only in a vendor\'s dashboard', () => {
    const byHand = entries.filter((e) => e.byHand).map((e) => e.name);
    for (const must of ['Supabase Auth SMTP key', 'RevenueCat App Store credentials', 'RevenueCat Google Play credentials', 'APNs key', 'FCM key',
      'iOS signing credentials', 'SENTRY_AUTH_TOKEN', 'Supabase Metrics API key', 'Web-push VAPID private key']) {
      expect([must, byHand.includes(must)]).toEqual([must, true]);
    }
    for (const must of ['EXPO_ACCESS_TOKEN', 'REVENUECAT_WEBHOOK_SECRET', 'SUPABASE_SECRET_KEYS']) expect([must, listed.has(must)]).toEqual([must, true]);
  });

  it('holds names only, never a value', () => {
    const text = readFileSync(join(ROOT, 'mobile', 'register', 'secrets.json'), 'utf8');
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9]{8,}|sk_[A-Za-z0-9]{16,}|postgres(ql)?:\/\/[^\s"]*@|re_[A-Za-z0-9]{16,}/);
  });
});
