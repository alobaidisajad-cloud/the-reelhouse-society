-- An undo that leaves the function behind: the self-test must catch it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DROP TABLE public.self_test;
