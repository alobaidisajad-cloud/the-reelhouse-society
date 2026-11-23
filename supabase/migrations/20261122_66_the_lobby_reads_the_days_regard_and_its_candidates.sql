-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_66 — the Lobby's edition is drawn up a short step at a time, from the day's regard and its candidates.
-- ════════════════════════════════════════════════════════════════════════════
--   lobby_choose_edition, run by the schedule each day, chose the edition in one transaction and read the
--   house whole doing it: every log was read to find the few the day's regard, the newest and the honoured
--   named (and every filing), the day's certifications of logs were matched to every log, the newest stacks
--   were found by counting the films of every stack, and the notices already told of a piece were looked
--   for among every notice of the house: about ten seconds at 100,000 members, in proportion to the house.
--   Now it reads only what it weighs: the day's regard by when it was given, each piece and member it names
--   looked up by its key; the candidates (the pieces regarded that day, the newest 24 of each kind walked
--   from the newest down by the newest-first indexes, and the pieces honoured before) each read by its key
--   and judged as before; and the notices already told by the index of the Lobby's own notices
--   (20261122_64). A stack's privacy is read as the house's rules read it (a stack marked neither way is
--   open), by the index of the stacks open to all (20261122_65).
--   And the schedule draws the edition up a short step at a time, each its own transaction: the day's
--   regard gathered 2,000 rows a step, source by source in the order it was given, resuming after the
--   last row read (private.lobby_draft_regard, each member's regard of a piece once); then the newest and
--   the honoured added to the candidates; then the candidates judged 400 a step (private.lobby_draft_pieces);
--   then the edition placed from the pieces judged, and its notices told, in one short step. The hourly
--   lobby-edition job begins the day's draft and puts its job on the schedule (private.lobby_edition_drafted,
--   every second while a draft waits), which leaves the schedule once nothing waits. A day's regard,
--   however large, never holds one transaction for longer than a step.
--   lobby_choose_edition, called by itself, takes the same steps to the end in its own transaction, as
--   the rehearsals and the seeds ask it. The same edition, the same places, the same notices, for every
--   day; of pieces made at the same moment, the newest are taken by their id, the last first, as the
--   newest-first indexes hold them.
-- Undo: mobile/supabase/migrations-down/20261122_66_the_lobby_reads_the_days_regard_and_its_candidates.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── the drafts ──
--   In private, which the API never serves; read only by the steps. A draft's stage: 1 to 6 its regard
--   gathered, source by source; 7 the newest and the honoured added to its candidates; 8 its candidates
--   judged; 9 placed. `after_at`, `after_id` (and `after_slot`) are the last row a step read.
CREATE TABLE IF NOT EXISTS private.lobby_drafts (
  edition    date PRIMARY KEY,
  stage      smallint NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 9),
  after_at   timestamptz,
  after_id   uuid,
  after_slot text,
  began      timestamptz NOT NULL DEFAULT now()
);
-- Each member's regard of a piece, once a way ('c' certified, 'q' critiqued): its count is the piece's day.
CREATE TABLE IF NOT EXISTS private.lobby_draft_regard (
  edition date NOT NULL,
  slot    text NOT NULL,
  target  uuid NOT NULL,
  how     text NOT NULL,
  member  uuid NOT NULL,
  PRIMARY KEY (edition, slot, target, how, member)
);
CREATE TABLE IF NOT EXISTS private.lobby_draft_candidates (
  edition date NOT NULL,
  slot    text NOT NULL,
  id      uuid NOT NULL,
  PRIMARY KEY (edition, slot, id)
);
-- The candidates judged able to hang, each with its day.
CREATE TABLE IF NOT EXISTS private.lobby_draft_pieces (
  edition    date NOT NULL,
  slot       text NOT NULL,
  id         uuid NOT NULL,
  author     uuid NOT NULL,
  created_at timestamptz NOT NULL,
  day        integer NOT NULL,
  PRIMARY KEY (edition, slot, id)
);
-- add-only (1): no shipped client uses it: tables this car makes in private, which the API never serves (TestFlight build 41 and the website checked)
REVOKE ALL ON private.lobby_drafts, private.lobby_draft_regard, private.lobby_draft_candidates, private.lobby_draft_pieces
  FROM PUBLIC, anon, authenticated;

