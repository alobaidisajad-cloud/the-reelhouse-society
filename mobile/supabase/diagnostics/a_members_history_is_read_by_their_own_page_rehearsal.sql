-- ════════════════════════════════════════════════════════════════════════════
-- a_members_history_is_read_by_their_own_page_rehearsal.sql — 20261122_61. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_members_history_is_read_by_their_own_page_rehearsal.sql
--
-- 20261122_61 is applied on production (the train of 2026-11-24); this shows it still holds there, and on every sealed copy.
-- Production's get_moderation_history_for_users is held here, as it was, to compare
-- with. On verdicts it plants (thirty on one member, four of them in one moment; two on another; none on
-- a third; three on the member who asks last), as a moderator: every page asked (members named twice, a
-- member with none, a null among them, no members at all; pages of none, of five unasked, of one, of
-- twenty and past twenty, and below none) answers as production's did, row for row in order; and as a
-- member who is no moderator, nothing, their own verdicts among those asked. The read is each member's
-- own, from the front of their index, to their page.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

RESET ROLE;

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE mh_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 5;
SELECT pg_temp.rh_need('five members in good standing', (SELECT count(*) FROM mh_members), 5) AS done \gset rh_
GRANT SELECT ON mh_members TO anon, authenticated;
-- Member 1 is a moderator; member 5 is not. Members 2, 3 and 5 hold verdicts; member 4 none.
UPDATE public.profiles SET role = CASE WHEN id = (SELECT id FROM mh_members WHERE n = 1) THEN 'admin' WHEN role = 'admin' THEN 'free' ELSE role END
 WHERE id IN (SELECT id FROM mh_members);
DELETE FROM public.mod_actions WHERE target_user_id IN (SELECT id FROM mh_members);
INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason, created_at)
SELECT (SELECT id FROM mh_members WHERE n = 2), (SELECT id FROM mh_members WHERE n = 1), 'warn', 'rh mh ' || g,
       -- four in one moment (the 18th to the 21st newest, cut by a page of twenty), told apart by their ids
       CASE WHEN g BETWEEN 18 AND 21 THEN now() - interval '20 days' ELSE now() - g * interval '1 day' END
  FROM generate_series(1, 30) g;
INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason, created_at)
SELECT (SELECT id FROM mh_members WHERE n = 3), (SELECT id FROM mh_members WHERE n = 1), 'mute_user', 'rh mh ' || g, now() - g * interval '1 hour'
  FROM generate_series(1, 2) g;
INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason, created_at)
SELECT (SELECT id FROM mh_members WHERE n = 5), (SELECT id FROM mh_members WHERE n = 1), 'warn', 'rh mh ' || g, now() - g * interval '1 hour'
  FROM generate_series(1, 3) g;
SELECT pg_temp.rh_need('verdicts planted', (SELECT count(*) FROM public.mod_actions WHERE reason LIKE 'rh mh %'), 35) AS done \gset rh_

-- Production's reading, as it was.
CREATE FUNCTION pg_temp.mh_old(p_user_ids uuid[], p_per_user integer DEFAULT 5) RETURNS TABLE(id uuid, report_id uuid, target_user_id uuid, admin_id uuid, action text, reason text, duration_hours integer, expires_at timestamp with time zone, created_at timestamp with time zone, lifted_at timestamp with time zone, appeal_status text)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT r.id, r.report_id, r.target_user_id, r.admin_id, r.action, r.reason,
         r.duration_hours, r.expires_at, r.created_at, r.lifted_at, r.appeal_status
  FROM (
    SELECT m.*,
           ROW_NUMBER() OVER (PARTITION BY m.target_user_id ORDER BY m.created_at DESC, m.id DESC) AS rn
    FROM public.mod_actions m
    WHERE m.target_user_id = ANY(COALESCE(p_user_ids, ARRAY[]::uuid[]))
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
      )
  ) r
  WHERE r.rn <= LEAST(GREATEST(COALESCE(p_per_user, 5), 0), 20)
  ORDER BY r.target_user_id, r.created_at DESC, r.id DESC;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.mh_old(uuid[], integer) TO authenticated;

