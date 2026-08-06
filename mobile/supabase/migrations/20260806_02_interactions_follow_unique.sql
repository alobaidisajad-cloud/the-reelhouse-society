-- ════════════════════════════════════════════════════════════════════════════════
-- #77 · Following someone while offline was silently discarded, permanently
-- ════════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- ── WHAT IS WRONG ─────────────────────────────────────────────────────────────
-- The app's offline follow handler writes:
--
--     INSERT INTO interactions … ON CONFLICT (user_id, target_user_id, type) DO NOTHING
--
-- and this table has no such constraint. Probed against production:
--
--     POST /interactions?on_conflict=user_id,target_user_id,type
--     → 42P10  "there is no unique or exclusion constraint matching the
--               ON CONFLICT specification"
--
-- That message contains the word "unique", and the offline queue classified errors by
-- looking for that word — so every offline follow was filed as "already synced" and
-- dropped with no dead-letter, no toast and no error report. The optimistic follow
-- stayed on screen until the next launch's hydrate erased it.
--
-- The client half of that (judging SQLSTATE instead of prose) is already shipped. This
-- is the half that makes the write actually work.
--
-- ── WHY A FULL CONSTRAINT AND NOT A PARTIAL INDEX ─────────────────────────────
-- A partial unique index restricted to the follow types would express the intent more
-- precisely, and it does NOT work: PostgreSQL cannot infer a partial index as the
-- arbiter for `ON CONFLICT (cols)` unless the statement repeats the predicate, which
-- PostgREST never emits. Measured on PostgreSQL 18, not assumed:
--
--     no constraint          → 42P10
--     PARTIAL unique index   → 42P10   (still fails)
--     FULL unique constraint → works, duplicate ignored
--
-- ── WHAT IT DOES NOT TOUCH ────────────────────────────────────────────────────
-- Endorsements, reactions and retransmits carry NULL in target_user_id, and PostgreSQL
-- treats NULLs as distinct in a unique constraint — so they stay unconstrained. That is
-- 90 of the 101 live rows, verified by reading them.
--
-- ── IT ALSO FIXES A DUPLICATE NOBODY FILED ────────────────────────────────────
-- `tr_enforce_privacy_on_follow` is a BEFORE INSERT trigger that rewrites a `follow`
-- into a `follow_request` for a private target. BEFORE triggers run ahead of conflict
-- detection, so the arbiter sees the REWRITTEN row — proven on PostgreSQL 18. Today,
-- following a private account twice offline inserts two pending-request rows. With this
-- constraint the second is a no-op.
--
-- ── SAFE TO APPLY TODAY ───────────────────────────────────────────────────────
-- 101 live interaction rows, ZERO duplicate (user_id, target_user_id, type) groups.
-- Re-checked by this script anyway, because "it was true when I looked" is not a
-- guarantee about the moment you press Run.
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1 · refuse to proceed on dirty data, with a readable reason ────────────────
-- A bare ALTER would fail here too, but with a message that names neither the table's
-- meaning nor what to do about it.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT 1
      FROM public.interactions
     WHERE target_user_id IS NOT NULL
     GROUP BY user_id, target_user_id, type
    HAVING count(*) > 1
  ) d;

  IF n > 0 THEN
    RAISE EXCEPTION
      'Cannot add the constraint: % duplicate (user_id, target_user_id, type) group(s) exist. NOTHING has been changed — the whole script rolled back. Send this message back and the de-duplication will be written for your exact rows.', n;
  END IF;
END $$;

-- ── 2 · the constraint ─────────────────────────────────────────────────────────
-- Guarded so the script is safe to run twice: ADD CONSTRAINT is not idempotent on its
-- own, and a hand-run migration should never punish a second Run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'interactions_user_target_type_key'
       AND conrelid = 'public.interactions'::regclass
  ) THEN
    ALTER TABLE public.interactions
      ADD CONSTRAINT interactions_user_target_type_key
      UNIQUE (user_id, target_user_id, type);
  END IF;
END $$;

-- ── 3 · refuse to commit unless it is actually there ───────────────────────────
-- A migration that reports success without having changed anything is how #77 stayed
-- hidden for a whole audit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'interactions_user_target_type_key'
       AND conrelid = 'public.interactions'::regclass
       AND contype = 'u'
  ) THEN
    RAISE EXCEPTION 'The constraint was not created. NOTHING has been changed — the whole script rolled back.';
  END IF;

  RAISE NOTICE 'OK — offline follows can now be written. Duplicate follows are no longer possible.';
END $$;

COMMIT;
