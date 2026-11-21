-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_27 — a member judged by the house reads its whole reason, appeals it once, and is told the outcome.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A member warned, suspended or banned could not read the reason, and had no appeal: get_my_verdict,
--      file_appeal (one per verdict), get_pending_appeals and judge_appeal (never by the moderator who
--      ruled), and tribunal_waiting (review round 14).
--   2. A verdict overturned is struck: its standing read again from the verdicts still standing, a
--      removal put back where its row still stands, and the enforcement record says so (review round 14).
--   Functions, and the rules of 20261120_21 proved over the verdicts (VALIDATE: mod_actions read and
--   written on meanwhile). The waiting appeals' index is 20261120_28.
-- Undo: mobile/supabase/migrations-down/20261120_27_a_verdict_is_read_whole_and_appealed_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B6 · a member judged by the house reads its whole reason, appeals it once, and is told the outcome (review round 14) ──
--   A member warned, suspended or banned could not read the house's reason in the app: the notice row
--   is cut at three lines, its reason (up to 500 characters) after an 85-character preamble, and it
--   opened nothing. No screen showed the reason, there was no appeal, and no record view.
--   The owner decided (2026-11-19): a member may appeal each verdict ONCE from inside the app; they read
--   the house's full reason, write one appeal, it goes to the Tribunal and is judged by a moderator other
--   than the one who ruled, and the member is told the outcome. Now (with H-B6.locks' columns and H-B2's
--   notices, each naming its verdict):
--   1. get_my_verdict: the member reads one verdict of their own whole: what the house did, its reason,
--      its length, what it removed (their own words, kept), whether it was lifted, and their appeal;
--   2. file_appeal: the member's one appeal of that verdict, in their own words (up to 1,000 characters),
--      cleaned as every member's words are; a second is refused (ALREADY_APPEALED);
--   3. get_pending_appeals: the Tribunal's APPEALS, oldest first, each with the verdict, the case, what
--      was removed, the member's standing, and whether the moderator reading it is the one who ruled;
--   4. judge_appeal (a salon message put back whole, the quotes of it in replies with it): a moderator other
--      than the one who ruled (OWN_VERDICT, refused at the house), and never
--      the member the verdict is about (OWN_CASE; both by H-B2's one rule, a_judge_is_refused), upholds
--      or overturns it with a word for the member; a second hearing is refused (ALREADY_JUDGED).
--      Overturned, the verdict is struck: lifted (its ban or suspension no longer holds the member, read
--      again from the verdicts still standing, standing_from_verdicts), a warning withdrawn, a removal put
--      back where its row still stands (a salon message, a filing, a page's words, a salon's name); a
--      piece the removal deleted cannot come back with the critiques and marks that went with it, and its
--      words are kept for the member in this verdict (get_my_verdict), to file again;
--   5. the member is told the outcome in a notice that names the verdict, and opens it;
--   6. tribunal_waiting: the Tribunal door's count, the cases and the appeals this moderator may hear;
--   7. the enforcement record (get_moderation_history_for_users) says which verdicts were lifted or
--      overturned, so a verdict struck never reads as a strike.
--   The rules H-B6.locks laid NOT VALID are proved over every verdict here (no table held as they are).

-- add-only (3): it only fixes: rules H-B6.locks made, proved over the verdicts already written without holding the table; TestFlight build 41 and the website never write mod_actions, replayed as the members themselves (H-B6 rehearsal)
ALTER TABLE public.mod_actions VALIDATE CONSTRAINT mod_actions_appeal_len;
-- add-only (3): it only fixes: a rule H-B6.locks made, proved over the verdicts already written without holding the table; TestFlight build 41 and the website never write mod_actions, replayed as the members themselves (H-B6 rehearsal)
ALTER TABLE public.mod_actions VALIDATE CONSTRAINT mod_actions_appeal_note_len;
-- add-only (3): it only fixes: a rule H-B6.locks made, proved over the verdicts already written without holding the table; TestFlight build 41 and the website never write mod_actions, replayed as the members themselves (H-B6 rehearsal)
ALTER TABLE public.mod_actions VALIDATE CONSTRAINT mod_actions_lift_reason_len;
-- add-only (3): it only fixes: a rule H-B6.locks made, proved over the verdicts already written without holding the table; TestFlight build 41 and the website never write mod_actions, replayed as the members themselves (H-B6 rehearsal)
ALTER TABLE public.mod_actions VALIDATE CONSTRAINT mod_actions_appeal_status_check;
-- add-only (3): it only fixes: a rule H-B6.locks made, proved over the verdicts already written without holding the table; TestFlight build 41 and the website never write mod_actions, replayed as the members themselves (H-B6 rehearsal)
ALTER TABLE public.mod_actions VALIDATE CONSTRAINT mod_actions_appeal_whole;
-- add-only (3): it only fixes: a rule H-B6.locks made, proved over the verdicts already written without holding the table; TestFlight build 41 and the website never write mod_actions, replayed as the members themselves (H-B6 rehearsal)
ALTER TABLE public.mod_actions VALIDATE CONSTRAINT mod_actions_content_snapshot_len;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.get_my_verdict(uuid);
CREATE FUNCTION public.get_my_verdict(p_action_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me uuid := auth.uid();
  m    public.mod_actions%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  -- One's own verdicts alone; a dismissal of a report about one is no verdict on one.
  SELECT * INTO m FROM public.mod_actions
   WHERE id = p_action_id AND target_user_id = v_me AND action <> 'dismiss';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERDICT_GONE' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', m.id,
    'action', m.action,
    'reason', m.reason,
    'created_at', m.created_at,
    'duration_hours', m.duration_hours,
    'expires_at', m.expires_at,
    -- What a removal took: the member's own words, kept with the verdict.
    'removed', CASE WHEN m.action = 'delete_content' AND m.content_snapshot IS NOT NULL
                    THEN jsonb_strip_nulls(jsonb_build_object('title', m.content_snapshot ->> 'title', 'body', m.content_snapshot ->> 'body')) END,
    -- Whether an overturned removal puts the piece back where it stood, or only hands back its words.
    'restorable', m.content_snapshot ? 'kept',
    'lifted_at', m.lifted_at,
    'lift_reason', m.lift_reason,
    'appeal', CASE WHEN m.appeal IS NULL THEN NULL ELSE jsonb_build_object(
                'text', m.appeal, 'filed_at', m.appeal_filed_at, 'status', m.appeal_status,
                'judged_at', m.appeal_judged_at, 'note', m.appeal_note) END,
    'can_appeal', m.appeal IS NULL,
    -- An appeal no moderator may hear yet (the house's one moderator ruled it, or it is about them): it
    -- waits for another, and the member is told so (the owner's decision, 2026-11-19).
    'no_moderator_yet', m.appeal_status = 'pending' AND NOT private.an_appeal_may_be_heard(m.admin_id, m.target_user_id));
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by the app's verdict sheet alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.get_my_verdict(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_verdict(uuid) TO authenticated, service_role;

-- The member's own record of verdicts, newest first, a page at a time: a verdict is reached from here
-- (Settings, and the banner of a pause or a silence), never only from its notice, which a member may
-- dismiss. Each opens whole (get_my_verdict). Asked of the record's own index (idx_mod_actions_target).
-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.get_my_verdicts(timestamp with time zone, uuid, integer);
CREATE FUNCTION public.get_my_verdicts(p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  -- One's own verdicts alone; a dismissal of a report about one is no verdict on one.
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', m.id,
             'action', m.action,
             'reason', m.reason,
             'created_at', m.created_at,
             'duration_hours', m.duration_hours,
             'expires_at', m.expires_at,
             'lifted_at', m.lifted_at,
             'appeal_status', m.appeal_status,
             'content_type', (SELECT r.content_type FROM public.reports r WHERE r.id = m.report_id))
           ORDER BY m.created_at DESC, m.id DESC)
      FROM (
        SELECT * FROM public.mod_actions q
         WHERE q.target_user_id = v_me AND q.action <> 'dismiss'
           AND (p_cursor_at IS NULL OR (q.created_at, q.id) < (p_cursor_at, p_cursor_id))
         ORDER BY q.created_at DESC, q.id DESC
         LIMIT LEAST(GREATEST(coalesce(p_limit, 30), 1), 50)
      ) m
  ), '[]'::jsonb);
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by the app's record of verdicts alone, each member of their own (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.get_my_verdicts(timestamp with time zone, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_verdicts(timestamp with time zone, uuid, integer) TO authenticated, service_role;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.file_appeal(uuid, text);
CREATE FUNCTION public.file_appeal(p_action_id uuid, p_appeal text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_words text := btrim(coalesce(public.clean_member_text(p_appeal), ''));
  m       public.mod_actions%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_words) = 0 OR char_length(v_words) > 1000 THEN
    RAISE EXCEPTION 'An appeal is between 1 and 1,000 characters.' USING ERRCODE = 'P0001';
  END IF;
  -- Held while it is written: two presses at once file one appeal, the second refused.
  -- A member silenced or suspended may still appeal: the appeal is how they answer it.
  SELECT * INTO m FROM public.mod_actions
   WHERE id = p_action_id AND target_user_id = v_me AND action <> 'dismiss'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERDICT_GONE' USING ERRCODE = 'P0002';
  END IF;
  IF m.appeal IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_APPEALED' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.mod_actions
     SET appeal = v_words, appeal_filed_at = now(), appeal_status = 'pending'
   WHERE id = p_action_id;
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by the app's verdict sheet alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.file_appeal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.file_appeal(uuid, text) TO authenticated, service_role;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.get_pending_appeals(timestamp with time zone, uuid, integer);
CREATE FUNCTION public.get_pending_appeals(p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  -- Oldest first, as a court hears them: a page at a time, keyset on the moment filed and the verdict.
  -- Asked of the partial index mod_actions_appeals_waiting (H-B6.index), never every verdict.
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', m.id,
             'action', m.action,
             'reason', m.reason,
             'created_at', m.created_at,
             'duration_hours', m.duration_hours,
             'expires_at', m.expires_at,
             'lifted_at', m.lifted_at,
             'appeal', m.appeal,
             'appeal_filed_at', m.appeal_filed_at,
             -- The one who ruled may not hear it: the screen says so, and the house refuses it.
             'ruled_by_you', m.admin_id IS NOT DISTINCT FROM v_admin_id,
             -- Why this moderator may not hear it (the one who ruled, or the member it is about), or none.
             'refused', private.a_judge_is_refused(v_admin_id, m.admin_id, m.target_user_id),
             -- No moderator of the house may hear it yet: it waits for another to be appointed.
             'no_moderator_yet', NOT private.an_appeal_may_be_heard(m.admin_id, m.target_user_id),
             'ruled_by', (SELECT a.username FROM public.profiles a WHERE a.id = m.admin_id),
             'member', jsonb_build_object('id', t.id, 'username', t.username, 'avatar_url', t.avatar_url,
                         'is_banned', coalesce(t.is_banned, false),
                         'exiled', coalesce(t.is_banned, false) AND coalesce(t.suspension_reason, '') LIKE 'PERMANENT EXILE:%',
                         'suspended_until', CASE WHEN t.suspended_until > now() THEN t.suspended_until END),
             'case', (SELECT jsonb_build_object('content_type', r.content_type, 'reason', r.reason, 'details', r.details)
                        FROM public.reports r WHERE r.id = m.report_id),
             'removed', CASE WHEN m.action = 'delete_content' AND m.content_snapshot IS NOT NULL
                             THEN jsonb_strip_nulls(jsonb_build_object('title', m.content_snapshot ->> 'title', 'body', m.content_snapshot ->> 'body')) END,
             'restorable', m.content_snapshot ? 'kept')
           ORDER BY m.appeal_filed_at, m.id)
      FROM (
        SELECT * FROM public.mod_actions q
         WHERE q.appeal_status = 'pending'
           AND (p_cursor_at IS NULL OR (q.appeal_filed_at, q.id) > (p_cursor_at, p_cursor_id))
         ORDER BY q.appeal_filed_at, q.id
         LIMIT LEAST(GREATEST(coalesce(p_limit, 20), 1), 50)
      ) m
      LEFT JOIN public.profiles t ON t.id = m.target_user_id
  ), '[]'::jsonb);
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by the app's Tribunal alone, admins only (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.get_pending_appeals(timestamp with time zone, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_appeals(timestamp with time zone, uuid, integer) TO authenticated, service_role;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.judge_appeal(uuid, text, text);
CREATE FUNCTION public.judge_appeal(p_action_id uuid, p_outcome text, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_note     text := btrim(coalesce(p_note, ''));
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
  END IF;

  IF m.target_user_id IS NOT NULL THEN
    v_notice := CASE p_outcome
      WHEN 'upheld' THEN 'The Tribunal has heard your appeal and upholds the verdict.'
      ELSE 'The Tribunal has heard your appeal and overturns the verdict: it is struck from your record. ' || v_effect
    END || ' The Tribunal''s word: ' || v_note;
    INSERT INTO public.notifications (user_id, type, title, body, message, metadata)
    VALUES (m.target_user_id, 'moderation', 'Your Appeal Was Heard', v_notice, v_notice,
            jsonb_build_object('action', 'appeal', 'outcome', p_outcome, 'mod_action_id', m.id));
  END IF;
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by the app's Tribunal alone, admins only (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.judge_appeal(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.judge_appeal(uuid, text, text) TO authenticated, service_role;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.tribunal_waiting();
CREATE FUNCTION public.tribunal_waiting() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;
  -- The cases pending, and the appeals this moderator may hear (never those of their own verdicts, nor of
  -- verdicts about themselves: a_judge_is_refused).
  RETURN jsonb_build_object(
    'cases', (SELECT count(*) FROM public.reports WHERE status = 'pending'),
    'appeals', (SELECT count(*) FROM public.mod_actions
                 WHERE appeal_status = 'pending' AND private.a_judge_is_refused(v_admin_id, admin_id, target_user_id) IS NULL));
END;
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by the app's Settings door alone, admins only (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.tribunal_waiting() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tribunal_waiting() TO authenticated, service_role;

-- As the live schema has it, each verdict saying whether it was lifted and how its appeal went: a
-- verdict struck never reads as a strike.
-- add-only (3): it only fixes: the record reads every verdict it read, in its order, with two columns more; TestFlight build 41 and the website read its columns by name, replayed as the moderator (H-B6 rehearsal)
DROP FUNCTION IF EXISTS public.get_moderation_history_for_users(uuid[], integer);
CREATE FUNCTION public.get_moderation_history_for_users(p_user_ids uuid[], p_per_user integer DEFAULT 5) RETURNS TABLE(id uuid, report_id uuid, target_user_id uuid, admin_id uuid, action text, reason text, duration_hours integer, expires_at timestamp with time zone, created_at timestamp with time zone, lifted_at timestamp with time zone, appeal_status text)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT r.id, r.report_id, r.target_user_id, r.admin_id, r.action, r.reason,
         r.duration_hours, r.expires_at, r.created_at, r.lifted_at, r.appeal_status
  FROM (
    SELECT m.*,
           ROW_NUMBER() OVER (PARTITION BY m.target_user_id ORDER BY m.created_at DESC, m.id DESC) AS rn
    FROM public.mod_actions m
    WHERE m.target_user_id = ANY(COALESCE(p_user_ids, ARRAY[]::uuid[]))
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
      )
  ) r
  WHERE r.rn <= LEAST(GREATEST(COALESCE(p_per_user, 5), 0), 20)
  ORDER BY r.target_user_id, r.created_at DESC, r.id DESC;
$$;
-- add-only (3): it only fixes: the grants the live schema gives it, stated again over its new definition (a visitor, given it by the default privileges of a function made anew, is refused it as before); replayed as the moderator (H-B6 rehearsal)
REVOKE ALL ON FUNCTION public.get_moderation_history_for_users(uuid[], integer) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.get_moderation_history_for_users(uuid[], integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_moderation_history_for_users(uuid[], integer) TO service_role;
