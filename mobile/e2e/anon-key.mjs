#!/usr/bin/env node
/**
 * anon-key.mjs — the local stack's anon key, without starting the stack.
 *
 *   node mobile/e2e/anon-key.mjs        prints the key, or fails by name
 *
 * The Supabase CLI makes the key itself, from its config, not from a running
 * container (pkg/config/apikeys.go at the release e2e.yml installs): an HS256
 * token over {"iss":"supabase-demo","role":"anon","exp":1983812996}, signed
 * with auth.jwt_secret, or the CLI's default secret when config.toml sets none.
 * Nothing in it depends on the time or the machine, so every run's stack has
 * the same key, and e2e.yml builds the app once for all its shards. Each shard
 * still compares the key the app was built with to its own stack's, so a CLI
 * that makes it another way fails there by name.
 */
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The CLI release this is read from: e2e.yml must install this one (anonKey.test.ts). */
export const CLI_VERSION = '2.118.0';
/** The CLI's own default, a published value, used by every local stack that sets none. */
export const DEFAULT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
/** The fixed expiry the CLI gives its keys, in seconds since 1970. */
export const EXPIRY = 1983812996;

/** The [auth] settings that would make the CLI sign another key. */
const SETS_THE_KEY = ['jwt_secret', 'anon_key', 'signing_keys_path'];

/** Which of those a config.toml sets in its [auth] table. */
export function keySettings(toml) {
  let inAuth = false;
  const found = [];
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    const table = /^\[([^\]]+)\]/.exec(line);
    if (table) { inAuth = table[1].trim() === 'auth'; continue; }
    const key = /^([A-Za-z_]+)\s*=/.exec(line);
    if (inAuth && key && SETS_THE_KEY.includes(key[1])) found.push(key[1]);
  }
  return found;
}

/** The key, as the CLI signs it: Go's JSON, keys in its order, base64url with no padding. */
export function anonKey(secret = DEFAULT_SECRET) {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss: 'supabase-demo', role: 'anon', exp: EXPIRY })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const config = join(dirname(fileURLToPath(import.meta.url)), 'supabase', 'config.toml');
  const set = keySettings(readFileSync(config, 'utf8'));
  if (set.length) {
    console.log(`::error title=E2E anon key::e2e/supabase/config.toml sets auth.${set.join(', auth.')}, ` +
      'so the stack signs its own key: read it from a running stack instead');
    process.exit(1);
  }
  console.log(anonKey());
}
