-- ═══════════════════════════════════════════════════════════════════════════
-- THE DISPATCH · STEP ONE · PRODUCTION
--
-- Runs inside ONE transaction. If any statement fails, nothing happens at all.
--
-- ⚠ This is NOT the rehearsal script. That one opens with DROP SCHEMA public
--   CASCADE and stubs your tables, which is what makes it a rehearsal and what
--   would make running it catastrophic. This script creates and migrates; it
--   drops nothing.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── PREFLIGHT ──────────────────────────────────────────────────────────────
-- Refuse to run against a database that is not the one this was written for.
-- A migration that half-applies to an unexpected shape is worse than one that
-- declines to start.
DO $preflight$
DECLARE clash text;
BEGIN
  IF to_regclass('public.dispatch_dossiers') IS NULL THEN
    RAISE EXCEPTION 'dispatch_dossiers is missing — this is not the database this migration expects';
  END IF;
  IF to_regclass('public.dispatch_posts') IS NOT NULL THEN
    RAISE EXCEPTION 'dispatch_posts already exists — step one has already been run';
  END IF;
  IF to_regclass('public.notifications') IS NULL OR to_regclass('public.reports') IS NULL THEN
    RAISE EXCEPTION 'notifications or reports is missing — stop and look';
  END IF;

  -- ── THE GATES THIS MIGRATION LEANS ON, AT THE SIGNATURE IT CALLS THEM ────
  -- Every RESTRICTIVE policy below calls one of these. If a live one takes
  -- different argument types than assumed, the policy would be created against
  -- a function that does not resolve, and the failure would surface a hundred
  -- statements later — or worse, not at all.
  IF to_regprocedure('public.is_user_not_banned()') IS NULL THEN
    RAISE EXCEPTION 'is_user_not_banned() not found — the ban gates cannot be built';
  END IF;
  IF to_regprocedure('public.is_hidden_by(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_hidden_by(uuid, uuid) not found — the block gates cannot be built';
  END IF;
  IF to_regprocedure('public.has_tier_at_least(integer)') IS NULL THEN
    RAISE EXCEPTION 'has_tier_at_least(integer) not found — the AUTEURS gate cannot be built';
  END IF;

  -- ── AND NO NAME THIS MIGRATION CLAIMS IS ALREADY TAKEN ──────────────────
  -- Replacing a function that already exists under one of these names would
  -- overwrite something this script knows nothing about. Refusing up front is
  -- a clear message; failing halfway is a puzzle.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO clash
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('may_file','dispatch_door','end_filing','freeze_closed_ballots',
                       'dispatch_scrub_departed','dispatch_count_cert','dispatch_count_comment',
                       'dispatch_no_hard_delete','dispatch_notify','dispatch_notify_critique',
                       'dispatch_notify_certify','dispatch_notify_answer',
                       'dispatch_notify_ballot_closed','dossiers_write',
                       'dossier_comments_write','dossier_certifications_write');
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'these names already exist and this migration would overwrite them: %', clash;
  END IF;
END $preflight$;

-- ═══ THE DISPATCH ══════════════════════════════════════════════════════════

CREATE TABLE public.dispatch_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('take','seeking','wire','ballot','dossier')),

  -- SET NULL, not CASCADE: a departed member leaves the record and loses the
  -- name. Cascade here would delete the filing AND every critique under it.
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_username text NOT NULL,

  subject_kind    text CHECK (subject_kind IN ('film','person')),
  subject_id      integer,
  subject_title   text,
  subject_sub     text,
  subject_image   text,

  title           text,
  body            text NOT NULL DEFAULT '',
  full_content    text,
  source          text,
  source_url      text,
  options         jsonb,
  closes_at       timestamptz,
  frozen_totals   jsonb,
  answer_id       uuid,

  series_id       uuid,
  series_title    text,
  part_number     smallint,

  spoiler_label   text,
  withheld_at     timestamptz,
  ended_at        timestamptz,
  ended_by        text CHECK (ended_by IN ('author','house')),

  is_published    boolean NOT NULL DEFAULT true,
  certify_count   integer NOT NULL DEFAULT 0,
  comment_count   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  edited_at       timestamptz,

  CONSTRAINT subject_whole  CHECK (subject_kind IS NULL
                                   OR (subject_id IS NOT NULL AND subject_title IS NOT NULL)),
  CONSTRAINT series_whole   CHECK (series_id IS NULL
                                   OR (series_title IS NOT NULL AND part_number IS NOT NULL
                                       AND kind = 'dossier')),
  CONSTRAINT ended_whole    CHECK ((ended_at IS NULL) = (ended_by IS NULL)),
  -- ── AN ENDED FILING IS EXEMPT FROM WHAT ITS KIND REQUIRES ────────────────
  -- These read "a dossier has a title, a wire has a source" — true of a filing
  -- that exists, and false of one that has been erased. Written without the
  -- exemption, they made a dossier IMPOSSIBLE TO STRIKE: erasure nulls the
  -- title, the constraint refuses the update, and the whole delete failed.
  -- The moderator's only tool would have thrown, on the kind most likely to
  -- need it.
  --
  -- Same shape as `published_has_body` below, which already had it. A rule
  -- about what a filing must contain has to admit that some filings no longer
  -- contain anything, on purpose.
  CONSTRAINT dossier_title  CHECK (kind <> 'dossier' OR ended_at IS NOT NULL OR title IS NOT NULL),
  CONSTRAINT wire_source    CHECK (kind <> 'wire'    OR ended_at IS NOT NULL OR source IS NOT NULL),
  CONSTRAINT ballot_options CHECK (kind <> 'ballot'
                                   OR (options IS NOT NULL AND closes_at IS NOT NULL
                                       AND jsonb_array_length(options) BETWEEN 2 AND 6)),
  -- a published filing has to say something; an unwritten series part need not
  CONSTRAINT published_has_body CHECK (NOT is_published OR ended_at IS NOT NULL
                                       OR char_length(btrim(body)) > 0),
  CONSTRAINT body_ceiling   CHECK (char_length(body) <= 2000),
  CONSTRAINT excerpt_ceiling CHECK (kind <> 'dossier' OR char_length(body) <= 500),
  CONSTRAINT title_ceiling  CHECK (title IS NULL OR char_length(title) <= 200),
  CONSTRAINT essay_ceiling  CHECK (full_content IS NULL OR char_length(full_content) <= 25000),
  CONSTRAINT source_ceiling CHECK (source IS NULL OR char_length(source) <= 100),
  CONSTRAINT spoiler_ceiling CHECK (spoiler_label IS NULL OR char_length(spoiler_label) <= 80),
  CONSTRAINT options_ceiling CHECK (options IS NULL OR char_length(options::text) <= 1200)
);

