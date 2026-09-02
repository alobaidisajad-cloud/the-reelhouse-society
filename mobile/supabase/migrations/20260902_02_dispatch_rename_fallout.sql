-- ═══════════════════════════════════════════════════════════════════════════
-- THE DISPATCH · STEP TWO · WHAT THE RENAME TOOK WITH IT
--
-- Step one renamed dispatch_dossiers, dossier_comments and dossier_certifications
-- and put views in their place. A rename carries the table's TRIGGERS, INDEXES
-- and CONSTRAINTS along with it — so four live controls that were attached to
-- those tables are now attached to `*_legacy` tables that nothing writes to, and
-- the new tables have nothing in their place.
--
-- Nothing here is new design. Every item is a control that was live on
-- 2026-09-01 and stopped being live on 2026-09-02, or a rule the rest of this
-- database already follows that the new tables were not given.
--
-- Found by enumerating every statement in this repo that ever named one of the
-- three renamed tables, rather than by recalling what they carried.
--
-- Runs inside ONE transaction. If any statement fails, nothing happens at all.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.dispatch_posts') IS NULL THEN
    RAISE EXCEPTION 'dispatch_posts is missing — run step one first';
  END IF;
  IF to_regprocedure('public.derive_author_username_column()') IS NULL THEN
    RAISE EXCEPTION 'derive_author_username_column() not found — the handle cannot be derived';
  END IF;
  IF to_regprocedure('public.enforce_tier_gate()') IS NULL THEN
    RAISE EXCEPTION 'enforce_tier_gate() not found — the AUTEURS trigger gate cannot be restored';
  END IF;
END $preflight$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · ACCOUNT DELETION STOPPED ERASING NAMES
--
-- `request_account_deletion` erases a departed member's handle from everything
-- they wrote. Two of its statements are:
--
--   UPDATE public.dossier_comments  SET user_id = NULL, username = '[deleted]' …
--   UPDATE public.dispatch_dossiers SET user_id = NULL, author_username = '[deleted]' …
--
-- Both names are now views, so both statements fall through the INSTEAD OF
-- triggers step one wrote — and those triggers carried only the columns a member
-- edits. `user_id` and the handle were dropped on the floor. The function
-- reported success, the account went, and the name stayed legible on every
-- filing and every critique. It also stamped `edited_at` on all of them.
--
-- ── WHY THE TRIGGER AND NOT THE DELETION FUNCTION ──────────────────────────
-- Patching `request_account_deletion` would need its whole live body — which
-- this repo has disagreed with three times — and would fix one caller. The
-- views are what lie; the views are what get fixed. Every caller through the old
-- names is then correct whether it knows about any of this or not.
--
-- An erasure is recognised by its own shape (the handle going to a tombstone
-- while user_id goes to NULL) rather than by who called, so it needs no
-- cooperation from the caller at all.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dossiers_write() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.dispatch_posts
      (kind, user_id, author_username, title, body, full_content, is_published)
    VALUES ('dossier', NEW.user_id, NEW.author_username, NEW.title,
            coalesce(NEW.excerpt,''), NEW.full_content, coalesce(NEW.is_published,true))
    RETURNING id INTO NEW.id;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.dispatch_posts
       SET title           = NEW.title,
           body            = coalesce(NEW.excerpt,''),
           full_content    = NEW.full_content,
           is_published    = NEW.is_published,
           -- carried, so an erasure through this name is a real erasure
           user_id         = NEW.user_id,
           author_username = NEW.author_username,
           -- an erasure is not an edit: it must not move the essay up the feed
           updated_at      = CASE WHEN NEW.user_id IS NULL AND OLD.user_id IS NOT NULL
                                  THEN updated_at ELSE now() END
     WHERE id = OLD.id;
    RETURN NEW;

  ELSE
    DELETE FROM public.dispatch_posts WHERE id = OLD.id;
    RETURN OLD;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.dossier_comments_write() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body)
    VALUES (NEW.dossier_id, NEW.user_id, coalesce(NEW.username, ''), NEW.body)
    RETURNING id INTO NEW.id;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.dispatch_comments
       SET body            = NEW.body,
           user_id         = NEW.user_id,
           author_username = NEW.username,
           -- only a real edit is marked as one. An erasure changes the name and
           -- nothing else, and a critique that reads "edited" because its author
           -- closed their account is the app telling a small lie about a person
           -- who is no longer there to correct it.
           edited_at       = CASE WHEN NEW.body IS DISTINCT FROM OLD.body
                                  THEN now() ELSE edited_at END
     WHERE id = OLD.id;
    RETURN NEW;

  ELSE
    DELETE FROM public.dispatch_comments WHERE id = OLD.id;
    RETURN OLD;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · THE HANDLE WAS BEING TAKEN FROM THE CLIENT AGAIN
