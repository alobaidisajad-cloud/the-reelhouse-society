-- ════════════════════════════════════════════════════════════════════════════
-- 20261003_07 — the house keeps its own record
-- ════════════════════════════════════════════════════════════════════════════
-- Five records the house kept where the member could change them, or not at all:
--
-- 1. A host's ban or mute lived only on the member's own seat (lounge_members),
--    and a member may delete their own seat to leave. A banned member stepped
--    out and joined again as approved; a muted one stepped out and came back
--    with their voice. Now the sanction is the host's record (lounge_sanctions,
--    which no member can read or write): leaving still works, a ban still
--    refuses the door, a muted member comes back muted, and only the host lifts
--    either (set_lounge_member_status to 'approved').
--
-- 2. A private screening room is an Auteur's to found, but the rank was asked
--    only when a room was made: an Archivist made a public salon and turned it
--    private in its settings. The same rank is now asked when a room turns
--    private. Rooms already private are left as they are.
--
-- 3. A report took the reported member from the caller, and the website sent
--    none for a stack: the Tribunal could only dismiss it. The member is now
--    read from the reported item itself, whatever the caller sends.
--
-- 4. Members held INSERT and DELETE on profiles, and a rule letting a member
--    insert their own. No client does either: a profile is made at sign-up by
--    handle_new_user, and an account is closed by its own function. A door no
--    one uses is a door left open. Gone.
--
-- 5. A silenced or suspended member's new name (or a host's new salon name) was
--    put back without a word while the write answered success, so the app said
--    "updated". It is now refused aloud, in the house's own sentence.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · A host's sanction outlasts the door ────────────────────────────────
CREATE TABLE public.lounge_sanctions (
    lounge_id uuid NOT NULL REFERENCES public.lounges(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('muted', 'banned')),
    set_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (lounge_id, user_id)
);
COMMENT ON TABLE public.lounge_sanctions IS 'A host''s ban or mute, kept apart from the member''s seat so leaving cannot lift it. Written only by set_lounge_member_status; read only by the house''s own functions.';
ALTER TABLE public.lounge_sanctions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lounge_sanctions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.lounge_sanctions TO service_role;