CREATE TABLE public.dispatch_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid NOT NULL REFERENCES public.dispatch_posts(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_username text NOT NULL,
  body            text NOT NULL,
  certify_count   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  edited_at       timestamptz,
  CONSTRAINT critique_ceiling CHECK (char_length(body) <= 2000)
);

ALTER TABLE public.dispatch_posts
  ADD CONSTRAINT answer_is_a_critique
  FOREIGN KEY (answer_id) REFERENCES public.dispatch_comments(id) ON DELETE SET NULL;

-- two real foreign keys, exactly one of them set — a polymorphic id would have
-- no referential integrity and nothing to cascade from
CREATE TABLE public.dispatch_certifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id    uuid REFERENCES public.dispatch_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.dispatch_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_target CHECK (num_nonnulls(post_id, comment_id) = 1)
);
CREATE UNIQUE INDEX dispatch_cert_post_once
  ON public.dispatch_certifications (user_id, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX dispatch_cert_comment_once
  ON public.dispatch_certifications (user_id, comment_id) WHERE comment_id IS NOT NULL;

CREATE TABLE public.dispatch_votes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid NOT NULL REFERENCES public.dispatch_posts(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index smallint NOT NULL CHECK (option_index BETWEEN 0 AND 5),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE TABLE public.dispatch_saves (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id    uuid NOT NULL REFERENCES public.dispatch_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- ── INDEXES ────────────────────────────────────────────────────────────────
CREATE INDEX dispatch_posts_feed    ON public.dispatch_posts (created_at DESC, id)
  WHERE ended_at IS NULL AND withheld_at IS NULL AND is_published;
CREATE INDEX dispatch_posts_kind    ON public.dispatch_posts (kind, created_at DESC);
CREATE INDEX dispatch_posts_author  ON public.dispatch_posts (user_id, created_at DESC);
CREATE INDEX dispatch_posts_subject ON public.dispatch_posts (subject_kind, subject_id)
  WHERE subject_id IS NOT NULL;
CREATE INDEX dispatch_posts_series  ON public.dispatch_posts (series_id, part_number)
  WHERE series_id IS NOT NULL;
CREATE INDEX dispatch_comments_post ON public.dispatch_comments (post_id, created_at DESC);
CREATE INDEX dispatch_comments_user ON public.dispatch_comments (user_id);
CREATE INDEX dispatch_cert_user     ON public.dispatch_certifications (user_id);
CREATE INDEX dispatch_votes_post    ON public.dispatch_votes (post_id);
CREATE INDEX dispatch_saves_post    ON public.dispatch_saves (post_id);

-- ── THE NAME BELONGS TO THE TABLE ──────────────────────────────────────────
-- Erasure as a property of the table, not of a function somebody must remember
-- to update. Whenever user_id goes from set to NULL — however it happens, and
-- ON DELETE SET NULL is one of the ways — the handle goes with it.
CREATE OR REPLACE FUNCTION public.dispatch_scrub_departed() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF NEW.user_id IS NULL AND OLD.user_id IS NOT NULL THEN
    NEW.author_username := '[a member, departed]';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER scrub_departed BEFORE UPDATE ON public.dispatch_posts
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_scrub_departed();
CREATE TRIGGER scrub_departed BEFORE UPDATE ON public.dispatch_comments
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_scrub_departed();

-- ── COUNTERS BY TRIGGER ────────────────────────────────────────────────────
-- The live counters are maintained inside toggle_dossier_certify, so a CASCADE
-- delete never decrements them: every account deletion permanently inflates the
-- certify count of every essay that member certified. A row trigger fires for
-- cascade-deleted rows, which is the whole reason the counting moves here.
CREATE OR REPLACE FUNCTION public.dispatch_count_cert() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_id IS NOT NULL THEN
      UPDATE public.dispatch_posts SET certify_count = certify_count + 1 WHERE id = NEW.post_id;
    ELSE
      UPDATE public.dispatch_comments SET certify_count = certify_count + 1 WHERE id = NEW.comment_id;
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.post_id IS NOT NULL THEN
      UPDATE public.dispatch_posts
         SET certify_count = GREATEST(0, certify_count - 1) WHERE id = OLD.post_id;
    ELSE
      UPDATE public.dispatch_comments
         SET certify_count = GREATEST(0, certify_count - 1) WHERE id = OLD.comment_id;
    END IF;
    RETURN OLD;
  END IF;
END $$;

CREATE TRIGGER count_cert AFTER INSERT OR DELETE ON public.dispatch_certifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_count_cert();

CREATE OR REPLACE FUNCTION public.dispatch_count_comment() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.dispatch_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSE
    UPDATE public.dispatch_posts
       SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END $$;

CREATE TRIGGER count_comment AFTER INSERT OR DELETE ON public.dispatch_comments
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_count_comment();

-- ── THE DOOR ───────────────────────────────────────────────────────────────
-- One expression, used as the gate AND as the progress on screen, so the page
-- can never promise a member something the database will refuse.
CREATE OR REPLACE FUNCTION public.may_file() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND now() >= p.created_at + interval '2 days'
       AND (SELECT count(DISTINCT film_id) FROM public.logs WHERE user_id = p.id) >= 5);
$$;

CREATE OR REPLACE FUNCTION public.dispatch_door()
RETURNS TABLE (films integer, films_needed integer, days integer, days_needed integer, may_file boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT (SELECT count(DISTINCT film_id) FROM public.logs WHERE user_id = p.id)::int,
         5,
         GREATEST(0, floor(extract(epoch FROM now() - p.created_at) / 86400))::int,
         2,
         public.may_file()
    FROM public.profiles p WHERE p.id = auth.uid();
$$;

-- ── ERASURE ────────────────────────────────────────────────────────────────
-- A tombstone that only hides the text on screen is a lie: the row is still
-- there and the API still returns it. This empties it.
CREATE OR REPLACE FUNCTION public.end_filing(p_post uuid, p_by text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF p_by NOT IN ('author','house') THEN RAISE EXCEPTION 'bad ended_by'; END IF;
  IF p_by = 'author' AND NOT EXISTS (
       SELECT 1 FROM public.dispatch_posts WHERE id = p_post AND user_id = auth.uid())
  THEN RAISE EXCEPTION 'not yours'; END IF;

  UPDATE public.dispatch_posts
     SET body = '', full_content = NULL, title = NULL, subject_image = NULL, source = NULL,
         spoiler_label = NULL, ended_at = now(), ended_by = p_by
   WHERE id = p_post AND ended_at IS NULL;
END $$;

-- ═══ RLS ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.dispatch_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_votes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_saves          ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.dispatch_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.dispatch_posts, public.dispatch_comments, public.dispatch_certifications,
  public.dispatch_votes, public.dispatch_saves TO authenticated;

-- ── POSTS ──────────────────────────────────────────────────────────────────
-- Published filings are public: the essay is in the window. Everything else is
-- inside the club.
CREATE POLICY posts_read_published ON public.dispatch_posts
  FOR SELECT TO anon, authenticated
  USING (is_published AND withheld_at IS NULL);

-- A withheld filing reads to its author alone, and to nobody else at all.
CREATE POLICY posts_read_own ON public.dispatch_posts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY posts_write_own ON public.dispatch_posts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY posts_update_own ON public.dispatch_posts
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY posts_delete_own ON public.dispatch_posts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- the gates, RESTRICTIVE so they AND rather than OR
CREATE POLICY posts_block ON public.dispatch_posts AS RESTRICTIVE
  FOR SELECT TO anon, authenticated USING (NOT public.is_hidden_by(auth.uid(), user_id));
CREATE POLICY posts_ban_insert ON public.dispatch_posts AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());
CREATE POLICY posts_ban_update ON public.dispatch_posts AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.is_user_not_banned());
CREATE POLICY posts_ban_delete ON public.dispatch_posts AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.is_user_not_banned());
CREATE POLICY posts_door ON public.dispatch_posts AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.may_file());
CREATE POLICY posts_tier ON public.dispatch_posts AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (kind NOT IN ('ballot','dossier') OR public.has_tier_at_least(2));