--
-- `author_username` is a copy of `profiles.username` frozen into the row. Batch
-- 15 established that such a copy must be DERIVED on write, never accepted from
-- whoever sent the insert — otherwise anyone can file under anyone's name, and
-- the feed, the share card and the notification all repeat it.
--
-- The trigger that did that was on dispatch_dossiers and dossier_comments. It
-- went with the rename. Every filing and critique written since step one has
-- taken the client's word for who wrote it.
--
-- The existing function is reused unchanged — both new tables spell the column
-- `author_username`, so both take the author variant. It CORRECTS rather than
-- rejects: a queued write carrying a stale handle is not an attack, and losing
-- the member's words to an error they cannot read would be the worse failure.
--
-- Ordering with `scrub_departed` is decided by name, and Postgres fires BEFORE
-- triggers alphabetically: scrub_departed, then trg_derive_username. Scrub sets
-- the tombstone when user_id goes NULL; derive then sees a NULL user_id and
-- returns without touching it. Correct in both directions, by construction.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_derive_username ON public.dispatch_posts;
CREATE TRIGGER trg_derive_username
BEFORE INSERT OR UPDATE ON public.dispatch_posts
FOR EACH ROW EXECUTE FUNCTION public.derive_author_username_column();

DROP TRIGGER IF EXISTS trg_derive_username ON public.dispatch_comments;
CREATE TRIGGER trg_derive_username
BEFORE INSERT OR UPDATE ON public.dispatch_comments
FOR EACH ROW EXECUTE FUNCTION public.derive_author_username_column();

-- ── AND A RENAME MUST STILL REACH THEM ─────────────────────────────────────
-- The other half of the same pair: when a member changes their handle, every
-- frozen copy is rewritten. That function still names the two views, where the
-- column it sets no longer exists in the same shape — so a rename reached
-- neither filings nor critiques, and (before §1 above) stamped every critique
-- as edited on the way past.
--
-- Only the two dossier lines change. log_comments and video_reviews are
-- untouched tables and keep the statements they already had.
CREATE OR REPLACE FUNCTION public.sync_denormalized_username()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN

    UPDATE public.dispatch_posts
       SET author_username = NEW.username
     WHERE user_id = NEW.id
       AND author_username IS DISTINCT FROM NEW.username;

    UPDATE public.dispatch_comments
       SET author_username = NEW.username
     WHERE user_id = NEW.id
       AND author_username IS DISTINCT FROM NEW.username;

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
END $$;

REVOKE ALL ON FUNCTION public.sync_denormalized_username() FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · ONE TOMBSTONE STRING, NOT TWO
--
-- Seven tables mark a departed member as '[deleted]', and `lounge.ts:215` is the
-- client that reads it. Step one invented '[a member, departed]' for the new
-- tables — prettier, and wrong: the same person would have read as '[deleted]'
-- on their log comments and as something else on their filings, in the same
-- scroll. A house voice that is not the same everywhere is not a voice.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dispatch_scrub_departed() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF NEW.user_id IS NULL AND OLD.user_id IS NOT NULL THEN
    NEW.author_username := '[deleted]';
  END IF;
  RETURN NEW;
END $$;

-- and anything the carry-over already wrote in the other dialect
UPDATE public.dispatch_posts    SET author_username = '[deleted]'
 WHERE author_username = '[a member, departed]';
