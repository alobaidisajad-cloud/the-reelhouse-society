-- ════════════════════════════════════════════════════════════════════════════════
-- #87b · A rename leaves dead handles behind on everything you ever wrote
-- ════════════════════════════════════════════════════════════════════════════════
-- Four tables store a copy of the author's handle next to their user_id. Renaming
-- updates profiles.username and nothing else, so every dossier, critique and comment
-- the member ever wrote keeps displaying a handle that resolves to nobody — and whose
-- tap-through goes nowhere.
--
-- This is not hypothetical. Cross-referencing the live database against the 32 live
-- profiles, six rows are already stranded on `sajjadsaleel_`, a handle that matches no
-- profile, belonging to a user_id that is now `sajjadobaidi`:
--
--     dispatch_dossiers   1 of 1 rows
--     dossier_comments    1 of 1 rows
--     log_comments        4 of 7 rows
--     video_reviews       0 of 0 rows   (empty today, but the column is live)
--
-- The four tables are the COMPLETE class, enumerated mechanically rather than from
-- memory: every `username`/`author_username` column in the schema, then confirmed
-- one by one against the live API. list_comments, lounge_messages, cinema_reviews,
-- notifications, interactions, reports, tips and programmes were each probed and
-- carry no such column (42703).
--
-- Two parts, and both are needed: the trigger stops it happening again, the back-fill
-- repairs what already happened. Either alone leaves the bug half-open.
--
-- Keyed on user_id, never on the old handle. Matching the old handle would miss any
-- row that had already drifted, and would rewrite rows belonging to whoever claimed
-- that handle next.
-- ════════════════════════════════════════════════════════════════════════════════

-- ── PART 1 · keep them in step from now on ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_denormalized_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Defensive: the trigger's WHEN clause already guarantees this, but the guard
  -- survives someone recreating the trigger without it.
  IF NEW.username IS DISTINCT FROM OLD.username THEN

    UPDATE public.dispatch_dossiers
       SET author_username = NEW.username
     WHERE user_id = NEW.id
       AND author_username IS DISTINCT FROM NEW.username;

    UPDATE public.dossier_comments
       SET username = NEW.username
     WHERE user_id = NEW.id
       AND username IS DISTINCT FROM NEW.username;

    UPDATE public.log_comments
       SET username = NEW.username
     WHERE user_id = NEW.id
       AND username IS DISTINCT FROM NEW.username;

    UPDATE public.video_reviews
       SET username = NEW.username
     WHERE user_id = NEW.id
       AND username IS DISTINCT FROM NEW.username;

  END IF;

  RETURN NULL;  -- AFTER trigger: the return value is ignored
END;
$$;

-- SECURITY DEFINER is required: the four tables carry their own RLS, and a rename
-- must repair every row the member authored without depending on the exact shape of
-- those policies. search_path is pinned so the definer rights cannot be redirected at
-- a shadowed table.
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC. A trigger function cannot be
-- invoked directly (PostgreSQL refuses with "can only be called as a trigger"), so
-- this is belt-and-braces rather than a hole being closed — but a SECURITY DEFINER
-- function should never be callable by a role that has no business calling it.
REVOKE ALL ON FUNCTION public.sync_denormalized_username() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_denormalized_username() FROM anon;
REVOKE ALL ON FUNCTION public.sync_denormalized_username() FROM authenticated;

DROP TRIGGER IF EXISTS trg_sync_denormalized_username ON public.profiles;

-- AFTER, not BEFORE: this must see the handle exactly as it was finally stored, past
-- every BEFORE trigger on profiles that normalises or validates it. PostgreSQL runs
-- all BEFORE triggers ahead of all AFTER triggers, so that ordering is guaranteed by
-- the trigger type and does not depend on trigger names.
CREATE TRIGGER trg_sync_denormalized_username
AFTER UPDATE OF username ON public.profiles
FOR EACH ROW
WHEN (OLD.username IS DISTINCT FROM NEW.username)
EXECUTE FUNCTION public.sync_denormalized_username();


-- ── PART 2 · repair the rows already stranded ───────────────────────────────────
-- Keyed on user_id and written as "wherever the copy disagrees with the source of
-- truth", so it heals every drifted row rather than only the six known ones — and is
-- safe to run twice.
UPDATE public.dispatch_dossiers d
   SET author_username = p.username
  FROM public.profiles p
 WHERE p.id = d.user_id
   AND d.author_username IS DISTINCT FROM p.username;

UPDATE public.dossier_comments c
   SET username = p.username
  FROM public.profiles p
 WHERE p.id = c.user_id
   AND c.username IS DISTINCT FROM p.username;

UPDATE public.log_comments c
   SET username = p.username
  FROM public.profiles p
 WHERE p.id = c.user_id
   AND c.username IS DISTINCT FROM p.username;

UPDATE public.video_reviews v
   SET username = p.username
  FROM public.profiles p
 WHERE p.id = v.user_id
   AND v.username IS DISTINCT FROM p.username;