-- ── CRITIQUES ──────────────────────────────────────────────────────────────
CREATE POLICY critiques_read ON public.dispatch_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY critiques_write_own ON public.dispatch_comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY critiques_update_own ON public.dispatch_comments
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY critiques_delete_own ON public.dispatch_comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY critiques_block ON public.dispatch_comments AS RESTRICTIVE
  FOR SELECT TO authenticated USING (NOT public.is_hidden_by(auth.uid(), user_id));
CREATE POLICY critiques_ban_insert ON public.dispatch_comments AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());
-- the hole live today: a banned member could rewrite an existing critique
CREATE POLICY critiques_ban_update ON public.dispatch_comments AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.is_user_not_banned());
CREATE POLICY critiques_ban_delete ON public.dispatch_comments AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.is_user_not_banned());
-- and no new critique on a filing that has ended or is under review
CREATE POLICY critiques_open_post ON public.dispatch_comments AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.dispatch_posts p
                       WHERE p.id = post_id AND p.ended_at IS NULL AND p.withheld_at IS NULL));

-- ── CERTIFICATIONS, VOTES, SAVES ───────────────────────────────────────────
CREATE POLICY certs_read ON public.dispatch_certifications
  FOR SELECT TO authenticated USING (true);
CREATE POLICY certs_write_own ON public.dispatch_certifications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY certs_delete_own ON public.dispatch_certifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY certs_block ON public.dispatch_certifications AS RESTRICTIVE
  FOR SELECT TO authenticated USING (NOT public.is_hidden_by(auth.uid(), user_id));
