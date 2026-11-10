-- Read-only: what 20261109_01, 20261109_02 and 20261109_03 leave on production, each as one line.
-- Run with: node mobile/supabase/diagnostics/read-only.cjs train_7_live_check.sql

-- 20261109_01
SELECT 'dispatch_posts.words: a plain integer column, no generated expression',
  (SELECT data_type || '|' || is_generated FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dispatch_posts' AND column_name = 'words');
SELECT 'z_counts_its_words counts every write of a filing',
  (SELECT string_agg(tgname, ',') FROM pg_trigger WHERE tgrelid = 'public.dispatch_posts'::regclass AND tgname = 'z_counts_its_words');
SELECT 'dispatch_post_words: authenticated runs it (a member''s own write counts through it), anon does not',
  has_function_privilege('authenticated', 'public.dispatch_post_words(text)', 'EXECUTE')::text
  || '|' || has_function_privilege('anon', 'public.dispatch_post_words(text)', 'EXECUTE')::text;
SELECT 'every part of a series has its count, and each count is the text''s',
  (SELECT count(*) FROM public.dispatch_posts WHERE series_id IS NOT NULL)::text || ' parts|'
  || (SELECT count(*) FROM public.dispatch_posts WHERE series_id IS NOT NULL
        AND words IS DISTINCT FROM public.dispatch_post_words(coalesce(full_content, body)))::text || ' wrong';

-- 20261109_02
SELECT 'get_lounge_list: the caller''s rights, its search path set',
  prosecdef::text || '|' || array_to_string(proconfig, ',') FROM pg_proc WHERE oid = 'public.get_lounge_list()'::regprocedure;
SELECT 'get_lounge_list: authenticated may run it, anon may not',
  has_function_privilege('authenticated', 'public.get_lounge_list()', 'EXECUTE')::text
  || '|' || has_function_privilege('anon', 'public.get_lounge_list()', 'EXECUTE')::text;

-- 20261109_03
SELECT 'a critique of a log names its log, of a stack its stack',
  (pg_get_functiondef('public.notify_on_log_comment()'::regprocedure) LIKE '%''endorse:log:'' || NEW.log_id%')::text
  || '|' || (pg_get_functiondef('public.notify_on_list_comment()'::regprocedure) LIKE '%''endorse:list:'' || NEW.list_id%')::text;
SELECT 'critique notices of a log or a stack: keyed | keyless with a critique still to match (0) | keyless with none',
  (SELECT count(*) FROM public.notifications WHERE type = 'comment' AND (group_key LIKE 'endorse:log:%' OR group_key LIKE 'endorse:list:%'))::text
  || '|' || (SELECT count(*) FROM public.notifications n WHERE n.type = 'comment' AND n.group_key IS NULL
        AND (EXISTS (SELECT 1 FROM public.log_comments c JOIN public.logs l ON l.id = c.log_id
                      WHERE n.message LIKE 'left a critique on your log of %' AND n.from_user_id = c.user_id
                        AND n.user_id = l.user_id AND n.created_at = c.created_at)
          OR EXISTS (SELECT 1 FROM public.list_comments c JOIN public.lists l ON l.id = c.list_id
                      WHERE n.message LIKE 'left a critique on your stack %' AND n.from_user_id = c.user_id
                        AND n.user_id = l.user_id AND n.created_at = c.created_at)))::text
  || '|' || (SELECT count(*) FROM public.notifications WHERE type = 'comment' AND group_key IS NULL
        AND (message LIKE 'left a critique on your log of %' OR message LIKE 'left a critique on your stack %'))::text;
