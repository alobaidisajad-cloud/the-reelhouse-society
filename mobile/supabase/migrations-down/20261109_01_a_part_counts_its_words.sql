-- Undo of 20261109_01: the Dispatch's filings without their kept word count.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses it: a trigger 20261109_01 makes, run by no client (TestFlight build 41 and the website checked)
DROP TRIGGER z_counts_its_words ON public.dispatch_posts;
-- add-only (1): no shipped client uses it: a function 20261109_01 makes, named by no client before it (TestFlight build 41 and the website checked)
DROP FUNCTION public.dispatch_posts_count_words();
-- add-only (1): no shipped client uses it: a function 20261109_01 makes, named by no client before it (TestFlight build 41 and the website checked)
DROP FUNCTION public.dispatch_post_words(text);
-- add-only (1): no shipped client uses it: a column 20261109_01 makes, named by no client before it (TestFlight build 41 and the website checked)
ALTER TABLE public.dispatch_posts DROP COLUMN words;