-- the hole live today: a banned member could still move a public number
CREATE POLICY certs_ban_insert ON public.dispatch_certifications AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());
CREATE POLICY certs_ban_delete ON public.dispatch_certifications AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.is_user_not_banned());

CREATE POLICY votes_read ON public.dispatch_votes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY votes_write_own ON public.dispatch_votes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY votes_ban ON public.dispatch_votes AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());
-- a ballot past its deadline takes no more votes, whatever the screen thinks
CREATE POLICY votes_still_open ON public.dispatch_votes AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.dispatch_posts p
                       WHERE p.id = post_id AND p.closes_at > now()));

CREATE POLICY saves_own ON public.dispatch_saves
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════════════════
-- CARRY THE HOUSE OVER
--
-- Every essay, critique and certification that exists moves into the new tables
-- keeping its OWN id — so every link, every share card, every notification and
-- every lounge message that already points at a dossier still points at it.
-- A migration that reissues ids is a migration that breaks every reference in
-- the app and in members' chat histories.
--
-- Counters are RECOMPUTED rather than copied. The live numbers were maintained
-- by hand inside toggle_dossier_certify and never decremented on a cascade
-- delete, so they have drifted upward for as long as the feature has existed.
-- Copying them would carry that drift into a schema built to make it
-- impossible. The truth is the row count.
--
-- The triggers are disabled for the carry-over: they exist to keep counters
-- honest as members act, and a bulk INSERT of history is not a member acting.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.dispatch_posts    DISABLE TRIGGER USER;
ALTER TABLE public.dispatch_comments DISABLE TRIGGER USER;

INSERT INTO public.dispatch_posts
  (id, kind, user_id, author_username, title, body, full_content,
   is_published, created_at, updated_at)
SELECT d.id, 'dossier', d.user_id,
       coalesce(nullif(btrim(d.author_username), ''), '[a member, departed]'),
       d.title,
       -- ── THE EXCERPT IS OPTIONAL LIVE AND THE BODY IS NOT ─────────────────
       -- `excerpt` is nullable in the old table, and `published_has_body` says
       -- a published filing must say something. A published essay saved with no
       -- excerpt — nothing stops one today — would fail that check and roll the
       -- whole migration back at the very first INSERT.
       --
       -- So the body falls back through what the essay actually has: its
       -- excerpt, else its opening, else its title. `title` is NOT NULL live,
       -- so the fallback always lands. Nothing is invented and nothing is lost:
       -- the full text is carried into full_content either way.
       left(coalesce(nullif(btrim(d.excerpt), ''),
                     nullif(btrim(left(d.full_content, 500)), ''),
                     d.title), 500),
       left(d.full_content, 25000),
       coalesce(d.is_published, true), d.created_at, d.updated_at
  FROM public.dispatch_dossiers d;

INSERT INTO public.dispatch_comments
  (id, post_id, user_id, author_username, body, created_at)
SELECT c.id, c.dossier_id, c.user_id,
       coalesce(nullif(btrim(c.username), ''), '[a member, departed]'),
       -- created_at is nullable on the old critiques table (it only has a
       -- DEFAULT) and NOT NULL on the new one
       left(c.body, 2000), coalesce(c.created_at, now())
  FROM public.dossier_comments c;

INSERT INTO public.dispatch_certifications (id, user_id, post_id, created_at)
SELECT k.id, k.user_id, k.dossier_id, coalesce(k.created_at, now())
  FROM public.dossier_certifications k;

ALTER TABLE public.dispatch_posts    ENABLE TRIGGER USER;
ALTER TABLE public.dispatch_comments ENABLE TRIGGER USER;

-- counted from the rows, not carried from the old columns
UPDATE public.dispatch_posts p SET
  certify_count = (SELECT count(*) FROM public.dispatch_certifications x WHERE x.post_id = p.id),
  comment_count = (SELECT count(*) FROM public.dispatch_comments x WHERE x.post_id = p.id);

