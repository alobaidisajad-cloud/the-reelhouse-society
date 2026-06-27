-- ═══════════════════════════════════════════════════════════════════════════════
-- LOUNGE OVERHAUL — Phase A backend (membership model, reactions, soft-delete,
-- host controls, counts, RLS). APPLY MANUALLY in the SQL editor (do not db push).
-- ═══════════════════════════════════════════════════════════════════════════════
-- Model: public = instant join + readable preview; private = request → host admits,
-- sealed until approved. Invite codes removed (column kept, unused). Security is
-- enforced here in RLS + triggers, never just the UI.
-- Idempotent. Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1. Schema ────────────────────────────────────────────────────────────────
ALTER TABLE public.lounge_members  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
ALTER TABLE public.lounge_members  DROP CONSTRAINT IF EXISTS lounge_members_status_check;
ALTER TABLE public.lounge_members  ADD  CONSTRAINT lounge_members_status_check CHECK (status IN ('approved','pending','muted','banned'));

ALTER TABLE public.lounge_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.notifications   ADD COLUMN IF NOT EXISTS related_lounge_id uuid;
ALTER TABLE public.lounges         ALTER COLUMN invite_code DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.lounge_message_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.lounge_messages(id) ON DELETE CASCADE,
  lounge_id  uuid NOT NULL REFERENCES public.lounges(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  reaction   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, reaction)
);
ALTER TABLE public.lounge_message_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.lounge_message_reactions TO authenticated;

-- ── 2. member_count: keep = count of APPROVED members (was client-maintained) ──
CREATE OR REPLACE FUNCTION public.recount_lounge_members()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lounge uuid := COALESCE(NEW.lounge_id, OLD.lounge_id);
BEGIN
  UPDATE public.lounges
     SET member_count = (SELECT count(*) FROM public.lounge_members
                          WHERE lounge_id = v_lounge AND status = 'approved')
   WHERE id = v_lounge;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS tr_recount_lounge_members ON public.lounge_members;
CREATE TRIGGER tr_recount_lounge_members
AFTER INSERT OR DELETE OR UPDATE OF status ON public.lounge_members
FOR EACH ROW EXECUTE FUNCTION public.recount_lounge_members();
UPDATE public.lounges l
   SET member_count = (SELECT count(*) FROM public.lounge_members m
                        WHERE m.lounge_id = l.id AND m.status = 'approved');

-- ── 3. Guard: only the host may change a member's status (no self-approval) ────
CREATE OR REPLACE FUNCTION public.protect_lounge_member_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.uid() IS NOT NULL
     AND auth.uid() <> (SELECT creator_id FROM public.lounges WHERE id = NEW.lounge_id) THEN
    RAISE EXCEPTION 'Only the host can change membership status';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_protect_lounge_member_status ON public.lounge_members;
CREATE TRIGGER tr_protect_lounge_member_status
BEFORE UPDATE ON public.lounge_members
FOR EACH ROW EXECUTE FUNCTION public.protect_lounge_member_status();

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
-- lounges: metadata discoverable (so private rooms can be found + requested).
DROP POLICY IF EXISTS "Anyone can view lounges" ON public.lounges;
CREATE POLICY "Lounges are discoverable" ON public.lounges FOR SELECT USING (true);

-- lounge_members: a member sees the room's roster; the host also sees pending;
-- everyone sees their own row. (Old policy only let you see yourself.)
DROP POLICY IF EXISTS "Members can view memberships" ON public.lounge_members;
CREATE POLICY "Roster visible to members and host" ON public.lounge_members FOR SELECT USING (
  user_id = auth.uid()
  OR auth.uid() = (SELECT creator_id FROM public.lounges WHERE id = lounge_members.lounge_id)
  OR EXISTS (SELECT 1 FROM public.lounge_members me
             WHERE me.lounge_id = lounge_members.lounge_id AND me.user_id = auth.uid() AND me.status = 'approved')
);

-- Joins/requests go through SECURITY DEFINER RPCs only (prevents self-inserting
-- as 'approved' into a private room). Remove the open client INSERT.
DROP POLICY IF EXISTS "Users can join lounges" ON public.lounge_members;

