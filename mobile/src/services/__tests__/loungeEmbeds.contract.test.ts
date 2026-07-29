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
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