-- ── one step of a draft ──
--   The caller holds the chooser's lock. p_rows: the regard rows a step reads (the candidates judged are a
--   fifth of it). Returns what the step did; 'chosen N' once the edition is placed (N its places).
CREATE OR REPLACE FUNCTION private.lobby_edition_step(p_edition date, p_rows integer DEFAULT 2000) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    SET lock_timeout TO '100ms'
    AS $$
DECLARE
  -- the edition's moment: 00:00 UTC of its day; its regard is the day before it
  v_end     timestamptz := p_edition::timestamp AT TIME ZONE 'UTC';
  v_start   timestamptz := (p_edition::timestamp AT TIME ZONE 'UTC') - interval '1 day';
  v_rows    integer := GREATEST(COALESCE(p_rows, 2000), 1);
  v_judge   integer := GREATEST(COALESCE(p_rows, 2000) / 5, 1);
  d         record;
  v_from    timestamptz;
  v_slot    text;
  v_how     text;
  v_ats     timestamptz[];
  v_ids     uuid[];
  v_targets uuid[];
  v_members uuid[];
  v_slots   text[];
  v_n       integer;
  v_chosen  integer;
BEGIN
  SELECT * INTO d FROM private.lobby_drafts WHERE edition = p_edition FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not drafted';
  END IF;
  -- From the last row read (one range of each source's index of when it was given), that row left out.
  v_from := GREATEST(v_start, COALESCE(d.after_at, v_start));

  IF d.stage BETWEEN 1 AND 6 THEN
    -- who marked what in the day before, and how: 'c' certified, 'q' critiqued; a source a stage
    IF d.stage = 1 THEN
      v_slot := 'log'; v_how := 'c';
      SELECT array_agg(x.created_at ORDER BY x.created_at, x.id), array_agg(x.id ORDER BY x.created_at, x.id),
             array_agg(x.target_log_id ORDER BY x.created_at, x.id), array_agg(x.user_id ORDER BY x.created_at, x.id)
        INTO v_ats, v_ids, v_targets, v_members
        FROM (SELECT x.created_at, x.id, x.target_log_id, x.user_id FROM public.interactions x
               WHERE x.type = 'endorse_log' AND x.created_at >= v_from AND x.created_at < v_end
                 AND (d.after_at IS NULL OR (x.created_at, x.id) > (d.after_at, d.after_id))
               ORDER BY x.created_at, x.id LIMIT v_rows) x;
    ELSIF d.stage = 2 THEN
      v_slot := 'log'; v_how := 'q';
      SELECT array_agg(c.created_at ORDER BY c.created_at, c.id), array_agg(c.id ORDER BY c.created_at, c.id),
             array_agg(c.log_id ORDER BY c.created_at, c.id), array_agg(c.user_id ORDER BY c.created_at, c.id)
        INTO v_ats, v_ids, v_targets, v_members
        FROM (SELECT c.created_at, c.id, c.log_id, c.user_id FROM public.log_comments c
               WHERE c.user_id IS NOT NULL AND c.withheld_at IS NULL  -- a critique the house withholds is no regard (H-B10)
                 AND c.created_at >= v_from AND c.created_at < v_end
                 AND (d.after_at IS NULL OR (c.created_at, c.id) > (d.after_at, d.after_id))
               ORDER BY c.created_at, c.id LIMIT v_rows) c;
    ELSIF d.stage = 3 THEN
      v_slot := 'list'; v_how := 'c';
      SELECT array_agg(x.created_at ORDER BY x.created_at, x.id), array_agg(x.id ORDER BY x.created_at, x.id),
             array_agg(x.target_list_id ORDER BY x.created_at, x.id), array_agg(x.user_id ORDER BY x.created_at, x.id)
        INTO v_ats, v_ids, v_targets, v_members
        FROM (SELECT x.created_at, x.id, x.target_list_id, x.user_id FROM public.interactions x
               WHERE x.type = 'endorse_list' AND x.created_at >= v_from AND x.created_at < v_end
                 AND (d.after_at IS NULL OR (x.created_at, x.id) > (d.after_at, d.after_id))
               ORDER BY x.created_at, x.id LIMIT v_rows) x;
    ELSIF d.stage = 4 THEN
      v_slot := 'list'; v_how := 'q';
      SELECT array_agg(c.created_at ORDER BY c.created_at, c.id), array_agg(c.id ORDER BY c.created_at, c.id),
             array_agg(c.list_id ORDER BY c.created_at, c.id), array_agg(c.user_id ORDER BY c.created_at, c.id)
        INTO v_ats, v_ids, v_targets, v_members
        FROM (SELECT c.created_at, c.id, c.list_id, c.user_id FROM public.list_comments c
               WHERE c.user_id IS NOT NULL AND c.withheld_at IS NULL  -- a critique the house withholds is no regard (H-B10)
                 AND c.created_at >= v_from AND c.created_at < v_end
                 AND (d.after_at IS NULL OR (c.created_at, c.id) > (d.after_at, d.after_id))
               ORDER BY c.created_at, c.id LIMIT v_rows) c;
    ELSIF d.stage = 5 THEN
      v_slot := 'post'; v_how := 'c';
      SELECT array_agg(c.created_at ORDER BY c.created_at, c.id), array_agg(c.id ORDER BY c.created_at, c.id),
             array_agg(c.post_id ORDER BY c.created_at, c.id), array_agg(c.user_id ORDER BY c.created_at, c.id)
        INTO v_ats, v_ids, v_targets, v_members
        FROM (SELECT c.created_at, c.id, c.post_id, c.user_id FROM public.dispatch_certifications c
               WHERE c.post_id IS NOT NULL AND c.created_at >= v_from AND c.created_at < v_end
                 AND (d.after_at IS NULL OR (c.created_at, c.id) > (d.after_at, d.after_id))
               ORDER BY c.created_at, c.id LIMIT v_rows) c;
    ELSE
      v_slot := 'post'; v_how := 'q';
      SELECT array_agg(c.created_at ORDER BY c.created_at, c.id), array_agg(c.id ORDER BY c.created_at, c.id),
             array_agg(c.post_id ORDER BY c.created_at, c.id), array_agg(c.user_id ORDER BY c.created_at, c.id)
        INTO v_ats, v_ids, v_targets, v_members
        FROM (SELECT c.created_at, c.id, c.post_id, c.user_id FROM public.dispatch_comments c
               WHERE c.user_id IS NOT NULL AND c.withheld_at IS NULL  -- a critique the house withholds is no regard (H-B10)
                 AND c.created_at >= v_from AND c.created_at < v_end
                 AND (d.after_at IS NULL OR (c.created_at, c.id) > (d.after_at, d.after_id))
               ORDER BY c.created_at, c.id LIMIT v_rows) c;
    END IF;
    v_n := COALESCE(cardinality(v_ids), 0);
    IF v_n > 0 THEN
      -- Never its author's own (the piece looked up by its key); a banned member's regard counts for
      -- nothing. Each member's regard of a piece kept once a way, the piece a candidate.
      WITH kept AS (
        INSERT INTO private.lobby_draft_regard (edition, slot, target, how, member)
        SELECT p_edition, v_slot, t.target, v_how, t.member
          FROM unnest(v_targets, v_members) t(target, member)
         WHERE t.member <> CASE v_slot
                             WHEN 'log'  THEN (SELECT l.user_id FROM public.logs l WHERE l.id = t.target)
                             WHEN 'list' THEN (SELECT x.user_id FROM public.lists x WHERE x.id = t.target)
                             ELSE             (SELECT p.user_id FROM public.dispatch_posts p WHERE p.id = t.target)
                           END
           AND EXISTS (SELECT 1 FROM public.profiles m WHERE m.id = t.member AND NOT coalesce(m.is_banned, false))
        ON CONFLICT DO NOTHING
        RETURNING target
      )
      INSERT INTO private.lobby_draft_candidates (edition, slot, id)
      SELECT DISTINCT p_edition, v_slot, k.target FROM kept k
      ON CONFLICT DO NOTHING;
    END IF;
    IF v_n < v_rows THEN
      UPDATE private.lobby_drafts SET stage = d.stage + 1, after_at = NULL, after_id = NULL WHERE edition = p_edition;
    ELSE
      UPDATE private.lobby_drafts SET after_at = v_ats[v_n], after_id = v_ids[v_n] WHERE edition = p_edition;
    END IF;
    RETURN 'regard ' || v_n;
  END IF;

  IF d.stage = 7 THEN
    -- The pieces honoured before, and the newest of each kind (which a quiet day reaches), as candidates.
    INSERT INTO private.lobby_draft_candidates (edition, slot, id)
    SELECT p_edition, x.slot, x.id FROM (
      SELECT e.slot, e.target_id AS id
        FROM public.lobby_editions e
       WHERE e.edition < p_edition AND e.place <= CASE e.slot WHEN 'post' THEN 3 ELSE 1 END
      UNION
      (SELECT 'log'::text, n.id FROM public.logs n
         JOIN public.profiles np ON np.id = n.user_id
        WHERE n.review IS NOT NULL AND n.review <> ''  -- as logs_reviewed_newest holds them
          AND char_length(btrim(coalesce(n.review, ''))) >= 30 AND NOT coalesce(n.is_spoiler, false)
          AND n.created_at < v_end
          AND NOT coalesce(np.is_banned, false) AND NOT coalesce(np.is_social_private, false)
          AND NOT EXISTS (SELECT 1 FROM public.lobby_editions h
                           WHERE h.edition < p_edition AND h.place <= 1 AND h.slot = 'log' AND h.target_id = n.id)
        ORDER BY n.created_at DESC, n.id DESC LIMIT 24)
      UNION
      (SELECT 'list'::text, n.id FROM public.lists n
         JOIN public.profiles np ON np.id = n.user_id
        WHERE n.is_private IS NOT TRUE AND n.created_at < v_end  -- open to all, as lists_open_newest holds them
          AND (SELECT count(*) FROM public.list_items i WHERE i.list_id = n.id) >= 4
          AND NOT coalesce(np.is_banned, false) AND NOT coalesce(np.is_social_private, false)
          AND NOT EXISTS (SELECT 1 FROM public.lobby_editions h
                           WHERE h.edition < p_edition AND h.place <= 1 AND h.slot = 'list' AND h.target_id = n.id)
        ORDER BY n.created_at DESC, n.id DESC LIMIT 24)
      UNION
      (SELECT 'post'::text, n.id FROM public.dispatch_posts n
         JOIN public.profiles np ON np.id = n.user_id
        WHERE n.is_published AND n.withheld_at IS NULL  -- as dispatch_posts_paper_latest holds them
          AND n.ended_at IS NULL AND n.spoiler_label IS NULL AND n.created_at < v_end
          AND char_length(btrim(coalesce(n.title, '') || ' ' || coalesce(nullif(n.full_content, ''), n.body, ''))) >= 30
          AND NOT coalesce(np.is_banned, false) AND NOT coalesce(np.is_social_private, false)
          AND NOT EXISTS (SELECT 1 FROM public.lobby_editions h
                           WHERE h.edition < p_edition AND h.place <= 3 AND h.slot = 'post' AND h.target_id = n.id)
        ORDER BY n.created_at DESC, n.id DESC LIMIT 24)
    ) x
    ON CONFLICT DO NOTHING;
    UPDATE private.lobby_drafts SET stage = 8, after_at = NULL, after_id = NULL, after_slot = NULL WHERE edition = p_edition;
    RETURN 'candidates';
  END IF;

  IF d.stage = 8 THEN
    -- The next candidates, by their key from the last judged; each read by its key and judged as every
    -- piece always was, with its day.
    SELECT array_agg(k.slot ORDER BY k.slot, k.id), array_agg(k.id ORDER BY k.slot, k.id) INTO v_slots, v_ids
      FROM (SELECT k.slot, k.id FROM private.lobby_draft_candidates k
             WHERE k.edition = p_edition
               AND (d.after_slot IS NULL OR (k.slot, k.id) > (d.after_slot, d.after_id))
             ORDER BY k.slot, k.id LIMIT v_judge) k;
    v_n := COALESCE(cardinality(v_ids), 0);
    IF v_n > 0 THEN
      INSERT INTO private.lobby_draft_pieces (edition, slot, id, author, created_at, day)
      SELECT p_edition, a.slot, a.id, a.author, a.created_at,
             (SELECT count(*) FROM private.lobby_draft_regard r WHERE r.edition = p_edition AND r.slot = a.slot AND r.target = a.id)
        FROM (
          SELECT 'log'::text AS slot, l.id, l.user_id AS author, l.created_at
            FROM unnest(v_slots, v_ids) k(slot, id)
            CROSS JOIN LATERAL (SELECT x.id, x.user_id, x.created_at, x.review, x.is_spoiler, x.withheld_at
                                  FROM public.logs x WHERE x.id = k.id OFFSET 0) l
            JOIN public.profiles p ON p.id = l.user_id
           WHERE k.slot = 'log'
             AND btrim(coalesce(l.review, '')) <> '' AND NOT coalesce(l.is_spoiler, false)
             AND l.withheld_at IS NULL  -- a piece the house withholds never hangs (H-B10)
             AND l.created_at < v_end
             AND NOT coalesce(p.is_banned, false) AND NOT coalesce(p.is_social_private, false)
             AND NOT EXISTS (SELECT 1 FROM public.lobby_withheld w WHERE w.kind = 'log' AND w.target_id = l.id)
             AND NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.content_type = 'log' AND r.content_id = l.id::text
                                                              AND coalesce(r.status, 'pending') = 'pending')
          UNION ALL
          SELECT 'list', s.id, s.user_id, s.created_at
            FROM unnest(v_slots, v_ids) k(slot, id)
            CROSS JOIN LATERAL (SELECT x.id, x.user_id, x.created_at, x.is_private, x.withheld_at
                                  FROM public.lists x WHERE x.id = k.id OFFSET 0) s
            JOIN public.profiles p ON p.id = s.user_id
           WHERE k.slot = 'list'
             AND NOT coalesce(s.is_private, false)
             AND s.withheld_at IS NULL  -- a piece the house withholds never hangs (H-B10)
             AND (SELECT count(*) FROM public.list_items i WHERE i.list_id = s.id) >= 4
             AND s.created_at < v_end
             AND NOT coalesce(p.is_banned, false) AND NOT coalesce(p.is_social_private, false)
             AND NOT EXISTS (SELECT 1 FROM public.lobby_withheld w WHERE w.kind = 'list' AND w.target_id = s.id)
             AND NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.content_type = 'list' AND r.content_id = s.id::text
                                                              AND coalesce(r.status, 'pending') = 'pending')
          UNION ALL
          SELECT 'post', d2.id, d2.user_id, d2.created_at
            FROM unnest(v_slots, v_ids) k(slot, id)
            CROSS JOIN LATERAL (SELECT x.id, x.user_id, x.created_at, x.is_published, x.withheld_at, x.ended_at, x.spoiler_label
                                  FROM public.dispatch_posts x WHERE x.id = k.id OFFSET 0) d2
            JOIN public.profiles p ON p.id = d2.user_id
           WHERE k.slot = 'post'
             AND coalesce(d2.is_published, false) AND d2.withheld_at IS NULL AND d2.ended_at IS NULL
             AND d2.spoiler_label IS NULL AND d2.created_at < v_end
             AND NOT coalesce(p.is_banned, false) AND NOT coalesce(p.is_social_private, false)
             AND NOT EXISTS (SELECT 1 FROM public.lobby_withheld w WHERE w.kind = 'post' AND w.target_id = d2.id)
             AND NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.content_type = 'dispatch_post' AND r.content_id = d2.id::text
                                                              AND coalesce(r.status, 'pending') = 'pending')
        ) a
      ON CONFLICT DO NOTHING;
    END IF;
    IF v_n < v_judge THEN
      UPDATE private.lobby_drafts SET stage = 9, after_slot = NULL, after_id = NULL WHERE edition = p_edition;
    ELSE
      UPDATE private.lobby_drafts SET after_slot = v_slots[v_n], after_id = v_ids[v_n] WHERE edition = p_edition;
    END IF;
    RETURN 'judged ' || v_n;
  END IF;

  -- Stage 9: the edition placed from the pieces judged, as it always was placed.
  WITH honoured AS (
    -- what the wall has shown before: first log, first stack, first three filings
    SELECT e.slot, e.target_id, e.author_id, e.edition
      FROM public.lobby_editions e
     WHERE e.edition < p_edition AND e.place <= CASE e.slot WHEN 'post' THEN 3 ELSE 1 END
  ),
  scored AS (
    SELECT a.slot, a.id, a.author, a.created_at, a.day,
           EXISTS (SELECT 1 FROM honoured h WHERE h.slot = a.slot AND h.target_id = a.id) AS had_its_day,
           EXISTS (SELECT 1 FROM honoured h WHERE h.author_id = a.author AND h.edition >= p_edition - 7) AS honoured_lately
      FROM private.lobby_draft_pieces a WHERE a.edition = p_edition
  ),
  ranked AS (
    SELECT s.*,
           row_number() OVER (PARTITION BY s.slot
                              ORDER BY s.had_its_day, s.day DESC, s.honoured_lately,
                                       s.created_at DESC, s.id) AS merit
      FROM scored s
  ),
  -- one member, one bill: each author's second piece in a slot, and the first log's author among stacks
  spread AS (
    SELECT r.*,
           row_number() OVER (PARTITION BY r.slot, r.author ORDER BY r.merit) AS nth,
           (r.slot = 'list' AND r.author = (SELECT author FROM ranked WHERE slot = 'log' AND merit = 1)) AS holds_the_log
      FROM ranked r
  ),
  placed AS (
    SELECT s.slot, s.id, s.author, s.day,
           row_number() OVER (PARTITION BY s.slot
                              ORDER BY s.holds_the_log, (s.slot = 'post' AND s.nth > 1), s.merit) AS place
      FROM spread s
  )
  INSERT INTO public.lobby_editions (edition, slot, place, target_id, author_id, score)
  SELECT p_edition, slot, place, id, author, day FROM placed WHERE place <= 12;

  GET DIAGNOSTICS v_chosen = ROW_COUNT;

  -- The authors of what hangs are told without a push — once a piece, never again (the notices already
  -- told found by the index of the Lobby's own notices).
  INSERT INTO public.notifications (user_id, type, message, group_key)
  SELECT e.author_id, 'featured',
         CASE e.slot WHEN 'log'  THEN 'Your log hangs in the Lobby today.'
                     WHEN 'list' THEN 'Your stack hangs in the Lobby today.'
                     ELSE             'Your filing hangs in the Lobby today.' END,
         'lobby:' || e.slot || ':' || e.target_id
    FROM public.lobby_editions e
   WHERE e.edition = p_edition
     AND e.place <= CASE e.slot WHEN 'post' THEN 3 ELSE 1 END
     AND NOT EXISTS (SELECT 1 FROM public.notifications n
                      WHERE n.type = 'featured' AND n.group_key = 'lobby:' || e.slot || ':' || e.target_id);

  -- The draft goes: its rows emptied at once when no other draft waits.
  DELETE FROM private.lobby_drafts WHERE edition = p_edition;
  IF NOT EXISTS (SELECT 1 FROM private.lobby_drafts) THEN
    TRUNCATE private.lobby_draft_regard, private.lobby_draft_candidates, private.lobby_draft_pieces;
  ELSE
    DELETE FROM private.lobby_draft_regard WHERE edition = p_edition;
    DELETE FROM private.lobby_draft_candidates WHERE edition = p_edition;
    DELETE FROM private.lobby_draft_pieces WHERE edition = p_edition;
  END IF;
  RETURN 'chosen ' || v_chosen;
END $$;

-- ── the edition, chosen to the end ──
--   As production holds it, called by itself (the rehearsals, the seeds): every step of the day's draft
--   taken in this one transaction.
-- add-only (3): it only fixes: the same edition, places and notices for every day (the rehearsal chooses an edition with the old reading and the new and compares them); run by the rehearsals and the seeds, the schedule now drawing it up a step at a time
CREATE OR REPLACE FUNCTION public.lobby_choose_edition(p_edition date DEFAULT ((now() AT TIME ZONE 'UTC'::text))::date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_said text;
BEGIN
  -- One chooser at a time; and an edition, once chosen, is never chosen again.
  PERFORM pg_advisory_xact_lock(hashtext('public.lobby_choose_edition'));
  IF EXISTS (SELECT 1 FROM public.lobby_editions WHERE edition = p_edition) THEN
    RETURN 0;
  END IF;
  INSERT INTO private.lobby_drafts (edition) VALUES (p_edition) ON CONFLICT (edition) DO NOTHING;
  LOOP
    v_said := private.lobby_edition_step(p_edition, 1000000);
    EXIT WHEN v_said LIKE 'chosen %';
  END LOOP;
  RETURN substr(v_said, 8)::integer;
END;
$$;

-- ── the day's draft begun, by the schedule ──
--   Run by the lobby-edition job, every hour: the day's edition, not yet chosen, drafted; and while any
--   draft waits, its job on the schedule. The chooser's lock is taken first, so a step that finds nothing
--   waiting and leaves the schedule is never passed by a draft it did not see.
CREATE OR REPLACE FUNCTION private.lobby_edition_begun() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_edition date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.lobby_choose_edition'));
  IF NOT EXISTS (SELECT 1 FROM public.lobby_editions WHERE edition = v_edition) THEN
    INSERT INTO private.lobby_drafts (edition) VALUES (v_edition) ON CONFLICT (edition) DO NOTHING;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.lobby_drafts) THEN
    RETURN 'chosen already';
  END IF;
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'the-lobby-edition-is-drafted') THEN
      PERFORM cron.schedule('the-lobby-edition-is-drafted', '1 seconds', 'SELECT private.lobby_edition_drafted();');
    END IF;
  END IF;
  RETURN 'drafted';
