-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 1B (interim) · finding #26 — take private_notes away from the ANON key
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ THE WEB APP MUST BE DEPLOYED FIRST (commit 4d274c2). See "Prerequisite".
--
-- THE LEAK. `logs.private_notes` is served to anonymous callers:
--     GET /rest/v1/logs?select=private_notes   ->  HTTP 200, real note returned
-- The anon key ships inside the iOS binary and is served in plaintext by the web
-- app, so this is "readable by anyone on the internet". RLS is row-level and has
-- no column dimension, so no policy can express "this column, owner only".
--
-- WHY NOT the full fix (a separate log_private_notes table) YET. The app is on
-- TestFlight and will not receive a new build until all 33 audit batches are done.
-- Moving the column now would make the LIVE build show empty notes and overwrite
-- them on the next edit — data loss for real testers. The table migration ships
-- with the launch build; this closes the internet-facing half today.
--
-- WHY A COLUMN GRANT WORKS HERE. Postgres will not subtract a column from a
-- table-wide grant, and `GRANT ALL ON TABLE public.logs TO anon` is exactly that.
-- So the table-level SELECT is revoked and the 26 non-sensitive columns are
-- granted back explicitly. private_notes is simply never granted.
--
-- PROVEN ON A REPLICA before applying:
--     BEFORE  anon SELECT private_notes -> the note
--             anon SELECT *             -> works
--     AFTER   anon SELECT private_notes -> permission denied for table logs
--             anon SELECT *             -> permission denied for table logs
--             anon SELECT id (count)    -> still works
--             AUTHENTICATED             -> still reads private_notes  ← TestFlight safe
--
-- PREREQUISITE (already shipped): MarqueeBoard.tsx:19 and FilmHero.tsx:43 ran
-- `select('*', { count:'exact', head:true })` on logs for logged-out visitors.
-- `select=*` expands to every column, so they would 403 the moment this lands.
-- Commit 4d274c2 changes both to `select('id', …)`. DEPLOY THAT FIRST.
--
-- ⚠️ INVARIANT: this is an explicit column allowlist. A column added to
-- public.logs will NOT be readable by anon until it is granted here. That fails
-- closed, which is the intent — but it must be recorded in the migration ledger
-- (batch 32) or a future column will look mysteriously invisible to logged-out
-- visitors.
-- ═══════════════════════════════════════════════════════════════════════════════

REVOKE SELECT ON public.logs FROM anon;

GRANT SELECT (
  id, user_id, film_id, film_title, rating, review, watched_date, format,
  created_at, poster_path, year, status, is_spoiler, watched_with,
  abandoned_reason, physical_media, is_autopsied, autopsy, alt_poster,
  editorial_header, drop_cap, pull_quote, updated_at, video_url,
  viewing_history, view_count
) ON public.logs TO anon;
-- private_notes is deliberately absent. That is the entire fix.

-- ── Verify (run after) ─────────────────────────────────────────────────────────
--   as anon:  GET /rest/v1/logs?select=private_notes   -> must be 401/403, NOT 200
--   as anon:  GET /rest/v1/logs?select=id&limit=1      -> must still be 200
--   as anon:  GET /rest/v1/logs?select=*&limit=1       -> now 403 (expected)
--   web:      open a film page logged out — the log count must still render
--   mobile:   open the TestFlight build, view your own log — notes still visible
--
-- ── Rollback ───────────────────────────────────────────────────────────────────
-- GRANT SELECT ON public.logs TO anon;
