-- ════════════════════════════════════════════════════════════════════════════
-- Four indexes — one per room, each matching one real query exactly.
--
-- ── THE PROBLEM ─────────────────────────────────────────────────────────────
-- Every one of these tables can already FIND a member's rows by index, so cost
-- scales with that member's own collection rather than with how many people
-- use the app. That part was fine.
--
-- What none of them had was an index in the ORDER the rooms read them. The
-- Archive and the Ledger page by `watched_date DESC, id DESC`; the only index
-- on watched_date is not user-scoped, and the user-scoped index is on a
-- DIFFERENT date column (created_at). So neither fits, and a member with
-- 10,000 films re-sorts all 10,000 rows on every page of scrolling — slower
-- precisely as someone becomes a heavy user, which is backwards.
--
-- Each index below is `(user_id, <the ordering column> DESC, id DESC)`: the
-- filter, the sort and the keyset tie-breaker in one structure, so a page is a
-- range scan instead of a scan-then-sort.
--
-- ── NULLS LAST IS NOT DECORATION ────────────────────────────────────────────
-- `watched_date` is nullable, and the client asks for it with
-- `{ ascending: false, nullsFirst: false }` — DESC NULLS LAST. SQL's default
-- for DESC is NULLS FIRST. An index whose null ordering disagrees with the
-- query's is simply never chosen, and nothing reports that: the query stays
-- correct and stays slow. Hence the explicit NULLS LAST on the first one only,
-- where it is what the query actually asks for.
--
-- ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
-- No index for the A–Z / Z–A sorts. Sorting a few thousand rows costs
-- milliseconds, and every index makes every write slower forever. They can be
-- added the day there is evidence somebody needs them — the reverse is much
-- harder to undo.
--
-- ── HOW TO RUN ──────────────────────────────────────────────────────────────
-- CONCURRENTLY cannot run inside a transaction block. Run these ONE AT A TIME,
-- not as one pasted block. They are additive and touch no data — the version
-- on TestFlight simply gets faster.
-- ════════════════════════════════════════════════════════════════════════════

-- The Archive and the Ledger. Both page by watch date; this is the heaviest
-- of the four because those two rooms hold the most rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_user_watched_id
  ON public.logs (user_id, watched_date DESC NULLS LAST, id DESC);

-- The Watchlist's default ("RECENT") order.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_watchlists_user_created_id
  ON public.watchlists (user_id, created_at DESC, id DESC);

-- The Vault's default order, within each shelf.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_physical_archive_user_created_id
  ON public.physical_archive (user_id, created_at DESC, id DESC);

-- The Stacks' default order.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lists_user_created_id
  ON public.lists (user_id, created_at DESC, id DESC);
