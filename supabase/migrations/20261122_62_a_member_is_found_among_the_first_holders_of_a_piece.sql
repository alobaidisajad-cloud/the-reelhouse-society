-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_62 — a member is found among the first thousand holders of the words' rarest piece.
-- ════════════════════════════════════════════════════════════════════════════
--   search_members read the members who hold the words anywhere, past a thousand, by walking every handle
--   in order and asking each: words that many hold, whose holders sort far into the handles, read the
--   house to its page ("mber 95" walked 94,445 handles to its first 21 at 100,000 members, and would walk
--   about 945,000 at a million). And who holds words of common pieces was gathered whole by the trigram
--   indexes before the first was kept.
--   Now the house keeps, for every piece of three letters (private.member_grams), the first thousand of
--   its holders in handle order, and how many hold it (private.member_gram_heads): a piece held by fewer
--   lists every holder; one held by more lists those whose handles sort at or before its last listed.
--   A search reads the list of the words' rarest piece: every member holding the words holds the piece,
--   so when the piece lists every holder, its list is everyone who could hold the words (a thousand at
--   most); when it does not, the holders of the words among its list are exactly those whose handles sort
--   up to its last, so a page met inside the list is the page. Words that all of the house's pieces hold
--   past a thousand are gathered by the trigram indexes only when their rarest piece of three letters or
--   digits is held by 5,000 or fewer (a gathering never larger than that); otherwise, and when such a
--   gathering finds more than a thousand, a name's beginning and the words anywhere are walked in the
--   widest list. A page that list cannot meet says so (TOO_WIDE): more letters narrow it. Never the house.
--   Rows read are bounded by the list (a thousand) and the gathering (5,000 a column) at any size.
--   The lists are kept as members join, are renamed and leave: each write queued by a trigger, and
--   settled once a transaction as it commits (a constraint trigger), each piece's head locked in the
--   pieces' order and written once.
--   The car makes the lists empty and holds no member's write for longer than its triggers' making: it
--   reads no member. The lists are filled by a job (private.member_grams_fill, every second where the
--   house keeps its jobs), five hundred members at a time in the order of their ids, each time short and
--   its own transaction, resumed where the last ended; a member written meanwhile is settled into the
--   lists by its own commit once the job has passed its id, and read as it stands by the job otherwise.
--   Until the job has read every member, the search reads as 20261122_29 left it; once it has, the
--   lists are analysed for the planner and read.
--   Words without three letters together in a row are searched as before.
-- Undo: mobile/supabase/migrations-down/20261122_62_a_member_is_found_among_the_first_holders_of_a_piece.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── the pieces' first holders, kept ──
--   In private, which the API never serves; read only by search_members. A piece is three characters of
--   a handle or a name, lower case, as ILIKE reads them, marked "a" (held anywhere) or "h" (held in the
--   handle, for a search of handles alone); compared byte by byte (it is only ever matched).
CREATE TABLE IF NOT EXISTS private.member_gram_heads (
  gram    text COLLATE "C" PRIMARY KEY,
  holders integer NOT NULL CHECK (holders >= 0),
  listed  integer NOT NULL CHECK (listed >= 0 AND listed <= 1000),
  -- NULL: every holder is listed. Otherwise every holder whose handle sorts at or before it is.
  upto    text,
  CHECK ((upto IS NULL) = (listed = holders))
);
CREATE TABLE IF NOT EXISTS private.member_grams (
  gram     text COLLATE "C" NOT NULL,
  username text NOT NULL,
  id       uuid NOT NULL,
  PRIMARY KEY (gram, username) INCLUDE (id)
);
-- add-only (1): no shipped client uses it: tables this car makes in private, which the API never serves (TestFlight build 41 and the website checked)
REVOKE ALL ON private.member_gram_heads, private.member_grams FROM PUBLIC, anon, authenticated;

-- ── a member's pieces, and the words' ──
CREATE OR REPLACE FUNCTION private.member_grams_of(p_handle text, p_name text) RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  -- Each three characters of the handle and of the name, lower case, once, in byte order (the order the
  -- pieces are locked in): marked "a" as held anywhere (a search of handles and names), and the handle's
  -- marked "h" as well (a search of handles alone).
  SELECT coalesce(array_agg(DISTINCT g.gram ORDER BY g.gram), '{}'::text[])
    FROM (SELECT (v.f || substr(v.x, i, 3)) COLLATE "C" AS gram
            FROM (VALUES (lower(p_handle), 'a'), (lower(p_name), 'a'), (lower(p_handle), 'h')) v(x, f)
           CROSS JOIN LATERAL generate_series(1, char_length(v.x) - 2) i) g
$$;

