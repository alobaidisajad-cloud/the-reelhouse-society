-- A rehearsal in which no case runs: rehearsals.mjs --self-test must see it fail.
\set ON_ERROR_STOP 1
BEGIN;
\ir ../../../../supabase/diagnostics/rehearsal_kit.sql

SELECT count(*) FROM public.profiles;

SELECT pg_temp.rh_verdict();
ROLLBACK;
