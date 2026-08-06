-- ════════════════════════════════════════════════════════════════════════════════
-- #87b · A handle stored beside a user_id must never be able to be wrong
-- ════════════════════════════════════════════════════════════════════════════════
-- Four tables store a copy of the author's handle next to their user_id. There are
-- THREE ways that copy goes wrong, and closing only one leaves the column just as
-- untrustworthy as before:
--
--   1. RENAME       profiles.username changes and nothing else does, so every dossier,
--                   critique and comment the member ever wrote keeps displaying a
--                   handle that resolves to nobody and whose tap-through goes nowhere.
--                   Six rows on this database are already stranded this way.
--
--   2. WRONG AT BIRTH  the handle is supplied by the CLIENT on insert. The offline
--                   queue persists across app updates, so a comment composed under an
--                   old handle can be written long after the rename — a row that is
--                   stale from the moment it exists, which a rename trigger will never
--                   revisit because no rename follows it.
--
--   3. FORGED       nothing server-side ever checked that copy against its author.
--                   RLS pins user_id to auth.uid(), so ownership cannot be faked — but
--                   the DISPLAYED handle was whatever the client chose to send, and it
--                   is the displayed handle members read. That is impersonation.
--
-- So the column stops being client data and becomes derived data: written from
-- profiles on every insert and update, re-synced on every rename, and back-filled once
-- for the rows already wrong.
--
-- THE CLASS IS FOUR TABLES, enumerated mechanically rather than from memory: every
-- username/author_username column in the schema, each then confirmed against the live
-- API. list_comments, lounge_messages, cinema_reviews, notifications, interactions,
-- reports, tips and programmes were each probed and carry no such column (42703).
-- video_reviews is EMPTY today — which is exactly why a fix covering only what has
-- already broken would have let the next one break silently.
--
-- Keyed on user_id, never on the old handle. Matching the old handle would miss rows
-- that had already drifted, and would rewrite rows belonging to whoever claimed that
-- handle next.
--
-- Wrapped in a transaction: this is run by hand, and a script that half-applies is
-- worse than one that does not run at all.
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── PART 1 · a rename carries to everything the member wrote ────────────────────
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


-- ── PART 2 · the copy is derived on write, not accepted from the client ─────────
-- Two plain functions rather than one clever one. A single function keyed on TG_ARGV
-- would need hstore or a jsonb round-trip to assign a column chosen at runtime — an
-- extension dependency, or per-row JSON work, on the hot path of every comment insert.
-- Three of the four tables share a column name; dispatch_dossiers is the odd one.
--
-- These silently CORRECT rather than reject. A member whose queued comment carries an
-- old handle has done nothing wrong and must not lose the comment, and an insert that
-- fails at the database is a crash the client cannot explain. The stored value is
-- simply the truth, whatever was sent.
CREATE OR REPLACE FUNCTION public.derive_username_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_handle text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;  -- nothing to derive from; never NULL out a NOT NULL column
  END IF;
  SELECT username INTO v_handle FROM public.profiles WHERE id = NEW.user_id;
  IF v_handle IS NULL THEN
    RETURN NEW;  -- no profile row (should not happen); leave what was sent
  END IF;
  NEW.username := v_handle;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.derive_author_username_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_handle text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT username INTO v_handle FROM public.profiles WHERE id = NEW.user_id;
  IF v_handle IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.author_username := v_handle;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.derive_username_column()        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.derive_author_username_column() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_denormalized_username()    FROM PUBLIC;

-- anon/authenticated inherit the PUBLIC grant, so the revokes above already cover
-- them; these are explicit belt-and-braces, guarded so a missing role cannot abort a
-- hand-run script.
DO $$
DECLARE r text; f text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH f IN ARRAY ARRAY[
        'public.derive_username_column()',
        'public.derive_author_username_column()',
        'public.sync_denormalized_username()'
      ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r);
      END LOOP;
    END IF;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_derive_username ON public.dispatch_dossiers;
CREATE TRIGGER trg_derive_username
BEFORE INSERT OR UPDATE ON public.dispatch_dossiers
FOR EACH ROW EXECUTE FUNCTION public.derive_author_username_column();

DROP TRIGGER IF EXISTS trg_derive_username ON public.dossier_comments;
CREATE TRIGGER trg_derive_username
BEFORE INSERT OR UPDATE ON public.dossier_comments
FOR EACH ROW EXECUTE FUNCTION public.derive_username_column();

DROP TRIGGER IF EXISTS trg_derive_username ON public.log_comments;
CREATE TRIGGER trg_derive_username
BEFORE INSERT OR UPDATE ON public.log_comments
FOR EACH ROW EXECUTE FUNCTION public.derive_username_column();

DROP TRIGGER IF EXISTS trg_derive_username ON public.video_reviews;
CREATE TRIGGER trg_derive_username
BEFORE INSERT OR UPDATE ON public.video_reviews
FOR EACH ROW EXECUTE FUNCTION public.derive_username_column();


-- ── PART 3 · repair the rows already stranded ───────────────────────────────────
-- Written as "wherever the copy disagrees with the source of truth", so it heals every
-- drifted row rather than only the six known ones — and is safe to run twice.
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


-- ── PART 4 · refuse to commit a half-fix ────────────────────────────────────────
-- If FORCE ROW LEVEL SECURITY were ever enabled on one of these tables, the back-fill
-- above could match zero rows and report success. This turns that silent no-op into a
-- loud failure, and the whole transaction rolls back rather than half-applying.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT 1 FROM public.dispatch_dossiers d JOIN public.profiles p ON p.id = d.user_id
      WHERE d.author_username IS DISTINCT FROM p.username
    UNION ALL
    SELECT 1 FROM public.dossier_comments c JOIN public.profiles p ON p.id = c.user_id
      WHERE c.username IS DISTINCT FROM p.username
    UNION ALL
    SELECT 1 FROM public.log_comments c JOIN public.profiles p ON p.id = c.user_id
      WHERE c.username IS DISTINCT FROM p.username
    UNION ALL
    SELECT 1 FROM public.video_reviews v JOIN public.profiles p ON p.id = v.user_id
      WHERE v.username IS DISTINCT FROM p.username
  ) s;

  IF n > 0 THEN
    RAISE EXCEPTION
      'Back-fill did not take: % row(s) still show a handle that is not their author''s. NOTHING has been changed — the whole script rolled back. Send this message back and it will be diagnosed.', n;
  END IF;

  RAISE NOTICE 'OK — every stored handle now matches its author.';
END $$;

COMMIT;
