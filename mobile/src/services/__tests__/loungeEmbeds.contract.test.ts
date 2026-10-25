/**
 * Embed contract test: the app's embeds, as it asks for them, resolve on the house.
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
 *
 * Where its credentials come from, and why only from there: test-utils/contractEnv.
 */
import { SUPABASE_URL, canRun, houseFetch, visitor } from '@/test-utils/contractEnv';
import { MESSAGE_COLUMNS } from '@/src/stores/lounge';
import { SAVED_CARD_COLUMNS } from '@/src/stores/dispatch';

const EMBEDS: { table: string; select: string }[] = [
  // The salon's own page of words, as the store asks for it: its author and its reactions.
  { table: 'lounge_messages', select: MESSAGE_COLUMNS.replace(/\s+/g, '') },
  { table: 'lounge_members', select: 'user_id,profiles!lounge_members_user_id_fkey(username,avatar_url)' },
  { table: 'lounge_message_reactions', select: 'id,profiles!lounge_message_reactions_user_id_fkey(username)' },
  // The Dispatch's saved page, as the store asks for it: the card, inner-joined to the member's
  // own saves (a visitor is refused the saves: 401, after the embed resolved).
  { table: 'dispatch_posts', select: SAVED_CARD_COLUMNS.replace(/\s+/g, '') },
];

const describeMaybe = canRun ? describe : describe.skip;

describeMaybe('the app’s embeds resolve (no schema drift)', () => {
  jest.setTimeout(20000);

  it.each(EMBEDS)('$table embeds what the app asks for without a 400', async ({ table, select }) => {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`;
    // Given an address, a contract that cannot reach it fails: it was asked to look.
    const res = await houseFetch(url, { headers: visitor() });

    if (res.status === 400) {
      const body = await res.text();
      throw new Error(
        `Schema drift: an embed on "${table}" returned 400: a relationship it names ` +
          `(a foreign key) is missing or misnamed. Body: ${body}`
      );
    }

    // Read (200), or refused to a visitor after the embed resolved (401); a missing
    // table (404) or a server error is no answer about the embed.
    expect([200, 401]).toContain(res.status);
  });
});
