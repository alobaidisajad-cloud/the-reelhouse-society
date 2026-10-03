-- ════════════════════════════════════════════════════════════════════════════
-- the_house_keeps_its_own_record_rehearsal.sql — 20261003_07. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/the_house_keeps_its_own_record_rehearsal.sql
--
-- Two members: a host (Auteur) and a guest (Archivist), ranks set inside the
-- transaction. Each case runs as the signed-in member, in its own block, so a
-- refusal is caught and printed, never fatal. Without with_fix the house is as
-- it is: a muted guest who steps out comes back with their voice, a banned one
-- walks back in, an Archivist turns a salon private, a report names no one.
-- Read each NOTICE as  case|expected|got ; the last line counts the misses.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;

SELECT set_config('rehearsal.host', (SELECT id::text FROM public.profiles
  WHERE NOT coalesce(is_banned, false) AND role IS DISTINCT FROM 'admin' ORDER BY created_at LIMIT 1), true) AS done \gset rh_
SELECT set_config('rehearsal.guest', (SELECT id::text FROM public.profiles
  WHERE NOT coalesce(is_banned, false) AND role IS DISTINCT FROM 'admin'
    AND id::text <> current_setting('rehearsal.host') ORDER BY created_at LIMIT 1), true) AS done \gset rh_
UPDATE public.profiles SET tier = 'auteur', is_founding = false, suspended_until = NULL, role = 'auteur'
 WHERE id::text = current_setting('rehearsal.host');
UPDATE public.profiles SET tier = 'archivist', is_founding = false, suspended_until = NULL, role = 'archivist'
 WHERE id::text = current_setting('rehearsal.guest');

-- A mute given before the fix, so carrying the old sanctions over is asked of
-- at least one (production may hold none).
INSERT INTO public.lounges (id, name, creator_id, is_private)
VALUES ('00000000-0000-4000-8000-0000000000a0', 'Rehearsal old salon', current_setting('rehearsal.host')::uuid, false);
INSERT INTO public.lounge_members (lounge_id, user_id, status)
VALUES ('00000000-0000-4000-8000-0000000000a0', current_setting('rehearsal.guest')::uuid, 'muted');

CREATE TEMP TABLE hk_before ON COMMIT DROP AS
SELECT count(*) AS sanctioned FROM public.lounge_members WHERE status IN ('muted', 'banned');
CREATE TEMP TABLE hk_misses (label text) ON COMMIT DROP;
GRANT ALL ON hk_misses TO authenticated;

\if :{?with_fix}
\ir ../../../supabase/migrations/20261003_07_the_house_keeps_its_own_record.sql
\endif

-- A public salon and a private room, both the host's, both new.
INSERT INTO public.lounges (id, name, creator_id, is_private)
VALUES ('00000000-0000-4000-8000-0000000000a1', 'Rehearsal salon', current_setting('rehearsal.host')::uuid, false),
       ('00000000-0000-4000-8000-0000000000a2', 'Rehearsal room', current_setting('rehearsal.host')::uuid, true);

-- A log by someone other than the guest, which the guest has not reported.
SELECT set_config('rehearsal.log', (SELECT l.id::text FROM public.logs l
  WHERE l.user_id::text <> current_setting('rehearsal.guest')
    AND NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.content_id = l.id::text
                     AND r.reporter_id::text = current_setting('rehearsal.guest') AND r.status = 'pending')
  ORDER BY l.created_at LIMIT 1), true) AS done \gset rh_
-- The guest's reports this hour must leave room for two more.
DELETE FROM public.reports WHERE reporter_id::text = current_setting('rehearsal.guest') AND created_at > now() - interval '1 hour';

