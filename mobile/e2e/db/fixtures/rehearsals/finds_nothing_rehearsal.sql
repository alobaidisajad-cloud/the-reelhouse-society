-- A rehearsal whose pick finds no row: rehearsals.mjs --self-test must see it fail
-- there, before any case could pass over nothing.
\set ON_ERROR_STOP 1
BEGIN;
\ir ../../../../supabase/diagnostics/rehearsal_kit.sql

SELECT set_config('rehearsal.nobody', pg_temp.rh_found('a member with an empty handle',
  (SELECT id FROM public.profiles WHERE username = '' LIMIT 1))::text, true) AS done \gset rh_
SELECT pg_temp.rh_case('the member has no logs', '0',
  (SELECT count(*)::text FROM public.logs WHERE user_id::text = current_setting('rehearsal.nobody', true)));

SELECT pg_temp.rh_verdict();
ROLLBACK;
