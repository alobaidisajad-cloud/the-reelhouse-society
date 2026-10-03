-- ════════════════════════════════════════════════════════════════════════════
-- a_dismissal_is_recorded_once_rehearsal.sql — 20261002_05. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/a_dismissal_is_recorded_once_rehearsal.sql
--
-- Two pending reports and one already resolved are dismissed together by an
-- admin. Without with_fix the record gains three dismissals for two: the
-- rehearsal says no. Read each NOTICE as  case | expected | got.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;

\if :{?with_fix}
\ir ../../../supabase/migrations/20261002_05_a_dismissal_is_recorded_once.sql
\endif

-- An admin (one is made for the rehearsal if the house has none), a reporter, a target.
SELECT set_config('rehearsal.admin', coalesce(
  (SELECT id::text FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1),
  (SELECT id::text FROM public.profiles ORDER BY created_at LIMIT 1)), true) AS done \gset rh_
UPDATE public.profiles SET role = 'admin' WHERE id = current_setting('rehearsal.admin')::uuid AND role IS DISTINCT FROM 'admin';
SELECT set_config('rehearsal.reporter', (SELECT id::text FROM public.profiles WHERE id::text <> current_setting('rehearsal.admin') ORDER BY created_at LIMIT 1), true) AS done \gset rh_
SELECT set_config('rehearsal.target', (SELECT id::text FROM public.profiles WHERE id::text NOT IN (current_setting('rehearsal.admin'), current_setting('rehearsal.reporter')) ORDER BY created_at LIMIT 1), true) AS done \gset rh_

CREATE TEMP TABLE dm_ids ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.reports (reporter_id, content_id, content_type, reason, target_user_id, status)
  VALUES (current_setting('rehearsal.reporter')::uuid, gen_random_uuid(), 'dispatch_post', 'spam', current_setting('rehearsal.target')::uuid, 'pending'),
         (current_setting('rehearsal.reporter')::uuid, gen_random_uuid(), 'dispatch_post', 'spam', current_setting('rehearsal.target')::uuid, 'pending'),
         (current_setting('rehearsal.reporter')::uuid, gen_random_uuid(), 'dispatch_post', 'spam', current_setting('rehearsal.target')::uuid, 'resolved')
  RETURNING id, status)
SELECT id, status FROM made;
GRANT SELECT ON dm_ids TO authenticated;
CREATE TEMP TABLE dm_out (n integer) ON COMMIT DROP;
GRANT ALL ON dm_out TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.admin'), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO dm_out SELECT public.bulk_dismiss_reports((SELECT array_agg(id) FROM dm_ids), current_setting('rehearsal.admin')::uuid, 'rehearsal');
RESET ROLE;

DO $$
DECLARE failed integer := 0; c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('the count is the reports dismissed', '2', (SELECT n::text FROM dm_out)),
    ('the record holds one dismissal per report dismissed', '2',
       (SELECT count(*)::text FROM public.mod_actions WHERE report_id IN (SELECT id FROM dm_ids) AND action = 'dismiss')),
    ('the one already resolved gains nothing', '0',
       (SELECT count(*)::text FROM public.mod_actions WHERE report_id IN (SELECT id FROM dm_ids WHERE status = 'resolved'))),
    ('both pending reports are now resolved', '2',
       (SELECT count(*)::text FROM public.reports WHERE id IN (SELECT id FROM dm_ids WHERE status = 'pending') AND status = 'resolved'))
  ) AS t(label, expected, got) LOOP
    RAISE NOTICE '% | % | %', c.label, c.expected, c.got;
    IF c.got IS DISTINCT FROM c.expected THEN failed := failed + 1; END IF;
  END LOOP;
  RAISE NOTICE 'FAILED: %', failed;
END $$;

ROLLBACK;