-- ═══════════════════════════════════════════════════════════════════════════
-- MOVE THE OLD TABLES ASIDE — RENAMED, NOT DROPPED
--
-- A rename is reversible and a DROP is not. If anything about this migration
-- turns out to be wrong, the original rows are still sitting there under
-- _legacy names and can be restored by renaming back. They cost nothing to
-- keep and can be dropped in a later, separate, deliberate step once the new
-- build is the only build.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.dossier_comments       RENAME TO dossier_comments_legacy;
ALTER TABLE public.dossier_certifications RENAME TO dossier_certifications_legacy;
ALTER TABLE public.dispatch_dossiers      RENAME TO dispatch_dossiers_legacy;

-- ═══ COMPATIBILITY ═════════════════════════════════════════════════════════
-- The TestFlight build and the live web app read these names. They keep working.
CREATE VIEW public.dispatch_dossiers WITH (security_invoker = true) AS
  SELECT id, user_id, author_username, title, body AS excerpt, full_content,
         is_published, created_at, updated_at, 0 AS views, certify_count
    FROM public.dispatch_posts WHERE kind = 'dossier';

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
       SET title = NEW.title, body = coalesce(NEW.excerpt,''),
           full_content = NEW.full_content, is_published = NEW.is_published,
           updated_at = now()
     WHERE id = OLD.id;
    RETURN NEW;
  ELSE
    DELETE FROM public.dispatch_posts WHERE id = OLD.id;
    RETURN OLD;
  END IF;
END $$;

CREATE TRIGGER dossiers_write INSTEAD OF INSERT OR UPDATE OR DELETE
  ON public.dispatch_dossiers FOR EACH ROW EXECUTE FUNCTION public.dossiers_write();

CREATE VIEW public.dossier_comments WITH (security_invoker = true) AS
  SELECT c.id, c.post_id AS dossier_id, c.user_id,
         c.author_username AS username, c.body, c.created_at
    FROM public.dispatch_comments c;

CREATE VIEW public.dossier_certifications WITH (security_invoker = true) AS
  SELECT id, user_id, post_id AS dossier_id, created_at
    FROM public.dispatch_certifications WHERE post_id IS NOT NULL;

GRANT SELECT ON public.dispatch_dossiers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.dispatch_dossiers TO authenticated;
GRANT SELECT ON public.dossier_comments, public.dossier_certifications TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- THE SHIPPED APP WRITES THROUGH THESE NAMES TOO
--
-- The dossier view already has its INSTEAD OF trigger. The other two had only
-- SELECT, which is half a compatibility layer: the TestFlight build and the web
-- app both INSERT a critique and INSERT/DELETE a certification by these names,
-- and a write to a view with no INSTEAD OF trigger does not fall through — it
-- fails outright. Read-only compatibility would have looked correct in every
-- test that only reads.
-- ═══════════════════════════════════════════════════════════════════════════

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
       SET body = NEW.body, edited_at = now()
     WHERE id = OLD.id;
    RETURN NEW;
  ELSE
    DELETE FROM public.dispatch_comments WHERE id = OLD.id;
    RETURN OLD;
  END IF;
END $$;

CREATE TRIGGER dossier_comments_write INSTEAD OF INSERT OR UPDATE OR DELETE
  ON public.dossier_comments FOR EACH ROW
  EXECUTE FUNCTION public.dossier_comments_write();

CREATE OR REPLACE FUNCTION public.dossier_certifications_write() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.dispatch_certifications (user_id, post_id)
    VALUES (NEW.user_id, NEW.dossier_id)
    RETURNING id INTO NEW.id;
    RETURN NEW;
  ELSE
    DELETE FROM public.dispatch_certifications
     WHERE user_id = OLD.user_id AND post_id = OLD.dossier_id;
    RETURN OLD;
  END IF;
END $$;

CREATE TRIGGER dossier_certifications_write INSTEAD OF INSERT OR DELETE
  ON public.dossier_certifications FOR EACH ROW
  EXECUTE FUNCTION public.dossier_certifications_write();

GRANT INSERT, UPDATE, DELETE ON public.dossier_comments TO authenticated;
GRANT INSERT, DELETE ON public.dossier_certifications TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- A CLOSED BALLOT BECOMES A RECORD
--
-- Closed is DERIVED — now() >= closes_at — so the screen is right the instant
-- the deadline passes with nothing having to run. The freeze is separate: it
-- writes the totals down once, so the result stops being recomputed from live
-- votes and stops quietly changing as voters delete their accounts.
--
-- Idempotent by its WHERE clause, so a cron that fires twice, or a late catch-up
-- run, cannot rewrite a result that is already fixed.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.freeze_closed_ballots() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE n integer;
BEGIN
  WITH tallied AS (
    SELECT p.id,
           jsonb_build_object(
             -- sum(v.n), not count(v.id): `v` is already GROUPED BY option, so
             -- it has no id to count and one row per option rather than one per
             -- vote. Counting its rows would have recorded "2 ballots cast" for
             -- a ballot with two options and two hundred voters — a permanent,
             -- plausible, wrong number, written once and never recomputed.
             'total', coalesce(sum(v.n), 0),
             'counts', coalesce(jsonb_object_agg(v.option_index, v.n)
                                FILTER (WHERE v.option_index IS NOT NULL), '{}'::jsonb),
             'frozen_at', now()
           ) AS totals
      FROM public.dispatch_posts p
      LEFT JOIN (
        SELECT post_id, option_index, count(*) AS n
          FROM public.dispatch_votes GROUP BY post_id, option_index
      ) v ON v.post_id = p.id
     WHERE p.kind = 'ballot'
       AND p.closes_at <= now()
       AND p.frozen_totals IS NULL
     GROUP BY p.id
  )
  UPDATE public.dispatch_posts p
     SET frozen_totals = t.totals
    FROM tallied t
   WHERE p.id = t.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.freeze_closed_ballots() FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- A FILING CANNOT BE HARD-DELETED — BY ANYONE, THROUGH ANY PATH
