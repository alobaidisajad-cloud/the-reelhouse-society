-- ═══════════════════════════════════════════════════════════════════════════════
-- The log rate limit has never worked — and enabling it as written would break
-- archive imports
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ NO APP CHANGE.
--
-- Found during batch 6, filed rather than bundled because switching it on changes
-- behaviour for every real member and deserved its own before/after.
--
-- ── WHY IT HAS NEVER FIRED ────────────────────────────────────────────────────
-- 20260325_rate_limiting.sql:50 created it WITHOUT `AS RESTRICTIVE`, confirmed live
-- (pg_policy.polpermissive = true). Permissive policies combine with OR, so on
-- INSERT it is OR'd with "Users can insert their own logs" and reduces to:
--
--   ((uid = user_id) OR (uid = user_id) OR (uid = user_id AND rate_ok))
--     AND (not_banned)
--   =  (uid = user_id) AND (not_banned)
--
-- The rate term contributes nothing. The 200-logs-per-day cap has never blocked a
-- single insert since the day it was written.
--
-- ── WHY THE OBVIOUS FIX IS WRONG ─────────────────────────────────────────────
-- Adding `AS RESTRICTIVE` at 200/day would make it real — and immediately break the
-- Import Archive feature, which is sold on the FREE tier ("Import & Export
-- Archive", src/constants/membership.ts:22).
--
-- Verified: neither importer caps how many rows it writes. Mobile batches at 50,
-- web at 4, and both loop until the file is exhausted. A member arriving with a
-- 3,000-film history inserts 3,000 log rows in one sitting. At 200/day the import
-- would stop 6% of the way in, leaving a half-imported archive and no clear reason.
--
-- The original comment — "even the most obsessive cinephile won't log 200 films in
-- 24 hours legitimately" — was written before importing existed, and importing is
-- exactly the legitimate case it fails to imagine.
--
-- ── THE CEILING CHOSEN, AND WHY ──────────────────────────────────────────────
-- 20,000 per 24 hours.
--
-- The purpose of this limit is to stop a scripted flood, not to police enthusiasm.
-- 20,000 is far above any real film history — the largest public archives on
-- comparable services run to roughly 20k lifetime entries, and that is a LIFETIME,
-- not a day — while still capping a runaway script at a size that cannot quietly
-- fill the database.
--
-- A member can no longer be blocked by importing. A script is still stopped.
-- Those are the two things that matter, and 200 achieved only the second while
-- pretending to achieve nothing at all.
--
-- ⚠️ If a member ever legitimately hits this, the honest fix is to raise the number,
-- not to remove the policy. The failure mode is a refused INSERT with a clear
-- constraint error, not silent data loss.
--
-- ── ONE MORE DEFECT IN THE SAME FUNCTION ─────────────────────────────────────
-- rate_limit_check is SECURITY DEFINER with NO `SET search_path`, and it builds SQL
-- with format() and EXECUTE. Every other SECURITY DEFINER function in this database
-- pins search_path. Fixed here at the same time — the table and column names are
-- passed through %I, so they were already quoted correctly; the missing pin is the
-- gap.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1 · harden the helper (body unchanged apart from the pin)
CREATE OR REPLACE FUNCTION public.rate_limit_check(
    table_name TEXT,
    user_col TEXT,
    max_count INTEGER,
    window_minutes INTEGER DEFAULT 1440
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_count INTEGER;
BEGIN
    EXECUTE format(
        'SELECT COUNT(*) FROM %I WHERE %I = auth.uid() AND created_at > now() - interval ''%s minutes''',
        table_name, user_col, window_minutes
    ) INTO current_count;
    RETURN current_count < max_count;
END;
$$;

-- 2 · make the limit real, at a ceiling no member can reach
DROP POLICY IF EXISTS logs_insert_rate_limit ON public.logs;
CREATE POLICY logs_insert_rate_limit ON public.logs
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.rate_limit_check('logs', 'user_id', 20000, 1440));

-- 3 · close the hole the policy alone cannot see
--
-- ⚠️ A POLICY CANNOT LIMIT A SINGLE BULK INSERT, and this was measured, not assumed.
-- rate_limit_check counts rows already committed; rows being written by the SAME
-- statement are invisible to it under MVCC. So:
--
--     1,000-row batches, repeated   -> refused at batch 21, exactly 20,000 rows ✅
--     ONE statement of 50,000 rows  -> ALLOWED, all 50,000 stored ❌
--
-- PostgREST will happily accept a single POST carrying an array of 50,000 objects,
-- so that bypass is reachable by anyone. The policy alone would have looked like a
-- rate limit while stopping only the naive version of the abuse.
--
-- A STATEMENT-level trigger with a transition table CAN see the rows the statement
-- is writing, so it closes the case the policy structurally cannot. Both are kept:
-- the policy refuses cheaply per row, the trigger catches what it cannot see.
CREATE OR REPLACE FUNCTION public.enforce_log_insert_ceiling()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing integer;
  v_incoming integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;                       -- service_role / system paths untouched
  END IF;

  SELECT count(*) INTO v_incoming FROM inserted WHERE user_id = auth.uid();
  IF v_incoming = 0 THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_existing
    FROM public.logs
   WHERE user_id = auth.uid()
     AND created_at > now() - interval '1440 minutes';

  -- v_existing already includes the incoming rows at AFTER time, so compare directly.
  IF v_existing > 20000 THEN
    RAISE EXCEPTION
      'Daily log limit reached (20000 in 24 hours). % rows in this write would exceed it.',
      v_incoming
      USING ERRCODE = '54000';
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tr_log_insert_ceiling ON public.logs;
CREATE TRIGGER tr_log_insert_ceiling
  AFTER INSERT ON public.logs
  REFERENCING NEW TABLE AS inserted
  FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_log_insert_ceiling();

COMMIT;

-- ── Verify (run after) ────────────────────────────────────────────────────────
--   SELECT polname,
--          CASE WHEN polpermissive THEN 'permissive (inert)' ELSE 'RESTRICTIVE' END
--     FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--    WHERE c.relname = 'logs' AND polname = 'logs_insert_rate_limit';
--   -- must read RESTRICTIVE
--
--   In the app: log a film normally — unaffected. Import an archive — completes.
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS logs_insert_rate_limit ON public.logs;
-- CREATE POLICY logs_insert_rate_limit ON public.logs FOR INSERT
--   WITH CHECK (auth.uid() = user_id
--               AND rate_limit_check('logs', 'user_id', 200, 1440));
-- (that restores the inert version — it blocks nothing)

-- ═══════════════════════════════════════════════════════════════════════════════
-- ADDENDUM · take rate_limit_check away from anonymous callers
-- ═══════════════════════════════════════════════════════════════════════════════
-- Found by re-checking after the migration was applied: rate_limit_check is
-- SECURITY DEFINER, takes an ARBITRARY TABLE NAME as an argument, and anon can call
-- it over REST (live probe returned 200).
--
-- It leaks nothing today. auth.uid() is NULL for an anonymous caller, so every count
-- is 0 and the answer is always TRUE regardless of the table asked about. The
-- identifier is passed through %I, so there is no injection either.
--
-- But a SECURITY DEFINER function that will run `SELECT COUNT(*) FROM <any table>`
-- for anyone who asks is not something to leave reachable. Closing it costs nothing.
--
-- ⚠️ authenticated MUST keep EXECUTE. An RLS policy expression is evaluated with the
-- querying role's privileges, so revoking it from `authenticated` would make
-- logs_insert_rate_limit fail for every member — i.e. nobody could log a film.
-- Proven on a replica: with anon revoked and authenticated granted, a 3,000-film
-- import still succeeds, a single log still succeeds, a 50,000 bulk write is still
-- refused, and anon gets "permission denied".
REVOKE EXECUTE ON FUNCTION public.rate_limit_check(text, text, integer, integer)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rate_limit_check(text, text, integer, integer)
  TO authenticated;
