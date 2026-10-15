-- The grants self-test's starting point: a function visitors and members may run, in that order.
CREATE FUNCTION public.self_test_one() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
REVOKE ALL ON FUNCTION public.self_test_one() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_test_one() TO anon;
GRANT EXECUTE ON FUNCTION public.self_test_one() TO authenticated;
