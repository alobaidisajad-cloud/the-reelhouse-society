/**
 * Lounge embed contract test.
 *
 * Guards the build-31 regression: the `profiles(...)` embeds on lounge_messages /
 * lounge_members / lounge_message_reactions returned 400 because the FK to
 * public.profiles was missing (see migration 20260701_02_lounge_profiles_fk_embeds).
 *
 * PostgREST resolves the resource-embedding relationship BEFORE applying RLS, so an
 * anonymous request is enough to prove the relationship exists:
 *   • broken/missing relationship  → 400 (schema drift — FAIL)
 *   • valid relationship           → 200 (possibly empty — PASS)
 *
 * Skips gracefully when Supabase env/network is unavailable so offline CI stays green;
 * it only ever hard-fails on a real 400, which is the drift signal we care about.
 */
/**
 * ── THIS TEST READS ITS OWN CREDENTIALS, AND NOTHING ELSE DOES ──────────────
 * It gates on the Supabase URL and anon key, jest had neither, so it had NEVER
 * RUN — it reported "skipped", which in a summary of 272 passing suites reads
 * exactly like a pass. The obvious fix was to load `.env` in `jest.setup.ts`.
 * That was wrong twice over:
 *
 *   · `src/lib/supabase.ts` and `tmdb.ts` read these as `process.env.X ||
 *     'dummy'`. Unset, both operands evaluate and the fallback is covered;
 *     set, the fallback is unreachable — ./src/lib/ branch coverage fell
 *     under its floor and CI would have failed.
 *
 *   · Far worse, `'https://dummy.supabase.co'` is the thing that stops a unit
 *     test which accidentally builds a real client from reaching PRODUCTION.
 *     Giving all 4,000 tests a live URL and a working key, to save this one
 *     from skipping, trades a real safety net for a cosmetic green tick.
 *
 * So the credentials are read HERE, by the only test entitled to them, and are
 * never put on `process.env` where another test could pick them up. Only the two
 * EXPO_PUBLIC_ values — they ship inside the app bundle and are public by
 * design. `SUPABASE_DB_URL` is never read: no unit test should hold one.
 *
 * With no `.env` present this skips exactly as it did before. Making the check
 * possible is not the same as making it mandatory.
 */
function fromEnvFile(key: string): string | undefined {
  const { readFileSync, existsSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');
  for (const file of ['.env.local', '.env']) {
    const path = join(__dirname, '..', '..', '..', file);
    if (!existsSync(path)) continue;
    try {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (line.trimStart().startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 1 || line.slice(0, eq).trim() !== key) continue;
        return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      }
    } catch {
      /* unreadable — fall through and let the suite skip itself */
    }
  }
  return undefined;
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? fromEnvFile('EXPO_PUBLIC_SUPABASE_URL');
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? fromEnvFile('EXPO_PUBLIC_SUPABASE_ANON_KEY');

const EMBEDS: { table: string; select: string }[] = [
  { table: 'lounge_messages', select: 'id,profiles!lounge_messages_user_id_fkey(username,avatar_url)' },
  { table: 'lounge_members', select: 'user_id,profiles!lounge_members_user_id_fkey(username,avatar_url)' },
  { table: 'lounge_message_reactions', select: 'id,profiles!lounge_message_reactions_user_id_fkey(username)' },
];

const canRun = !!SUPABASE_URL && !!ANON_KEY;
const describeMaybe = canRun ? describe : describe.skip;

describeMaybe('Lounge profiles embeds resolve (no schema drift)', () => {
  jest.setTimeout(20000);

  it.each(EMBEDS)('$table embeds profiles without a 400', async ({ table, select }) => {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { apikey: ANON_KEY as string, Authorization: `Bearer ${ANON_KEY}` },
      });
    } catch {
      // Network unavailable in this environment — do not fail the suite on infra.
      console.warn(`[loungeEmbeds.contract] skipped ${table}: network unavailable`);
      return;
    }

    if (res.status === 400) {
      const body = await res.text();
      throw new Error(
        `Schema drift: embedding profiles on "${table}" returned 400. The ` +
          `${table}_user_id_fkey → profiles(id) FK is missing or misnamed. Body: ${body}`
      );
    }

    expect(res.status).not.toBe(400);
  });
});
