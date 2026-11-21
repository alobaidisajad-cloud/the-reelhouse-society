-- ════════════════════════════════════════════════════════════════════════════
-- a_critique_takes_its_notice_rehearsal.sql — 20261122_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_critique_takes_its_notice_rehearsal.sql --with-train
--
-- The train applies 20261122_02 here (with_train), every car before it already applied; a sealed copy already holds it.
-- Then members in good standing, acting as themselves, critique a record, a stack and a filing and
-- delete their critiques, and find each notice leave with its critique (stage C, the kinds pass).
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last
-- line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- A piece of each kind, and a critic in good standing who is not its author.
CREATE TEMP TABLE ctn_pieces ON COMMIT DROP AS
  SELECT 'log'::text AS kind, l.id AS piece, l.user_id AS author FROM public.logs l
   WHERE l.user_id IS NOT NULL ORDER BY l.created_at LIMIT 1;
INSERT INTO ctn_pieces SELECT 'list', l.id, l.user_id FROM public.lists l ORDER BY l.created_at LIMIT 1;
INSERT INTO ctn_pieces SELECT 'post', p.id, p.user_id FROM public.dispatch_posts p
   WHERE p.ended_at IS NULL AND p.withheld_at IS NULL AND p.is_published ORDER BY p.created_at LIMIT 1;
SELECT pg_temp.rh_need('a record, a stack and an open filing', (SELECT count(DISTINCT kind) FROM ctn_pieces), 3) AS done \gset rh_
CREATE TEMP TABLE ctn_critic ON COMMIT DROP AS
  SELECT k.kind, (SELECT u.id FROM auth.users u JOIN public.profiles p ON p.id = u.id
                   WHERE u.id <> k.author AND NOT coalesce(p.is_banned, false)
                     AND (p.suspended_until IS NULL OR p.suspended_until <= now())
                   ORDER BY u.created_at LIMIT 1) AS critic
    FROM ctn_pieces k;
SELECT pg_temp.rh_need('a critic for each piece', (SELECT count(critic) FROM ctn_critic), 3) AS done \gset rh_
GRANT SELECT ON ctn_pieces, ctn_critic TO anon, authenticated;
DELETE FROM public.critique_budget WHERE user_id IN (SELECT critic FROM ctn_critic);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT critic FROM ctn_critic) AND target LIKE 'critique:%';
DELETE FROM public.user_blocks
 WHERE (blocker_id IN (SELECT critic FROM ctn_critic) AND blocked_id IN (SELECT author FROM ctn_pieces))
    OR (blocked_id IN (SELECT critic FROM ctn_critic) AND blocker_id IN (SELECT author FROM ctn_pieces));

-- A notice of a critique deleted before the car, written as the old writers wrote it: orphaned.
INSERT INTO public.notifications (user_id, type, from_user_id, message, group_key)
SELECT k.author, 'comment', c.critic, 'left a critique on your rehearsal piece (orphaned).', 'endorse:' || k.kind || ':' || k.piece
  FROM ctn_pieces k JOIN ctn_critic c USING (kind)
 WHERE k.kind <> 'post'
   AND NOT EXISTS (SELECT 1 FROM public.log_comments x WHERE k.kind = 'log' AND x.log_id = k.piece AND x.user_id = c.critic)
   AND NOT EXISTS (SELECT 1 FROM public.list_comments x WHERE k.kind = 'list' AND x.list_id = k.piece AND x.user_id = c.critic);

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261122_02_a_critique_takes_its_notice.sql
SELECT pg_temp.rh_case('the notices of critiques already deleted are taken by the car', '0',
  (SELECT count(*)::text FROM public.notifications WHERE message = 'left a critique on your rehearsal piece (orphaned).')) AS done \gset rh_
\endif

-- ── a critique takes its notice ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- Files a critique as the critic (their claims, under the rehearsal's own role: the triggers judge
-- the member), and answers its id.
CREATE FUNCTION pg_temp.ctn_file(p_kind text, p_words text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid(); v_piece uuid := (SELECT piece FROM ctn_pieces WHERE kind = p_kind);
        v_critic uuid := (SELECT critic FROM ctn_critic WHERE kind = p_kind);
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_critic, 'role', 'authenticated')::text, true);
  IF p_kind = 'log' THEN
    INSERT INTO public.log_comments (id, log_id, user_id, username, body) VALUES (v_id, v_piece, v_critic, 'critic', p_words);
  ELSIF p_kind = 'list' THEN
    INSERT INTO public.list_comments (id, list_id, user_id, content) VALUES (v_id, v_piece, v_critic, p_words);
  ELSE
    INSERT INTO public.dispatch_comments (id, post_id, user_id, author_username, body) VALUES (v_id, v_piece, v_critic, 'critic', p_words);
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_id;
END $$;
-- Deletes a critique as its critic does, as themselves.
CREATE FUNCTION pg_temp.ctn_delete(p_kind text, p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT critic FROM ctn_critic WHERE kind = p_kind), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF p_kind = 'log' THEN DELETE FROM public.log_comments WHERE id = p_id;
  ELSIF p_kind = 'list' THEN DELETE FROM public.list_comments WHERE id = p_id;
  ELSE DELETE FROM public.dispatch_comments WHERE id = p_id; END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