UPDATE public.dispatch_comments SET author_username = '[deleted]'
 WHERE author_username = '[a member, departed]';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · THE SECOND AUTEURS GATE
--
-- Publishing an essay was guarded TWICE: by an RLS policy, and by a BEFORE
-- INSERT trigger. That is not redundancy — a policy is skipped entirely by any
-- SECURITY DEFINER function that writes the table, and this database has many.
-- Step one rebuilt the policy and not the trigger, so the gate went from two
-- independent locks to one.
--
-- The existing `enforce_tier_gate` is reused, with a WHEN clause instead of a
-- new function: the policy gates on kind (a take is free, a ballot and a dossier
-- are AUTEURS), so the trigger must gate on exactly the same condition or the
-- two disagree — and a free member filing a take would meet a refusal the screen
-- never predicted.
--
-- Its search_path is also re-pinned from `public` to `public, pg_temp` while it
-- is in hand. A pin without pg_temp does not stop a temp-schema hijack — proved
-- live in batch 29, where the same pin had been applied 68 times and did
-- nothing. The body only calls schema-qualified names, so the change is
-- behaviour-neutral, and it hardens every other trigger that uses this function.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_tier_gate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_tier_at_least(TG_ARGV[0]::integer) THEN
    RAISE EXCEPTION '%', TG_ARGV[1] USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_tier_gate_dispatch ON public.dispatch_posts;
CREATE TRIGGER tr_tier_gate_dispatch
BEFORE INSERT ON public.dispatch_posts
FOR EACH ROW WHEN (NEW.kind IN ('ballot','dossier'))
EXECUTE FUNCTION public.enforce_tier_gate(2, 'The Dispatch is an Auteur feature');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · THE NOTICES LOST THE ONE THING THAT MADE THEM READABLE
--
-- A whole migration (20260714_01_notification_voice) existed to fix pushes the
-- member "literally could not understand", and its two named defects were a
-- notice that did not say WHICH thing and one that used the wrong noun. It
-- ended at:
--
--   'certified your dossier “{title}”.'
--   'left a critique on your dossier “{title}”.'
--
-- Step one replaced both with 'certified your dossier' — no title, no full stop
-- — which is the exact defect that migration was written to remove. Restored
-- here, and extended to the four kinds that did not exist then.
--
-- The kind's own noun is used with no exceptions, because the app already talks
-- this way about itself ("a seeking is a poster of somebody's question"), and a
-- rule with one special case is a rule nobody can check.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dispatch_names(p_kind text, p_title text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp' AS $$
  SELECT 'your ' || coalesce(p_kind, 'filing')
      || CASE WHEN btrim(coalesce(p_title,'')) = '' THEN ''
              ELSE ' “' || btrim(p_title) || '”' END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_notify_critique() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE p record;
BEGIN
  SELECT id, user_id, kind, title INTO p
    FROM public.dispatch_posts WHERE id = NEW.post_id;
  PERFORM public.dispatch_notify(
    p.user_id, NEW.user_id, 'comment',
    'left a critique on ' || public.dispatch_names(p.kind, p.title) || '.',
    jsonb_build_object('dispatch_post_id', p.id, 'kind', p.kind,
                       'title', p.title, 'comment_id', NEW.id),
    'endorse:post:' || p.id);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_notify_certify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE p record; c record;
BEGIN
  IF NEW.post_id IS NOT NULL THEN
    SELECT id, user_id, kind, title INTO p
      FROM public.dispatch_posts WHERE id = NEW.post_id;
    PERFORM public.dispatch_notify(
      p.user_id, NEW.user_id, 'endorse',
      'certified ' || public.dispatch_names(p.kind, p.title) || '.',
      jsonb_build_object('dispatch_post_id', p.id, 'kind', p.kind, 'title', p.title),
      'endorse:post:' || p.id);
  ELSE
    SELECT id, user_id, post_id INTO c
      FROM public.dispatch_comments WHERE id = NEW.comment_id;
    PERFORM public.dispatch_notify(
      c.user_id, NEW.user_id, 'endorse',
      'certified your critique.',
      jsonb_build_object('dispatch_post_id', c.post_id, 'comment_id', c.id),
      'endorse:post:' || c.post_id);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_notify_answer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE c record;
BEGIN
  IF NEW.answer_id IS NULL OR NEW.answer_id IS NOT DISTINCT FROM OLD.answer_id THEN
    RETURN NEW;
  END IF;
  SELECT id, user_id INTO c FROM public.dispatch_comments WHERE id = NEW.answer_id;
  PERFORM public.dispatch_notify(
    c.user_id, NEW.user_id, 'comment',
    'took your critique as the answer.',
    jsonb_build_object('dispatch_post_id', NEW.id, 'kind', NEW.kind, 'comment_id', c.id),
    'endorse:post:' || NEW.id);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_notify_ballot_closed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v record; msg text;
BEGIN
  IF NEW.frozen_totals IS NULL OR OLD.frozen_totals IS NOT NULL THEN RETURN NEW; END IF;
  msg := CASE WHEN btrim(coalesce(NEW.title,'')) = ''
              THEN 'A ballot you voted in has closed.'
              ELSE 'The ballot “' || btrim(NEW.title) || '” you voted in has closed.' END;
  FOR v IN SELECT DISTINCT user_id FROM public.dispatch_votes WHERE post_id = NEW.id LOOP
    INSERT INTO public.notifications (user_id, type, message, metadata, group_key)
    SELECT v.user_id, 'system', msg,
           jsonb_build_object('dispatch_post_id', NEW.id, 'kind', 'ballot',
                              'title', NEW.title),
           'endorse:post:' || NEW.id
     WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = v.user_id);
  END LOOP;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_names(text, text) FROM PUBLIC, anon, authenticated;

