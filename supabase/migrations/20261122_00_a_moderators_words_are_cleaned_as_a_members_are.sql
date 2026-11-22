-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_00 — a moderator's words are cleaned as a member's are.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A moderator's word on an appeal (appeal_note) and the reason a sanction is lifted (lift_reason)
--      were kept as typed and told to the member in their notice, so a right-to-left override or an
--      invisible character in them showed one thing and kept another: judge_appeal and lift_sanction
--      clean each through clean_member_text, as file_appeal cleans the appeal and the verdict's reason
--      is cleaned; the verdict's cleaning trigger cleans the appeal, its word and the lift's reason
--      too; and the_moderators_words_made_clean cleans those already written, and their notices.
--   Two functions replaced, a pass, then the trigger last: its lock on mod_actions (as any trigger's
--   making takes) is held only to the commit; the notices are found by their member and moment.
-- Undo: mobile/supabase/migrations-down/20261122_00_a_moderators_words_are_cleaned_as_a_members_are.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── the Tribunal's word on an appeal, cleaned ──
--   As production holds it (20261120_32), but the word is cleaned before it is kept or told.
-- add-only (3): it only fixes: the Tribunal's word is cleaned before it is kept and told, every answer as before; replayed as the members themselves (a_moderators_words_are_cleaned_as_a_members_are rehearsal)
CREATE OR REPLACE FUNCTION public.judge_appeal(p_action_id uuid, p_outcome text, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_admin_id uuid := auth.uid();
  -- The Tribunal's word, cleaned as a member's words are (clean_member_text): kept on the verdict and
  -- told to the member in their notice.
  v_note     text := btrim(coalesce(public.clean_member_text(p_note), ''));
  m          public.mod_actions%ROWTYPE;
  v_snap     jsonb;
  v_kept     jsonb;
  v_type     text;
  v_id       uuid;
  v_rows     integer := 0;
  v_effect   text := '';
  v_notice   text;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('upheld', 'overturned') THEN
    RAISE EXCEPTION 'An appeal is upheld or overturned.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_note) = 0 OR char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'A word for the member of up to 500 characters is required.' USING ERRCODE = 'P0001';
  END IF;

  -- Held while it is heard: a second moderator hearing it at the same moment waits, then is refused.
  SELECT * INTO m FROM public.mod_actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND OR m.appeal IS NULL THEN
    RAISE EXCEPTION 'VERDICT_GONE' USING ERRCODE = 'P0002';
  END IF;
  IF m.appeal_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'ALREADY_JUDGED' USING ERRCODE = 'P0002';
  END IF;
  -- The owner's rule (a_judge_is_refused, the house's one rule of who may judge a case): the one who
  -- ruled never hears the appeal of their own verdict, nor does the member the verdict is about.
  IF private.a_judge_is_refused(v_admin_id, m.admin_id, m.target_user_id) IS NOT NULL THEN
    RAISE EXCEPTION '%', private.a_judge_is_refused(v_admin_id, m.admin_id, m.target_user_id) USING ERRCODE = '42501';
  END IF;

  UPDATE public.mod_actions
     SET appeal_status = p_outcome, appeal_judged_by = v_admin_id, appeal_judged_at = now(), appeal_note = v_note
   WHERE id = p_action_id;

  IF p_outcome = 'overturned' THEN
    -- Struck: the verdict no longer holds the member's standing, and the record says so.
    UPDATE public.mod_actions
       SET lifted_at = now(), lifted_by = v_admin_id, lift_reason = 'Overturned on appeal: ' || v_note
     WHERE id = p_action_id AND lifted_at IS NULL;

    IF m.action = 'warn' AND m.target_user_id IS NOT NULL THEN
      -- The warning it wrote (in the verdict's own moment) is withdrawn, and the count with it.
      DELETE FROM public.warnings
       WHERE id = (SELECT w.id FROM public.warnings w
                    WHERE w.user_id = m.target_user_id AND w.reason = m.reason AND w.created_at = m.created_at
                    ORDER BY w.id LIMIT 1);
      UPDATE public.profiles SET warning_count = GREATEST(coalesce(warning_count, 0) - 1, 0) WHERE id = m.target_user_id;
      v_effect := 'The warning is withdrawn.';

    ELSIF m.action IN ('suspend', 'mute_user') AND m.target_user_id IS NOT NULL THEN
      PERFORM public.standing_from_verdicts(m.target_user_id, 'suspension');
      v_effect := 'The pause it set no longer holds.';

    ELSIF m.action IN ('ban', 'permanent_exile') AND m.target_user_id IS NOT NULL THEN
      PERFORM public.standing_from_verdicts(m.target_user_id, 'ban');
      v_effect := 'The closing it set no longer holds.';

    ELSIF m.action = 'delete_content' AND EXISTS (SELECT 1 FROM public.withheld_pieces w WHERE w.mod_action_id = m.id) THEN
      -- Withheld (H-B10): given back whole, its critiques, marks, cards, counts and notices with it.
      -- Deleted meanwhile by its own author, there is nothing left to give back.
      IF public.give_back_withheld_piece(m.id) THEN
        v_rows := 1;
        v_effect := 'What it removed stands again where it was, whole, as it stood.';
      ELSE
        v_effect := 'What it removed is no longer in the house: you deleted it meanwhile.';
      END IF;

    ELSIF m.action = 'delete_content' THEN
      -- Put back where its row still stands, and only as the house left it (never over what its
      -- author has written since).
      v_snap := coalesce(m.content_snapshot, '{}'::jsonb);
      v_kept := v_snap -> 'kept';
      v_type := coalesce(v_snap ->> 'type', (SELECT r.content_type FROM public.reports r WHERE r.id = m.report_id));
      v_id := coalesce(
        CASE WHEN (v_snap ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (v_snap ->> 'id')::uuid END,
        (SELECT CASE WHEN r.content_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN r.content_id::uuid END
           FROM public.reports r WHERE r.id = m.report_id));
      IF v_type = 'lounge_message' AND coalesce(v_kept ->> 'content', v_snap ->> 'body') IS NOT NULL THEN
        UPDATE public.lounge_messages
           SET content = coalesce(v_kept ->> 'content', v_snap ->> 'body'), deleted_at = NULL
         WHERE id = v_id AND deleted_at IS NOT NULL AND content = '';
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        -- Whole: the replies that quoted it have their quotes back, as the withdrawal took them.
        IF v_rows > 0 THEN
          UPDATE public.lounge_messages r SET reply_to_content = coalesce(v_kept ->> 'content', v_snap ->> 'body')
           WHERE r.reply_to_id = v_id AND r.reply_to_content IS NULL;
        END IF;
      ELSIF v_type IN ('dispatch_post', 'dossier') AND v_kept IS NOT NULL THEN
        UPDATE public.dispatch_posts
           SET body = coalesce(v_kept ->> 'body', ''), full_content = v_kept ->> 'full_content', title = v_kept ->> 'title',
               subject_image = v_kept ->> 'subject_image', subject_backdrop = v_kept ->> 'subject_backdrop',
               source = v_kept ->> 'source', source_url = v_kept ->> 'source_url', spoiler_label = v_kept ->> 'spoiler_label',
               ended_at = NULL, ended_by = NULL
         WHERE id = v_id AND ended_by = 'house';
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      ELSIF v_type = 'profile' AND v_kept IS NOT NULL THEN
        UPDATE public.profiles
           SET bio = coalesce(bio, v_kept ->> 'bio'),
               display_name = coalesce(display_name, v_kept ->> 'display_name'),
               avatar_url = coalesce(avatar_url, v_kept ->> 'avatar_url'),
               social_links = CASE WHEN social_links IS NULL OR social_links = '{}'::jsonb THEN coalesce(v_kept -> 'social_links', '{}'::jsonb) ELSE social_links END
         WHERE id = v_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      ELSIF v_type = 'lounge' AND v_kept IS NOT NULL THEN
        UPDATE public.lounges
           SET name = CASE WHEN name = 'An Unnamed Salon' THEN coalesce(v_kept ->> 'name', name) ELSE name END,
               description = CASE WHEN coalesce(description, '') = '' THEN coalesce(v_kept ->> 'description', '') ELSE description END,
               cover_image = coalesce(cover_image, v_kept ->> 'cover_image')
         WHERE id = v_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      END IF;
      v_effect := CASE WHEN v_rows > 0 THEN 'What it removed stands again where it was.'
                       ELSE 'What it removed is kept for you with the verdict, to file again.' END;
    END IF;
    -- What the overturn did, kept on the verdict for the member's sheet: put back where it stood, or not.
    IF m.action = 'delete_content' THEN
      UPDATE public.mod_actions SET appeal_put_back = (v_rows > 0) WHERE id = p_action_id;
    END IF;
  ELSIF m.action = 'delete_content' THEN
    -- Upheld: a piece withheld for this hearing is deleted now, as REMOVE CONTENT deleted it before (H-B10).
    IF public.delete_withheld_piece(m.id) THEN
      v_effect := 'The piece it withheld is now deleted.';
    END IF;
  END IF;

  IF m.target_user_id IS NOT NULL THEN
    v_notice := CASE p_outcome
      WHEN 'upheld' THEN 'The Tribunal has heard your appeal and upholds the verdict.' || CASE WHEN v_effect <> '' THEN ' ' || v_effect ELSE '' END
      ELSE 'The Tribunal has heard your appeal and overturns the verdict: it is struck from your record. ' || v_effect
    END || ' The Tribunal''s word: ' || v_note;
    INSERT INTO public.notifications (user_id, type, title, body, message, metadata)
    VALUES (m.target_user_id, 'moderation', 'Your Appeal Was Heard', v_notice, v_notice,
            jsonb_build_object('action', 'appeal', 'outcome', p_outcome, 'mod_action_id', m.id));
  END IF;
END;
$_$;

-- ── the reason a sanction is lifted, cleaned ──
--   As production holds it (20261120_24), but the reason is cleaned before it is kept or told.
-- add-only (3): it only fixes: the reason a sanction is lifted is cleaned before it is kept and told, every answer as before; replayed as the members themselves (a_moderators_words_are_cleaned_as_a_members_are rehearsal)
CREATE OR REPLACE FUNCTION public.lift_sanction(p_user_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  -- The reason, cleaned as a member's words are (clean_member_text): kept on the verdict and told to
  -- the member in their notice.
  v_reason   text := btrim(coalesce(public.clean_member_text(p_reason), ''));
  v_banned   boolean;
  v_until    timestamptz;
  v_said     text;
  v_lifted   uuid;
  v_what     text;
  v_notice   text;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_reason) = 0 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'A reason of up to 500 characters is required.' USING ERRCODE = 'P0001';
  END IF;
  -- No admin lifts their own sanction: the house's one rule of who may judge a case (a_judge_is_refused).
  IF private.a_judge_is_refused(v_admin_id, NULL, p_user_id) IS NOT NULL THEN
    RAISE EXCEPTION '%', private.a_judge_is_refused(v_admin_id, NULL, p_user_id) USING ERRCODE = '42501';
  END IF;

  -- The member's standing, held while it is lifted: a verdict given at the same moment waits.
  SELECT coalesce(is_banned, false), suspended_until, suspension_reason INTO v_banned, v_until, v_said
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBER_GONE' USING ERRCODE = 'P0002';
  END IF;
  -- Exile is the house's last word: never lifted by hand, only overturned on its one appeal.
  IF EXISTS (SELECT 1 FROM public.mod_actions WHERE target_user_id = p_user_id AND action = 'permanent_exile' AND lifted_at IS NULL)
     OR (v_banned AND coalesce(v_said, '') LIKE 'PERMANENT EXILE:%') THEN
    RAISE EXCEPTION 'EXILE_STANDS' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_banned AND (v_until IS NULL OR v_until <= now()) THEN
    -- Lifted meanwhile by another admin, or a suspension run out: nothing stands to lift.
    RAISE EXCEPTION 'NOT_SANCTIONED' USING ERRCODE = 'P0002';
  END IF;

  -- The verdict told in the member's notice: the ban standing, else the suspension that governs.
  SELECT id INTO v_lifted FROM public.mod_actions
   WHERE target_user_id = p_user_id AND lifted_at IS NULL
     AND (action = 'ban' OR (action IN ('suspend', 'mute_user') AND expires_at > now()))
   ORDER BY (action = 'ban') DESC, expires_at DESC NULLS LAST, created_at DESC LIMIT 1;

  -- Only what holds now is lifted: a sentence already served stays served on the record, never "lifted".
  UPDATE public.mod_actions
     SET lifted_at = now(), lifted_by = v_admin_id, lift_reason = v_reason
   WHERE target_user_id = p_user_id AND lifted_at IS NULL
     AND (action = 'ban' OR (action IN ('suspend', 'mute_user') AND expires_at > now()));

  UPDATE public.profiles
     SET is_banned = false, banned_at = NULL, suspended_until = NULL, suspension_reason = NULL
   WHERE id = p_user_id;

  v_what := CASE WHEN v_banned THEN 'the closing of your membership' ELSE 'the pause on your membership' END;
  v_notice := 'The house has lifted ' || v_what || '. You may write again. Reason: ' || v_reason;
  INSERT INTO public.notifications (user_id, type, title, body, message, metadata)
  VALUES (p_user_id, 'moderation', 'A Notice from the House', v_notice, v_notice,
          jsonb_build_object('action', 'lift', 'reason', v_reason)
          || CASE WHEN v_lifted IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('mod_action_id', v_lifted) END);
END;
$$;

-- ── the moderators' words already written, cleaned once ──
--   Each verdict's appeal, its word and the lift's reason, and each notice that told a member the
--   Tribunal's word or a lift's reason: a notice is found by its member and the moment its words were
--   written (judge_appeal and lift_sanction write the verdict and the notice in one moment), by the
--   notices' (user_id, created_at) index. Nothing already clean is written. Kept, asked by the house
--   alone, so it can be run again; this car's undo drops it.
-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again; asked by the house alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.the_moderators_words_made_clean();
CREATE FUNCTION private.the_moderators_words_made_clean() RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_made  integer := 0;
  v_count integer;
BEGIN
  -- The notices of an appeal heard, written in the moment it was heard.
  UPDATE public.notifications n
     SET body = public.clean_member_text(n.body), message = public.clean_member_text(n.message)
    FROM public.mod_actions m
   WHERE m.appeal_judged_at IS NOT NULL
     AND n.user_id = m.target_user_id AND n.created_at = m.appeal_judged_at
     AND n.type = 'moderation' AND n.metadata ->> 'action' = 'appeal'
     AND (n.body, n.message) IS DISTINCT FROM (public.clean_member_text(n.body), public.clean_member_text(n.message));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_made := v_made + v_count;
  -- The notices of a sanction lifted, written in the moment it was lifted, the reason they carry with them.
  UPDATE public.notifications n
     SET body = public.clean_member_text(n.body), message = public.clean_member_text(n.message),
         metadata = CASE WHEN n.metadata ? 'reason'
                         THEN jsonb_set(n.metadata, '{reason}', to_jsonb(public.clean_member_text(n.metadata ->> 'reason')))
                         ELSE n.metadata END
    FROM public.mod_actions m
   WHERE m.lifted_at IS NOT NULL
     AND n.user_id = m.target_user_id AND n.created_at = m.lifted_at
     AND n.type = 'moderation' AND n.metadata ->> 'action' = 'lift'
     AND (n.body, n.message, n.metadata ->> 'reason')
         IS DISTINCT FROM (public.clean_member_text(n.body), public.clean_member_text(n.message), public.clean_member_text(n.metadata ->> 'reason'));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_made := v_made + v_count;
  -- The verdicts' appeals, the Tribunal's words and the lifts' reasons.
  UPDATE public.mod_actions
     SET appeal = public.clean_member_text(appeal), appeal_note = public.clean_member_text(appeal_note),
         lift_reason = public.clean_member_text(lift_reason)
   WHERE (appeal IS NOT NULL OR lift_reason IS NOT NULL)
     AND (appeal, appeal_note, lift_reason)
         IS DISTINCT FROM (public.clean_member_text(appeal), public.clean_member_text(appeal_note), public.clean_member_text(lift_reason));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_made + v_count;
END $$;
REVOKE ALL ON FUNCTION private.the_moderators_words_made_clean() FROM PUBLIC, anon, authenticated;

SELECT private.the_moderators_words_made_clean() AS made;

-- ── the verdict's cleaning trigger: its appeal, its word and the lift's reason too ──
--   Whoever writes them (the house's own functions are its only writers): each is cleaned as the
--   verdict's reason already is. Last, so its lock is held only to the commit.
-- add-only (3): it only fixes: a verdict's appeal, the Tribunal's word and a lift's reason are cleaned as its reason is, every verdict written as before; replayed as the members themselves (a_moderators_words_are_cleaned_as_a_members_are rehearsal)
CREATE OR REPLACE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF reason, appeal, appeal_note, lift_reason ON public.mod_actions FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('reason', 'appeal', 'appeal_note', 'lift_reason');