-- The critic's critique notices on the piece: all, and those naming this critique.
CREATE FUNCTION pg_temp.ctn_notices(p_kind text, p_id uuid DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.notifications n
   WHERE n.type = 'comment' AND n.from_user_id = (SELECT critic FROM ctn_critic WHERE kind = p_kind)
     AND n.group_key = 'endorse:' || p_kind || ':' || (SELECT piece FROM ctn_pieces WHERE kind = p_kind)
     AND (p_id IS NULL OR n.metadata ->> 'comment_id' = p_id::text);
$$;

CREATE TEMP TABLE ctn_ids (kind text, n int, id uuid) ON COMMIT DROP;
INSERT INTO ctn_ids SELECT k, 1, pg_temp.ctn_file(k, 'A first rehearsal critique.') FROM unnest(ARRAY['log', 'list', 'post']) k;
INSERT INTO ctn_ids SELECT k, 2, pg_temp.ctn_file(k, 'A second rehearsal critique.') FROM unnest(ARRAY['log', 'list', 'post']) k;

SELECT pg_temp.rh_case(k || ': each critique''s notice names its critique', '1|1',
         pg_temp.ctn_notices(k, (SELECT id FROM ctn_ids WHERE kind = k AND n = 1)) || '|' || pg_temp.ctn_notices(k, (SELECT id FROM ctn_ids WHERE kind = k AND n = 2)))
  FROM unnest(ARRAY['log', 'list', 'post']) k;

SELECT pg_temp.ctn_delete(k, (SELECT id FROM ctn_ids WHERE kind = k AND n = 1)), NULL FROM unnest(ARRAY['log', 'list', 'post']) k;
SELECT pg_temp.rh_case(k || ': the critique deleted takes its notice, the other critique''s stays', '0|1',
         pg_temp.ctn_notices(k, (SELECT id FROM ctn_ids WHERE kind = k AND n = 1)) || '|' || pg_temp.ctn_notices(k, (SELECT id FROM ctn_ids WHERE kind = k AND n = 2)))
  FROM unnest(ARRAY['log', 'list', 'post']) k;

-- A notice written before notices named their critique stays while its member has a critique there,
-- and goes with their last.
INSERT INTO public.notifications (user_id, type, from_user_id, message, group_key)
SELECT k.author, 'comment', c.critic, 'left a critique on your rehearsal piece (old).', 'endorse:' || k.kind || ':' || k.piece
  FROM ctn_pieces k JOIN ctn_critic c USING (kind) WHERE k.kind <> 'post';
INSERT INTO ctn_ids SELECT k, 3, pg_temp.ctn_file(k, 'A third rehearsal critique.') FROM unnest(ARRAY['log', 'list']) k;
SELECT pg_temp.ctn_delete(k, (SELECT id FROM ctn_ids WHERE kind = k AND n = 3)), NULL FROM unnest(ARRAY['log', 'list']) k;
SELECT pg_temp.rh_case(k || ': an old notice stays while its member has a critique there', '1',
         (SELECT count(*)::text FROM public.notifications WHERE message = 'left a critique on your rehearsal piece (old).' AND group_key LIKE 'endorse:' || k || ':%'))
  FROM unnest(ARRAY['log', 'list']) k;
SELECT pg_temp.ctn_delete(k, (SELECT id FROM ctn_ids WHERE kind = k AND n = 2)), NULL FROM unnest(ARRAY['log', 'list', 'post']) k;
SELECT pg_temp.rh_case(k || ': the member''s last critique there takes every notice of theirs on it', '0',
         pg_temp.ctn_notices(k))
  FROM unnest(ARRAY['log', 'list', 'post']) k;

-- The take-back is the house's: no member runs it.
CREATE FUNCTION pg_temp.ctn_member(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT critic FROM ctn_critic WHERE kind = 'log'), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN 'refused';
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN 'allowed';
END $$;
SELECT pg_temp.rh_case('no member runs the take-back', 'refused', pg_temp.ctn_member('SELECT public.a_critique_takes_its_notice()')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