--
-- The moderator's `delete_content` action runs `DELETE FROM dispatch_dossiers`,
-- which now hits a view, falls through the INSTEAD OF trigger, and becomes a
-- DELETE on dispatch_posts — cascading away every critique other members wrote
-- underneath it. Strike one member's filing and forty others lose the argument
-- they had about it.
--
-- ── WHY A TRIGGER AND NOT A PATCH TO THE FUNCTION ──────────────────────────
-- The obvious fix is to rewrite that branch of resolve_moderation_report_v2.
-- That needs the function's whole body, the live copy of which may not be the
-- copy in the repo — and it would fix exactly one caller. A member deleting
-- their own filing, an admin script, a future function: each is another place
-- to remember.
--
-- So the rule belongs to the TABLE. A delete is turned into an ending: the text
-- is erased, the tombstone is set, and the row stays so its critiques do. The
-- moderation function is not touched at all, and every path gets the behaviour
-- whether it knows about it or not.
--
-- ── AND ONE DOOR, DELIBERATELY LEFT ────────────────────────────────────────
-- `dispatch.allow_hard_delete` lets a migration or a genuine erasure request
-- remove a row outright. It is a session setting, so it cannot be reached from
-- the app's connection pool by accident, and it must be set on purpose.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dispatch_no_hard_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF coalesce(current_setting('dispatch.allow_hard_delete', true), '') = 'on' THEN
    RETURN OLD;
  END IF;

  -- already ended: nothing to erase, and nothing to delete either
  IF OLD.ended_at IS NOT NULL THEN RETURN NULL; END IF;

  UPDATE public.dispatch_posts
     SET body = '', full_content = NULL, title = NULL, subject_image = NULL, source = NULL,
         spoiler_label = NULL, ended_at = now(),
         ended_by = CASE WHEN OLD.user_id IS NOT DISTINCT FROM auth.uid()
                         THEN 'author' ELSE 'house' END
   WHERE id = OLD.id;

  RETURN NULL;   -- the delete does not happen
END $$;

CREATE TRIGGER no_hard_delete BEFORE DELETE ON public.dispatch_posts
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_no_hard_delete();

-- ═══════════════════════════════════════════════════════════════════════════
-- THE FEED THE SHIPPED BUILD CALLS
--
-- `get_dispatch_feed` is what both live clients use to draw the Dispatch. Its
-- signature is a contract with an app that is already in members' hands and
-- cannot be updated, so every part of it is preserved exactly:
--
--   · the same argument names and types      (p_limit, p_cursor_created_at)
--   · the same eight columns in the same order
--   · id and user_id as TEXT, not uuid — the original casts, and a client
--     parsing a uuid where it expected a string is a client that breaks
--   · `views` still returned, as 0. The column is gone from the new schema
--     because the number was unfalsifiable and displayed nowhere in the new
--     design — but the old build reads this field, and a missing column is a
--     crash while a zero is a number it simply does not draw.
--   · NOT security definer, exactly as it is today. It runs as the caller so
--     RLS does the filtering, which is why blocked members and withheld
--     filings disappear from it for free.
--
-- What changes is only where it reads from.
--
-- ── AND THE SIGNATURE IS READ, NOT WRITTEN ─────────────────────────────────
-- Writing the parameter list out by hand is how the first attempt at this
-- migration failed: the live function has DEFAULT values on its parameters,
-- CREATE OR REPLACE cannot remove a default, and Postgres refused the whole
-- transaction (42P13). It refuses a renamed parameter for the same reason.
--
-- Rather than guess what those defaults are, the live parameter list is read
-- back out of the catalogue and handed straight to CREATE OR REPLACE. Names,
-- types and defaults survive exactly as they are, whatever they are — and a
-- caller that omits an argument today still can tomorrow. Only the body moves.
-- ═══════════════════════════════════════════════════════════════════════════

