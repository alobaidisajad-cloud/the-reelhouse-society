/**
 * The sealed copy's address and its two members, for a SEALED test — and nothing else.
 * ─────────────────────────────────────────────────────────────────────────────
 * A sealed test (*.sealed.test.ts) runs one of the app's own stores, unmocked,
 * against the sealed copy of production through its API, as a member: it
 * WRITES. So, unlike a contract test (contractEnv.ts), it is never pointed at
 * production: the nightly run hands it nothing, and an address that is not the
 * runner's own stack is refused here, before any test can ask it.
 *
 * db-integration.yml hands the address as SEALED_SUPABASE_URL and the rest
 * from e2e/sealed/world.mjs, after e2e/sealed/world.sql has laid the members
 * and their salon down; scripts/contracts-ran.cjs --sealed fails the run if a
 * sealed test skipped. With nothing handed in, `canRunSealed` is false and a
 * sealed suite skips.
 */
import { houseFetch } from './contractEnv';

/** The real client: jest.setup.ts stands one in for every other test, which answers without asking. */
const { createClient } = jest.requireActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');

export const SEALED_URL = process.env.SEALED_SUPABASE_URL;
const ANON_KEY = process.env.SEALED_ANON_KEY;

if (SEALED_URL && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SEALED_URL)) {
  throw new Error(`A sealed test writes, so it asks only the runner's own stack, never ${SEALED_URL}.`);
}

/** The members world.mjs signs keys for, and their salon. */
export const SEALED = {
  readerId: process.env.SEALED_READER_ID ?? '',
  readerToken: process.env.SEALED_READER_TOKEN ?? '',
  posterId: process.env.SEALED_POSTER_ID ?? '',
  posterToken: process.env.SEALED_POSTER_TOKEN ?? '',
  loungeId: process.env.SEALED_LOUNGE_ID ?? '',
};

export const canRunSealed = !!SEALED_URL && !!ANON_KEY && Object.values(SEALED).every(Boolean);

/**
 * The app's client, as a member: their key on every request, and no session of
 * its own to refresh, so a phone clock set wrong cannot send it to the auth
 * server (the contracts job runs none). Each connection closes with its answer.
 */
export function memberClient(token: string) {
  return createClient(SEALED_URL as string, ANON_KEY as string, {
    accessToken: async () => token,
    global: { fetch: houseFetch, headers: { Connection: 'close' } },
  });
}

/** Headers for a request a test makes itself, as a member. */
export const asMember = (token: string): Record<string, string> => ({
  apikey: ANON_KEY as string,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Connection: 'close',
});
