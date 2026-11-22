-- Read-only: what round 14's cars (20261120_00 to 20261120_32) leave on production, each as one line.
-- Run with: node mobile/supabase/diagnostics/read-only.cjs train_11_live_check.sql
-- The train ran each car's rehearsal there after it applied it; these read back what the rehearsals
-- roll away: the rows each once-only fill changed, the job the house keeps, and the checks validated.

-- 20261120_00, _06, _12, _15, _18, _22, _30: each new table keeps row-level security on (all true)
SELECT 'the new tables, each with row-level security on',
  (SELECT string_agg(c.relname || '=' || c.relrowsecurity::text, ' ' ORDER BY c.relname)
     FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relname IN ('sign_in_doors', 'sign_in_handles', 'sign_in_devices', 'critique_budget', 'analytics_budget',
                        'salon_budget', 'gate_day', 'gate_counted', 'reported_words', 'withheld_pieces'));

-- 20261120_03
SELECT 'a member seated in a salon whose founder a block stands between (0)',
  (SELECT count(*) FROM public.lounge_members m
     JOIN public.lounges l ON l.id = m.lounge_id
     JOIN public.user_blocks b ON b.type = 'block'
      AND ((m.user_id = b.blocked_id AND l.creator_id = b.blocker_id)
        OR (m.user_id = b.blocker_id AND l.creator_id = b.blocked_id))
    WHERE m.status IN ('approved', 'muted', 'pending'))::text;

-- 20261120_11
SELECT 'a card standing that is not what the house holds (0)',
  (SELECT count(*) FROM public.lounge_messages x
     CROSS JOIN LATERAL (SELECT private.a_shared_card(x, false) AS card) c
    WHERE x.type IN ('film_share', 'person_share', 'log_share', 'list_share', 'dossier_share')
      AND NOT (coalesce(x.metadata, '{}'::jsonb) @> '{"gone": true}'::jsonb)
      AND NOT (coalesce(x.metadata, '{}'::jsonb) @> '{"sealed": true}'::jsonb)
      AND (x.film_id, x.film_title, x.film_poster, x.metadata)
          IS DISTINCT FROM ((c.card).film_id, (c.card).film_title, (c.card).film_poster, (c.card).metadata))::text;

-- 20261120_20
SELECT 'a message carrying another''s words that does not name whose (0)',
  (SELECT count(*) FROM public.lounge_messages m
    WHERE m.carries_words_of IS NULL
      AND (m.reply_to_id IS NOT NULL OR m.type IN ('log_share', 'list_share', 'dossier_share'))
      AND public.whose_words_a_message_carries(m.user_id, m.type, m.metadata, m.reply_to_id) IS NOT NULL)::text;

-- 20261120_24
SELECT 'a notice of a verdict that does not name its verdict (0)',
  (SELECT count(*) FROM public.notifications n
     JOIN public.mod_actions m
       ON m.action <> 'dismiss' AND m.target_user_id IS NOT NULL
      AND n.user_id = m.target_user_id AND n.created_at = m.created_at
    WHERE n.type = 'moderation' AND n.metadata ->> 'action' = m.action
      AND NOT (coalesce(n.metadata, '{}'::jsonb) ? 'mod_action_id'))::text;

-- 20261120_21, validated by 20261120_27 (all true)
SELECT 'the verdicts'' checks, each validated',
  (SELECT string_agg(conname || '=' || convalidated::text, ' ' ORDER BY conname)
     FROM pg_constraint
    WHERE conrelid = 'public.mod_actions'::regclass
      AND conname IN ('mod_actions_appeal_len', 'mod_actions_appeal_note_len', 'mod_actions_lift_reason_len',
                      'mod_actions_appeal_status_check', 'mod_actions_appeal_whole', 'mod_actions_content_snapshot_len'));

-- 20261120_32
SELECT 'the hourly job that ends a withheld piece''s 30 days (17 * * * *|true)',
  (SELECT schedule || '|' || active::text FROM cron.job WHERE jobname = 'a-withheld-piece-is-deleted-unappealed');
SELECT 'expire_withheld_pieces: no member may run it (authenticated|anon)',
  has_function_privilege('authenticated', 'public.expire_withheld_pieces()', 'EXECUTE')::text
  || '|' || has_function_privilege('anon', 'public.expire_withheld_pieces()', 'EXECUTE')::text;