DO $do$
DECLARE args text;
BEGIN
  SELECT pg_get_function_arguments(p.oid) INTO args
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.get_dispatch_feed(integer, timestamp with time zone)');

  -- only reached on a database where the function does not exist yet
  args := coalesce(args, 'p_limit integer, p_cursor_created_at timestamp with time zone');

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.get_dispatch_feed(%s)
    RETURNS TABLE (
      id text, title text, excerpt text, author_username text, user_id text,
      views integer, certify_count integer, created_at timestamp with time zone
    )
    LANGUAGE sql STABLE
    SET search_path TO 'public','pg_temp'
    AS $body$
      SELECT p.id::text,
             p.title,
             p.body            AS excerpt,
             p.author_username,
             p.user_id::text,
             0                 AS views,
             p.certify_count,
             p.created_at
        FROM public.dispatch_posts p
       WHERE p.kind = 'dossier'
         AND p.is_published
         AND p.withheld_at IS NULL
         AND p.ended_at IS NULL
         AND (p_cursor_created_at IS NULL OR p.created_at < p_cursor_created_at)
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT greatest(1, least(coalesce(p_limit, 20), 100));
    $body$
  $f$, args);
END $do$;

GRANT EXECUTE ON FUNCTION public.get_dispatch_feed(integer, timestamp with time zone)
  TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- FOUR EVENTS, AND NOT ONE NEW NOTIFICATION TYPE
