-- A rehearsal whose one case holds: rehearsals.mjs --self-test must see it pass.
\set ON_ERROR_STOP 1
BEGIN;
\ir ../../../../supabase/diagnostics/rehearsal_kit.sql

SELECT pg_temp.rh_case('the house keeps its members', 'true', (to_regclass('public.profiles') IS NOT NULL)::text);

SELECT pg_temp.rh_verdict();
ROLLBACK;
