/**
 * The live credentials a CONTRACT test reads — and nothing else does.
 * ─────────────────────────────────────────────────────────────────────────────
 * A contract test asks production a question the code cannot answer about
 * itself: does this embed resolve, may a visitor read these columns. It needs
 * the Supabase URL and the anon key, and jest has neither.
 *
 * The obvious fix, loading `.env` in `jest.setup.ts`, is wrong twice over:
 *
 *   · `src/lib/supabase.ts` and `tmdb.ts` read these as `process.env.X ||
 *     'dummy'`. Unset, both operands evaluate and the fallback is covered;
 *     set, the fallback is unreachable — ./src/lib/ branch coverage fell
 *     under its floor and CI would have failed.
 *
 *   · Far worse, `'https://dummy.supabase.co'` is the thing that stops a unit
 *     test which accidentally builds a real client from reaching PRODUCTION.
 *     Giving all 5,000 tests a live URL and a working key, to save the contract
 *     tests from skipping, trades a real safety net for a cosmetic green tick.
 *
 * So the credentials are read HERE, returned to the tests that ask, and never
 * put on `process.env` where another test could pick them up. Only the two
 * EXPO_PUBLIC_ values — they ship inside the app bundle and are public by
 * design. `SUPABASE_DB_URL` is never read: no unit test should hold one.
 *
 * CI hands the values in as CONTRACT_SUPABASE_* — names only contract tests
 * read. It used to set EXPO_PUBLIC_* on the whole Jest step, which gave every
 * test a live URL: exactly the trade described above. `src/lib` branch coverage
 * then measured 0.8% lower on CI than anywhere else, and the ratchet failed.
 *
 * With no `.env` present, `canRun` is false and a contract suite skips.
 * Making the check possible is not the same as making it mandatory.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function fromEnvFile(key: string): string | undefined {
  for (const file of ['.env.local', '.env']) {
    const path = join(__dirname, '..', file);
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

export const SUPABASE_URL = process.env.CONTRACT_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? fromEnvFile('EXPO_PUBLIC_SUPABASE_URL');
export const ANON_KEY = process.env.CONTRACT_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? fromEnvFile('EXPO_PUBLIC_SUPABASE_ANON_KEY');
export const canRun = !!SUPABASE_URL && !!ANON_KEY;

/** Headers for a request made as a signed-out visitor. */
export const visitor = (): Record<string, string> => ({
  apikey: ANON_KEY as string,
  Authorization: `Bearer ${ANON_KEY}`,
});
