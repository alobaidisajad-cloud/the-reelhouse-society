-- ════════════════════════════════════════════════════════════════════════════
-- 20261015_07 — a rule holds on every path to the row it guards.
-- ════════════════════════════════════════════════════════════════════════════
-- Each section below is one rule, kept by the database for every way a write
-- or a read can reach it (a client's own query, a policy, a house function):
--   1. a count is made only of the rows a rule names;
--   2. a block refuses a new comment, certification or follow, either way;
--   3. the session says who is asking: a gate reads auth.uid(), never a caller's word;
--   4. an analytics event is filed under its own member;
--   5. a member's error reports are kept to 200 a day, each dated as it arrives;
--   6. a certification made through toggle_dossier_certify keeps the rules a
--      direct one keeps: a member in good standing, an open post;
--   7. a report whose reporter has left is still resolved;
--   8. a salon's messages are read as the house's other words are read;
--   9. a member's stated choice of a private file is the one the house keeps,
--      and no profile keeps a list of follows in text that nothing maintains.
-- A refusal is SQLSTATE 42501, the code the apps read as the house's answer.
-- Undo: mobile/supabase/migrations-down/20261015_07_a_rule_holds_on_every_path.sql
-- (the data of section 9 is not put back: it is each member's own stated choice,
-- and lists no client reads).
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── 1. A count is made only of the rows a rule names ────────────────────────
-- rate_limit_check counts the caller's own rows of the last window, for the
-- policy that names the table: the logs' daily limit (logs_insert_rate_limit,
-- unchanged, 20000 a day). Any other table or column is refused.
-- add-only (1): no shipped client uses it: TestFlight build 41 and the website never call rate_limit_check;
--   its one caller, the logs policy, names the pair this keeps.
CREATE OR REPLACE FUNCTION public.rate_limit_check(table_name text, user_col text, max_count integer, window_minutes integer DEFAULT 1440) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    current_count INTEGER;
BEGIN
    IF table_name IS DISTINCT FROM 'logs' OR user_col IS DISTINCT FROM 'user_id' THEN
        RAISE EXCEPTION 'rate_limit_check counts only the rows a rule names' USING ERRCODE = '42501';
    END IF;
    EXECUTE format(
        'SELECT COUNT(*) FROM %I WHERE %I = auth.uid() AND created_at > now() - interval ''%s minutes''',
        table_name, user_col, window_minutes
    ) INTO current_count;
    RETURN current_count < max_count;
END;
$$;

-- ── 2. A block refuses a new comment, certification or follow, either way ───
-- A block is a user_blocks row of type 'block', and it stands both ways, as
-- hidden_authors and is_hidden_by read it. A mute is the muting member's alone:
-- it hides what they read and refuses nothing the muted member writes.
CREATE FUNCTION public.a_block_stands_between(p_one uuid, p_other uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks b
     WHERE b.type = 'block'
       AND ((b.blocker_id = p_one AND b.blocked_id = p_other)
         OR (b.blocker_id = p_other AND b.blocked_id = p_one))
  );
$$;

