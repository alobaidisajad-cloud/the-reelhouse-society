/**
 * A visitor reads what the app asks for — asked of production, as a visitor.
 * ─────────────────────────────────────────────────────────────────────────────
 * `anon` reads `logs` through COLUMN grants, not a table grant. A column added
 * to the table later is therefore invisible to a signed-out visitor until it is
 * granted by name — and PostgREST refuses the WHOLE request when one column is
 * refused. `logs.viewing_id` was added on 2026-09-17 and never granted, so for
 * nine days every log page and every member's list of logs failed for anyone
 * not signed in, while The Reel, which is open to them, linked to both. No test
 * could see it: every unit test mocks the database, and the grant lives only
 * in production. Fixed by 20260926_02.
 *
 * So this sends the app's OWN select strings — imported, never copied — to the
 * live API with the anon key, and fails on any refusal. A new column added to
 * PUBLIC_LOG_COLUMNS without a grant fails here the same day.
 *
 * It also pins the feed's counts: both feed functions must carry
 * `certify_count` and `critique_count` (20260926_01), or every card on The Reel
 * silently draws no numbers.
 *
 * Skips with no credentials or no network, like the other contract test.
 */
import { SUPABASE_URL, canRun, visitor } from '@/test-utils/contractEnv';
import { PUBLIC_LOG_COLUMNS } from '@/src/utils/mappers';
import { logCertifySelect, logCountsSelect, withLogCountFilters } from '@/src/services/logCounts';

const describeMaybe = canRun ? describe : describe.skip;

/**
 * The query string the app's own filter helper writes — recorded, not copied,
 * so a change to the helper is a change to what this sends.
 */
function filtersFor(viewerId: string | null): string {
  const parts: string[] = [];
  const recorder = { eq: (c: string, v: string) => { parts.push(`${c}=eq.${v}`); return recorder; } };
  withLogCountFilters(recorder, viewerId);
  return parts.join('&');
}
/** A member id in the right shape: a visitor may ask about anyone's public marks. */
const SOMEONE = '00000000-0000-4000-8000-000000000000';

/** GET as a visitor; null when the network is not there (infra, not a failure). */
async function asVisitor(path: string): Promise<{ status: number; body: string } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: visitor() });
    return { status: res.status, body: await res.text() };
  } catch {
    console.warn(`[visitor.contract] skipped ${path.slice(0, 40)}: network unavailable`);
    return null;
  }
}

const READS: { what: string; path: string }[] = [
  {
    what: 'a member’s list of logs (ProfileDataService)',
    path: `logs?select=${encodeURIComponent(PUBLIC_LOG_COLUMNS)}&limit=1`,
  },
  {
    what: 'the log page (LogService.getLogDetails)',
    path: `logs?select=${encodeURIComponent(`${PUBLIC_LOG_COLUMNS}, profiles!logs_user_id_fkey(username, avatar_url, role, display_name, member_no), ${logCertifySelect(null)}`)}&${filtersFor(null)}&limit=1`,
  },
  {
    what: 'a card, with its counts (the feed fallback and the film archive)',
    path: `logs?select=${encodeURIComponent(`id, film_id, profiles!logs_user_id_fkey(username, avatar_url, role), ${logCountsSelect(null)}`)}&${filtersFor(null)}&limit=1`,
  },
  // The member's shape of the same two requests — the table embedded twice,
  // each embed narrowed by its own alias. The API must accept it; a signed-in
  // member's own row security then decides what it counts.
  {
    what: 'the log page, as a member asks it (with the viewer’s own mark)',
    path: `logs?select=${encodeURIComponent(`${PUBLIC_LOG_COLUMNS}, ${logCertifySelect(SOMEONE)}`)}&${filtersFor(SOMEONE)}&limit=1`,
  },
  {
    what: 'a card, as a member asks it (with the viewer’s own mark)',
    path: `logs?select=${encodeURIComponent(`id, ${logCountsSelect(SOMEONE)}`)}&${filtersFor(SOMEONE)}&limit=1`,
  },
];

describeMaybe('a visitor reads what the app asks for', () => {
  jest.setTimeout(20000);

  it.each(READS)('$what', async ({ path }) => {
    const r = await asVisitor(path);
    if (!r) return;
    // 401 42501 is a refused column; 400 is a select the API cannot parse.
    expect({ status: r.status, body: r.status === 200 ? '' : r.body }).toEqual({ status: 200, body: '' });
  });

  it.each(['get_community_feed_auth_cursor'])('%s carries the two counts, and the viewer’s mark, on every row', async (fn) => {
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { ...visitor(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_limit: 3 }),
      });
    } catch {
      console.warn(`[visitor.contract] skipped ${fn}: network unavailable`);
      return;
    }
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Record<string, unknown>[];
    for (const row of rows) {
      expect(typeof row.certify_count).toBe('number');
      expect(typeof row.critique_count).toBe('number');
      // A visitor has certified nothing (20260926_03).
      expect(row.certified).toBe(false);
    }
  });
});
