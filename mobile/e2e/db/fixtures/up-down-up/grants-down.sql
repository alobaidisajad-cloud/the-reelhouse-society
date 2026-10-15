-- Visitors have it again: the grant lands after the members' one, the same grants in another order.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
GRANT EXECUTE ON FUNCTION public.self_test_one() TO anon;
