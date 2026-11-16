-- Read-only: what 20261115_01 leaves on production, each as one line.
-- Run with: node mobile/supabase/diagnostics/read-only.cjs train_10_live_check.sql

-- 20261115_01
SELECT 'sever_follows_on_block: a block takes the follows and the requests, both ways',
  (SELECT prosrc LIKE '%type IN (''follow'', ''follow_request'')%' FROM pg_proc WHERE oid = 'public.sever_follows_on_block()'::regprocedure)::text;
SELECT 'accept_follow_request: admits no one a block stands between',
  (SELECT prosrc LIKE '%a_block_stands_between(requester_id, v_me)%' FROM pg_proc WHERE oid = 'public.accept_follow_request(uuid)'::regprocedure)::text;
SELECT 'accept_follow_request: who may run it, as before it (authenticated|anon)',
  has_function_privilege('authenticated', 'public.accept_follow_request(uuid)', 'EXECUTE')::text
  || '|' || has_function_privilege('anon', 'public.accept_follow_request(uuid)', 'EXECUTE')::text;
SELECT 'follows and requests standing across a block (0)',
  (SELECT count(*) FROM public.interactions i
    WHERE i.type IN ('follow', 'follow_request')
      AND EXISTS (SELECT 1 FROM public.user_blocks b
                   WHERE b.type = 'block'
                     AND ((b.blocker_id = i.user_id AND b.blocked_id = i.target_user_id)
                       OR (b.blocker_id = i.target_user_id AND b.blocked_id = i.user_id))))::text;
