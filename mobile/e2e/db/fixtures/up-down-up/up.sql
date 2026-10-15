-- The self-test's migration: a table, a column on it, an index and a function.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE public.self_test (id int PRIMARY KEY);
ALTER TABLE public.self_test ADD COLUMN note text;
CREATE INDEX self_test_note ON public.self_test (note);
CREATE FUNCTION public.self_test_count() RETURNS bigint LANGUAGE sql AS $$ SELECT count(*) FROM public.self_test $$;