-- ── AND THE TWO FUNCTIONS THAT NOW POINT AT NOTHING ────────────────────────
-- notify_on_dossier_certify and notify_on_dossier_comment read the view and are
-- fired by triggers that now sit on the *_legacy tables, which nothing writes.
-- They are left exactly where they are: dropping them would be a second
-- irreversible change in a week that has already had one, they cost nothing, and
-- if the legacy tables are ever restored their triggers must still work.

-- ═══════════════════════════════════════════════════════════════════════════
-- 6 · SEVEN TEXT COLUMNS AND ONE JSONB WITH NO CEILING
--
-- Batch 27 put a ceiling on all 130 text and jsonb columns in this database, on
-- the rule that an uncapped column is a column somebody can fill. Step one added
-- eight more and capped only the ones a composer types into.
--
-- Every number here is the one this database already uses for that kind of
-- value — handles 100, film titles 300, paths and URLs 2048 — rather than a
-- fresh judgement, so the Dispatch cannot drift from the rest of the house.
--
-- `frozen_totals` is written only by freeze_closed_ballots, never by a member.
-- It is capped anyway: six options at the widest plausible tally is under 400
-- bytes, so 4000 cannot bind on honest input, and "only the server writes it" is
-- a claim about today's callers, not a property of the column.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.dispatch_posts
  ADD CONSTRAINT handle_ceiling        CHECK (char_length(author_username) <= 100),
  ADD CONSTRAINT subject_title_ceiling CHECK (subject_title IS NULL OR char_length(subject_title) <= 300),
  ADD CONSTRAINT subject_sub_ceiling   CHECK (subject_sub   IS NULL OR char_length(subject_sub)   <= 300),
  ADD CONSTRAINT subject_image_ceiling CHECK (subject_image IS NULL OR char_length(subject_image) <= 2048),
  ADD CONSTRAINT source_url_ceiling    CHECK (source_url    IS NULL OR char_length(source_url)    <= 2048),
  ADD CONSTRAINT series_title_ceiling  CHECK (series_title  IS NULL OR char_length(series_title)  <= 300),
  ADD CONSTRAINT frozen_ceiling        CHECK (frozen_totals IS NULL OR char_length(frozen_totals::text) <= 4000);

ALTER TABLE public.dispatch_comments
  ADD CONSTRAINT handle_ceiling CHECK (char_length(author_username) <= 100);

COMMIT;
