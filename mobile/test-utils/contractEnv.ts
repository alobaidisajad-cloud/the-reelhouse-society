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
 *     Giving every unit test a live URL and a working key, to save the contract
 *     tests from skipping, trades a real safety net for a cosmetic green tick.
 *
 * So the credentials are read HERE, returned to the tests that ask, and never
 * put on `process.env` where another test could pick them up. Only the two
 * EXPO_PUBLIC_ values — they ship inside the app bundle and are public by
 * design. `SUPABASE_DB_URL` is never read: no unit test should hold one.
 *
 * The address is handed in as CONTRACT_SUPABASE_* — names only contract tests
 * read — and from nowhere else. An earlier CI set EXPO_PUBLIC_* on the whole
 * Jest step, which gave every test a live URL: exactly the trade described
 * above (`src/lib` branch coverage measured 0.8% lower there, and the ratchet
 * failed). And a fallback to the app's own .env made every local run, the push
 * hook's among them, ask production. Production is asked once a night
 * (nightly.yml); a push asks production's sealed shape (db-integration.yml),
 * and scripts/contracts-ran.cjs fails either run if a contract skipped.
 *
 * With no CONTRACT_SUPABASE_* set, `canRun` is false and a contract suite skips.
 */
export const SUPABASE_URL = process.env.CONTRACT_SUPABASE_URL;
export const ANON_KEY = process.env.CONTRACT_SUPABASE_ANON_KEY;
export const canRun = !!SUPABASE_URL && !!ANON_KEY;

/**
 * Headers for a request made as a signed-out visitor. Each connection closes with
 * its answer: one kept open for reuse holds Node's fetch timers past the test file.
 */
export const visitor = (): Record<string, string> => ({
  apikey: ANON_KEY as string,
  Authorization: `Bearer ${ANON_KEY}`,
  Connection: 'close',
});
