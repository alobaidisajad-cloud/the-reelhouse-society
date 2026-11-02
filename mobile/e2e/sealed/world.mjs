#!/usr/bin/env node
/**
 * world.mjs — the two members a sealed test runs as, and their keys.
 *
 *   eval "$(node mobile/e2e/sealed/world.mjs)"     exports the SEALED_* the tests read
 *
 * A sealed test (*.sealed.test.ts) runs one of the app's own stores against the
 * sealed copy of production, through its API, as a member. The contracts job
 * starts no auth server, so no one signs in: the members are laid down by
 * world.sql, and each key is signed here as the auth server would sign it,
 * with the local stack's published secret (anon-key.mjs), so PostgREST takes
 * it. Their ids live here alone: world.sql is handed them as psql variables.
 */
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DEFAULT_SECRET, EXPIRY, anonKey } from '../anon-key.mjs';

/** Who the sealed tests are: one who reads the salon, one who writes in it, and the salon. */
export const WORLD = {
  reader: '5ea1ed00-0000-4000-8000-000000000001',
  poster: '5ea1ed00-0000-4000-8000-000000000002',
  lounge: '5ea1ed00-0000-4000-8000-00000000000a',
};

/** A member's key, as the auth server signs one: HS256 over the claims PostgREST reads. */
export function memberToken(sub, secret = DEFAULT_SECRET) {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ aud: 'authenticated', role: 'authenticated', sub, exp: EXPIRY })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

/** The lines a shell evaluates: every name a sealed test reads but its address. */
export function exports() {
  return [
    ['SEALED_ANON_KEY', anonKey()],
    ['SEALED_READER_ID', WORLD.reader],
    ['SEALED_POSTER_ID', WORLD.poster],
    ['SEALED_LOUNGE_ID', WORLD.lounge],
    ['SEALED_READER_TOKEN', memberToken(WORLD.reader)],
    ['SEALED_POSTER_TOKEN', memberToken(WORLD.poster)],
  ].map(([k, v]) => `export ${k}=${v}`).join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(exports());
