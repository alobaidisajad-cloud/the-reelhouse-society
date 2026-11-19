-- Undo of 20261120_27: a member judged by the house reads its whole reason, appeals it once, and is told the outcome, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B6, undone: no verdict read whole, no appeal, the record as it was ──
-- The functions H-B6 made dropped; get_moderation_history_for_users as the live schema has it, with its grants.
-- The rules H-B6 proved are laid again NOT VALID, as H-B6.locks left them; H-B6.locks' undo takes them away.
-- add-only (1): no shipped client uses it: a function H-B6 made, called by no shipped client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.tribunal_waiting();
-- add-only (1): no shipped client uses it: a function H-B6 made, called by no shipped client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.judge_appeal(uuid, text, text);
-- add-only (1): no shipped client uses it: a function H-B6 made, called by no shipped client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.get_pending_appeals(timestamp with time zone, uuid, integer);
-- add-only (1): no shipped client uses it: a function H-B6 made, called by no shipped client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.file_appeal(uuid, text);
-- add-only (1): no shipped client uses it: a function H-B6 made, called by no shipped client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.get_my_verdict(uuid);
-- add-only (1): no shipped client uses it: a function H-B6 made, called by no shipped client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.get_my_verdicts(timestamp with time zone, uuid, integer);

-- As the live schema has it.
-- add-only (3): it only fixes: the undo of H-B6, the record read as before (TestFlight build 41 and the website read it so)
DROP FUNCTION IF EXISTS public.get_moderation_history_for_users(uuid[], integer);
CREATE FUNCTION public.get_moderation_history_for_users(p_user_ids uuid[], p_per_user integer DEFAULT 5) RETURNS TABLE(id uuid, report_id uuid, target_user_id uuid, admin_id uuid, action text, reason text, duration_hours integer, expires_at timestamp with time zone, created_at timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT r.id, r.report_id, r.target_user_id, r.admin_id, r.action, r.reason,
         r.duration_hours, r.expires_at, r.created_at
  FROM (
    SELECT m.*,
           ROW_NUMBER() OVER (PARTITION BY m.target_user_id ORDER BY m.created_at DESC, m.id DESC) AS rn
    FROM public.mod_actions m
    WHERE m.target_user_id = ANY(COALESCE(p_user_ids, ARRAY[]::uuid[]))
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
  ) r
  WHERE r.rn <= LEAST(GREATEST(COALESCE(p_per_user, 5), 0), 20)
  ORDER BY r.target_user_id, r.created_at DESC, r.id DESC;
$$;
-- add-only (3): it only fixes: the grants the live schema gives it, stated again
REVOKE ALL ON FUNCTION public.get_moderation_history_for_users(uuid[], integer) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.get_moderation_history_for_users(uuid[], integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_moderation_history_for_users(uuid[], integer) TO service_role;

-- The six rules, unproved again, as H-B6.locks left them.
-- add-only (1): no shipped client uses it: a rule H-B6.locks made, laid again NOT VALID as that car left it (TestFlight build 41 and the website never write mod_actions)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_appeal_len;
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_appeal_len CHECK ((char_length(appeal) <= 1000)) NOT VALID;
-- add-only (1): no shipped client uses it: a rule H-B6.locks made, laid again NOT VALID as that car left it (TestFlight build 41 and the website never write mod_actions)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_appeal_note_len;
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_appeal_note_len CHECK ((char_length(appeal_note) <= 2000)) NOT VALID;
-- add-only (1): no shipped client uses it: a rule H-B6.locks made, laid again NOT VALID as that car left it (TestFlight build 41 and the website never write mod_actions)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_lift_reason_len;
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_lift_reason_len CHECK ((char_length(lift_reason) <= 2000)) NOT VALID;
-- add-only (1): no shipped client uses it: a rule H-B6.locks made, laid again NOT VALID as that car left it (TestFlight build 41 and the website never write mod_actions)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_appeal_status_check;
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_appeal_status_check
  CHECK ((appeal_status IS NULL OR appeal_status = ANY (ARRAY['pending'::text, 'upheld'::text, 'overturned'::text]))) NOT VALID;
-- add-only (1): no shipped client uses it: a rule H-B6.locks made, laid again NOT VALID as that car left it (TestFlight build 41 and the website never write mod_actions)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_appeal_whole;
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_appeal_whole
  CHECK ((((appeal IS NULL) = (appeal_filed_at IS NULL)) AND ((appeal IS NULL) = (appeal_status IS NULL)))) NOT VALID;
-- add-only (1): no shipped client uses it: a rule H-B6.locks made, laid again NOT VALID as that car left it (TestFlight build 41 and the website never write mod_actions)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_content_snapshot_len;
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_content_snapshot_len CHECK ((char_length((content_snapshot)::text) <= 200000)) NOT VALID;
