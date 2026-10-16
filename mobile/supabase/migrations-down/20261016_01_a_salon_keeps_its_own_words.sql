-- Undo of 20261016_01_a_salon_keeps_its_own_words.sql: production's schema as it was before it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

GRANT INSERT, UPDATE, DELETE ON TABLE public.dispatch_dossiers_legacy, public.dossier_comments_legacy,
  public.dossier_certifications_legacy TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_endorse_content(p_actor uuid, p_type text, p_log_id uuid, p_list_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_owner uuid; v_pref text;
BEGIN
  IF p_type = 'endorse_log' THEN
    SELECT user_id INTO v_owner FROM public.logs WHERE id = p_log_id;
  ELSIF p_type = 'endorse_list' THEN
    SELECT user_id INTO v_owner FROM public.lists WHERE id = p_list_id;
  ELSE
    RETURN TRUE;
  END IF;
  SELECT preferences->>'privacy_endorsements' INTO v_pref FROM public.profiles WHERE id = v_owner;
  RETURN public.audience_allows(p_actor, v_owner, v_pref);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_annotate_list(p_actor uuid, p_list_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT public.audience_allows(p_actor, l.user_id,
    (SELECT preferences->>'privacy_annotations' FROM public.profiles WHERE id = l.user_id))
  FROM public.lists l WHERE l.id = p_list_id;
$$;

-- 20261015_07's form.
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

ALTER POLICY interactions_select_authorized ON public.interactions
  USING (((auth.uid() = user_id) OR (auth.uid() = target_user_id)
          OR public.can_view_user_data(user_id) OR public.can_view_user_data(target_user_id)));

DROP TRIGGER a_withdrawn_message_leaves_its_quotes ON public.lounge_messages;
DROP FUNCTION public.a_withdrawn_message_leaves_its_quotes();

DROP TRIGGER a_reply_quotes_its_message ON public.lounge_messages;
DROP FUNCTION public.a_reply_quotes_its_message();

DROP TRIGGER a_reaction_is_in_its_message_salon ON public.lounge_message_reactions;
DROP FUNCTION public.a_reaction_is_in_its_message_salon();
