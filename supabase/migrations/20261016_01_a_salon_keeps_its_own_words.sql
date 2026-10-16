-- ════════════════════════════════════════════════════════════════════════════
-- 20261016_01 — a salon keeps its own words, and a request its two members.
-- ════════════════════════════════════════════════════════════════════════════
-- Each section is one rule, kept by the database for every way a write can
-- reach it:
--   1. a reaction belongs to its message's salon;
--   2. a reply's quote is the house's copy of the message it answers, in the
--      same salon, and a withdrawn message is quoted by no one;
--   3. a message withdrawn or taken away is taken out of every quote of it;
--   4. a request to follow is seen by its two members alone;
--   5. a critique or a certification reaches only a log or stack its writer
--      may see;
--   6. the old Dispatch's tables are written by nothing.
-- A refusal is SQLSTATE 42501, the code the apps read as the house's answer.
-- Production held no row these rules refuse or change (salon_quotes_check.sql,
-- 2026-10-16), so no row is rewritten here.
-- Undo: mobile/supabase/migrations-down/20261016_01_a_salon_keeps_its_own_words.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── 1. A reaction belongs to its message's salon ────────────────────────────
-- The seat a reaction asks for is the seat in its message's salon: a reaction
-- naming one salon and a message of another is refused.
CREATE FUNCTION public.a_reaction_is_in_its_message_salon() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lounge_messages m
                  WHERE m.id = NEW.message_id AND m.lounge_id = NEW.lounge_id) THEN
    RAISE EXCEPTION 'A reaction belongs to its message''s salon.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- add-only (1): no shipped client uses it: a trigger's function, new here; TestFlight build 41 and the
--   website never call it.
REVOKE ALL ON FUNCTION public.a_reaction_is_in_its_message_salon() FROM PUBLIC, anon, authenticated;

-- add-only (3): it only fixes: TestFlight build 41 sends each reaction with its message's own salon
--   (stores/lounge.ts toggleReaction: msg.lounge_id), as the rehearsal replays; the website writes no reaction.
CREATE TRIGGER a_reaction_is_in_its_message_salon BEFORE INSERT OR UPDATE OF message_id, lounge_id
  ON public.lounge_message_reactions FOR EACH ROW EXECUTE FUNCTION public.a_reaction_is_in_its_message_salon();

-- ── 2. A reply quotes its message as the house keeps it ─────────────────────
-- The words and the name a reply shows are copied from the message it answers,
-- never taken from the sender: the message's words (none once it is withdrawn)
-- and its writer's handle ('[deleted]' once the writer has left, as
-- delete_user_account marks a departed writer's quotes). A reply to a message of
-- another salon, or to none the house keeps, is refused; a quote with no
-- message replied to is dropped.
CREATE FUNCTION public.a_reply_quotes_its_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  q public.lounge_messages%ROWTYPE;
BEGIN
  IF NEW.reply_to_id IS NULL THEN
    NEW.reply_to_content := NULL;
    NEW.reply_to_username := NULL;
    RETURN NEW;
  END IF;
  SELECT * INTO q FROM public.lounge_messages WHERE id = NEW.reply_to_id;
  IF NOT FOUND OR q.lounge_id IS DISTINCT FROM NEW.lounge_id THEN
    RAISE EXCEPTION 'A reply answers a message of its own salon.' USING ERRCODE = '42501';
  END IF;
  NEW.reply_to_content := CASE WHEN q.deleted_at IS NULL THEN q.content END;
  NEW.reply_to_username := CASE WHEN q.user_id IS NULL THEN '[deleted]'
                                ELSE (SELECT p.username FROM public.profiles p WHERE p.id = q.user_id) END;
  RETURN NEW;
END $$;

-- add-only (1): no shipped client uses it: a trigger's function, new here; TestFlight build 41 and the
--   website never call it.
REVOKE ALL ON FUNCTION public.a_reply_quotes_its_message() FROM PUBLIC, anon, authenticated;

-- Named to run after a_clean_member_text, so the copy is the cleaned words the message keeps.
-- add-only (3): it only fixes: TestFlight build 41 sends a reply's quote as the message's own words and
--   writer's handle (app/lounge/[id].tsx handleSend: replyTo.content, replyTo.username), the values this
--   copies, as the rehearsal replays; the website writes no reply.
CREATE TRIGGER a_reply_quotes_its_message BEFORE INSERT
  ON public.lounge_messages FOR EACH ROW EXECUTE FUNCTION public.a_reply_quotes_its_message();

-- ── 3. A withdrawn message leaves every quote of it ─────────────────────────
-- withdraw_lounge_message empties a message's words; a member may also delete
-- their own. Either way, each reply quoting it keeps its answer and its name,
-- and loses the words. The house's own update, so a_keeps_what_it_is lets it.
CREATE FUNCTION public.a_withdrawn_message_leaves_its_quotes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.deleted_at IS NOT NULL THEN
    UPDATE public.lounge_messages SET reply_to_content = NULL
     WHERE reply_to_id = OLD.id AND reply_to_content IS NOT NULL;
  END IF;
  RETURN NULL;
