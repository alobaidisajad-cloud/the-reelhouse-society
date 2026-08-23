-- ════════════════════════════════════════════════════════════════════════════
-- get_user_analytics — close the privacy hole, and make it answer honestly
--                      at any size.
--
-- ── WHY THIS IS URGENT ──────────────────────────────────────────────────────
-- The shipping version runs SECURITY DEFINER and NEVER checks whether the
-- caller may see the member. Its two sibling functions both call
-- `can_view_user_data`; this one calls nothing. So a member's total films,
-- average rating, rating spread, monthly activity and streaks are readable by
-- anybody holding the anon key — INCLUDING for a member who set their profile
-- to private. That is live today.
--
-- ── THE THREE OTHER DEFECTS FIXED HERE ──────────────────────────────────────
-- 1. `monthly_activity` was clipped to `NOW() - INTERVAL '12 months'`. The
--    Archive and the Ledger group a member's whole history by month, so for
--    anyone past their first year the counts simply stopped existing. A
--    member with twelve years of viewing got one year of truth and eleven of
--    nothing.
--
-- 2. `format_breakdown` reads `logs.format` — HOW A FILM WAS WATCHED. The
--    Vault is `physical_archive.formats` — WHAT THE MEMBER OWNS. Two unrelated
--    columns with confusingly similar names. Wiring the Vault's shelves to the
--    old field would have produced numbers that looked entirely plausible and
--    described something else. `format_breakdown` is left exactly as it was
--    (something may yet want it); `vault_formats` is the new, correct one.
--
-- 3. Nothing served the Watchlist's decade filter, so it was built from
--    whichever page happened to be loaded — and a member whose only 1940s film
--    sat on page eight had no 1940s button at all. Not a wrong count: a filter
--    that could not be reached.
--
-- ── WHY THIS CANNOT BREAK THE BUILD ON TESTFLIGHT ───────────────────────────
-- Of everything this function returns, the shipped app reads exactly ONE field:
-- `current_streak`. `monthly_activity`, `format_breakdown`, `longest_streak`,
-- `rating_distribution` and `avg_rating` are fetched and discarded (verified by
-- sweeping the client for every reader). So widening them reaches nothing.
--
-- `current_streak` itself is unchanged — except that for a profile the caller
-- may not see it now returns nothing instead of a number. The client already
-- handles that: `analyticsSummary?.current_streak ?? null`, and a null falls
-- back to computing the streak from the logs it holds, which for a sealed
-- profile is none. Zero. Which is the correct answer, and the one the sealed
-- room shows anyway.
--
-- Rehearsed on PostgreSQL 18 against a 2,700-log / 900-disc / 1,400-watchlist
-- model spanning twelve years, with dual-format discs, format-less discs, and
-- watchlist years that are NULL, empty and non-numeric.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_user_analytics(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE                       -- was VOLATILE by omission; it only reads
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- THE GATE. The same one `get_profile_counts` and
  -- `get_public_profile_analytics` already use, so all three finally agree on
  -- who may see what. Today this one agrees with nothing.
  --
  -- Deliberately NOT also requiring `auth.uid() IS NOT NULL`: a public
  -- profile's counts are already readable logged-out through
  -- `get_profile_counts`, and its logs are readable directly. Being stricter
  -- here than the data itself would break logged-out profile viewing on the
  -- web while protecting nothing.
  IF NOT public.can_view_user_data(p_user_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT json_build_object(
    'total_logs', (
      SELECT COUNT(*) FROM logs WHERE user_id = p_user_id
    ),

    'avg_rating', (
      SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)
      FROM logs WHERE user_id = p_user_id AND rating > 0
    ),

    -- Feeds the Ledger's rating chips, which carry no counts at all today.
    'rating_distribution', (
      SELECT COALESCE(json_agg(row_to_json(rd)), '[]'::json)
      FROM (
        SELECT rating, COUNT(*) as count
        FROM logs
        WHERE user_id = p_user_id AND rating > 0
        GROUP BY rating
        ORDER BY rating
      ) rd
    ),

    -- THE WHOLE HISTORY. The 12-month window is gone — see note 1 above.
    -- Bounded by the member's own months, not by row count: even twenty years
    -- of viewing is 240 rows of {month, count}, a few kilobytes.
    --
    -- COALESCE(watched_date, created_at) matches `groupByMonth` in the client
    -- exactly. If these two ever disagree about which date a film belongs to,
    -- the heading and the films beneath it drift apart silently.
    'monthly_activity', (
      SELECT COALESCE(json_agg(row_to_json(ma)), '[]'::json)
      FROM (
        SELECT TO_CHAR(COALESCE(watched_date::date, created_at::date), 'YYYY-MM') as month,
               COUNT(*) as count
        FROM logs
        WHERE user_id = p_user_id
        GROUP BY month
        ORDER BY month DESC
      ) ma
    ),

    -- ── FIXED: this number was 1 or 0 for every member in the app ──────────
    --
    -- The gaps-and-islands trick works because `date - row_number()` holds
    -- STILL along a run of consecutive days. That is only true ASCENDING. Read
    -- descending, the date falls by one while the row number climbs by one, so
    -- the expression moves by TWO every row and never repeats:
    --
    --      d          rn   d - rn        d + rn
    --      Aug 23      1   Aug 22        Aug 24   <- constant
    --      Aug 22      2   Aug 20        Aug 24
    --      Aug 21      3   Aug 18        Aug 24
    --
    -- Five consecutive days therefore produced FIVE groups of one. The count
    -- of the group containing today is 1, always — so a member on a 47-day run
    -- was shown a streak of 1, and the client believed it (a number is not
    -- null, so the local fallback never ran). `longest_streak`, four lines
    -- below, reads ASCENDING and has been correct all along.
    --
    -- Ordered ascending here too, so the two now agree by construction.
    --
    -- Two smaller repairs in the same expression:
    --   • `LIMIT 1` with no ORDER BY picked an arbitrary row when both today
    --     and yesterday had logs. Both sit in the same run so the answer
    --     happened to match, but it was luck, not logic.
    --   • The 365-day window silently truncated a streak longer than a year to
    --     365. DISTINCT days is a few thousand rows even for a decade of daily
    --     viewing, so the window bought nothing and cost the truth.
    'current_streak', (
      WITH dates AS (
        SELECT DISTINCT COALESCE(watched_date::date, created_at::date) as log_date
        FROM logs WHERE user_id = p_user_id
      ),
      streak AS (
        SELECT log_date,
               log_date - (ROW_NUMBER() OVER (ORDER BY log_date))::int AS grp
        FROM dates
      )
      SELECT COALESCE((
        SELECT COUNT(*) FROM streak
        WHERE grp = (
          -- The run that reaches today, or yesterday — a day may still be
          -- added to today, so missing it does not end a streak. Same rule the
          -- client's computeDailyStreak() uses.
          SELECT grp FROM streak
          WHERE log_date >= CURRENT_DATE - 1
          ORDER BY log_date DESC
          LIMIT 1
        )
      ), 0)
    ),

    'longest_streak', (
      WITH dates AS (
        SELECT DISTINCT COALESCE(watched_date::date, created_at::date) as log_date
        FROM logs WHERE user_id = p_user_id
      ),
      streak AS (
        SELECT log_date,
               log_date - (ROW_NUMBER() OVER (ORDER BY log_date))::int AS grp
        FROM dates
      )
      SELECT COALESCE(MAX(cnt), 0)
      FROM (SELECT COUNT(*) as cnt FROM streak GROUP BY grp) s
    ),

    -- UNCHANGED. This is `logs.format` — how a film was watched. Kept exactly
    -- as it was so nothing that may come to depend on it shifts underneath.
    'format_breakdown', (
      SELECT COALESCE(json_agg(row_to_json(fb)), '[]'::json)
      FROM (
        SELECT format, COUNT(*) as count
        FROM logs
        WHERE user_id = p_user_id AND format IS NOT NULL AND format != ''
        GROUP BY format
        ORDER BY count DESC
      ) fb
    ),

    -- NEW — the Vault's actual shelves, from the actual table.
    --
    -- A copy is counted on EVERY shelf it belongs to, because `formats` is an
    -- array and a Criterion Blu-ray genuinely stands on two. That is exactly
    -- what the Vault room draws, so the chip and the shelf agree by
    -- construction. It also means these counts SUM TO MORE than vault_count,
    -- deliberately: they answer "how many on this shelf", not "how many discs".
    --
    -- LEFT JOIN LATERAL, not a plain unnest: an unnest of an empty array
    -- produces no rows at all, so every disc with no format recorded would
    -- vanish from a member's own vault without trace. NULLIF collapses the
    -- empty array to NULL, the LEFT JOIN keeps the row, and it lands on
    -- 'unfiled' — the shelf the room already draws for exactly these.
    'vault_formats', (
      SELECT COALESCE(json_agg(row_to_json(vf)), '[]'::json)
      FROM (
        SELECT COALESCE(f, 'unfiled') AS format, COUNT(*) AS count
        FROM physical_archive pa
        LEFT JOIN LATERAL unnest(NULLIF(pa.formats, '{}')) AS f ON TRUE
        WHERE pa.user_id = p_user_id
        GROUP BY 1
        ORDER BY count DESC
      ) vf
    ),

    -- NEW — every decade the member's queue actually spans.
    --
    -- The regex guard is not defensive padding: `get_public_profile_analytics`
    -- already guards `logs.year` the same way, which says the column has held
    -- non-numeric values. A bare `::int` would raise 22P02 and take the WHOLE
    -- payload down — including current_streak, which the shipped app reads.
    -- One malformed year would have broken the streak for everyone.
    'watchlist_decades', (
      SELECT COALESCE(json_agg(row_to_json(wd)), '[]'::json)
      FROM (
        SELECT ((year::text)::int / 10) * 10 AS decade, COUNT(*) AS count
        FROM watchlists
        WHERE user_id = p_user_id
          AND year::text ~ '^\d+$'
          AND (year::text)::int > 0
        GROUP BY 1
        ORDER BY 1 DESC
      ) wd
    )
  ) INTO result;

  RETURN result;
END;
$function$;
