/**
 * anonKey.test.ts — the key the E2E app is built with is the one every
 * shard's local stack has, made without starting a stack.
 *
 * anon-key.mjs is run as e2e.yml runs it. The key itself is never written here
 * (the secrets scan reads every file); its sha256 is: that of the local stack's
 * key the Supabase CLI publishes, the same for every project that sets no secret.
 */
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

const E2E = join(__dirname, '..');
const SCRIPT = join(E2E, 'anon-key.mjs');
const PUBLISHED_SHA256 = 'bf1725a8f98bea37e88618702e725ba84bd8acdb2647c5e0ed638bfd685791cf';

function ask(expr: string) {
  const code = `import * as k from ${JSON.stringify(pathToFileURL(SCRIPT).href)}; console.log(JSON.stringify(${expr}));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  expect(r.stderr).toBe('');
  return JSON.parse(r.stdout);
}

it('prints the key the CLI makes for a stack that sets no secret', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  expect(r.status).toBe(0);
  expect(createHash('sha256').update(r.stdout.trim()).digest('hex')).toBe(PUBLISHED_SHA256);
});

it('signs the CLI\'s claims, in the CLI\'s order, with nothing that changes from run to run', () => {
  const [header, payload] = (ask('k.anonKey()') as string).split('.').map((p) => Buffer.from(p, 'base64url').toString());
  expect(header).toBe('{"alg":"HS256","typ":"JWT"}');
  expect(payload).toBe('{"iss":"supabase-demo","role":"anon","exp":1983812996}');
  expect(ask('k.anonKey() === k.anonKey()')).toBe(true);
  // Another secret is another key: the secret is part of what is signed.
  expect(ask('k.anonKey("another-secret-of-at-least-thirty-two-chars") === k.anonKey()')).toBe(false);
});

it('the sealed world sets nothing that would make the CLI sign another key', () => {
  const config = readFileSync(join(E2E, 'supabase', 'config.toml'), 'utf8');
  expect(ask(`k.keySettings(${JSON.stringify(config)})`)).toEqual([]);
});

it('says no to a config that sets the secret, a key, or signing keys under [auth], and only there', () => {
  const set = '[api]\njwt_secret = "x"\n[auth]\nsite_url = "x"\njwt_secret = "a-secret"\nsigning_keys_path = "./k.json"\n[auth.email]\nanon_key = "x"\n';
  expect(ask(`k.keySettings(${JSON.stringify(set)})`)).toEqual(['jwt_secret', 'signing_keys_path']);
  expect(ask(`k.keySettings(${JSON.stringify('[auth]\n  anon_key = "x"\n')})`)).toEqual(['anon_key']);
});

it('is read from the CLI release e2e.yml installs', () => {
  const workflow = readFileSync(join(E2E, '..', '..', '.github', 'workflows', 'e2e.yml'), 'utf8');
  const installed = [...workflow.matchAll(/supabase\/setup-cli@\S+[^\n]*\n\s*with:\n\s*version: (\S+)/g)].map((m) => m[1]);
  expect(installed.length).toBeGreaterThan(0);
  expect(new Set(installed)).toEqual(new Set([ask('k.CLI_VERSION')]));
  expect(workflow).toContain('key=$(node mobile/e2e/anon-key.mjs)');
});
