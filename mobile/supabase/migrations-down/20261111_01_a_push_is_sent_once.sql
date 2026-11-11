-- Undo of 20261111_01: notices with no record of being pushed. Deploy notify-push v5 first: v6 claims
-- by pushed_at, and would fail every push without it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the trigger as it was before 20261111_01, which every shipped client wrote under
DROP TRIGGER a_keeps_what_it_is ON public.notifications;
CREATE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.notifications FOR EACH ROW
  EXECUTE FUNCTION public.a_row_keeps_what_it_is('user_id', 'type', 'from_user_id', 'from_username', 'related_lounge_id',
    'film_id', 'poster_path', 'title', 'body', 'message', 'metadata', 'group_key', 'created_at');

-- add-only (1): no shipped client uses it: a column 20261111_01 makes, named by no client before it (TestFlight build 41 and the website checked)
ALTER TABLE public.notifications DROP COLUMN pushed_at;