CREATE OR REPLACE FUNCTION private.member_pattern_grams(p_pattern text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE STRICT
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  v_text text := lower(p_pattern);
  v_n    integer := char_length(v_text);
  v_i    integer := 1;
  v_c    text;
  v_seg  text := '';
  v_out  text[] := '{}';
BEGIN
  -- The pieces every holder of the words holds: each three characters of each run of the words between
  -- wildcards, its escapes read, lower case as ILIKE reads them. NULL when no run has three.
  WHILE v_i <= v_n + 1 LOOP
    v_c := CASE WHEN v_i <= v_n THEN substr(v_text, v_i, 1) END;
    IF v_c = '\' AND v_i < v_n THEN
      v_seg := v_seg || substr(v_text, v_i + 1, 1);
      v_i := v_i + 2;
      CONTINUE;
    END IF;
    IF v_c IS NULL OR v_c IN ('%', '_') THEN
      FOR k IN 1 .. char_length(v_seg) - 2 LOOP
        v_out := v_out || substr(v_seg, k, 3);
      END LOOP;
      v_seg := '';
    ELSE
      v_seg := v_seg || v_c;
    END IF;
    v_i := v_i + 1;
  END LOOP;
  IF cardinality(v_out) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT array_agg(DISTINCT g ORDER BY g) FROM unnest(v_out) g);
END $$;

-- ── a member's pieces listed as they join, and taken off as they leave ──
--   Each write queues what it changes (private.member_grams_waiting), and the transaction settles them
--   once, as it commits: so each piece's head is written once a transaction however many members it
--   writes (a head written again and again in one transaction is read through every one of its copies).
--   Settled: a piece listing every holder lists the newcomers; past a thousand, those past its thousandth
--   go and it lists those up to it. A piece that lists only the first lists a newcomer whose handle sorts
--   at or before its last, and counts any other. A leaver is taken off the list if listed; when every
--   holder left is listed, the piece lists every holder again.
CREATE TABLE IF NOT EXISTS private.member_grams_waiting (
  txid     bigint NOT NULL DEFAULT txid_current(),
  gram     text COLLATE "C" NOT NULL,
  username text NOT NULL,
  id       uuid NOT NULL,
  sign     smallint NOT NULL CHECK (sign IN (-1, 1)),
  -- Its key leads with the transaction, so the settling's read and delete of its own rows walk the key.
  seq      bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (txid, seq)
);
-- add-only (1): no shipped client uses it: a table this car makes in private, which the API never serves (TestFlight build 41 and the website checked)
REVOKE ALL ON private.member_grams_waiting FROM PUBLIC, anon, authenticated;