-- lounge_messages: readable in public lounges (preview) OR if you're an APPROVED
-- member (pending/banned cannot read a private room).
DROP POLICY IF EXISTS "Anyone can read public lounge messages" ON public.lounge_messages;
CREATE POLICY "Lounge messages readable" ON public.lounge_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.lounges l WHERE l.id = lounge_messages.lounge_id AND l.is_private = false)
  OR EXISTS (SELECT 1 FROM public.lounge_members m
             WHERE m.lounge_id = lounge_messages.lounge_id AND m.user_id = auth.uid() AND m.status = 'approved')
);

-- Posting requires APPROVED membership (muted/pending/banned cannot send).
DROP POLICY IF EXISTS "Members can send messages" ON public.lounge_messages;
CREATE POLICY "Approved members can send" ON public.lounge_messages FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.lounge_members m
              WHERE m.lounge_id = lounge_messages.lounge_id AND m.user_id = auth.uid() AND m.status = 'approved')
);

-- reactions: readable wherever you can read the message; only approved members
-- may add their own; you may remove your own.
DROP POLICY IF EXISTS "Reactions readable" ON public.lounge_message_reactions;
CREATE POLICY "Reactions readable" ON public.lounge_message_reactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.lounges l WHERE l.id = lounge_message_reactions.lounge_id AND l.is_private = false)
  OR EXISTS (SELECT 1 FROM public.lounge_members m
             WHERE m.lounge_id = lounge_message_reactions.lounge_id AND m.user_id = auth.uid() AND m.status = 'approved')
);
DROP POLICY IF EXISTS "Approved members can react" ON public.lounge_message_reactions;
CREATE POLICY "Approved members can react" ON public.lounge_message_reactions FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.lounge_members m
              WHERE m.lounge_id = lounge_message_reactions.lounge_id AND m.user_id = auth.uid() AND m.status = 'approved')
);
DROP POLICY IF EXISTS "Remove own reaction" ON public.lounge_message_reactions;
CREATE POLICY "Remove own reaction" ON public.lounge_message_reactions FOR DELETE USING (auth.uid() = user_id);

