-- Visitors lose the function.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
REVOKE EXECUTE ON FUNCTION public.self_test_one() FROM anon;
