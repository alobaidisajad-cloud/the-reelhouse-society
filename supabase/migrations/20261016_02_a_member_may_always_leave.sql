-- ════════════════════════════════════════════════════════════════════════════
-- 20261016_02 — a member may always leave.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A member closes their own account whatever their standing: the closing
--      is the house's own act once the member has asked, so no rule of a
--      member's standing (a ban, a suspension, a salon's face kept while its
--      host is silenced) stands between a member and their leaving.
--   2. three functions nothing calls are taken away (WORKLIST P1.14, P3.4):
--      get_profile_metrics, which failed on every call (it divided logs.year,
--      text, by a number); get_user_lounges, which still returned a salon's
--      retired invite code; and replace_list_items, an owner-rights writer of
--      stacks open to visitors.
-- Undo: mobile/supabase/migrations-down/20261016_02_a_member_may_always_leave.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── 1. A member may always leave ────────────────────────────────────────────
-- As before, with one step: once the member is read, the request's claims are
-- set aside, so the rules that ask who is writing (enforce_not_restricted,
-- enforce_lounge_identity_freeze) see the house. Nothing after reads them.
-- add-only (3): it only fixes: TestFlight build 41 and the website close an account through this one call
--   (the app's AuthService, the website's SettingsPage), which now closes a silenced or suspended member's too, and every other
--   account as before, as the rehearsal replays.
CREATE OR REPLACE FUNCTION public.request_account_deletion() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid      uuid := auth.uid();
  v_handle text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT username INTO v_handle FROM public.profiles WHERE id = uid;

  -- The member has asked; what follows is the house's own act.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  UPDATE public.lounges l
     SET creator_id = (
           SELECT m.user_id FROM public.lounge_members m
            WHERE m.lounge_id = l.id AND m.user_id <> uid AND m.status = 'approved'
            ORDER BY m.joined_at ASC NULLS LAST
            LIMIT 1)
   WHERE l.creator_id = uid
     AND EXISTS (SELECT 1 FROM public.lounge_members m
                  WHERE m.lounge_id = l.id AND m.user_id <> uid AND m.status = 'approved');

  UPDATE public.log_comments
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dossier_comments
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dispatch_dossiers
     SET user_id = NULL, author_username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.lounge_messages
     SET reply_to_username = '[deleted]'
   WHERE reply_to_id IN (SELECT id FROM public.lounge_messages WHERE user_id = uid);

  DELETE FROM public.notifications WHERE from_user_id = uid;

  IF v_handle IS NOT NULL THEN
    UPDATE public.lounge_messages
       SET metadata = (metadata - 'owner_username') - 'author_username'
     WHERE metadata->>'owner_username' = v_handle
        OR metadata->>'author_username' = v_handle;
  END IF;

  UPDATE public.list_comments   SET user_id = NULL WHERE user_id = uid;
  UPDATE public.lounge_messages SET user_id = NULL WHERE user_id = uid;

  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE owner = uid;

  DELETE FROM auth.users WHERE id = uid;
END
$$;

-- ── 2. Three functions nothing calls are taken away ─────────────────────────
-- add-only (1): no shipped client uses it: TestFlight build 41, the website and the edge functions never call
--   get_profile_metrics, and no function, policy or view of the database names it; every call failed.
DROP FUNCTION public.get_profile_metrics(uuid);

-- add-only (1): no shipped client uses it: TestFlight build 41, the website and the edge functions never call
--   get_user_lounges (granted to service_role alone), and no function, policy or view of the database names it.
DROP FUNCTION public.get_user_lounges(uuid);

-- add-only (1): no shipped client uses it: TestFlight build 41 saves a stack through save_stack and the website
--   through the list_items table; no edge function calls replace_list_items, and no function, policy or view of
--   the database names it.
DROP FUNCTION public.replace_list_items(uuid, jsonb);