END $$;

-- add-only (1): no shipped client uses it: a trigger's function, new here; TestFlight build 41 and the
--   website never call it.
REVOKE ALL ON FUNCTION public.a_withdrawn_message_leaves_its_quotes() FROM PUBLIC, anon, authenticated;

-- add-only (3): it only fixes: TestFlight build 41 withdraws through withdraw_lounge_message and reads a
--   reply with no quote as a plain message (app/lounge/[id].tsx draws a quote only when it has words), as
--   the rehearsal replays; the website withdraws no message.
CREATE TRIGGER a_withdrawn_message_leaves_its_quotes AFTER UPDATE OF deleted_at OR DELETE
  ON public.lounge_messages FOR EACH ROW EXECUTE FUNCTION public.a_withdrawn_message_leaves_its_quotes();

-- ── 4. A request to follow is seen by its two members alone ─────────────────
-- A follow is seen when either end's file is open, as a follower list is; a
-- request is between the member who asked and the member asked.
-- add-only (3): it only fixes: TestFlight build 41 and the website read a request only as one of its two
--   members (FollowRequestService, socialSlice; the website's stores/auth.ts and NotificationBell), as the
--   rehearsal replays; every other row reads as before.
ALTER POLICY interactions_select_authorized ON public.interactions
  USING (((auth.uid() = user_id) OR (auth.uid() = target_user_id)
          OR ((type <> 'follow_request'::text)
              AND (public.can_view_user_data(user_id) OR public.can_view_user_data(target_user_id)))));

-- ── 5. A critique or certification reaches only what its writer may see ─────
-- audience_allows answers for a comment on a log or stack and a certification
-- of one: a private member's work is answered only by those who follow them,
-- as it is read. A private stack is its owner's alone, so no one else's
-- comment or certification reaches it.
-- add-only (3): it only fixes: a comment or certification of work its writer cannot read is refused, every
--   other one is answered as before (20261015_07's form, which this keeps whole), as the rehearsal replays;
--   TestFlight build 41 and the website comment on and certify only work they have shown.
CREATE OR REPLACE FUNCTION public.audience_allows(p_actor uuid, p_owner uuid, p_pref text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN p_owner IS NULL THEN TRUE
    WHEN auth.uid() = p_owner THEN TRUE
    WHEN public.a_block_stands_between(auth.uid(), p_owner) THEN FALSE
    WHEN NOT public.can_view_user_data(p_owner) THEN FALSE
    WHEN COALESCE(p_pref, 'everyone') = 'everyone' THEN TRUE
    WHEN COALESCE(p_pref, 'everyone') = 'nobody' THEN FALSE
    ELSE EXISTS (SELECT 1 FROM public.interactions
                 WHERE type = 'follow' AND user_id = auth.uid() AND target_user_id = p_owner)
  END;
$$;

-- add-only (3): it only fixes: a comment on another member's private stack is refused, every other one is
--   answered as before, as the rehearsal replays; TestFlight build 41 and the website show no one's private
--   stack but its owner's.
CREATE OR REPLACE FUNCTION public.can_annotate_list(p_actor uuid, p_list_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT NOT (COALESCE(l.is_private, false) AND l.user_id IS DISTINCT FROM auth.uid())
     AND public.audience_allows(p_actor, l.user_id,
           (SELECT preferences->>'privacy_annotations' FROM public.profiles WHERE id = l.user_id))
  FROM public.lists l WHERE l.id = p_list_id;
$$;

-- add-only (3): it only fixes: a certification of another member's private stack is refused, every other
--   one is answered as before, as the rehearsal replays; TestFlight build 41 and the website show no one's
--   private stack but its owner's.
CREATE OR REPLACE FUNCTION public.can_endorse_content(p_actor uuid, p_type text, p_log_id uuid, p_list_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_owner uuid; v_pref text; v_private boolean := false;
BEGIN
  IF p_type = 'endorse_log' THEN
    SELECT user_id INTO v_owner FROM public.logs WHERE id = p_log_id;
  ELSIF p_type = 'endorse_list' THEN
    SELECT user_id, COALESCE(is_private, false) INTO v_owner, v_private FROM public.lists WHERE id = p_list_id;
  ELSE
    RETURN TRUE;
  END IF;
  IF v_private AND v_owner IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;
  SELECT preferences->>'privacy_endorsements' INTO v_pref FROM public.profiles WHERE id = v_owner;
  RETURN public.audience_allows(p_actor, v_owner, v_pref);
END;
$$;

-- ── 6. The old Dispatch's tables are written by nothing ─────────────────────
-- An older build's essay, critique or certification reaches the Dispatch's own
-- tables through the views of the old names (dispatch_dossiers,
-- dossier_comments, dossier_certifications); the tables under those names
-- before the Dispatch are kept to be read, and no member writes them.
-- add-only (1): no shipped client uses it: TestFlight build 41 writes through the three views of the old
--   names, never these tables, and the website writes none of them.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.dispatch_dossiers_legacy, public.dossier_comments_legacy,
  public.dossier_certifications_legacy FROM anon, authenticated;