-- ── 5. RPCs ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_public_lounge(p_lounge_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_private boolean; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT is_private INTO v_private FROM public.lounges WHERE id = p_lounge_id;
  IF v_private IS NULL THEN RAISE EXCEPTION 'Lounge not found'; END IF;
  IF v_private THEN RAISE EXCEPTION 'This lounge is private — request to join'; END IF;
  SELECT status INTO v_status FROM public.lounge_members WHERE lounge_id = p_lounge_id AND user_id = auth.uid();
  IF v_status = 'banned' THEN RAISE EXCEPTION 'You cannot join this lounge'; END IF;
  INSERT INTO public.lounge_members (lounge_id, user_id, status)
  VALUES (p_lounge_id, auth.uid(), 'approved')
  ON CONFLICT (user_id, lounge_id) DO UPDATE SET status = 'approved'
    WHERE public.lounge_members.status <> 'banned';
END $$;

CREATE OR REPLACE FUNCTION public.request_lounge_membership(p_lounge_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_private boolean; v_creator uuid; v_status text; v_uname text; v_lname text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT is_private, creator_id, name INTO v_private, v_creator, v_lname FROM public.lounges WHERE id = p_lounge_id;
  IF v_private IS NULL THEN RAISE EXCEPTION 'Lounge not found'; END IF;
  SELECT status INTO v_status FROM public.lounge_members WHERE lounge_id = p_lounge_id AND user_id = auth.uid();
  IF v_status = 'banned' THEN RAISE EXCEPTION 'You cannot request this lounge'; END IF;
  IF v_status IN ('approved','pending') THEN RETURN; END IF;
  INSERT INTO public.lounge_members (lounge_id, user_id, status) VALUES (p_lounge_id, auth.uid(), 'pending')
  ON CONFLICT (user_id, lounge_id) DO UPDATE SET status = 'pending'
    WHERE public.lounge_members.status NOT IN ('banned','approved');
  SELECT username INTO v_uname FROM public.profiles WHERE id = auth.uid();
  IF v_creator IS NOT NULL AND v_creator <> auth.uid() THEN
    INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, related_lounge_id)
    VALUES (v_creator, 'system', v_uname, auth.uid(), '@' || UPPER(COALESCE(v_uname,'someone')) || ' is asking to enter ' || COALESCE(v_lname,'your lounge') || '.', p_lounge_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.approve_lounge_member(p_lounge_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lname text;
BEGIN
  IF auth.uid() <> (SELECT creator_id FROM public.lounges WHERE id = p_lounge_id) THEN
    RAISE EXCEPTION 'Only the host can admit members'; END IF;
  UPDATE public.lounge_members SET status = 'approved'
   WHERE lounge_id = p_lounge_id AND user_id = p_user_id AND status = 'pending';
  IF FOUND THEN
    SELECT name INTO v_lname FROM public.lounges WHERE id = p_lounge_id;
    INSERT INTO public.notifications (user_id, type, from_user_id, message, related_lounge_id)
    VALUES (p_user_id, 'system', auth.uid(), 'You were admitted to ' || COALESCE(v_lname,'the lounge') || '.', p_lounge_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.decline_lounge_member(p_lounge_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() <> (SELECT creator_id FROM public.lounges WHERE id = p_lounge_id) THEN
    RAISE EXCEPTION 'Only the host can decline requests'; END IF;
  DELETE FROM public.lounge_members WHERE lounge_id = p_lounge_id AND user_id = p_user_id AND status = 'pending';
END $$;

CREATE OR REPLACE FUNCTION public.set_lounge_member_status(p_lounge_id uuid, p_user_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_creator uuid;
BEGIN
  SELECT creator_id INTO v_creator FROM public.lounges WHERE id = p_lounge_id;
  IF auth.uid() <> v_creator THEN RAISE EXCEPTION 'Only the host can do this'; END IF;
  IF p_user_id = v_creator THEN RAISE EXCEPTION 'The host cannot be changed'; END IF;
  IF p_status NOT IN ('approved','muted','banned') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.lounge_members SET status = p_status WHERE lounge_id = p_lounge_id AND user_id = p_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.remove_lounge_member(p_lounge_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_creator uuid;
BEGIN
  SELECT creator_id INTO v_creator FROM public.lounges WHERE id = p_lounge_id;
  IF auth.uid() <> v_creator THEN RAISE EXCEPTION 'Only the host can remove members'; END IF;
  IF p_user_id = v_creator THEN RAISE EXCEPTION 'The host cannot be removed'; END IF;
  DELETE FROM public.lounge_members WHERE lounge_id = p_lounge_id AND user_id = p_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_lounge_message(p_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author uuid; v_lounge uuid; v_creator uuid;
BEGIN
  SELECT user_id, lounge_id INTO v_author, v_lounge FROM public.lounge_messages WHERE id = p_message_id;
  IF v_author IS NULL THEN RETURN; END IF;
  SELECT creator_id INTO v_creator FROM public.lounges WHERE id = v_lounge;
  IF auth.uid() <> v_author AND auth.uid() <> v_creator THEN
    RAISE EXCEPTION 'You can only withdraw your own dispatch'; END IF;
  UPDATE public.lounge_messages SET content = '', deleted_at = now() WHERE id = p_message_id;
END $$;

-- No-code create (the new flow). Keeps a generated invite_code only for back-compat.
CREATE OR REPLACE FUNCTION public.create_lounge(p_name text, p_description text, p_is_private boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.lounges (name, description, is_private, invite_code, creator_id, member_count)
  VALUES (p_name, p_description, COALESCE(p_is_private,false), upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)), v_uid, 0)
  RETURNING id INTO v_id;
  INSERT INTO public.lounge_members (lounge_id, user_id, status) VALUES (v_id, v_uid, 'approved');
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION
  public.join_public_lounge(uuid), public.request_lounge_membership(uuid),
  public.approve_lounge_member(uuid,uuid), public.decline_lounge_member(uuid,uuid),
  public.set_lounge_member_status(uuid,uuid,text), public.remove_lounge_member(uuid,uuid),
  public.withdraw_lounge_message(uuid), public.create_lounge(text,text,boolean)
TO authenticated;

-- ── 6. Realtime: reactions appear live + a pending member auto-enters on admit ──
-- (lounge_messages is already published.) Idempotent — skip if already a member.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lounge_message_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lounge_message_reactions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lounge_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lounge_members;
  END IF;
END $$;
-- DELETE/UPDATE realtime payloads need the full OLD row.
ALTER TABLE public.lounge_message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.lounge_members REPLICA IDENTITY FULL;

COMMIT;