--
-- `comment`, `endorse` and `system` already exist, already map to the four
-- preference switches (notif_comments / notif_endorsements / notif_follows /
-- notif_system), and are already handled by notify-push — `comment` and
-- `endorse` are in its ACTOR_PREFIXED_TYPES, so the push copy reads correctly
-- with no change at all.
--
-- Inventing `answer` and `ballot_closed` would have fallen outside every one of
-- those, which is exactly the decorative-switch bug the settings pass repaired.
-- The Dispatch specifics ride in `metadata`; the type stays a routing and
-- preference key, not display copy.
--
-- Raised by TRIGGER rather than by the client, so an event cannot be forged and
-- cannot be forgotten. Three rules every one of them obeys:
--
--   · never notify yourself
--   · never notify a departed member (user_id is NULL and the column is NOT NULL)
--   · never notify someone who has blocked the actor, or whom the actor blocked
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dispatch_notify(
  p_to uuid, p_from uuid, p_type text, p_message text, p_meta jsonb, p_group text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF p_to IS NULL OR p_from IS NULL OR p_to = p_from THEN RETURN; END IF;

  -- a block in either direction silences the notice. `is_hidden_by` reads the
  -- SESSION's viewer, which inside a trigger is the actor rather than the
  -- recipient, so the pair is asked for directly here.
  IF EXISTS (
    SELECT 1 FROM public.user_blocks
     WHERE (blocker_id = p_to AND blocked_id = p_from)
        OR (blocker_id = p_from AND blocked_id = p_to AND type = 'block')
  ) THEN RETURN; END IF;

  INSERT INTO public.notifications
    (user_id, from_user_id, from_username, type, message, metadata, group_key)
  SELECT p_to, p_from, pr.username, p_type, p_message, p_meta, p_group
    FROM public.profiles pr WHERE pr.id = p_from;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_notify(uuid, uuid, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;

-- ── a critique on your filing ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_notify_critique() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE p record;
BEGIN
  SELECT id, user_id, kind, title INTO p
    FROM public.dispatch_posts WHERE id = NEW.post_id;
  PERFORM public.dispatch_notify(
    p.user_id, NEW.user_id, 'comment',
    'critiqued your ' || p.kind,
    jsonb_build_object('dispatch_post_id', p.id, 'kind', p.kind,
                       'title', p.title, 'comment_id', NEW.id),
    'endorse:post:' || p.id);
  RETURN NEW;
END $$;

CREATE TRIGGER notify_critique AFTER INSERT ON public.dispatch_comments
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_notify_critique();

-- ── a certification, on a filing or on a critique ──────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_notify_certify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE p record; c record;
BEGIN
  IF NEW.post_id IS NOT NULL THEN
    SELECT id, user_id, kind, title INTO p
      FROM public.dispatch_posts WHERE id = NEW.post_id;
    PERFORM public.dispatch_notify(
      p.user_id, NEW.user_id, 'endorse',
      'certified your ' || p.kind,
      jsonb_build_object('dispatch_post_id', p.id, 'kind', p.kind, 'title', p.title),
      'endorse:post:' || p.id);
  ELSE
    SELECT id, user_id, post_id INTO c
      FROM public.dispatch_comments WHERE id = NEW.comment_id;
    PERFORM public.dispatch_notify(
      c.user_id, NEW.user_id, 'endorse',
      'certified your critique',
      jsonb_build_object('dispatch_post_id', c.post_id, 'comment_id', c.id),
      'endorse:post:' || c.post_id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER notify_certify AFTER INSERT ON public.dispatch_certifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_notify_certify();

-- ── your critique was taken as the answer ──────────────────────────────────
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
    'took your critique as the answer',
    jsonb_build_object('dispatch_post_id', NEW.id, 'kind', NEW.kind, 'comment_id', c.id),
    'endorse:post:' || NEW.id);
  RETURN NEW;
END $$;

CREATE TRIGGER notify_answer AFTER UPDATE OF answer_id ON public.dispatch_posts
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_notify_answer();

-- ── a ballot you voted in has closed ───────────────────────────────────────
-- Fired by the freeze, so it happens exactly once per ballot: the freeze is
-- idempotent by its WHERE clause, and this rides on the row it actually wrote.
CREATE OR REPLACE FUNCTION public.dispatch_notify_ballot_closed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v record;
BEGIN
  IF NEW.frozen_totals IS NULL OR OLD.frozen_totals IS NOT NULL THEN RETURN NEW; END IF;
  FOR v IN SELECT DISTINCT user_id FROM public.dispatch_votes WHERE post_id = NEW.id LOOP
    INSERT INTO public.notifications (user_id, type, message, metadata, group_key)
    SELECT v.user_id, 'system', 'A ballot you voted in has closed.',
           jsonb_build_object('dispatch_post_id', NEW.id, 'kind', 'ballot',
                              'title', NEW.title),
           'endorse:post:' || NEW.id
     WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = v.user_id);
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER notify_ballot_closed AFTER UPDATE OF frozen_totals ON public.dispatch_posts
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_notify_ballot_closed();

-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT MAY BE REPORTED
--
-- Two new surfaces — a filing and a critique — and one that should have been
-- there all along.
--
-- ── THE LIVE CHECK AND THE APP DISAGREE ────────────────────────────────────
-- The constraint allows eight values. `ReportableContentType` in the app allows
-- NINE: it has `lounge`, and the database does not. That path is reachable —
-- long-press a salon that is not yours and the report sheet opens with
-- contentType 'lounge', as its own comment says: "a vile door plaque must be
-- reportable". The client validates it, the insert fails the CHECK, and the
-- report is lost.
--
-- So reporting a room is broken in production today. `lounge` is added here
-- because the constraint is being rewritten anyway, and recreating it without
-- the value would mean knowingly rebuilding a rule that contradicts the app.
--
-- ── AND WHY THE DROP IS BY SHAPE, NOT BY NAME ──────────────────────────────
-- A CHECK cannot be extended; it has to be dropped and recreated. Guessing its
-- name risks dropping nothing (and silently keeping the old rule), or dropping
-- the wrong one — there are two constraints on this column and the other is a
-- length cap that must survive. So the enum constraint is found by the shape of
-- its own definition and dropped by the name Postgres actually has for it.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
    FROM pg_constraint
   WHERE conrelid = 'public.reports'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%content_type = ANY%';

  IF c IS NULL THEN
    RAISE EXCEPTION 'no content_type enum constraint found on public.reports — stop and look';
  END IF;

  EXECUTE format('ALTER TABLE public.reports DROP CONSTRAINT %I', c);
  EXECUTE format($f$
    ALTER TABLE public.reports ADD CONSTRAINT %I CHECK (content_type = ANY (ARRAY[
      'log'::text, 'list'::text, 'log_comment'::text, 'list_comment'::text,
      'dossier'::text, 'dossier_comment'::text, 'lounge_message'::text,
      'lounge'::text, 'profile'::text,
      'dispatch_post'::text, 'dispatch_comment'::text]))
  $f$, c);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- THE TWO RPCs THAT WOULD NOW DOUBLE-COUNT OR THROW
--
-- `toggle_dossier_certify` incremented certify_count BY HAND. The new schema
-- maintains that counter with a trigger, so leaving the old body in place would
-- count every certification twice and every un-certification twice — a number
-- that drifts by two per act, on the shipped build, invisibly.
--
-- `increment_dossier_views` wrote to dispatch_dossiers.views. That is now a
-- view whose `views` is the literal 0, which is not updatable: the old body would
-- raise on every essay opened by the shipped app.
--
-- Both keep their exact signatures — read out of the catalogue rather than
-- written down, for the same reason as the feed above. The first defers to the
-- trigger; the second becomes a no-op, because the number it kept was
-- unfalsifiable, displayed nowhere in the new design, and cost a network write
-- on every read.
-- ═══════════════════════════════════════════════════════════════════════════

DO $do$
DECLARE args text;
BEGIN
  SELECT pg_get_function_arguments(p.oid) INTO args
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.toggle_dossier_certify(uuid)');
  args := coalesce(args, 'dossier_uuid uuid');

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.toggle_dossier_certify(%s)
    RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $body$
    DECLARE already boolean;
    BEGIN
      SELECT EXISTS(SELECT 1 FROM public.dispatch_certifications
                     WHERE user_id = auth.uid() AND post_id = dossier_uuid) INTO already;
      IF already THEN
        DELETE FROM public.dispatch_certifications
         WHERE user_id = auth.uid() AND post_id = dossier_uuid;
        RETURN FALSE;
      ELSE
        INSERT INTO public.dispatch_certifications (user_id, post_id)
        VALUES (auth.uid(), dossier_uuid);
        RETURN TRUE;
      END IF;
    END $body$
  $f$, args);
END $do$;

DO $do$
DECLARE args text;
BEGIN
  SELECT pg_get_function_arguments(p.oid) INTO args
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.increment_dossier_views(uuid)');
  args := coalesce(args, 'dossier_uuid uuid');

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.increment_dossier_views(%s)
    RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $body$
    BEGIN
      -- deliberately nothing. See above.
      RETURN;
    END $body$
  $f$, args);
END $do$;

COMMIT;
