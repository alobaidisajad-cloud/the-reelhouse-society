-- ════════════════════════════════════════════════════════════════════════════
-- 20261015_02 — no function in public may be run by a role with no grant.
-- ════════════════════════════════════════════════════════════════════════════
-- Every role inherits PUBLIC, so what PUBLIC may execute, every login may: a
-- function is run only by the roles granted it. Each of the 71 below keeps its
-- own grants to anon, authenticated and service_role, so every member's call
-- is answered as before;
-- only delete_list_cascade was never granted to anon, and a signed-out visitor
-- owns no list. The trigger functions among them fire as before: a trigger's
-- function is not checked for EXECUTE when it fires.
-- Then every function the postgres role makes from now on starts closed to
-- PUBLIC. The line names no schema: a default for one schema cannot take away
-- PUBLIC's built-in EXECUTE, so it would do nothing.
-- Undo: mobile/supabase/migrations-down/20261015_02_no_function_is_open_to_everyone.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: every call of TestFlight build 41 and the website goes as anon or authenticated,
--   whose grants stay, as the old-app E2E and the shipped clients' schema checks replay; anon loses only
--   delete_list_cascade, which build 41 calls signed in alone (listSlice, mutationExecutor) and the website never
REVOKE EXECUTE ON FUNCTION
    public.assign_list_item_position(),
    public.can_annotate_list(p_actor uuid, p_list_id uuid),
    public.can_annotate_log(p_actor uuid, p_log_id uuid),
    public.can_endorse_content(p_actor uuid, p_type text, p_log_id uuid, p_list_id uuid),
    public.can_view_user_data(target_uid uuid),
    public.check_interaction_rate_limit(),
    public.create_lounge(p_name text, p_description text, p_is_private boolean),
    public.delete_list_cascade(p_list_id uuid),
    public.dispatch_comments_pin_columns(),
    public.dispatch_count_cert(),
    public.dispatch_count_comment(),
    public.dispatch_door(),
    public.dispatch_no_hard_delete(),
    public.dispatch_notify_answer(),
    public.dispatch_notify_ballot_closed(),
    public.dispatch_notify_certify(),
    public.dispatch_notify_critique(),
    public.dispatch_posts_pin_columns(),
    public.dispatch_room_totals(p_user_id uuid),
    public.dispatch_scrub_departed(),
    public.divert_private_notes(),
    public.dossier_certifications_write(),
    public.dossier_comments_write(),
    public.dossiers_write(),
    public.enforce_log_insert_ceiling(),
    public.enforce_log_tier_fields(),
    public.enforce_lounge_identity_freeze(),
    public.enforce_not_restricted(),
    public.enforce_privacy_on_follow(),
    public.enforce_profile_identity_freeze(),
    public.enforce_tier_gate(),
    public.enforce_username_policy(),
    public.get_community_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid),
    public.get_following_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid),
    public.get_priority_reports(p_limit integer, p_cursor_count bigint, p_cursor_created timestamp with time zone, p_cursor_id uuid),
    public.get_profile_counts(p_user_id uuid),
    public.get_profile_metrics(uid uuid),
    public.get_public_profile_analytics(p_user_id uuid),
    public.get_salon_member_faces(p_lounge_ids uuid[]),
    public.handle_follow_count_change(),
    public.handle_is_unwelcome(p_handle text),
    public.handle_new_user(),
    public.handle_privacy_switch(),
    public.handle_user_deletion(),
    public.increment_dossier_views(dossier_uuid uuid),
    public.is_hidden_by(viewer_id uuid, author_id uuid),
    public.is_lounge_member_or_host(_lounge_id uuid),
    public.is_user_not_banned(),
    public.join_public_lounge(p_lounge_id uuid),
    public.may_file(),
    public.note_film(),
    public.notify_on_dossier_certify(),
    public.notify_on_dossier_comment(),
    public.notify_on_interaction(),
    public.notify_on_list_comment(),
    public.notify_on_log_comment(),
    public.profile_tier_weight(p_tier text, p_role text, p_is_founding boolean),
    public.protect_lounge_member_status(),
    public.protect_privileged_profile_fields(),
    public.protect_video_review_metrics(),
    public.public_prefs(p jsonb),
    public.recount_lounge_members(),
    public.register_push_token(p_token text, p_platform text),
    public.replace_list_items(p_list_id uuid, p_items jsonb),
    public.request_lounge_membership(p_lounge_id uuid),
    public.rls_auto_enable(),
    public.set_updated_at(),
    public.sever_follows_on_block(),
    public.tg_notify_push(),
    public.tier_weight(t text),
    public.update_my_preferences(p_preferences jsonb)
  FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
