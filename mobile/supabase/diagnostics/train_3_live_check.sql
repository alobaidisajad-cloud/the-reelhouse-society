-- Read-only: what 20261015_07, 20261016_01 and 20261016_02 leave on production, each as one line.
-- Run with: node mobile/supabase/diagnostics/read-only.cjs train_3_live_check.sql

-- 20261015_07
SELECT 'rate_limit_check refuses a table no rule names', (pg_get_functiondef('public.rate_limit_check(text,text,integer,integer)'::regprocedure) LIKE '%counts only the rows a rule names%')::text;
SELECT 'a_block_stands_between, runnable by anon or authenticated', count(*)::text
  FROM unnest(ARRAY['anon', 'authenticated']) AS r WHERE has_function_privilege(r, 'public.a_block_stands_between(uuid,uuid)', 'EXECUTE');
SELECT 'audience_allows reads the block and the reader''s view', (pg_get_functiondef('public.audience_allows(uuid,uuid,text)'::regprocedure) LIKE '%a_block_stands_between%can_view_user_data%')::text;
SELECT 'a follow across a block is refused', (pg_get_functiondef('public.enforce_privacy_on_follow()'::regprocedure) LIKE '%A block stands between these members%')::text;
SELECT 'the Dispatch''s block triggers, enabled', count(*)::text
  FROM pg_trigger WHERE tgname = 'refuse_across_a_block' AND NOT tgisinternal AND tgenabled = 'O'
   AND tgrelid IN ('public.dispatch_comments'::regclass, 'public.dispatch_certifications'::regclass);
SELECT 'the three gates anon may run', count(*)::text
  FROM unnest(ARRAY['public.can_annotate_log(uuid,uuid)', 'public.can_annotate_list(uuid,uuid)', 'public.can_endorse_content(uuid,text,uuid,uuid)']) AS f
 WHERE has_function_privilege('anon', f::regprocedure, 'EXECUTE');
SELECT 'an analytics event is filed under its own member', (pg_get_expr(polwithcheck, polrelid) LIKE '%user_id = auth.uid()%')::text
  FROM pg_policy WHERE polname = 'Users can insert analytics events';
SELECT 'error reports: the daily ceiling trigger and its index', count(*)::text FROM (
  SELECT 1 FROM pg_trigger WHERE tgname = 'daily_ceiling' AND tgrelid = 'public.error_logs'::regclass AND tgenabled = 'O'
  UNION ALL SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'error_logs_member_day') x;
SELECT 'toggle_dossier_certify keeps a member''s standing and an open post', (pg_get_functiondef('public.toggle_dossier_certify(uuid)'::regprocedure) LIKE '%silenced by The Society%ended_at IS NULL%')::text;
SELECT 'a report without its reporter is still resolved', (pg_get_functiondef('public.resolve_moderation_report_v2(uuid,text,uuid,text,integer,boolean)'::regprocedure) LIKE '%v_reporter_id IS NOT NULL%')::text;
SELECT 'a salon''s messages hide the blocked', count(*)::text FROM pg_policy
 WHERE polname = 'lounge_messages_hide_blocked' AND polrelid = 'public.lounge_messages'::regclass AND NOT polpermissive;
SELECT 'members whose preference says private and whose file is not', count(*)::text FROM public.profiles
 WHERE preferences ->> 'social_visibility' = 'private' AND is_social_private IS NOT TRUE;
SELECT 'profiles still holding follows in text', count(*)::text FROM public.profiles
 WHERE cardinality(following) > 0 OR cardinality(followers) > 0;

-- 20261016_01
SELECT 'the salon''s three triggers, enabled', count(*)::text FROM pg_trigger
 WHERE NOT tgisinternal AND tgenabled = 'O' AND tgname IN
   ('a_reaction_is_in_its_message_salon', 'a_reply_quotes_its_message', 'a_withdrawn_message_leaves_its_quotes');
SELECT 'a request to follow is seen by its two members alone', (pg_get_expr(polqual, polrelid) LIKE '%follow_request%')::text
  FROM pg_policy WHERE polname = 'interactions_select_authorized';
SELECT 'a private stack is refused a critique and a certification', (
  pg_get_functiondef('public.can_annotate_list(uuid,uuid)'::regprocedure) LIKE '%is_private%'
  AND pg_get_functiondef('public.can_endorse_content(uuid,text,uuid,uuid)'::regprocedure) LIKE '%v_private%')::text;
SELECT 'the old Dispatch tables a member may write', count(*)::text
  FROM unnest(ARRAY['public.dispatch_dossiers_legacy', 'public.dossier_comments_legacy', 'public.dossier_certifications_legacy']) AS t,
       unnest(ARRAY['anon', 'authenticated']) AS r, unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS w
 WHERE has_table_privilege(r, t, w);

-- 20261016_02
SELECT 'a member may always leave: the claims set aside', (pg_get_functiondef('public.request_account_deletion()'::regprocedure) LIKE '%request.jwt.claims%')::text;
SELECT 'the three functions nothing called, still there', count(*)::text
  FROM unnest(ARRAY['public.get_profile_metrics(uuid)', 'public.get_user_lounges(uuid)', 'public.replace_list_items(uuid,jsonb)']) AS f
 WHERE to_regprocedure(f) IS NOT NULL;