-- How far the job has read: every member whose id sorts at or before `after` is listed (none while it is
-- NULL), and `complete` once every member is. A member written is settled by its commit only once the
-- job has passed it; the job and the settling take one lock (shared by the settling) while they read
-- this row, so a member is never both missed by the job and passed over by the settling.
CREATE TABLE IF NOT EXISTS private.member_grams_filled (
  one      boolean PRIMARY KEY DEFAULT true CHECK (one),
  after    uuid,
  members  integer NOT NULL DEFAULT 0,
  complete boolean NOT NULL DEFAULT false,
  -- How many holders a piece lists at most: a thousand. Made smaller only on empty lists, as the car's
  -- rehearsal lists its few planted members.
  cap      integer NOT NULL DEFAULT 1000 CHECK (cap BETWEEN 1 AND 1000),
  began    timestamptz NOT NULL DEFAULT now(),
  ended    timestamptz
);
INSERT INTO private.member_grams_filled (one) VALUES (true) ON CONFLICT (one) DO NOTHING;
-- add-only (1): no shipped client uses it: a table this car makes in private, which the API never serves (TestFlight build 41 and the website checked)
REVOKE ALL ON private.member_grams_filled FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.member_grams_apply(p_gone private.member_grams[], p_came private.member_grams[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  v_off_g text[];
  v_off_n integer[];
  v_on_g  text[];
  v_on_n  integer[];
  v_cut   text[] := '{}';
  v_last  text[] := '{}';
  v_gram  text;
  v_k     integer;
  v_at    text;
  v_n     integer;
  v_cap   integer;
BEGIN
  -- Nothing to settle (members the job has not reached): the lists not touched.
  IF cardinality(p_gone) = 0 AND cardinality(p_came) = 0 THEN
    RETURN 0;
  END IF;
  SELECT f.cap INTO v_cap FROM private.member_grams_filled f;
  -- A head for each new piece; then every piece touched, locked in one order.
  INSERT INTO private.member_gram_heads (gram, holders, listed, upto)
  SELECT DISTINCT c.gram, 0, 0, NULL::text FROM unnest(p_came) c ORDER BY 1
  ON CONFLICT (gram) DO NOTHING;
  PERFORM 1 FROM private.member_gram_heads h
   WHERE h.gram IN (SELECT g.gram FROM unnest(p_gone) g UNION SELECT c.gram FROM unnest(p_came) c)
   ORDER BY h.gram FOR UPDATE;
  -- The leavers off the lists; the comers on, where their piece lists every holder or they sort at or
  -- before its last. Each counted by piece.
  WITH off AS (
    DELETE FROM private.member_grams m USING unnest(p_gone) g
     WHERE m.gram = g.gram AND m.username = g.username AND m.id = g.id
    RETURNING m.gram
  ) SELECT coalesce(array_agg(o.gram), '{}'), coalesce(array_agg(o.n), '{}') INTO v_off_g, v_off_n
      FROM (SELECT off.gram, count(*)::integer AS n FROM off GROUP BY off.gram) o;
  WITH came AS (
    INSERT INTO private.member_grams (gram, username, id)
    SELECT c.gram, c.username, c.id FROM unnest(p_came) c JOIN private.member_gram_heads h ON h.gram = c.gram
     WHERE h.upto IS NULL OR c.username <= h.upto
    RETURNING gram
  ) SELECT coalesce(array_agg(o.gram), '{}'), coalesce(array_agg(o.n), '{}') INTO v_on_g, v_on_n
      FROM (SELECT came.gram, count(*)::integer AS n FROM came GROUP BY came.gram) o;
  -- A list past its cap (a thousand) ends at its thousandth: those past it go, the last of them first.
  FOR v_gram, v_k IN
    SELECT h.gram, h.listed + o.n - coalesce(f.n, 0) - v_cap
      FROM unnest(v_on_g, v_on_n) o(gram, n) JOIN private.member_gram_heads h ON h.gram = o.gram
      LEFT JOIN unnest(v_off_g, v_off_n) f(gram, n) ON f.gram = o.gram
     WHERE h.listed + o.n - coalesce(f.n, 0) > v_cap
     ORDER BY h.gram
  LOOP
    DELETE FROM private.member_grams m
     WHERE m.gram = v_gram
       AND m.username IN (SELECT x.username FROM private.member_grams x WHERE x.gram = v_gram ORDER BY x.username DESC LIMIT v_k);
    SELECT max(m.username) INTO v_at FROM private.member_grams m WHERE m.gram = v_gram;
    v_cut := v_cut || v_gram;
    v_last := v_last || v_at;
  END LOOP;
  -- Each head written once: its holders by the change, its list as it now ends.
  UPDATE private.member_gram_heads h
     SET holders = h.holders + d.came - d.gone,
         listed  = CASE WHEN c.last IS NOT NULL THEN v_cap ELSE h.listed + d.went_on - d.came_off END,
         upto    = CASE WHEN c.last IS NOT NULL THEN c.last
                        WHEN h.holders + d.came - d.gone = h.listed + d.went_on - d.came_off THEN NULL
                        ELSE h.upto END
    FROM (SELECT x.gram, sum(x.came) AS came, sum(x.gone) AS gone, sum(x.went_on) AS went_on, sum(x.came_off) AS came_off
            FROM (SELECT c.gram, 1 AS came, 0 AS gone, 0 AS went_on, 0 AS came_off FROM unnest(p_came) c
                  UNION ALL SELECT g.gram, 0, 1, 0, 0 FROM unnest(p_gone) g
                  UNION ALL SELECT o.gram, 0, 0, o.n, 0 FROM unnest(v_on_g, v_on_n) o(gram, n)
                  UNION ALL SELECT f.gram, 0, 0, 0, f.n FROM unnest(v_off_g, v_off_n) f(gram, n)) x
           GROUP BY x.gram) d
    LEFT JOIN (SELECT unnest(v_cut) AS gram, unnest(v_last) AS last) c ON c.gram = d.gram
   WHERE h.gram = d.gram;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION private.a_members_pieces_are_queued() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.username IS NOT DISTINCT FROM NEW.username
     AND OLD.display_name IS NOT DISTINCT FROM NEW.display_name THEN
    RETURN NULL;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    INSERT INTO private.member_grams_waiting (gram, username, id, sign)
    SELECT g, OLD.username, OLD.id, -1 FROM unnest(private.member_grams_of(OLD.username, OLD.display_name)) g;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    INSERT INTO private.member_grams_waiting (gram, username, id, sign)
    SELECT g, NEW.username, NEW.id, 1 FROM unnest(private.member_grams_of(NEW.username, NEW.display_name)) g;
  END IF;
  -- Counted, so the settling knows at once whether anything waits (the transaction's own setting).
  PERFORM set_config('reelhouse.member_grams_queued',
                     (COALESCE(NULLIF(current_setting('reelhouse.member_grams_queued', true), ''), '0')::bigint + 1)::text, true);
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION private.member_grams_settle() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  v_queued   text := COALESCE(current_setting('reelhouse.member_grams_queued', true), '');
  v_complete boolean;
  v_after    uuid;
BEGIN
  -- Run once a written member as the transaction commits: the first settles everything waiting, the rest
  -- find nothing new.
  IF v_queued = '' OR v_queued = COALESCE(current_setting('reelhouse.member_grams_settled', true), '') THEN
    RETURN NULL;
  END IF;
  -- While the job is filling the lists, only the members it has passed are settled here (it reads the
  -- others as they stand): its lock is taken, shared, before its row is read, so a batch of the job
  -- reads this transaction's writes once committed or lists them before this reads how far it went.
  SELECT f.complete, f.after INTO v_complete, v_after FROM private.member_grams_filled f;
  IF NOT v_complete THEN
    PERFORM pg_advisory_xact_lock_shared(hashtext('private.member_grams_fill'));
    SELECT f.complete, f.after INTO v_complete, v_after FROM private.member_grams_filled f;
  END IF;
  -- Each member's net change to each piece: joined and left in one transaction is no change.
  PERFORM private.member_grams_apply(
    ARRAY(SELECT ROW(w.gram, w.username, w.id)::private.member_grams FROM private.member_grams_waiting w
           WHERE w.txid = txid_current() AND (v_complete OR w.id <= v_after)
           GROUP BY w.gram, w.username, w.id HAVING sum(w.sign) < 0),
    ARRAY(SELECT ROW(w.gram, w.username, w.id)::private.member_grams FROM private.member_grams_waiting w
           WHERE w.txid = txid_current() AND (v_complete OR w.id <= v_after)
           GROUP BY w.gram, w.username, w.id HAVING sum(w.sign) > 0));
  DELETE FROM private.member_grams_waiting WHERE txid = txid_current();
  PERFORM set_config('reelhouse.member_grams_settled', v_queued, true);
  RETURN NULL;
END $$;
-- add-only (1): no shipped client uses it: functions this car makes in private, run by the triggers and search_members alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.member_grams_of(text, text), private.member_pattern_grams(text),
  private.member_grams_apply(private.member_grams[], private.member_grams[]),
  private.a_members_pieces_are_queued(), private.member_grams_settle() FROM PUBLIC, anon, authenticated;

-- ── the triggers ──
--   Made on the empty lists: their making holds the members' writes only for itself, never for a read of
--   the house. From their commit, every member written is queued, and settled once the job has passed it.
-- add-only (3): it only fixes: every member joins, is renamed and leaves as before, and is listed (the rehearsal replays members joining, renamed and leaving, and compares the lists with the house read again); TestFlight build 41 and the website write as before
CREATE OR REPLACE TRIGGER a_members_pieces_are_queued
  AFTER INSERT OR DELETE OR UPDATE OF username, display_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.a_members_pieces_are_queued();
-- add-only (3): it only fixes: every member joins, is renamed and leaves as before, and is listed as the transaction commits (the rehearsal replays members joining, renamed and leaving, settles them, and compares the lists with the house read again); TestFlight build 41 and the website write as before
CREATE CONSTRAINT TRIGGER a_members_pieces_are_settled
  AFTER INSERT OR DELETE OR UPDATE OF username, display_name ON public.profiles
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.member_grams_settle();

-- ── the lists filled, five hundred members at a time ──
--   One run lists the next members in the order of their ids (profiles_pkey), as they stand, and says how
--   far it went; resumed by the next where it ended. Its lock is taken alone, and given up at once when
--   a member's commit or another run holds it (each run is short, and the next tries again), so a
--   member's write waits at most one run. The run after the last member marks the lists complete and
--   analyses them, and where the house keeps its jobs the job then ends itself.
CREATE OR REPLACE FUNCTION private.member_grams_fill(p_members integer DEFAULT 500) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    SET lock_timeout TO '100ms'
    AS $$
DECLARE
  v_after    uuid;
  v_complete boolean;
  v_came     private.member_grams[];
  v_read     integer;
  v_last     uuid;
BEGIN
  SELECT f.complete INTO v_complete FROM private.member_grams_filled f;
  IF NOT v_complete THEN
    -- Read again once the lock is held: the last run's end, and every member committed before it. Its
    -- row is held too, and a run gives way at once to whoever holds it.
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtext('private.member_grams_fill'));
      SELECT f.complete, f.after INTO v_complete, v_after FROM private.member_grams_filled f FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RETURN 'waited';
    END;
  END IF;
  IF v_complete THEN
    IF to_regclass('cron.job') IS NOT NULL THEN
      PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'the-members-pieces-are-listed';
    END IF;
    RETURN 'complete';
  END IF;
  -- The next members after the last run's, each with every piece they hold.
  WITH next AS (
    SELECT p.id, p.username, p.display_name FROM public.profiles p
     -- One range of the ids from the last run's end (the same plan at every run), its end itself left out.
     WHERE p.id >= COALESCE(v_after, '00000000-0000-0000-0000-000000000000'::uuid) AND p.id IS DISTINCT FROM v_after
     ORDER BY p.id LIMIT GREATEST(p_members, 1)
  )
  SELECT array_agg(ROW(g.g, n.username, n.id)::private.member_grams) FILTER (WHERE g.g IS NOT NULL),
         count(DISTINCT n.id), (array_agg(n.id ORDER BY n.id DESC))[1]
    INTO v_came, v_read, v_last
    FROM next n LEFT JOIN LATERAL unnest(private.member_grams_of(n.username, n.display_name)) g(g) ON true;
  IF v_read = 0 THEN
    UPDATE private.member_grams_filled SET complete = true, ended = now();
    ANALYZE private.member_gram_heads;
    ANALYZE private.member_grams;
    RETURN 'complete';
  END IF;
  PERFORM private.member_grams_apply('{}', COALESCE(v_came, '{}'));
  UPDATE private.member_grams_filled SET after = v_last, members = members + v_read;
  RETURN 'listed ' || v_read;
END $$;
-- add-only (1): no shipped client uses it: a function this car makes in private, run by the job alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.member_grams_fill(integer) FROM PUBLIC, anon, authenticated;

-- The job, where the house keeps its jobs (pg_cron): a run every second, so the members' writes wait at
-- most one short run in a second while it lasts.
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule('the-members-pieces-are-listed', '1 seconds', 'SELECT private.member_grams_fill();');
  END IF;
END $$;

-- ── the search, by the lists ──
-- As 20261122_29 left it, but words with a piece of three are found by its list.
-- add-only (3): it only fixes: the same members in the same order for every search a list can answer (the rehearsal replays each search and compares it with the old reading); a search no list can narrow says so (TOO_WIDE) instead of reading the house; TestFlight build 41 and the website read it as before
CREATE OR REPLACE FUNCTION public.search_members(p_pattern text, p_handles_only boolean DEFAULT false, p_cursor_closeness integer DEFAULT NULL::integer, p_cursor_username text DEFAULT NULL::text, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, username text, avatar_url text, role text, closeness integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 51);
  v_names  boolean := NOT COALESCE(p_handles_only, false);
  v_hidden uuid[];
  v_tests  text[];
  v_few    uuid[];
  v_past   text;
  v_tier   integer;
  v_not    text := '';
  v_got    integer := 0;
  v_n      integer;
  v_short  text := '';
  v_many   boolean;
  v_walk   boolean;
  v_bitmap text := current_setting('enable_bitmapscan');
  v_sort   text := current_setting('enable_sort');
  v_seq    text := current_setting('enable_seqscan');
  v_index  text := current_setting('enable_indexscan');
  -- The words' letters before their first wildcard, their escapes read: where a handle beginning with them starts.
  v_lead   text := regexp_replace(substring(COALESCE(p_pattern, '') from '^((?:[^%_\\]|\\.)*)'), '\\(.)', '\1', 'g');
  -- The words' pieces of three (private.member_pattern_grams): every holder of the words holds each,
  -- anywhere ("a") or, for a search of handles alone, in the handle ("h"). Only once the job has listed
  -- every member (private.member_grams_filled), and the reader's own transaction has no member's write
  -- waiting to be settled (settled as it commits, so the lists do not hold them yet): until then,
  -- searched as before.
  v_grams  text[] := CASE WHEN COALESCE(current_setting('reelhouse.member_grams_queued', true), '')
                               = COALESCE(current_setting('reelhouse.member_grams_settled', true), '')
                           AND (SELECT f.complete FROM private.member_grams_filled f)
                          THEN (SELECT array_agg((CASE WHEN COALESCE(p_handles_only, false) THEN 'h' ELSE 'a' END || g) COLLATE "C")
                                  FROM unnest(private.member_pattern_grams(COALESCE(p_pattern, ''))) g) END;
  v_known  integer;
  v_rare   integer;
  v_gram   text;
  v_upto   text;
  v_listed boolean := false;
  -- How many a gathering keeps before the handles are walked instead (a thousand); with a list, its cap
  -- (a thousand): the list is walked instead.
  v_wide   integer := 1000;
BEGIN
  IF COALESCE(p_pattern, '') = '' THEN
    RETURN;
  END IF;
  v_hidden := COALESCE((SELECT private.hidden_authors())::uuid[], '{}'::uuid[]);
  -- Each closeness's own test, as the one read's CASE asked it. Plain, so the planner reads the words
  -- and their indexes: a WHERE drops a test that is unknown (a name not given), as the CASE did.
  -- The handle that is the words: words with no wildcard left once their escapes are read are one
  -- handle, any case, so the case-blind unique index (profiles_username_lower_unique) finds it at once
  -- (ILIKE is that same lower() on both sides: the equality adds no member and takes none away).
  -- A handle or a name that begins with the words is asked the same of its lower case (ILIKE is lower()
  -- LIKE lower()), so its beginning is found in profiles_username_beginning (20261122_22) or
  -- profiles_display_name_beginning (20261122_17), never by the trigram of a word's start that every
  -- handle or name holding such a word anywhere also holds.
  v_tests := ARRAY[
    format('p.username ILIKE %L ESCAPE %L', p_pattern, '\')
      || CASE WHEN regexp_replace(p_pattern, '\\.', '', 'g') !~ '[%_\\]'
              THEN format(' AND lower(p.username) = lower(%L)', regexp_replace(p_pattern, '\\(.)', '\1', 'g')) ELSE '' END,
    -- A beginning is asked as one range of its lower case alone: the ILIKE inside COALESCE, which no index
    -- reads, so the planner never gathers by the trigram of a word's start (a handle beginning with "m1"
    -- gathered all 11,112 of 100,000 before the first thousand were kept). Unknown only where the column
    -- is, so a member with no name is ruled in or out as before.
    format('COALESCE(p.username ILIKE %L ESCAPE %L, false) AND lower(p.username) LIKE %L ESCAPE %L', p_pattern || '%', '\', lower(p_pattern) || '%', '\'),
    CASE WHEN v_names THEN format('COALESCE(p.display_name ILIKE %L ESCAPE %L, false) AND lower(p.display_name) LIKE %L ESCAPE %L', p_pattern || '%', '\', lower(p_pattern) || '%', '\') ELSE 'false' END,
    format('(p.username ILIKE %L ESCAPE %L', '%' || p_pattern || '%', '\')
      || CASE WHEN v_names THEN format(' OR p.display_name ILIKE %L ESCAPE %L)', '%' || p_pattern || '%', '\') ELSE ')' END
  ];
  IF v_grams IS NOT NULL THEN
    -- Words with a piece of three: the pieces' heads say who could hold them. A piece no member holds:
    -- no member holds the words, in any closeness.
    SELECT count(*), min(h.holders) FILTER (WHERE substr(h.gram, 2) ~ '^[[:alnum:]]{3}$') INTO v_known, v_rare
      FROM private.member_gram_heads h WHERE h.gram = ANY (v_grams) AND h.holders > 0;
    IF v_known < cardinality(v_grams) THEN
      RETURN;
    END IF;
    -- The list read: the smallest of those that list every holder; else the one listing furthest into
    -- the handles (its holders of the words are exact up to its last, and a page is likeliest met there).
    SELECT h.gram, h.upto INTO v_gram, v_upto
      FROM private.member_gram_heads h WHERE h.gram = ANY (v_grams)
     ORDER BY h.upto IS NOT NULL, CASE WHEN h.upto IS NULL THEN h.holders END, h.upto DESC
     LIMIT 1;
    v_listed := true;
    v_many := false;
    SELECT f.cap INTO v_wide FROM private.member_grams_filled f;
    IF v_upto IS NULL THEN
      -- It lists every holder: whoever holds the words is among them, a thousand at most.
      EXECUTE format('SELECT array_agg(p.id) FROM private.member_grams g JOIN public.profiles p ON p.id = g.id WHERE g.gram = $2 AND COALESCE(%s, false) AND NOT COALESCE(p.id = ANY ($1), false)',
                     v_tests[4])
        INTO v_few USING v_hidden, v_gram;
    ELSIF v_rare <= 5 * v_wide THEN
      -- Its rarest piece of three letters or digits is held by 5,000 or fewer: the trigram indexes gather
      -- no more than they hold of it (a bitmap of all the words' trigrams, never a walk or a scan).
      PERFORM set_config('enable_seqscan', 'off', true); PERFORM set_config('enable_indexscan', 'off', true);
      EXECUTE format('SELECT array_agg(p.id) FROM (SELECT p.id FROM public.profiles p WHERE %s AND NOT COALESCE(p.id = ANY ($1), false) LIMIT %s) p',
                     v_tests[4], v_wide + 1)
        INTO v_few USING v_hidden;
      PERFORM set_config('enable_seqscan', v_seq, true); PERFORM set_config('enable_indexscan', v_index, true);
    ELSE
      -- Held by more: who holds the words anywhere is walked in the list at once, never gathered.
      v_many := true;
    END IF;
  ELSE
    -- Words without three letters or digits in a row hold no trigram inside a handle or a name: the
    -- gatherings of who holds them anywhere (the one read's own, and the last closeness) then read by
    -- their one- and two-letter pieces (profiles_short_grams), never member by member through the house,
    -- the words' own test asked inside COALESCE so no plan reads a trigram index for them whole. A handle
    -- or a name that begins with them is found by its trigrams as before (a beginning has its own).
    IF p_pattern !~ '[[:alnum:]]{3}' AND private.pattern_grams(p_pattern) IS NOT NULL THEN
      v_short := format(' AND private.search_grams(p.username, p.display_name) @> %L::text[]', private.pattern_grams(p_pattern));
    END IF;
    -- Many or few, first, by a walk that reads the same number of members at any size of the house: the
    -- first 2,000 handles in their own order (profiles_username_unique), each asked the words' own test.
    -- When 20 or more of them hold the words (one in a hundred), so many do that each closeness's page is
    -- met by walking the handles in order within a few thousand, and the indexes of the pieces and the
    -- trigrams, which gather every member who holds the words before the first is read (22,248 for "m1",
    -- 81,929 for "1" at 100,000 members), are not read for them.
    EXECUTE format('SELECT count(*) FROM (SELECT p.id, p.username, p.display_name FROM public.profiles p ORDER BY p.username LIMIT 2000) p WHERE COALESCE(%s, false) AND NOT COALESCE(p.id = ANY ($1), false)',
                   v_tests[4])
      INTO v_n USING v_hidden;
    v_many := v_n >= 20;
    -- Fewer: who holds the words at all (the one read's own WHERE), gathered once by the plan the words
    -- want, up to a thousand: when fewer hold them, the page is the one read's own over just those few, by id.
    IF NOT v_many THEN
      EXECUTE format('SELECT array_agg(p.id) FROM (SELECT p.id FROM public.profiles p WHERE %s%s AND NOT COALESCE(p.id = ANY ($1), false) LIMIT 1001) p',
                     CASE WHEN v_short = '' THEN v_tests[4] ELSE format('COALESCE(%s, false)', v_tests[4]) END, v_short)
        INTO v_few USING v_hidden;
    END IF;
  END IF;
  IF NOT v_many AND COALESCE(cardinality(v_few), 0) <= v_wide THEN
    RETURN QUERY
    SELECT m.id, m.username, m.avatar_url, m.role, m.closeness
      FROM (
        SELECT p.id, p.username, p.avatar_url, p.role,
               CASE WHEN p.username ILIKE p_pattern ESCAPE '\' THEN 0
                    WHEN p.username ILIKE p_pattern || '%' ESCAPE '\' THEN 1
                    WHEN v_names AND p.display_name ILIKE p_pattern || '%' ESCAPE '\' THEN 2
                    ELSE 3 END AS closeness
          FROM public.profiles p
         WHERE p.id = ANY (COALESCE(v_few, '{}'::uuid[]))
      ) m
     WHERE p_cursor_closeness IS NULL OR (m.closeness, m.username) > (p_cursor_closeness, p_cursor_username)
     ORDER BY m.closeness, m.username
     LIMIT v_limit;
    RETURN;
  END IF;
  -- More hold them: each closeness in turn, as far as the page needs. A member of a closeness meets its
  -- test and none of the closer ones; in the cursor's own closeness, it is past the cursor's handle (a
  -- member with no handle is never past it). Its members are gathered first, up to a thousand, by the
  -- plan the words want: fewer, and they are put in handle order themselves; more, and the closeness
  -- holds so many that its handles are walked in their own order (profiles_username_unique) and the
  -- page is met within the first few hundred. The walk asks its test as one the planner cannot weigh
  -- (COALESCE), so it is planned as a walk however few it guesses: its guess of a name's beginning
  -- once took 100,000 for 4, and sorted them all. When the first walk found many, the last closeness
  -- (who holds the words anywhere) is walked at once, never gathered.
  -- Words with a piece of three walk a name's beginning and the words anywhere in the piece's list
  -- instead (every member of those closenesses holds the piece), never the handles.
  FOR v_tier IN 0..3 LOOP
    IF (p_cursor_closeness IS NULL OR v_tier >= p_cursor_closeness) AND v_tests[v_tier + 1] <> 'false' THEN
      v_past := CASE WHEN v_tier = p_cursor_closeness THEN format(' AND p.username > %L', p_cursor_username) ELSE '' END;
      v_walk := v_many AND v_tier = 3;
      IF NOT v_walk THEN
        -- A beginning is gathered in its index's own order (USING ~<~, as text_pattern_ops holds it), so the
        -- range is read row by row and stops at its thousand and one, never gathered whole first: no bitmap
        -- for this one statement (a bitmap gathers the whole range before the first row is kept), set back
        -- as it was at once, so the trigram and short pieces' gatherings, which only a bitmap reads, are not touched.
        -- The words anywhere, when a list stands for them, are gathered by a bitmap alone (no more than the
        -- trigram indexes hold of a piece 5,000 or fewer hold).
        IF v_tier IN (1, 2) THEN PERFORM set_config('enable_bitmapscan', 'off', true); PERFORM set_config('enable_sort', 'off', true); END IF;
        IF v_tier = 3 AND v_listed THEN PERFORM set_config('enable_seqscan', 'off', true); PERFORM set_config('enable_indexscan', 'off', true); END IF;
        EXECUTE format('SELECT array_agg(p.id) FROM (SELECT p.id FROM public.profiles p WHERE %s%s%s%s AND NOT COALESCE(p.id = ANY ($1), false)%s LIMIT %s) p',
                       CASE WHEN v_short = '' OR v_tier < 3 THEN v_tests[v_tier + 1] ELSE format('COALESCE(%s, false)', v_tests[v_tier + 1]) END, v_not, v_past,
                       CASE WHEN v_tier = 3 THEN v_short ELSE '' END,
                       CASE v_tier WHEN 1 THEN ' ORDER BY lower(p.username) USING ~<~' WHEN 2 THEN ' ORDER BY lower(p.display_name) USING ~<~' ELSE '' END,
                       v_wide + 1)
          INTO v_few USING v_hidden;
        IF v_tier IN (1, 2) THEN PERFORM set_config('enable_bitmapscan', v_bitmap, true); PERFORM set_config('enable_sort', v_sort, true); END IF;
        IF v_tier = 3 AND v_listed THEN PERFORM set_config('enable_seqscan', v_seq, true); PERFORM set_config('enable_indexscan', v_index, true); END IF;
        v_walk := COALESCE(cardinality(v_few), 0) > v_wide;
      END IF;
      IF NOT v_walk THEN
        RETURN QUERY
        SELECT p.id, p.username, p.avatar_url, p.role, v_tier
          FROM public.profiles p
         WHERE p.id = ANY (COALESCE(v_few, '{}'::uuid[]))
         ORDER BY p.username
         LIMIT v_limit - v_got;
      ELSIF v_listed AND v_tier IN (2, 3) THEN
        -- Walked in the list, in handle order, from the cursor: exact up to the list's last handle. A page
        -- it cannot meet lies past it, where only more letters can narrow the search: said, never read.
        RETURN QUERY EXECUTE format(
          'SELECT p.id, p.username, p.avatar_url, p.role, %s
             FROM private.member_grams g JOIN public.profiles p ON p.id = g.id
            WHERE g.gram = $2%s
              AND COALESCE(%s, false)%s%s
              AND NOT COALESCE(p.id = ANY ($1), false)
            ORDER BY g.username
            LIMIT %s',
          v_tier, CASE WHEN v_tier = p_cursor_closeness THEN format(' AND g.username > %L', p_cursor_username) ELSE '' END,
          v_tests[v_tier + 1], v_not, v_past, v_limit - v_got)
        USING v_hidden, v_gram;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n < v_limit - v_got AND v_upto IS NOT NULL THEN
          RAISE EXCEPTION 'TOO_WIDE' USING ERRCODE = '54000', HINT = 'More letters narrow the search.';
        END IF;
      ELSE
        -- A handle that begins with the words is walked from where such handles start: every one sorts at
        -- or after the words' letters before any wildcard, in upper or lower case, whichever sorts first
        -- (in any collation a word sorts after its own beginning, and a case changes no letter's place
        -- among the others), so the walk never reads every handle before them ("m19" read 10,000 first).
        RETURN QUERY EXECUTE format(
          'SELECT p.id, p.username, p.avatar_url, p.role, %s
             FROM public.profiles p
            WHERE COALESCE(%s, false)%s%s%s
              AND NOT COALESCE(p.id = ANY ($1), false)
            ORDER BY p.username
            LIMIT %s',
          v_tier, v_tests[v_tier + 1], v_not, v_past,
          CASE WHEN v_tier = 1 AND v_lead <> '' THEN format(' AND p.username >= LEAST(upper(%L), lower(%L))', v_lead, v_lead) ELSE '' END,
          v_limit - v_got)
        USING v_hidden;
      END IF;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_got := v_got + v_n;
      EXIT WHEN v_got >= v_limit;
    END IF;
    -- A closer test ruled out: one that is unknown was not met, so it rules nothing out.
    v_not := v_not || ' AND NOT COALESCE(' || v_tests[v_tier + 1] || ', false)';
  END LOOP;
END;
$$;
