-- The jobs self-test's migration: a table; and, while it is applied, the filling job's last run, which
-- ends its work and takes it off the schedule (as the members' lists finished between car 64's readings).
CREATE TABLE public.self_test_jobs (id int PRIMARY KEY);
SELECT public.self_test_fill();