END $$;

-- ── a step of the oldest draft, by its job ──
--   Every second while a draft waits: one step, giving way at once to the chooser or to a draft being
--   begun (the lock both take), and to anyone holding what it writes (its lock wait is 100 ms). Nothing
--   drafted: the job leaves the schedule.
CREATE OR REPLACE FUNCTION private.lobby_edition_drafted(p_rows integer DEFAULT 2000) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    SET lock_timeout TO '100ms'
    AS $$
DECLARE
  v_edition date;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('public.lobby_choose_edition')) THEN
    RETURN 'waited';
  END IF;
  SELECT d.edition INTO v_edition FROM private.lobby_drafts d ORDER BY d.edition LIMIT 1;
  IF v_edition IS NULL THEN
    IF to_regclass('cron.job') IS NOT NULL THEN
      PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'the-lobby-edition-is-drafted';
    END IF;
    RETURN 'none drafted';
  END IF;
  RETURN private.lobby_edition_step(v_edition, p_rows);
END $$;
-- add-only (1): no shipped client uses it: functions this car makes in private, run by the schedule and the chooser alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.lobby_edition_step(date, integer),
  private.lobby_edition_begun(), private.lobby_edition_drafted(integer) FROM PUBLIC, anon, authenticated;

-- ── the schedule: the hourly job begins the day's draft ──
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule('lobby-edition', '5 * * * *', 'SELECT private.lobby_edition_begun();');
  END IF;
END $$;

-- The drafts, known to the planner (empty as the car leaves them).
-- add-only (1): no shipped client uses it: statistics, read by the planner alone
ANALYZE private.lobby_drafts, private.lobby_draft_regard, private.lobby_draft_candidates, private.lobby_draft_pieces;