-- add-only (1): no shipped client uses it: new here, run only by the house's own functions; TestFlight
--   build 41 and the website never call it.
REVOKE ALL ON FUNCTION public.a_block_stands_between(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- audience_allows answers for comments on logs and lists (can_annotate_log,
-- can_annotate_list) and certifications of them (can_endorse_content). The one
-- asking is the session's member (section 3); p_actor is not read.
-- add-only (3): it only fixes: a comment or certification across a block is refused, every other one is
--   answered as before, as the rehearsal replays (a member comments and certifies where allowed).
CREATE OR REPLACE FUNCTION public.audience_allows(p_actor uuid, p_owner uuid, p_pref text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN p_owner IS NULL THEN TRUE
    WHEN auth.uid() = p_owner THEN TRUE
    WHEN public.a_block_stands_between(auth.uid(), p_owner) THEN FALSE
    WHEN COALESCE(p_pref, 'everyone') = 'everyone' THEN TRUE
    WHEN COALESCE(p_pref, 'everyone') = 'nobody' THEN FALSE
    ELSE EXISTS (SELECT 1 FROM public.interactions
                 WHERE type = 'follow' AND user_id = auth.uid() AND target_user_id = p_owner)
  END;
$$;

-- A follow or a request to follow is refused across a block; a follow of a
-- private member becomes a request, as before.
-- add-only (3): it only fixes: a follow across a block is refused, every other follow is made as before,
--   as the rehearsal replays (a member follows another).
CREATE OR REPLACE FUNCTION public.enforce_privacy_on_follow() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_is_private BOOLEAN;
BEGIN
    IF NEW.type IN ('follow', 'follow_request')
       AND public.a_block_stands_between(NEW.user_id, NEW.target_user_id) THEN
        RAISE EXCEPTION 'A block stands between these members.' USING ERRCODE = '42501';
    END IF;
    IF NEW.type = 'follow' THEN
        SELECT is_social_private INTO v_is_private FROM public.profiles WHERE id = NEW.target_user_id;
        IF v_is_private THEN
            -- Automatically downgrade the 'follow' to a 'follow_request' at the database level.
            NEW.type := 'follow_request';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- The Dispatch: a critique is refused across a block with its post's author,
-- and a certification with the author of the post or critique it certifies,
-- on every path (a direct write, toggle_dossier_certify, the old dossier views).
-- SECURITY DEFINER so the author is read whatever the writer may see.
CREATE FUNCTION public.dispatch_refuses_across_a_block() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_row    jsonb := to_jsonb(NEW);
  v_author uuid;
BEGIN
  IF v_row ->> 'comment_id' IS NOT NULL THEN
    SELECT user_id INTO v_author FROM public.dispatch_comments WHERE id = (v_row ->> 'comment_id')::uuid;
  ELSE
    SELECT user_id INTO v_author FROM public.dispatch_posts WHERE id = (v_row ->> 'post_id')::uuid;
  END IF;
  IF public.a_block_stands_between(NEW.user_id, v_author) THEN
    RAISE EXCEPTION 'A block stands between these members.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- add-only (1): no shipped client uses it: a trigger's function, new here; TestFlight build 41 and the
--   website never call it.
REVOKE ALL ON FUNCTION public.dispatch_refuses_across_a_block() FROM PUBLIC, anon, authenticated;

-- add-only (3): it only fixes: a critique across a block is refused, every other critique is written as
--   before, as the rehearsal replays (a member critiques an open post).
CREATE TRIGGER refuse_across_a_block BEFORE INSERT ON public.dispatch_comments
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_refuses_across_a_block();

-- add-only (3): it only fixes: a certification across a block is refused, every other certification is
--   written as before, as the rehearsal replays (a member certifies a post, directly and by the function).
CREATE TRIGGER refuse_across_a_block BEFORE INSERT ON public.dispatch_certifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_refuses_across_a_block();

-- ── 3. The session says who is asking ────────────────────────────────────────
-- The three gates are run by the members' policies on log_comments,
-- list_comments and interactions (all TO authenticated); with section 2 they
-- answer for the session's member alone. Visitors run none of them.
-- add-only (1): no shipped client uses them: TestFlight build 41 and the website never call the three;
--   the policies that run them apply to members alone.
REVOKE EXECUTE ON FUNCTION
    public.can_annotate_log(p_actor uuid, p_log_id uuid),
    public.can_annotate_list(p_actor uuid, p_list_id uuid),
    public.can_endorse_content(p_actor uuid, p_type text, p_log_id uuid, p_list_id uuid)
  FROM anon;

-- ── 4. An analytics event is filed under its own member ─────────────────────
-- add-only (3): it only fixes: the website files each event under its signed-in member's own id
--   (src/hooks/useAnalytics.ts), as the rehearsal replays; TestFlight build 41 writes no analytics event.
ALTER POLICY "Users can insert analytics events" ON public.analytics_events
  WITH CHECK ((auth.role() = 'authenticated'::text) AND (user_id = auth.uid()));

-- ── 5. A member's error reports are kept to 200 a day ───────────────────────
-- Each report is dated when it arrives, and a member's 201st of a day is
-- refused with the words of the house's other limits. The house's own roles
-- are not counted.
CREATE FUNCTION public.error_logs_daily_ceiling() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  NEW.created_at := now();
  IF (SELECT count(*) FROM public.error_logs
       WHERE user_id = NEW.user_id AND created_at > now() - interval '1 day') >= 200 THEN
    RAISE EXCEPTION 'PGRST301: Too many requests. Please wait a moment.';
  END IF;
  RETURN NEW;
END $$;

-- add-only (1): no shipped client uses it: a trigger's function, new here; TestFlight build 41 and the
--   website never call it.
REVOKE ALL ON FUNCTION public.error_logs_daily_ceiling() FROM PUBLIC, anon, authenticated;

-- The count reads one member's reports of the last day, at any number of members.
CREATE INDEX error_logs_member_day ON public.error_logs USING btree (user_id, created_at);

-- add-only (3): it only fixes: the website's error report (src/errorLogger.ts, one per distinct error in five
--   seconds, created_at left to the house) is written as before, as the rehearsal replays; TestFlight
--   build 41 writes none.
CREATE TRIGGER daily_ceiling BEFORE INSERT ON public.error_logs
  FOR EACH ROW EXECUTE FUNCTION public.error_logs_daily_ceiling();

-- ── 6. toggle_dossier_certify keeps the rules a direct certification keeps ──
-- A member who is silenced or suspended changes no certification (the words
-- enforce_not_restricted says), and only an open post is certified (the answer
-- certs_open_post gives a direct write). A block is section 2's trigger.
-- add-only (3): it only fixes: a member in good standing certifies and withdraws on an open post as before,
--   as the rehearsal replays; TestFlight build 41 calls it only from a queued legacy toggle.
CREATE OR REPLACE FUNCTION public.toggle_dossier_certify(dossier_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
    DECLARE
      already  boolean;
      v_banned boolean;
      v_until  timestamptz;
    BEGIN
      SELECT is_banned, suspended_until INTO v_banned, v_until
        FROM public.profiles WHERE id = auth.uid();
      IF COALESCE(v_banned, false) THEN
        RAISE EXCEPTION 'Your account has been silenced by The Society.'
          USING ERRCODE = '42501';
      END IF;
      IF v_until IS NOT NULL AND v_until > now() THEN
        RAISE EXCEPTION 'Your account is suspended until %.',
          to_char(v_until AT TIME ZONE 'UTC', 'DD Mon YYYY HH24:MI "UTC"')
          USING ERRCODE = '42501';
      END IF;

      SELECT EXISTS(SELECT 1 FROM public.dispatch_certifications
                     WHERE user_id = auth.uid() AND post_id = dossier_uuid) INTO already;
      IF already THEN
        DELETE FROM public.dispatch_certifications
         WHERE user_id = auth.uid() AND post_id = dossier_uuid;
        RETURN FALSE;
      ELSE
        IF NOT EXISTS (SELECT 1 FROM public.dispatch_posts p
                        WHERE p.id = dossier_uuid AND p.ended_at IS NULL AND p.withheld_at IS NULL) THEN
          RAISE EXCEPTION 'new row violates row-level security policy for table "dispatch_certifications"'
            USING ERRCODE = '42501';
        END IF;
        INSERT INTO public.dispatch_certifications (user_id, post_id)
        VALUES (auth.uid(), dossier_uuid);
        RETURN TRUE;
      END IF;
    END $$;

-- ── 7. A report whose reporter has left is still resolved ───────────────────
-- The reporter is thanked when there is one; the member reported is told as
-- before. Every other step is unchanged.
-- add-only (3): it only fixes: an admin's resolution of a report with its reporter is made and told as
--   before, as the rehearsal replays; TestFlight build 41 and the website call it as admins alone.
CREATE OR REPLACE FUNCTION public.resolve_moderation_report_v2(p_report_id uuid, p_action text, p_admin_id uuid, p_reason text, p_duration_hours integer DEFAULT NULL::integer, p_notify_user boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id       uuid := auth.uid();
  v_target_user_id uuid;
  v_reporter_id    uuid;
  v_content_id     uuid;
  v_content_type   text;
  v_expires_at     timestamptz;
  v_notice         text;
  v_snapshot       jsonb;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT target_user_id, reporter_id, content_id, content_type
  INTO v_target_user_id, v_reporter_id, v_content_id, v_content_type
  FROM reports
  WHERE id = p_report_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or already resolved';
  END IF;

  IF v_target_user_id IS NULL AND p_action NOT IN ('dismiss', 'delete_content') THEN
    RAISE EXCEPTION 'That member has deleted their account. Only dismiss or delete_content remain.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_action IN ('suspend', 'mute_user') AND (p_duration_hours IS NULL OR p_duration_hours <= 0) THEN
    RAISE EXCEPTION 'A duration in hours is required for %', p_action USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'delete_content' AND v_content_type = 'profile' THEN
    RAISE EXCEPTION 'A profile is not content. Use ban or permanent_exile.' USING ERRCODE = 'P0001';
  END IF;

  IF p_duration_hours IS NOT NULL THEN
    v_expires_at := now() + (p_duration_hours || ' hours')::interval;
  END IF;

  IF p_action = 'delete_content' THEN
    v_snapshot := public.get_report_evidence(p_report_id);
  END IF;

  UPDATE reports
  SET status = 'resolved',
      resolved_at = now(),
      resolved_by = v_admin_id,
      resolution_action = p_action
  WHERE id = p_report_id;

  CASE p_action
    WHEN 'warn' THEN
      INSERT INTO warnings (user_id, admin_id, reason)
      VALUES (v_target_user_id, v_admin_id, p_reason);
      UPDATE profiles SET warning_count = warning_count + 1
      WHERE id = v_target_user_id;

    WHEN 'suspend' THEN
      UPDATE profiles
      SET suspended_until = v_expires_at, suspension_reason = p_reason
      WHERE id = v_target_user_id;

    WHEN 'ban' THEN
      UPDATE profiles
      SET is_banned = true, banned_at = now(), suspension_reason = p_reason
      WHERE id = v_target_user_id;

    WHEN 'permanent_exile' THEN
      UPDATE profiles
      SET is_banned = true, banned_at = now(), suspension_reason = 'PERMANENT EXILE: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'mute_user' THEN
      UPDATE profiles
      SET suspended_until = v_expires_at, suspension_reason = 'Muted: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'delete_content' THEN
      CASE v_content_type
        WHEN 'log'             THEN DELETE FROM logs              WHERE id = v_content_id;
        WHEN 'list'            THEN DELETE FROM lists             WHERE id = v_content_id;
        WHEN 'log_comment'     THEN DELETE FROM log_comments      WHERE id = v_content_id;
        WHEN 'list_comment'    THEN DELETE FROM list_comments     WHERE id = v_content_id;
        WHEN 'dossier'         THEN DELETE FROM dispatch_dossiers WHERE id = v_content_id;
        WHEN 'dossier_comment' THEN DELETE FROM dossier_comments  WHERE id = v_content_id;
        WHEN 'dispatch_post'    THEN DELETE FROM dispatch_posts    WHERE id = v_content_id;
        WHEN 'dispatch_comment' THEN DELETE FROM dispatch_comments WHERE id = v_content_id;
        WHEN 'lounge_message' THEN
          UPDATE lounge_messages
             SET content = '', deleted_at = now()
           WHERE id = v_content_id;
        ELSE
          RAISE EXCEPTION 'Cannot remove content of type %', COALESCE(v_content_type, 'unknown')
            USING ERRCODE = 'P0001';
      END CASE;

    WHEN 'dismiss' THEN
      NULL;

    ELSE
      RAISE EXCEPTION 'Unknown moderation action: %', p_action USING ERRCODE = 'P0001';
  END CASE;

  INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason,
                           duration_hours, expires_at, content_snapshot)
  VALUES (p_report_id, v_target_user_id, v_admin_id, p_action, p_reason,
          p_duration_hours, v_expires_at, v_snapshot);

  IF p_notify_user THEN
    IF v_reporter_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, message, metadata)
      VALUES (
        v_reporter_id,
        'moderation',
        'Your Report Was Reviewed',
        'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
        'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
        jsonb_build_object('report_id', p_report_id, 'action', p_action)
      );
    END IF;

    IF p_action != 'dismiss' AND v_target_user_id IS NOT NULL THEN
      v_notice := CASE p_action
        WHEN 'warn' THEN 'After reviewing a report, the house has issued a formal warning.'
        WHEN 'suspend' THEN 'After reviewing a report, the house has paused your membership for ' || COALESCE(p_duration_hours::text, 'a number of') || ' hours.'
        WHEN 'mute_user' THEN 'After reviewing a report, the house has muted your account for a time.'
        WHEN 'ban' THEN 'After reviewing a report, the house has closed your membership until further notice.'
        WHEN 'permanent_exile' THEN 'After reviewing a report, the house has permanently closed your membership.'
        WHEN 'delete_content' THEN 'After reviewing a report, the house has removed a piece of your content.'
        ELSE 'The house has reviewed a report concerning your account.'
      END || ' Reason: ' || p_reason;

      INSERT INTO notifications (user_id, type, title, body, message, metadata)
      VALUES (
        v_target_user_id,
        'moderation',
        'A Notice from the House',
        v_notice,
        v_notice,
        jsonb_build_object('action', p_action, 'reason', p_reason, 'expires_at', v_expires_at)
      );
    END IF;
  END IF;
END;
$$;

-- ── 8. A salon's messages are read as the house's other words are read ──────
-- Not from the members the reader blocked or muted, nor from those who blocked
-- the reader: the rule of log_comments_hide_blocked and critiques_block.
-- add-only (3): it only fixes: TestFlight build 41 already drops these messages itself (stores/lounge.ts, on
--   fetch, page and realtime) and every other message reads as before, as the rehearsal replays with the
--   clients' own read (a salon's newest fifty).
CREATE POLICY lounge_messages_hide_blocked ON public.lounge_messages AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((NOT COALESCE((user_id = ANY (( SELECT public.hidden_authors() AS hidden_authors)::uuid[])), false)));

-- ── 9. A member's stated choice of a private file is the one the house keeps ─
-- An older website saved the choice in preferences alone; is_social_private is
-- what the house enforces, and the apps write both together. Each member whose
-- preference says private is made private; nothing else of theirs changes.
UPDATE public.profiles
   SET is_social_private = true
 WHERE preferences ->> 'social_visibility' = 'private'
   AND is_social_private IS NOT TRUE;

-- Follows are the interactions table's; the following and followers columns
-- are an older copy in text that nothing keeps or reads. They are emptied.
UPDATE public.profiles
   SET following = '{}'::text[], followers = '{}'::text[]
 WHERE cardinality(following) > 0 OR cardinality(followers) > 0;
