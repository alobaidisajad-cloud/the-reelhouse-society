-- ════════════════════════════════════════════════════════════════════════════
-- 20261126_12 — leaving asks a fresh proof: an account is deleted by a member signed in moments ago.
-- ════════════════════════════════════════════════════════════════════════════
--   request_account_deletion is the one door out, and it cannot be undone. It now asks the session's
--   own token for a sign-in made within the last fifteen minutes (any method: a password, or the code
--   the house emails); a session without one is refused with 42501 'REAUTH' and nothing is touched.
--   The phone asks the emailed code before it calls (verifyOtp makes the fresh sign-in), as the website
--   always has. Everything else the function does is as it was, word for word.
--   It reads the caller's own token alone: the same work at any size.
-- Undo: mobile/supabase/migrations-down/20261126_12_leaving_asks_a_fresh_proof.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (4): a break the user accepted: 2026-11-26, the lead: "a shipped build-41 tester with the lock on would be refused deletion on the phone (the website still deletes): this is a security improvement and the lead accepts it". TestFlight build 41 asks the phone's lock alone when Biometric Lock is on, so such a tester is refused on the phone and deletes on the website (which asks the emailed code), or from a build that asks the code; with the lock off build 41 asks the emailed code and deletes as before
CREATE OR REPLACE FUNCTION public.request_account_deletion(p_erase_writing boolean DEFAULT false) RETURNS void
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

  -- Leaving asks a fresh proof: a sign-in (a password, or the code the house emails) within the last
  -- fifteen minutes, as the session's own token records it (its amr: each method and when). A session
  -- kept for weeks proves only that a phone holds it, and a phone's lock proves nothing to the house.
  IF NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(auth.jwt() -> 'amr') = 'array' THEN auth.jwt() -> 'amr' ELSE '[]'::jsonb END) AS a(proof)
     WHERE jsonb_typeof(a.proof -> 'timestamp') = 'number'
       AND (a.proof ->> 'timestamp')::numeric >= extract(epoch FROM now()) - 900
  ) THEN
    RAISE EXCEPTION 'REAUTH' USING ERRCODE = '42501', HINT = 'Sign in again with the emailed code, then delete the account.';
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

  -- The member chose to take their words with them: each piece comes down in the form a member's own
  -- withdrawal gives it, before the name is taken off what stays.
  IF coalesce(p_erase_writing, false) THEN
    -- Critiques and notes: deleted, as WITHDRAW deletes one. The counters settle by their triggers.
    DELETE FROM public.log_comments      WHERE user_id = uid;
    DELETE FROM public.list_comments     WHERE user_id = uid;
    DELETE FROM public.dispatch_comments WHERE user_id = uid;

    -- A closed ballot's notice quoted its question to every voter: the notice stays, the question goes.
    -- (written before round 12 it names no author; since, it names this member)
    UPDATE public.notifications n
       SET message = 'A ballot you voted in has closed.', metadata = n.metadata - 'title'
      FROM public.dispatch_posts p
     WHERE p.user_id = uid AND p.kind = 'ballot'
       AND (n.from_user_id IS NULL OR n.from_user_id = uid)
       AND n.metadata @> jsonb_build_object('dispatch_post_id', p.id, 'kind', 'ballot');

    -- Filings: withdrawn by their author. The critiques others wrote under them stay.
    PERFORM public.dispatch_empty_filing(p.id, 'author')
       FROM public.dispatch_posts p
      WHERE p.user_id = uid AND p.ended_at IS NULL;
    UPDATE public.dispatch_posts
       SET series_id = NULL, series_title = NULL, part_number = NULL
     WHERE user_id = uid AND series_id IS NOT NULL;

    -- Salon messages: withdrawn, with the card, the film and the quote they carried.
    UPDATE public.lounge_messages
       SET content = '', metadata = '{}'::jsonb, film_id = NULL, film_title = NULL, film_poster = NULL,
           reply_to_content = NULL, deleted_at = coalesce(deleted_at, now())
     WHERE user_id = uid;

    -- The old Dispatch tables, still open to read.
    DELETE FROM public.dossier_comments_legacy WHERE user_id = uid;
    UPDATE public.dispatch_dossiers_legacy
       SET title = '', excerpt = NULL, full_content = NULL
     WHERE user_id = uid;
  END IF;

  UPDATE public.log_comments
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dossier_comments
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dispatch_dossiers
     SET user_id = NULL, author_username = '[deleted]'
   WHERE user_id = uid;

  -- The old Dispatch tables kept the handle on what stays: the name comes off there too.
  UPDATE public.dossier_comments_legacy
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dispatch_dossiers_legacy
     SET user_id = NULL, author_username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.lounge_messages
     SET reply_to_username = '[deleted]'
   WHERE reply_to_id IN (SELECT id FROM public.lounge_messages WHERE user_id = uid);

  -- A closed ballot's notice names its author since round 12, so a block or a mute hides it: it stays
  -- with each voter, unsigned as the ballot itself stays, as it did before it named anyone.
  UPDATE public.notifications SET from_user_id = NULL WHERE from_user_id = uid AND type = 'ballot';

  DELETE FROM public.notifications WHERE from_user_id = uid;

  IF v_handle IS NOT NULL THEN
    -- Asked as containment, so the cards' own index (lounge_messages_card_names, 20261022_02) finds them.
    -- A stack's card names its curator: that name comes off as a record's and an essay's do.
    UPDATE public.lounge_messages
       SET metadata = ((metadata - 'owner_username') - 'author_username')
                      - CASE WHEN type = 'list_share' AND metadata @> jsonb_build_object('curator', v_handle)
                             THEN 'curator' ELSE '' END
     WHERE metadata <> '{}'::jsonb
       AND (metadata @> jsonb_build_object('owner_username', v_handle)
         OR metadata @> jsonb_build_object('author_username', v_handle)
         OR (type = 'list_share' AND metadata @> jsonb_build_object('curator', v_handle)));
  END IF;

  UPDATE public.list_comments   SET user_id = NULL WHERE user_id = uid;
  UPDATE public.lounge_messages SET user_id = NULL WHERE user_id = uid;

  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE owner = uid;

  DELETE FROM auth.users WHERE id = uid;
END
$$;