CREATE FUNCTION pg_temp.hk(label text, expected text, got text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '%|%|%', label, expected, got;
  IF got IS DISTINCT FROM expected THEN INSERT INTO hk_misses VALUES (label); END IF;
END $$;
CREATE FUNCTION pg_temp.seat(p_lounge uuid) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT coalesce((SELECT status FROM public.lounge_members
                    WHERE lounge_id = p_lounge AND user_id::text = current_setting('rehearsal.guest')), 'none');
$$;
GRANT EXECUTE ON FUNCTION pg_temp.hk(text, text, text), pg_temp.seat(uuid) TO authenticated;

-- Who is acting. The house (postgres) also clears the claims, so auth.uid() is
-- nobody and no member's rank is asked of what the rehearsal itself sets up.
\set as_host 'SET LOCAL ROLE authenticated; SELECT set_config(''request.jwt.claims'', json_build_object(''sub'', current_setting(''rehearsal.host''), ''role'', ''authenticated'')::text, true) IS NULL AS f;'
\set as_guest 'SET LOCAL ROLE authenticated; SELECT set_config(''request.jwt.claims'', json_build_object(''sub'', current_setting(''rehearsal.guest''), ''role'', ''authenticated'')::text, true) IS NULL AS f;'
\set as_house 'RESET ROLE; SELECT set_config(''request.jwt.claims'', '''', true) IS NULL AS f;'

-- ── 1 · the guest joins; the host mutes them ────────────────────────────────
:as_guest
DO $$ DECLARE got text; BEGIN
  BEGIN PERFORM public.join_public_lounge('00000000-0000-4000-8000-0000000000a1'); got := pg_temp.seat('00000000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('the guest joins the salon', 'approved', got);
END $$;
:as_house
:as_host
DO $$ DECLARE got text; BEGIN
  BEGIN PERFORM public.set_lounge_member_status('00000000-0000-4000-8000-0000000000a1', current_setting('rehearsal.guest')::uuid, 'muted');
    got := pg_temp.seat('00000000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('the host mutes the guest', 'muted', got);
END $$;
:as_house

-- ── 2 · a mute outlasts the door ────────────────────────────────────────────
:as_guest
DO $$ DECLARE got text; BEGIN
  BEGIN PERFORM public.join_public_lounge('00000000-0000-4000-8000-0000000000a1'); got := pg_temp.seat('00000000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('a muted guest presses join again, and stays muted', 'muted', got);

  DELETE FROM public.lounge_members WHERE lounge_id = '00000000-0000-4000-8000-0000000000a1' AND user_id = auth.uid();
  PERFORM pg_temp.hk('a muted guest may still leave', 'none', pg_temp.seat('00000000-0000-4000-8000-0000000000a1'));

  BEGIN PERFORM public.join_public_lounge('00000000-0000-4000-8000-0000000000a1'); got := pg_temp.seat('00000000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('a muted guest who left comes back muted', 'muted', got);

  BEGIN PERFORM count(*) FROM public.lounge_sanctions; got := 'read';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.hk('a member cannot read the sanctions', '42501', got);
  BEGIN DELETE FROM public.lounge_sanctions WHERE user_id = auth.uid(); got := 'wrote';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.hk('a member cannot erase their sanction', '42501', got);
END $$;
:as_house

-- ── 3 · a ban outlasts the door ─────────────────────────────────────────────
:as_host
DO $$ BEGIN
  PERFORM public.set_lounge_member_status('00000000-0000-4000-8000-0000000000a1', current_setting('rehearsal.guest')::uuid, 'banned');
END $$;
:as_house
:as_guest
DO $$ DECLARE got text; BEGIN
  DELETE FROM public.lounge_members WHERE lounge_id = '00000000-0000-4000-8000-0000000000a1' AND user_id = auth.uid();
  BEGIN PERFORM public.join_public_lounge('00000000-0000-4000-8000-0000000000a1'); got := pg_temp.seat('00000000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('a banned guest who left is refused the door', 'You cannot join this lounge', got);
  BEGIN PERFORM public.request_lounge_membership('00000000-0000-4000-8000-0000000000a1'); got := pg_temp.seat('00000000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('nor may they ask to enter', 'You cannot request this lounge', got);
END $$;
:as_house

-- ── 4 · only the host lifts it, even with the guest gone ────────────────────
:as_host
DO $$ BEGIN
  PERFORM public.set_lounge_member_status('00000000-0000-4000-8000-0000000000a1', current_setting('rehearsal.guest')::uuid, 'approved');
END $$;
:as_house
:as_guest
DO $$ DECLARE got text; BEGIN
  BEGIN PERFORM public.join_public_lounge('00000000-0000-4000-8000-0000000000a1'); got := pg_temp.seat('00000000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('once the host lifts the ban, the guest joins with their voice', 'approved', got);
END $$;
:as_house

-- ── 5 · a private room: a muted guest who left asks again ───────────────────
INSERT INTO public.lounge_members (lounge_id, user_id, status)
VALUES ('00000000-0000-4000-8000-0000000000a2', current_setting('rehearsal.guest')::uuid, 'approved');
:as_host
DO $$ BEGIN
  PERFORM public.set_lounge_member_status('00000000-0000-4000-8000-0000000000a2', current_setting('rehearsal.guest')::uuid, 'muted');
END $$;
:as_house
:as_guest
DO $$ DECLARE got text; BEGIN
  DELETE FROM public.lounge_members WHERE lounge_id = '00000000-0000-4000-8000-0000000000a2' AND user_id = auth.uid();
  BEGIN PERFORM public.request_lounge_membership('00000000-0000-4000-8000-0000000000a2'); got := pg_temp.seat('00000000-0000-4000-8000-0000000000a2');
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('a muted guest who left may ask again', 'pending', got);
END $$;
:as_house
:as_host
DO $$ DECLARE got text; BEGIN
  BEGIN PERFORM public.approve_lounge_member('00000000-0000-4000-8000-0000000000a2', current_setting('rehearsal.guest')::uuid);
    got := pg_temp.seat('00000000-0000-4000-8000-0000000000a2');
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('admitted again, they are still muted', 'muted', got);
END $$;
:as_house

-- ── 6 · turning a room private asks the founder's rank ──────────────────────
:as_guest
DO $$ DECLARE got text; v uuid; BEGIN
  INSERT INTO public.lounges (name, creator_id, is_private) VALUES ('Guest salon', auth.uid(), false) RETURNING id INTO v;
  BEGIN UPDATE public.lounges SET is_private = true WHERE id = v; got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.hk('an Archivist turns their salon private', '42501', got);
  BEGIN UPDATE public.lounges SET name = 'Guest salon, renamed' WHERE id = v; got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.hk('an Archivist still renames their public salon', 'ok', got);
END $$;
:as_house
UPDATE public.lounges SET is_private = true WHERE name = 'Guest salon, renamed'
   AND creator_id::text = current_setting('rehearsal.guest');
:as_guest
DO $$ DECLARE got text; BEGIN
  BEGIN UPDATE public.lounges SET description = 'kept' WHERE name = 'Guest salon, renamed' AND creator_id = auth.uid(); got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.hk('a room already private (from a lapsed rank) is still the founder''s to edit', 'ok', got);
  -- A settings form saves every field, the private one with it, unchanged.
  BEGIN UPDATE public.lounges SET is_private = true, description = 'kept again' WHERE name = 'Guest salon, renamed' AND creator_id = auth.uid(); got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.hk('saving that room''s whole form, still private, is allowed', 'ok', got);
END $$;
:as_house
:as_host
DO $$ DECLARE got text; BEGIN
  BEGIN UPDATE public.lounges SET is_private = true WHERE id = '00000000-0000-4000-8000-0000000000a1'; got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.hk('an Auteur turns their salon private', 'ok', got);
END $$;
:as_house

-- ── 7 · a report names the member who wrote the thing ───────────────────────
:as_guest
DO $$ DECLARE got text; r uuid; BEGIN
  r := public.submit_report(auth.uid(), current_setting('rehearsal.log')::uuid, 'log', 'spam', NULL, NULL);
  SELECT (target_user_id = (SELECT user_id FROM public.logs WHERE id = current_setting('rehearsal.log')::uuid))::text
    INTO got FROM public.reports WHERE id = r;
  PERFORM pg_temp.hk('a report sent without a member names the log''s writer', 'true', coalesce(got, 'null'));
  r := public.submit_report(auth.uid(), '00000000-0000-4000-8000-0000000000a1', 'lounge', 'spam', NULL, auth.uid());
  SELECT target_user_id::text INTO got FROM public.reports WHERE id = r;
  PERFORM pg_temp.hk('a report naming the wrong member names the room''s host', current_setting('rehearsal.host'), coalesce(got, 'null'));
  BEGIN PERFORM public.submit_report(auth.uid(), auth.uid(), 'profile', 'spam', NULL, NULL); got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('a member still cannot report their own profile', 'Cannot report your own profile', got);
END $$;
:as_house

-- ── 8 · a profile is made and closed by the house alone ─────────────────────
:as_guest
DO $$ DECLARE got text; BEGIN
  BEGIN DELETE FROM public.profiles WHERE id = auth.uid(); got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.hk('a member deletes their own profile row', '42501', got);
END $$;
:as_house
DO $$ BEGIN
  PERFORM pg_temp.hk('members hold no INSERT or DELETE on profiles, by table or column', '00', (
    SELECT count(*)::text FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND grantee IN ('anon', 'authenticated') AND privilege_type = 'INSERT')
    || (SELECT count(*)::text FROM information_schema.table_privileges
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'DELETE'))
    );
END $$;

-- ── 9 · every sanction already given is kept ────────────────────────────────
DO $$ BEGIN
  PERFORM pg_temp.hk('the sanctions given before the fix are all recorded',
    (SELECT sanctioned::text FROM hk_before),
    (SELECT count(*)::text FROM public.lounge_sanctions s
      WHERE s.lounge_id NOT IN ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2')));
EXCEPTION WHEN undefined_table THEN
  PERFORM pg_temp.hk('the sanctions given before the fix are all recorded', (SELECT sanctioned::text FROM hk_before), 'no table');
END $$;

:as_guest
DO $$ DECLARE got text; BEGIN
  DELETE FROM public.lounge_members WHERE lounge_id = '00000000-0000-4000-8000-0000000000a0' AND user_id = auth.uid();
  BEGIN PERFORM public.join_public_lounge('00000000-0000-4000-8000-0000000000a0'); got := pg_temp.seat('00000000-0000-4000-8000-0000000000a0');
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('a guest muted before the fix who leaves comes back muted', 'muted', got);
END $$;
:as_house

-- ── 10 · a frozen name is refused aloud ─────────────────────────────────────
:as_guest
DO $$ DECLARE got text; BEGIN
  BEGIN UPDATE public.profiles SET bio = 'rehearsal bio' WHERE id = auth.uid(); got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('a member in good standing edits their bio', 'ok', got);
END $$;
:as_house
UPDATE public.profiles SET suspended_until = '2099-01-01 12:00+00' WHERE id::text = current_setting('rehearsal.guest');
:as_guest
DO $$ DECLARE got text; BEGIN
  BEGIN UPDATE public.profiles SET bio = 'rehearsal bio, suspended' WHERE id = auth.uid(); got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('a suspended member editing their bio is told so', 'Your account is suspended until 01 Jan 2099 12:00 UTC.', got);
  BEGIN UPDATE public.profiles SET is_social_private = NOT coalesce(is_social_private, false) WHERE id = auth.uid(); got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('a suspended member may still change their privacy', 'ok', got);
  BEGIN UPDATE public.lounges SET name = 'Suspended rename' WHERE creator_id = auth.uid() AND name = 'Guest salon, renamed'; got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('a suspended host renaming their salon is told so', 'Your account is suspended until 01 Jan 2099 12:00 UTC.', got);
  -- Leaving recounts the room (an UPDATE of the lounge, as this member): never gated.
  BEGIN DELETE FROM public.lounge_members WHERE lounge_id = '00000000-0000-4000-8000-0000000000a1' AND user_id = auth.uid();
    got := pg_temp.seat('00000000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.hk('a suspended member may still leave a salon', 'none', got);
END $$;
:as_house
DO $$ BEGIN
  PERFORM pg_temp.hk('the suspended bio is unchanged', 'rehearsal bio',
    (SELECT bio FROM public.profiles WHERE id::text = current_setting('rehearsal.guest')));
END $$;

DO $$ BEGIN RAISE NOTICE 'FAILED: %', (SELECT count(*) FROM hk_misses); END $$;
ROLLBACK;
