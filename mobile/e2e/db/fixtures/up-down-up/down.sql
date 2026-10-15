-- Its undo, whole.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DROP FUNCTION public.self_test_count();
DROP TABLE public.self_test;