-- Every page, as the member asking reads it, by either reading: each row's id, member and moment, in order.
CREATE FUNCTION pg_temp.mh_pages(p_asker integer, p_old boolean) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v jsonb := '{}'::jsonb; ids uuid[]; k integer; i integer; page jsonb;
  m2 uuid := (SELECT id FROM mh_members WHERE n = 2); m3 uuid := (SELECT id FROM mh_members WHERE n = 3);
  m4 uuid := (SELECT id FROM mh_members WHERE n = 4); m5 uuid := (SELECT id FROM mh_members WHERE n = 5);
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT m.id FROM mh_members m WHERE m.n = p_asker), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  FOR i IN 1..6 LOOP
    ids := CASE i WHEN 1 THEN ARRAY[m2, m3, m4, m5] WHEN 2 THEN ARRAY[m2, m2, m3] WHEN 3 THEN ARRAY[m4]
                  WHEN 4 THEN ARRAY[m3, NULL, m5] WHEN 5 THEN ARRAY[]::uuid[] ELSE NULL END;
    FOREACH k IN ARRAY ARRAY[-1, 0, 1, 5, 20, 25, NULL::integer] LOOP
      IF p_old THEN
        SELECT coalesce(jsonb_agg(jsonb_build_array(h.id, h.target_user_id, h.created_at, h.reason) ORDER BY n), '[]'::jsonb) INTO page
          FROM pg_temp.mh_old(ids, k) WITH ORDINALITY h(id, report_id, target_user_id, admin_id, action, reason, duration_hours, expires_at, created_at, lifted_at, appeal_status, n);
      ELSE
        SELECT coalesce(jsonb_agg(jsonb_build_array(h.id, h.target_user_id, h.created_at, h.reason) ORDER BY n), '[]'::jsonb) INTO page
          FROM public.get_moderation_history_for_users(ids, k) WITH ORDINALITY h(id, report_id, target_user_id, admin_id, action, reason, duration_hours, expires_at, created_at, lifted_at, appeal_status, n);
      END IF;
      v := v || jsonb_build_object(i || '|' || coalesce(k::text, 'unasked'), page);
    END LOOP;
  END LOOP;
  -- The page size unasked: the default.
  IF p_old THEN
    SELECT coalesce(jsonb_agg(h.id ORDER BY n), '[]'::jsonb) INTO page FROM pg_temp.mh_old(ARRAY[m2, m3]) WITH ORDINALITY h(id, report_id, target_user_id, admin_id, action, reason, duration_hours, expires_at, created_at, lifted_at, appeal_status, n);
  ELSE
    SELECT coalesce(jsonb_agg(h.id ORDER BY n), '[]'::jsonb) INTO page FROM public.get_moderation_history_for_users(ARRAY[m2, m3]) WITH ORDINALITY h(id, report_id, target_user_id, admin_id, action, reason, duration_hours, expires_at, created_at, lifted_at, appeal_status, n);
  END IF;
  v := v || jsonb_build_object('default', page);
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $f$;
CREATE TEMP TABLE mh_now ON COMMIT DROP AS SELECT pg_temp.mh_pages(1, false) AS mod, pg_temp.mh_pages(5, false) AS member;
CREATE TEMP TABLE mh_was ON COMMIT DROP AS SELECT pg_temp.mh_pages(1, true) AS mod, pg_temp.mh_pages(5, true) AS member;

SELECT pg_temp.rh_need('pages replayed', (SELECT count(*) FROM mh_now, jsonb_object_keys(mod)), 43) AS done \gset rh_
SELECT pg_temp.rh_case('as a moderator, every page answers as production''s did, row for row in order', 'none',
  coalesce((SELECT string_agg(k, '; ' ORDER BY k) FROM mh_now n, mh_was w, jsonb_object_keys(n.mod || w.mod) k
             WHERE (n.mod -> k) IS DISTINCT FROM (w.mod -> k)), 'none')) AS done \gset rh_
-- Members 2, 3, 4, 5 at pages of 5, 20 and past twenty: 5+2+0+3, 20+2+0+3, held at twenty.
SELECT pg_temp.rh_case('a moderator''s pages: five each, twenty each, twenty past twenty; named twice, once; none below one', '10|25|25|7|0|0',
  (SELECT jsonb_array_length(mod -> '1|5') || '|' || jsonb_array_length(mod -> '1|20') || '|' || jsonb_array_length(mod -> '1|25')
          || '|' || jsonb_array_length(mod -> '2|5') || '|' || jsonb_array_length(mod -> '1|0') || '|' || jsonb_array_length(mod -> '1|-1') FROM mh_now)) AS done \gset rh_
SELECT pg_temp.rh_case('the four in one moment told apart by their ids, the higher first, cut by a page of twenty as before', '3|true',
  (SELECT count(*) FROM mh_now, jsonb_array_elements(mod -> '1|20') e WHERE (e ->> 3) IN ('rh mh 18', 'rh mh 19', 'rh mh 20', 'rh mh 21'))::text || '|'
    || ((SELECT jsonb_agg(e -> 0) FROM mh_now, jsonb_array_elements(mod -> '1|20') e) IS NOT DISTINCT FROM (SELECT jsonb_agg(e -> 0) FROM mh_was, jsonb_array_elements(mod -> '1|20') e))::text) AS done \gset rh_
SELECT pg_temp.rh_case('as a member, nothing, their own verdicts among those asked; as production''s', '0|true',
  (SELECT count(*) FROM mh_now, jsonb_each(member) e WHERE jsonb_array_length(e.value) > 0)::text || '|'
    || ((SELECT member FROM mh_now) = (SELECT member FROM mh_was))::text) AS done \gset rh_
SELECT pg_temp.rh_case('each member is read alone, newest first, to their page', 'true',
  (position('CROSS JOIN LATERAL' in pg_get_functiondef('public.get_moderation_history_for_users(uuid[], integer)'::regprocedure)) > 0
     AND position('ROW_NUMBER()' in pg_get_functiondef('public.get_moderation_history_for_users(uuid[], integer)'::regprocedure)) = 0)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