-- The sanctions already given.
INSERT INTO public.lounge_sanctions (lounge_id, user_id, status)
SELECT lounge_id, user_id, status FROM public.lounge_members WHERE status IN ('muted', 'banned')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_lounge_member_status(p_lounge_id uuid, p_user_id uuid, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_creator uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT creator_id INTO v_creator FROM public.lounges WHERE id = p_lounge_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Lounge not found'; END IF;
  IF auth.uid() IS DISTINCT FROM v_creator THEN RAISE EXCEPTION 'Only the host can do this'; END IF;
  IF p_user_id IS NOT DISTINCT FROM v_creator THEN RAISE EXCEPTION 'The host cannot be changed'; END IF;
  IF p_status NOT IN ('approved','muted','banned') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.lounge_members SET status = p_status WHERE lounge_id = p_lounge_id AND user_id = p_user_id;
  -- The record outlasts the seat: a ban or mute stands though the member leave.
  IF p_status IN ('muted', 'banned') THEN
    INSERT INTO public.lounge_sanctions (lounge_id, user_id, status) VALUES (p_lounge_id, p_user_id, p_status)
    ON CONFLICT (lounge_id, user_id) DO UPDATE SET status = EXCLUDED.status, set_at = now();
  ELSE
    DELETE FROM public.lounge_sanctions WHERE lounge_id = p_lounge_id AND user_id = p_user_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.join_public_lounge(p_lounge_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_private boolean; v_sanction text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT is_private INTO v_private FROM public.lounges WHERE id = p_lounge_id;
  IF v_private IS NULL THEN RAISE EXCEPTION 'Lounge not found'; END IF;
  IF v_private THEN RAISE EXCEPTION 'This lounge is private — request to join'; END IF;
  SELECT status INTO v_sanction FROM public.lounge_sanctions WHERE lounge_id = p_lounge_id AND user_id = auth.uid();
  IF v_sanction = 'banned' THEN RAISE EXCEPTION 'You cannot join this lounge'; END IF;
  INSERT INTO public.lounge_members (lounge_id, user_id, status)
  VALUES (p_lounge_id, auth.uid(), COALESCE(v_sanction, 'approved'))
  ON CONFLICT (user_id, lounge_id) DO UPDATE SET status = EXCLUDED.status
    WHERE public.lounge_members.status <> 'banned';
END $$;

CREATE OR REPLACE FUNCTION public.request_lounge_membership(p_lounge_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_private boolean; v_creator uuid; v_status text; v_uname text; v_lname text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT is_private, creator_id, name INTO v_private, v_creator, v_lname FROM public.lounges WHERE id = p_lounge_id;
  IF v_private IS NULL THEN RAISE EXCEPTION 'Lounge not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.lounge_sanctions
              WHERE lounge_id = p_lounge_id AND user_id = auth.uid() AND status = 'banned') THEN
    RAISE EXCEPTION 'You cannot request this lounge';
  END IF;
  SELECT status INTO v_status FROM public.lounge_members WHERE lounge_id = p_lounge_id AND user_id = auth.uid();
  IF v_status = 'banned' THEN RAISE EXCEPTION 'You cannot request this lounge'; END IF;
  IF v_status IN ('approved','pending','muted') THEN RETURN; END IF;
  INSERT INTO public.lounge_members (lounge_id, user_id, status) VALUES (p_lounge_id, auth.uid(), 'pending')
  ON CONFLICT (user_id, lounge_id) DO UPDATE SET status = 'pending'
    WHERE public.lounge_members.status NOT IN ('banned','approved','muted');
  SELECT username INTO v_uname FROM public.profiles WHERE id = auth.uid();
  IF v_creator IS NOT NULL AND v_creator <> auth.uid() THEN
    -- the sender is from_username; every reader prints it before the message
    INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, related_lounge_id)
    VALUES (v_creator, 'system', v_uname, auth.uid(),
            CASE WHEN v_uname IS NULL THEN 'A member is asking' ELSE 'is asking' END
              || ' to enter ' || COALESCE(v_lname,'your lounge') || '.',
            p_lounge_id);
  END IF;
END $$;

-- A host admitting a request admits the member as the house knows them: muted stays muted.
CREATE OR REPLACE FUNCTION public.approve_lounge_member(p_lounge_id uuid, p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_lname text; v_sanction text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() IS DISTINCT FROM (SELECT creator_id FROM public.lounges WHERE id = p_lounge_id) THEN
    RAISE EXCEPTION 'Only the host can admit members'; END IF;
  -- A banned member cannot be pending (request_lounge_membership refuses them),
  -- so the only sanction met here is a mute.
  SELECT status INTO v_sanction FROM public.lounge_sanctions WHERE lounge_id = p_lounge_id AND user_id = p_user_id;
  UPDATE public.lounge_members SET status = COALESCE(v_sanction, 'approved')
   WHERE lounge_id = p_lounge_id AND user_id = p_user_id AND status = 'pending';
  IF FOUND THEN
    SELECT name INTO v_lname FROM public.lounges WHERE id = p_lounge_id;
    INSERT INTO public.notifications (user_id, type, from_user_id, message, related_lounge_id)
    VALUES (p_user_id, 'system', auth.uid(), 'You were admitted to ' || COALESCE(v_lname,'the lounge') || '.', p_lounge_id);
  END IF;
END $$;

-- ── 2 · A room turned private asks the founder's rank ─────────────────────
CREATE TRIGGER tr_tier_gate_private_lounges_turned BEFORE UPDATE OF is_private ON public.lounges
  FOR EACH ROW WHEN ((new.is_private IS TRUE) AND (old.is_private IS NOT TRUE))
  EXECUTE FUNCTION public.enforce_tier_gate('2', 'A private screening room is an Auteur feature');

-- ── 3 · A report names the member who wrote what it reports ───────────────
CREATE OR REPLACE FUNCTION public.submit_report(p_reporter_id uuid, p_content_id uuid, p_content_type text, p_reason text, p_details text DEFAULT NULL::text, p_target_user_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_reporter_id uuid := auth.uid();
  v_report_id uuid;
  v_recent_count int;
  v_target uuid;
BEGIN
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM reports
  WHERE reporter_id = v_reporter_id
    AND created_at > now() - interval '1 hour';

  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 10 reports per hour';
  END IF;

  -- The member is read from the item, never taken from the caller.
  v_target := CASE p_content_type
    WHEN 'profile'          THEN (SELECT id FROM profiles WHERE id = p_content_id)
    WHEN 'log'              THEN (SELECT user_id FROM logs WHERE id = p_content_id)
    WHEN 'list'             THEN (SELECT user_id FROM lists WHERE id = p_content_id)
    WHEN 'log_comment'      THEN (SELECT user_id FROM log_comments WHERE id = p_content_id)
    WHEN 'list_comment'     THEN (SELECT user_id FROM list_comments WHERE id = p_content_id)
    WHEN 'dossier'          THEN (SELECT user_id FROM dispatch_posts WHERE id = p_content_id)
    WHEN 'dispatch_post'    THEN (SELECT user_id FROM dispatch_posts WHERE id = p_content_id)
    WHEN 'dossier_comment'  THEN (SELECT user_id FROM dispatch_comments WHERE id = p_content_id)
    WHEN 'dispatch_comment' THEN (SELECT user_id FROM dispatch_comments WHERE id = p_content_id)
    WHEN 'lounge_message'   THEN (SELECT user_id FROM lounge_messages WHERE id = p_content_id)
    WHEN 'lounge'           THEN (SELECT creator_id FROM lounges WHERE id = p_content_id)
  END;

  IF p_content_type = 'profile' AND v_reporter_id = v_target THEN
    RAISE EXCEPTION 'Cannot report your own profile';
  END IF;

  BEGIN
    INSERT INTO reports (reporter_id, content_id, content_type, reason, details, target_user_id, status)
    VALUES (v_reporter_id, p_content_id, p_content_type, p_reason, p_details, v_target, 'pending')
    RETURNING id INTO v_report_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Already reported' USING ERRCODE = '23505';
  END;

  RETURN v_report_id;
END;
$$;

-- ── 4 · A profile is made and closed by the house alone ───────────────────
DROP POLICY "Users can insert their own profile." ON public.profiles;
REVOKE INSERT, DELETE ON public.profiles FROM anon, authenticated;

-- ── 5 · A frozen name is refused aloud, never undone in silence ───────────
-- A silenced or suspended member's new name, bio, portrait or links (and a
-- suspended host's new salon name, words or cover) were put back by these two
-- triggers while the write answered success, so every client said "updated".
-- Now the change is refused in the sentence enforce_not_restricted speaks for
-- every other write; the app hears it and shows the member their standing.
-- A write that leaves these fields alone (privacy, preferences, a handover of
-- the room when an account closes) still passes.
CREATE OR REPLACE FUNCTION public.enforce_profile_identity_freeze() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_banned boolean;
  v_until  timestamptz;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;

  NEW.is_banned         := OLD.is_banned;
  NEW.banned_at         := OLD.banned_at;
  NEW.suspended_until   := OLD.suspended_until;
  NEW.suspension_reason := OLD.suspension_reason;
  NEW.warning_count     := OLD.warning_count;

  IF (NEW.username, NEW.display_name, NEW.bio, NEW.avatar_url, NEW.social_links, NEW.persona)
     IS NOT DISTINCT FROM
     (OLD.username, OLD.display_name, OLD.bio, OLD.avatar_url, OLD.social_links, OLD.persona) THEN
    RETURN NEW;
  END IF;

  SELECT is_banned, suspended_until INTO v_banned, v_until
    FROM public.profiles WHERE id = auth.uid();

  IF COALESCE(v_banned, false) THEN
    RAISE EXCEPTION 'Your account has been silenced by The Society.' USING ERRCODE = '42501';
  END IF;
  IF v_until IS NOT NULL AND v_until > now() THEN
    RAISE EXCEPTION 'Your account is suspended until %.',
      to_char(v_until AT TIME ZONE 'UTC', 'DD Mon YYYY HH24:MI "UTC"')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_lounge_identity_freeze() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_banned boolean;
  v_until  timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.name, NEW.description, NEW.cover_image, NEW.is_private)
     IS NOT DISTINCT FROM (OLD.name, OLD.description, OLD.cover_image, OLD.is_private) THEN
    RETURN NEW;
  END IF;

  SELECT is_banned, suspended_until INTO v_banned, v_until
    FROM public.profiles WHERE id = auth.uid();

  IF COALESCE(v_banned, false) THEN
    RAISE EXCEPTION 'Your account has been silenced by The Society.' USING ERRCODE = '42501';
  END IF;
  IF v_until IS NOT NULL AND v_until > now() THEN
    RAISE EXCEPTION 'Your account is suspended until %.',
      to_char(v_until AT TIME ZONE 'UTC', 'DD Mon YYYY HH24:MI "UTC"')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;
