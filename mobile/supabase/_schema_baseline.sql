-- ════════════════════════════════════════════════════════════════════════════
-- _schema_baseline.sql — REFERENCE SNAPSHOT of the live PRODUCTION schema
-- ════════════════════════════════════════════════════════════════════════════
-- Generated 2026-06-27 via pg_dump (--schema-only --schema=public --no-owner)
-- from production (project wihyqkpoymwcvbprslyz, Postgres 17.6).
-- 60 functions · 121 policies · 36 tables.
--
-- WHY: the live DB was built outside the migration system (empty migration
-- history — see migrations/WAVE0_LIVE_NOTES.md), so the dated migration files do
-- NOT fully describe production. This file does — it's the repo's source-of-truth
-- snapshot of what actually exists live.
--
-- ⚠️ READ-ONLY REFERENCE. Do NOT `supabase db push` or replay this against
-- production. To refresh after a schema change, re-run pg_dump against the pooler
-- (session mode, port 5432) into this same path.
-- ════════════════════════════════════════════════════════════════════════════

--
-- PostgreSQL database dump
--

\restrict ximUOkxKGfizNKZlhwlehURJTbHHZALRzl9Z6l3nmG8E1wlzMLBfQFsEbVkBXMb

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: accept_follow_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_follow_request(requester_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Convert follow_request → follow
  UPDATE public.interactions
  SET type = 'follow'
  WHERE user_id = requester_id
    AND target_user_id = auth.uid()
    AND type = 'follow_request';

  -- Increment follower count for current user
  UPDATE public.profiles
  SET followers_count = COALESCE(followers_count, 0) + 1
  WHERE id = auth.uid();

  -- Increment following count for the requester
  UPDATE public.profiles
  SET following_count = COALESCE(following_count, 0) + 1
  WHERE id = requester_id;
END;
$$;


--
-- Name: batch_insert_list_items(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch_insert_list_items(p_list_id uuid, p_owner_id uuid, p_items jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE item jsonb; inserted_count integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lists WHERE id = p_list_id AND user_id = p_owner_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      INSERT INTO list_items (list_id, film_id, film_title, poster_path)
      VALUES (p_list_id, (item->>'film_id')::integer, item->>'film_title', item->>'poster_path')
      ON CONFLICT (list_id, film_id) DO NOTHING;
      IF FOUND THEN inserted_count := inserted_count + 1; END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN inserted_count;
END; $$;


--
-- Name: book_showtime_seat(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.book_showtime_seat(p_showtime_id uuid, p_slot_id text, p_seat_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_slots JSONB;
    v_slot JSONB;
    v_updated_slots JSONB;
    v_found BOOLEAN := FALSE;
    v_idx INT := 0;
BEGIN
    -- 1. Fetch the current slots array for the showtime
    SELECT slots INTO v_slots
    FROM public.showtimes
    WHERE id = p_showtime_id;

    IF v_slots IS NULL THEN
        RAISE EXCEPTION 'Showtime not found.';
    END IF;

    -- 2. Find the slot and append the seat
    -- We must reconstruct the JSONB array manually in PL/pgSQL
    SELECT jsonb_agg(
        CASE
            WHEN elem->>'id' = p_slot_id THEN
                -- Check if seat already exists in bookedSeats array
                CASE 
                    WHEN (elem->'bookedSeats') ? p_seat_id THEN
                        elem  -- Seat is already booked! Do nothing.
                    ELSE
                        -- Append seat to the bookedSeats array
                        jsonb_set(
                            elem,
                            '{bookedSeats}',
                            COALESCE(elem->'bookedSeats', '[]'::jsonb) || to_jsonb(p_seat_id)
                        )
                END
            ELSE
                elem
        END
    ) INTO v_updated_slots
    FROM jsonb_array_elements(v_slots) AS elem;

    -- 3. Only update if something changed (prevents double bookings)
    IF v_slots != COALESCE(v_updated_slots, '[]'::jsonb) THEN
        UPDATE public.showtimes
        SET slots = v_updated_slots
        WHERE id = p_showtime_id;
    END IF;

    RETURN v_updated_slots;
END;
$$;


--
-- Name: bulk_dismiss_reports(uuid[], uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_dismiss_reports(p_report_ids uuid[], p_admin_id uuid, p_reason text DEFAULT 'Bulk dismissed'::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  UPDATE reports
  SET status = 'resolved', resolved_at = now(), resolved_by = v_admin_id, resolution_action = 'dismiss'
  WHERE id = ANY(p_report_ids) AND status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason)
  SELECT r.id, r.target_user_id, v_admin_id, 'dismiss', p_reason
  FROM reports r WHERE r.id = ANY(p_report_ids);

  RETURN v_count;
END;
$$;


--
-- Name: can_view_user_data(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_user_data(target_uid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  is_private boolean;
  is_following boolean;
BEGIN
  IF auth.uid() = target_uid THEN
    RETURN TRUE;
  END IF;
  SELECT is_social_private INTO is_private FROM public.profiles WHERE id = target_uid;
  IF NOT COALESCE(is_private, false) THEN
    RETURN TRUE;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.interactions
    WHERE type = 'follow' AND user_id = auth.uid() AND target_user_id = target_uid
  ) INTO is_following;
  RETURN is_following;
END;
$$;


--
-- Name: check_interaction_rate_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_interaction_rate_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM interactions 
    WHERE user_id = NEW.user_id 
    AND created_at > (NOW() - INTERVAL '1 second')
  ) THEN
    RAISE EXCEPTION 'PGRST301: Too many requests. Please wait a moment.';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: claim_founding_seat(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_founding_seat(p_user_id uuid, p_max_seats integer DEFAULT 100) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_seats_claimed INTEGER;
  v_already_founding BOOLEAN;
BEGIN
  SELECT is_founding INTO v_already_founding
  FROM public.profiles WHERE id = p_user_id;

  IF v_already_founding THEN
    RETURN true;
  END IF;

  SELECT seats_claimed INTO v_seats_claimed
  FROM public.founding_seat_counter
  WHERE id = 1
  FOR UPDATE;

  IF v_seats_claimed >= p_max_seats THEN
    RETURN false;
  END IF;

  UPDATE public.founding_seat_counter
  SET seats_claimed = seats_claimed + 1
  WHERE id = 1;

  UPDATE public.profiles
  SET is_founding = true
  WHERE id = p_user_id;

  RETURN true;
END;
$$;


--
-- Name: create_lounge_with_member(text, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_lounge_with_member(p_name text, p_description text, p_is_private boolean, p_invite_code text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_lounge_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.lounges (name, description, is_private, invite_code, creator_id, member_count)
  VALUES (p_name, p_description, p_is_private, p_invite_code, v_user_id, 0)
  RETURNING id INTO v_lounge_id;

  INSERT INTO public.lounge_members (lounge_id, user_id)
  VALUES (v_lounge_id, v_user_id);

  RETURN v_lounge_id;
END;
$$;


--
-- Name: decline_follow_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decline_follow_request(requester_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.interactions
  WHERE user_id = requester_id
    AND target_user_id = auth.uid()
    AND type = 'follow_request';
END;
$$;


--
-- Name: decrement_follow_counts(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_follow_counts(follower_id uuid, followed_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
  begin  update public.profiles set following_count = greatest(0, following_count - 1) where id = follower_id;
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = followed_id;
    end;
    $$;


--
-- Name: delete_list_cascade(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_list_cascade(p_list_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  SELECT user_id INTO v_owner_id
  FROM lists
  WHERE id = p_list_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'List not found';
  END IF;

  IF v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: you do not own this list';
  END IF;

  DELETE FROM list_items WHERE list_id = p_list_id;
  DELETE FROM list_comments WHERE list_id = p_list_id;
  DELETE FROM interactions WHERE target_list_id = p_list_id;
  DELETE FROM lists WHERE id = p_list_id;
END;
$$;


--
-- Name: enforce_privacy_on_follow(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_privacy_on_follow() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_is_private BOOLEAN;
BEGIN
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


--
-- Name: enforce_username_policy(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_username_policy() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  reserved text[] := ARRAY[
    'admin','administrator','mod','moderator','support','help',
    'reelhouse','system','root','official','staff','team','bot',
    'null','undefined','anonymous','anon','deleted','unknown',
    'api','www','mail','email','noreply','no_reply',
    'settings','login','signup','logout','feed','discover',
    'profile','edit','delete','create','new','user','users'
  ];
  v_norm text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN
    RETURN NEW;
  END IF;

  v_norm := lower(coalesce(NEW.username, ''));

  IF TG_OP = 'UPDATE' THEN
    IF v_norm = ANY(reserved) THEN
      RAISE EXCEPTION 'This username is reserved.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF v_norm = ANY(reserved)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_norm AND id <> NEW.id) THEN
    NEW.username := NEW.username || '_' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: get_community_feed_auth_cursor(integer, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_community_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler
  FROM logs l
  JOIN profiles p ON p.id = l.user_id
  WHERE l.review IS NOT NULL
    AND l.review <> ''
    AND (auth.uid() IS NULL OR NOT is_hidden_by(auth.uid(), l.user_id))
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;


--
-- Name: get_email_by_username(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_email_by_username(lookup_username text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  found_email TEXT;
BEGIN
  SELECT au.email INTO found_email
  FROM auth.users au
  INNER JOIN public.profiles p ON p.id = au.id
  WHERE LOWER(p.username) = LOWER(lookup_username)
  LIMIT 1;
  
  RETURN found_email;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    film_id integer NOT NULL,
    film_title text NOT NULL,
    rating numeric,
    review text,
    watched_date date NOT NULL,
    format text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    poster_path text,
    year text,
    status text DEFAULT 'watched'::text,
    is_spoiler boolean DEFAULT false,
    watched_with text,
    private_notes text,
    abandoned_reason text,
    physical_media text,
    is_autopsied boolean DEFAULT false,
    autopsy jsonb,
    alt_poster text,
    editorial_header text,
    drop_cap boolean DEFAULT false,
    pull_quote text,
    updated_at timestamp with time zone DEFAULT now(),
    video_url text,
    viewing_history jsonb DEFAULT '[]'::jsonb,
    view_count integer DEFAULT 1,
    CONSTRAINT check_rating_range CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric))),
    CONSTRAINT check_title_not_empty CHECK (((film_title IS NOT NULL) AND (film_title <> ''::text))),
    CONSTRAINT logs_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric)))
);


--
-- Name: get_featured_critique(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_featured_critique() RETURNS SETOF public.logs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.logs
  WHERE review IS NOT NULL
    AND review != ''
    AND LENGTH(review) > 100
    AND rating >= 4
  ORDER BY created_at DESC
  LIMIT 1;
END;
$$;


--
-- Name: get_filtered_stacks_auth_cursor(text, boolean, integer, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_filtered_stacks_auth_cursor(p_search text DEFAULT ''::text, p_filter_following boolean DEFAULT false, p_limit integer DEFAULT 60, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid, created_at timestamp with time zone, films jsonb, certify_count bigint, is_ranked boolean)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    l.id, l.title, l.description,
    p.username, l.user_id, l.created_at,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object('id', li.film_id, 'title', li.film_title, 'poster_path', li.poster_path)
        ORDER BY li.created_at ASC
      )
      FROM list_items li WHERE li.list_id = l.id),
      '[]'::jsonb
    ) AS films,
    (SELECT COUNT(*) FROM interactions i
     WHERE i.target_list_id = l.id AND i.type = 'endorse_list') AS certify_count,
    l.is_ranked
  FROM lists l
  JOIN profiles p ON p.id = l.user_id
  WHERE l.is_private = false
    AND (auth.uid() IS NULL OR NOT is_hidden_by(auth.uid(), l.user_id))
    -- Search filter
    AND (
      p_search = ''
      OR l.title ILIKE '%' || p_search || '%'
      OR p.username ILIKE '%' || p_search || '%'
    )
    -- Following filter (JOIN safely if requested)
    AND (
      p_filter_following = false
      OR EXISTS (
        SELECT 1 FROM interactions i
        WHERE i.target_user_id = l.user_id
          AND i.user_id = auth.uid()
          AND i.type = 'follow'
      )
    )
    -- Cursor pagination
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;


--
-- Name: get_filtered_stacks_cursor(text, text[], integer, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_filtered_stacks_cursor(p_search text DEFAULT ''::text, p_following text[] DEFAULT '{}'::text[], p_limit integer DEFAULT 60, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid, created_at timestamp with time zone, films jsonb, certify_count bigint, is_ranked boolean)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    l.id, l.title, l.description,
    p.username, l.user_id, l.created_at,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object('id', li.film_id, 'title', li.film_title, 'poster_path', li.poster_path)
        ORDER BY li.created_at ASC
      )
      FROM list_items li WHERE li.list_id = l.id),
      '[]'::jsonb
    ) AS films,
    (SELECT COUNT(*) FROM interactions i
     WHERE i.target_list_id = l.id AND i.type = 'endorse_list') AS certify_count,
    l.is_ranked
  FROM lists l
  JOIN profiles p ON p.id = l.user_id
  WHERE l.is_private = false
    AND (
      p_search = ''
      OR l.title ILIKE '%' || p_search || '%'
      OR p.username ILIKE '%' || p_search || '%'
    )
    AND (
      array_length(p_following, 1) IS NULL
      OR p.username = ANY(p_following)
    )
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;


--
-- Name: get_following_feed(text[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_following_feed(p_usernames text[], p_limit integer DEFAULT 40, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, created_at timestamp with time zone, year text, user_id uuid, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, username text, avatar_url text, role text)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    l.id,
    l.film_id,
    l.film_title,
    l.poster_path,
    l.rating,
    l.review,
    l.drop_cap,
    l.status,
    l.created_at,
    l.year,
    l.user_id,
    l.editorial_header,
    l.pull_quote,
    l.watched_with,
    l.is_autopsied,
    l.autopsy,
    p.username,
    p.avatar_url,
    p.role
  FROM logs l
  INNER JOIN profiles p ON p.id = l.user_id
  WHERE p.username = ANY(p_usernames)
    AND l.review IS NOT NULL
    AND l.review <> ''
  ORDER BY l.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;


--
-- Name: get_following_feed_auth_cursor(integer, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_following_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler
  FROM logs l
  JOIN profiles p ON p.id = l.user_id
  JOIN interactions i ON i.target_user_id = l.user_id AND i.type = 'follow'
  WHERE i.user_id = auth.uid()
    AND l.review IS NOT NULL
    AND l.review <> ''
    AND NOT is_hidden_by(auth.uid(), l.user_id)
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;


--
-- Name: get_following_feed_cursor(text[], integer, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_following_feed_cursor(p_usernames text[], p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy
  FROM logs l
  JOIN profiles p ON p.id = l.user_id
  WHERE p.username = ANY(p_usernames)
    AND l.review IS NOT NULL
    AND l.review <> ''
    AND (
      p_cursor_created_at IS NULL
      OR
      (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;


--
-- Name: get_lounge_unread_counts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_lounge_unread_counts(p_user_id uuid) RETURNS TABLE(lounge_id uuid, unread_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        lm.lounge_id,
        COUNT(msg.id) AS unread_count
    FROM public.lounge_members lm
    LEFT JOIN public.lounge_messages msg
        ON msg.lounge_id = lm.lounge_id
        AND msg.created_at > COALESCE(lm.last_read_at, '1970-01-01'::timestamp)
        AND msg.user_id != p_user_id
    WHERE lm.user_id = p_user_id
    GROUP BY lm.lounge_id
    HAVING COUNT(msg.id) > 0;
END;
$$;


--
-- Name: get_priority_reports(integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_priority_reports(p_limit integer DEFAULT 20, p_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(id uuid, content_id uuid, content_type text, reason text, details text, reporter_id uuid, target_user_id uuid, created_at timestamp with time zone, report_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.content_id,
    r.content_type,
    r.reason,
    r.details,
    r.reporter_id,
    r.target_user_id,
    r.created_at,
    COUNT(*) OVER (PARTITION BY r.content_id) AS report_count
  FROM reports r
  WHERE r.status = 'pending'
    AND (p_cursor IS NULL OR r.created_at < p_cursor)
  ORDER BY report_count DESC, r.created_at ASC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_profile_counts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_counts(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN json_build_object(
        'logs', (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id),
        'ledger', (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id AND (rating > 0 OR review IS NOT NULL)),
        'watchlist', (SELECT COUNT(*) FROM watchlists WHERE user_id = p_user_id),
        'vault', (SELECT COUNT(*) FROM physical_archive WHERE user_id = p_user_id),
        'lists', (SELECT COUNT(*) FROM lists WHERE user_id = p_user_id AND is_private = false)
    );
END;
$$;


--
-- Name: get_profile_metrics(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_metrics(uid uuid) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    total_logs int;
    avg_rating numeric;
    decades json;
    autopsy_avg json;
    result json;
BEGIN
    -- 1. Get total logs and global average rating (ignoring 0 ratings)
    SELECT COUNT(*), COALESCE(AVG(NULLIF(rating, 0)), 0)
    INTO total_logs, avg_rating
    FROM logs
    WHERE user_id = uid;

    -- 2. Aggregate Decades (e.g., "1990s": 14, "2000s": 42)
    SELECT json_object_agg(decade, count) INTO decades
    FROM (
        SELECT CONCAT(FLOOR(year / 10) * 10, 's') AS decade, COUNT(*) as count
        FROM logs
        WHERE user_id = uid AND year IS NOT NULL
        GROUP BY FLOOR(year / 10) * 10
        ORDER BY count DESC
    ) AS decade_counts;

    -- 3. Aggregate Autopsy Radar Chart Averages
    SELECT json_build_object(
        'story', COALESCE(AVG((autopsy->>'story')::numeric), 0),
        'cinematography', COALESCE(AVG((autopsy->>'cinematography')::numeric), 0),
        'sound', COALESCE(AVG((autopsy->>'sound')::numeric), 0),
        'pacing', COALESCE(AVG((autopsy->>'pacing')::numeric), 0)
    ) INTO autopsy_avg
    FROM logs
    WHERE user_id = uid AND is_autopsied = true AND autopsy IS NOT NULL;

    -- Construct final JSON response to send over the wire (8KB instead of 5MB)
    result := json_build_object(
        'total_logs', total_logs,
        'avg_rating', avg_rating,
        'decades', COALESCE(decades, '{}'::json),
        'avg_autopsy', autopsy_avg
    );

    RETURN result;
END;
$$;


--
-- Name: get_public_profile_analytics(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_profile_analytics(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  SELECT CASE
    WHEN auth.uid() IS NULL OR NOT public.can_view_user_data(p_user_id)
      THEN '{"error": "forbidden"}'::jsonb
    ELSE (
      WITH user_logs AS (
        SELECT *,
          CASE WHEN year::text ~ '^\d+$' THEN year::text::int END AS year_int
        FROM public.logs WHERE user_id = p_user_id
      ),
      stamps AS (
        SELECT
          COUNT(*) AS total_logs,
          COUNT(*) FILTER (WHERE year_int < 1960) AS pre_1960_count,
          COUNT(*) FILTER (WHERE rating = 5) AS perfect_ratings_count,
          bool_or(physical_media IS NOT NULL) AS has_physical_media,
          bool_or(status = 'abandoned') AS has_abandoned,
          COUNT(DISTINCT (year_int / 10) * 10) FILTER (WHERE year_int IS NOT NULL) AS decades_logged_count,
          EXISTS(SELECT 1 FROM user_logs GROUP BY film_id HAVING COUNT(*) > 1) AS has_rewatched
        FROM user_logs
      ),
      decades AS (
        SELECT (year_int / 10) * 10 AS decade, COUNT(*) AS c
        FROM user_logs
        WHERE year_int IS NOT NULL
        GROUP BY decade
        ORDER BY c DESC
        LIMIT 3
      ),
      dna AS (
        SELECT
          AVG(rating) FILTER (WHERE rating > 0) AS avg_rating,
          (SELECT jsonb_agg(jsonb_build_object(d.decade::text || 's', d.c)) FROM decades d) AS top_decades
        FROM user_logs
      ),
      autopsies AS (
        SELECT
          AVG(COALESCE((autopsy::jsonb)->>'story', (autopsy::jsonb)->>'screenplay', (autopsy::jsonb)->>'script')::numeric) AS avg_story,
          AVG(COALESCE((autopsy::jsonb)->>'cinematography', (autopsy::jsonb)->>'visuals', (autopsy::jsonb)->>'acting')::numeric) AS avg_cinematography,
          AVG(COALESCE((autopsy::jsonb)->>'sound', (autopsy::jsonb)->>'score', (autopsy::jsonb)->>'editing')::numeric) AS avg_sound
        FROM user_logs
        WHERE is_autopsied = true AND autopsy IS NOT NULL
      )
      SELECT jsonb_build_object(
        'stamps', (SELECT to_jsonb(s.*) FROM stamps s),
        'dna', (SELECT to_jsonb(d.*) FROM dna d),
        'autopsy_math', (SELECT to_jsonb(a.*) FROM autopsies a)
      )
    )
  END;
$_$;


--
-- Name: get_user_analytics(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_analytics(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    -- Total log count
    'total_logs', (
      SELECT COUNT(*) FROM logs WHERE user_id = p_user_id
    ),

    -- Average rating (exclude 0-rated entries)
    'avg_rating', (
      SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)
      FROM logs WHERE user_id = p_user_id AND rating > 0
    ),

    -- Rating distribution (1-5 stars)
    'rating_distribution', (
      SELECT COALESCE(json_agg(row_to_json(rd)), '[]'::json)
      FROM (
        SELECT rating, COUNT(*) as count
        FROM logs
        WHERE user_id = p_user_id AND rating > 0
        GROUP BY rating
        ORDER BY rating
      ) rd
    ),

    -- Monthly activity (last 12 months)
    'monthly_activity', (
      SELECT COALESCE(json_agg(row_to_json(ma)), '[]'::json)
      FROM (
        SELECT TO_CHAR(
          COALESCE(watched_date::date, created_at::date), 'YYYY-MM'
        ) as month,
        COUNT(*) as count
        FROM logs
        WHERE user_id = p_user_id
          AND COALESCE(watched_date::date, created_at::date) >= NOW() - INTERVAL '12 months'
        GROUP BY month
        ORDER BY month
      ) ma
    ),

    -- Current daily streak
    'current_streak', (
      WITH dates AS (
        SELECT DISTINCT COALESCE(watched_date::date, created_at::date) as log_date
        FROM logs WHERE user_id = p_user_id
      ),
      streak AS (
        SELECT log_date,
               log_date - (ROW_NUMBER() OVER (ORDER BY log_date DESC))::int AS grp
        FROM dates
        WHERE log_date >= CURRENT_DATE - 365
      )
      SELECT COALESCE(MAX(cnt), 0)
      FROM (
        SELECT grp, COUNT(*) as cnt
        FROM streak
        WHERE grp = (SELECT grp FROM streak WHERE log_date >= CURRENT_DATE - 1 LIMIT 1)
        GROUP BY grp
      ) s
    ),

    -- Longest ever streak
    'longest_streak', (
      WITH dates AS (
        SELECT DISTINCT COALESCE(watched_date::date, created_at::date) as log_date
        FROM logs WHERE user_id = p_user_id
      ),
      streak AS (
        SELECT log_date,
               log_date - (ROW_NUMBER() OVER (ORDER BY log_date))::int AS grp
        FROM dates
      )
      SELECT COALESCE(MAX(cnt), 0)
      FROM (
        SELECT COUNT(*) as cnt FROM streak GROUP BY grp
      ) s
    ),

    -- Format breakdown (physical media)
    'format_breakdown', (
      SELECT COALESCE(json_agg(row_to_json(fb)), '[]'::json)
      FROM (
        SELECT format, COUNT(*) as count
        FROM logs
        WHERE user_id = p_user_id AND format IS NOT NULL AND format != ''
        GROUP BY format
        ORDER BY count DESC
      ) fb
    )
  ) INTO result;

  RETURN result;
END;
$$;


--
-- Name: get_user_blocks(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_blocks(p_user_id uuid) RETURNS TABLE(blocked_id uuid, type text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT ub.blocked_id, ub.type, ub.created_at
  FROM user_blocks ub
  WHERE ub.blocker_id = p_user_id
  ORDER BY ub.created_at DESC;
$$;


--
-- Name: get_user_lounges(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_lounges(p_user_id uuid) RETURNS TABLE(id uuid, name text, description text, is_private boolean, invite_code text, creator_id uuid, created_at timestamp with time zone, member_count integer, is_member boolean, unread_count bigint, last_message_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH
    my_memberships AS (
      SELECT lm.lounge_id, lm.last_read_at
      FROM lounge_members lm WHERE lm.user_id = p_user_id
    ),
    visible_lounges AS (
      SELECT DISTINCT ON (l.id)
        l.id, l.name, l.description, l.is_private, l.invite_code,
        l.creator_id, l.created_at, l.member_count,
        (mm.lounge_id IS NOT NULL OR l.creator_id = p_user_id) AS is_member
      FROM lounges l
      LEFT JOIN my_memberships mm ON mm.lounge_id = l.id
      WHERE TRUE OR mm.lounge_id IS NOT NULL OR l.creator_id = p_user_id
      ORDER BY l.id
    ),
    last_msgs AS (
      SELECT DISTINCT ON (lmsg.lounge_id)
        lmsg.lounge_id, lmsg.created_at AS last_msg_at
      FROM lounge_messages lmsg
      WHERE lmsg.lounge_id IN (SELECT vl.id FROM visible_lounges vl)
      ORDER BY lmsg.lounge_id, lmsg.created_at DESC
    ),
    unread AS (
      SELECT lmsg.lounge_id, COUNT(*) AS cnt
      FROM lounge_messages lmsg
      JOIN my_memberships mm ON mm.lounge_id = lmsg.lounge_id
      WHERE mm.last_read_at IS NULL OR lmsg.created_at > mm.last_read_at
      GROUP BY lmsg.lounge_id
    )
  SELECT vl.id, vl.name, vl.description, vl.is_private, vl.invite_code,
    vl.creator_id, vl.created_at, vl.member_count, vl.is_member,
    COALESCE(u.cnt, 0) AS unread_count, lm.last_msg_at AS last_message_at
  FROM visible_lounges vl
  LEFT JOIN last_msgs lm ON lm.lounge_id = vl.id
  LEFT JOIN unread u ON u.lounge_id = vl.id
  ORDER BY COALESCE(lm.last_msg_at, vl.created_at) DESC
  LIMIT 50;
END;
$$;


--
-- Name: handle_follow_count_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_follow_count_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$ BEGIN IF TG_OP = 'INSERT' AND NEW.type = 'follow' THEN UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.user_id; UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = NEW.target_user_id; ELSIF TG_OP = 'DELETE' AND OLD.type = 'follow' THEN UPDATE public.profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.user_id; UPDATE public.profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.target_user_id; END IF; RETURN COALESCE(NEW, OLD); END; $$;


--
-- Name: handle_interaction_removal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_interaction_removal() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- 1. UNFOLLOW (Clean up counts safely avoiding NULLs)
  IF OLD.type = 'follow' AND OLD.target_user_id IS NOT NULL THEN
    UPDATE public.profiles SET followers_count = GREATEST(0, COALESCE(followers_count, 0) - 1) WHERE id = OLD.target_user_id;
    UPDATE public.profiles SET following_count = GREATEST(0, COALESCE(following_count, 0) - 1) WHERE id = OLD.user_id;
  END IF;

  -- 2. CANCEL/DECLINE REQUEST (Clean up ghost notification)
  IF OLD.type = 'follow_request' AND OLD.target_user_id IS NOT NULL THEN
    DELETE FROM public.notifications 
    WHERE user_id = OLD.target_user_id AND from_user_id = OLD.user_id AND type = 'follow_request';
  END IF;

  RETURN OLD;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role, email, preferences)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    CASE WHEN NEW.raw_user_meta_data->>'role' = 'venue_owner' THEN 'venue_owner' ELSE 'cinephile' END,
    NEW.email,
    '{}'::JSONB
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: handle_privacy_switch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_privacy_switch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_updated_user_ids UUID[];
    v_count INT;
BEGIN
    -- If switching from Private (true) to Public (false)
    IF OLD.is_social_private = true AND NEW.is_social_private = false THEN
        
        -- 1. Bulk update interactions and capture the affected user_ids
        WITH updated AS (
            UPDATE public.interactions 
            SET type = 'follow' 
            WHERE target_user_id = NEW.id AND type = 'follow_request'
            RETURNING user_id
        )
        SELECT array_agg(user_id), count(*) INTO v_updated_user_ids, v_count
        FROM updated;

        IF v_count > 0 THEN
            -- 2. Increment target user's followers_count atomically in memory
            NEW.followers_count := COALESCE(NEW.followers_count, 0) + v_count;
            
            -- 3. Bulk increment following_count for all requesters
            UPDATE public.profiles 
            SET following_count = COALESCE(following_count, 0) + 1 
            WHERE id = ANY(v_updated_user_ids);
            
            -- 4. Bulk insert acceptance notifications
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            SELECT u_id, 'follow_accept', NEW.username, NEW.id, 'accepted your follow request. You can now view their archive.'
            FROM unnest(v_updated_user_ids) AS u_id;
            
            -- 5. Bulk delete the pending request notifications for the target user
            DELETE FROM public.notifications 
            WHERE user_id = NEW.id AND type = 'follow_request' AND from_user_id = ANY(v_updated_user_ids);
        END IF;
        
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: handle_user_deletion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_user_deletion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM public.logs WHERE user_id = OLD.id;
  DELETE FROM public.watchlists WHERE user_id = OLD.id;
  DELETE FROM public.lists WHERE user_id = OLD.id;
  DELETE FROM public.interactions WHERE user_id = OLD.id;
  DELETE FROM public.notifications WHERE user_id = OLD.id;
  DELETE FROM public.tickets WHERE user_id = OLD.id;
  DELETE FROM public.vaults WHERE user_id = OLD.id;
  DELETE FROM public.profiles WHERE id = OLD.id;
  RETURN OLD;
END;
$$;


--
-- Name: increment_dossier_views(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_dossier_views(dossier_uuid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.dispatch_dossiers
  SET views = COALESCE(views, 0) + 1
  WHERE id = dossier_uuid;
END;
$$;


--
-- Name: increment_follow_counts(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_follow_counts(follower_id uuid, followed_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin  update public.profiles set following_count = following_count + 1 where id = follower_id;
  update public.profiles set followers_count = followers_count + 1 where id = followed_id;
  end;
  $$;


--
-- Name: increment_video_tips(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_video_tips() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.video_reviews
    SET tip_total = tip_total + NEW.amount
    WHERE id = NEW.video_id;
    RETURN NEW;
END;
$$;


--
-- Name: increment_video_views(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_video_views(p_video_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
    UPDATE video_reviews
    SET views = COALESCE(views, 0) + 1
    WHERE id = p_video_id;
$$;


--
-- Name: is_blocked_by(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_blocked_by(viewer_id uuid, author_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_blocks 
    WHERE blocker_id = viewer_id AND blocked_id = author_id AND type = 'block'
  );
$$;


--
-- Name: is_hidden_by(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_hidden_by(viewer_id uuid, author_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_blocks
    WHERE blocker_id = viewer_id AND blocked_id = author_id
  );
$$;


--
-- Name: is_user_not_banned(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_user_not_banned() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_banned = true
  );
END;
$$;


--
-- Name: notify_on_interaction(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_on_interaction() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
    notif_message TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;

    IF NEW.type = 'follow' THEN
        target_user := NEW.target_user_id;
        notif_message := 'started following your frequency.';
        
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            VALUES (target_user, 'follow', sender_user, NEW.user_id, notif_message);
        END IF;

    ELSIF NEW.type = 'follow_request' THEN
        target_user := NEW.target_user_id;
        notif_message := 'requested to follow you.';
        
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            VALUES (target_user, 'follow_request', sender_user, NEW.user_id, notif_message);
        END IF;

    ELSIF NEW.type = 'endorse_log' THEN
        SELECT user_id INTO target_user FROM public.logs WHERE id = NEW.target_log_id;
        notif_message := 'certified your dossier 🏆';
        
        IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
            INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
            VALUES (target_user, 'endorse', sender_user, NEW.user_id, notif_message);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: notify_on_list_comment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_on_list_comment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;
    SELECT user_id INTO target_user FROM public.lists WHERE id = NEW.list_id;

    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
        INSERT INTO public.notifications (user_id, type, from_username, message)
        VALUES (target_user, 'comment', sender_user, 'penned a critique on your curated list ¶');
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: notify_on_log_comment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_on_log_comment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    target_user UUID;
    sender_user TEXT;
    target_film_title TEXT;
BEGIN
    SELECT username INTO sender_user FROM public.profiles WHERE id = NEW.user_id;
    SELECT user_id, film_title INTO target_user, target_film_title FROM public.logs WHERE id = NEW.log_id;

    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
        INSERT INTO public.notifications (user_id, type, from_username, message)
        VALUES (target_user, 'comment', sender_user, 'added a critique to your log of ' || COALESCE(target_film_title, 'a film'));
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: process_secure_tip(uuid, uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_secure_tip(p_to_user_id uuid, p_video_id uuid, p_amount numeric, p_message text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_from_user_id UUID := auth.uid();
    v_from_username TEXT;
    v_tip_id UUID;
BEGIN
    -- Ensure user is authenticated
    IF v_from_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be authenticated to tip.';
    END IF;

    -- Validate tip amount
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Tip must be greater than zero.';
    END IF;

    -- Look up username securely to prevent metadata spoofing
    SELECT username INTO v_from_username
    FROM public.profiles
    WHERE id = v_from_user_id;

    -- Insert tip into ledger
    INSERT INTO public.tips (
        from_user_id,
        from_username,
        to_user_id,
        video_id,
        amount,
        message
    ) VALUES (
        v_from_user_id,
        v_from_username,
        p_to_user_id,
        p_video_id,
        p_amount,
        p_message
    ) RETURNING id INTO v_tip_id;

    RETURN v_tip_id;
END;
$$;


--
-- Name: process_user_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_user_report() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.profiles
    SET trust_score = GREATEST(trust_score - 25, 0)
    WHERE id = NEW.reported_id;
    RETURN NEW;
END;
$$;


--
-- Name: protect_video_review_metrics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_video_review_metrics() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Revert ownership or metric tampering back to their original state
  NEW.user_id = OLD.user_id;
  NEW.username = OLD.username;
  NEW.views = OLD.views;
  NEW.tip_total = OLD.tip_total;
  
  RETURN NEW;
END;
$$;


--
-- Name: rate_limit_check(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_limit_check(table_name text, user_col text, max_count integer, window_minutes integer DEFAULT 1440) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    current_count INTEGER;
BEGIN
    EXECUTE format(
        'SELECT COUNT(*) FROM %I WHERE %I = auth.uid() AND created_at > now() - interval ''%s minutes''',
        table_name, user_col, window_minutes
    ) INTO current_count;
    RETURN current_count < max_count;
END;
$$;


--
-- Name: refresh_global_feed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_global_feed() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY global_feed_materialized;
END;
$$;


--
-- Name: register_push_token(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_push_token(p_token text, p_platform text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Detach this device token from any other account.
  DELETE FROM public.push_tokens
   WHERE token = p_token AND user_id <> auth.uid();

  -- Claim it for the current user (refresh token on the existing platform row).
  INSERT INTO public.push_tokens (user_id, token, platform, updated_at)
  VALUES (auth.uid(), p_token, p_platform, now())
  ON CONFLICT (user_id, platform)
  DO UPDATE SET token = EXCLUDED.token, updated_at = now();
END;
$$;


--
-- Name: replace_list_items(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_list_items(p_list_id uuid, p_user_id uuid, p_items jsonb DEFAULT '[]'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lists WHERE id = p_list_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: list does not belong to user'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM list_items WHERE list_id = p_list_id;
  
  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO list_items (list_id, film_id, film_title, poster_path, position)
    SELECT
      p_list_id,
      (item->>'film_id')::INT,
      COALESCE(item->>'film_title', 'Unknown'),
      item->>'poster_path',
      (item->>'position')::INT
    FROM jsonb_array_elements(p_items) AS item;
  END IF;
END;
$$;


--
-- Name: FUNCTION replace_list_items(p_list_id uuid, p_user_id uuid, p_items jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.replace_list_items(p_list_id uuid, p_user_id uuid, p_items jsonb) IS 'Atomically replaces all films in a list. Used by the mobile app to prevent data loss during list edits.';


--
-- Name: request_account_deletion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_account_deletion() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.profiles
  SET is_banned = TRUE,
      ban_reason = 'USER_REQUESTED_DELETION'
  WHERE id = auth.uid();
END;
$$;


--
-- Name: resolve_moderation_report_v2(uuid, text, uuid, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_moderation_report_v2(p_report_id uuid, p_action text, p_admin_id uuid, p_reason text, p_duration_hours integer DEFAULT NULL::integer, p_notify_user boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_target_user_id uuid;
  v_reporter_id uuid;
  v_content_id uuid;
  v_content_type text;
  v_expires_at timestamptz;
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

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Report not found or already resolved';
  END IF;

  IF p_action = 'suspend' AND p_duration_hours IS NOT NULL THEN
    v_expires_at := now() + (p_duration_hours || ' hours')::interval;
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

    WHEN 'delete_content' THEN
      NULL;

    WHEN 'mute_user' THEN
      UPDATE profiles
      SET suspended_until = v_expires_at, suspension_reason = 'Muted: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'dismiss' THEN
      NULL;
  END CASE;

  INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason, duration_hours, expires_at)
  VALUES (p_report_id, v_target_user_id, v_admin_id, p_action, p_reason, p_duration_hours, v_expires_at);

  IF p_notify_user THEN
    INSERT INTO notifications (user_id, type, title, body, metadata)
    VALUES (
      v_reporter_id,
      'moderation',
      'Report Reviewed',
      'The Tribunal has reviewed your report. Action: ' || p_action,
      jsonb_build_object('report_id', p_report_id, 'action', p_action)
    );

    IF p_action != 'dismiss' THEN
      INSERT INTO notifications (user_id, type, title, body, metadata)
      VALUES (
        v_target_user_id,
        'moderation',
        'Moderation Notice',
        'The Tribunal has taken action on your account: ' || p_action || '. Reason: ' || p_reason,
        jsonb_build_object('action', p_action, 'reason', p_reason, 'expires_at', v_expires_at)
      );
    END IF;
  END IF;
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: submit_report(uuid, uuid, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_report(p_reporter_id uuid, p_content_id uuid, p_content_type text, p_reason text, p_details text DEFAULT NULL::text, p_target_user_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_reporter_id uuid := auth.uid();
  v_report_id uuid;
  v_recent_count int;
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

  IF p_content_type = 'profile' AND v_reporter_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot report your own profile';
  END IF;

  INSERT INTO reports (reporter_id, content_id, content_type, reason, details, target_user_id, status)
  VALUES (v_reporter_id, p_content_id, p_content_type, p_reason, p_details, p_target_user_id, 'pending')
  RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$$;


--
-- Name: sweep_interaction_buffer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sweep_interaction_buffer() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    batch_size INT := 5000;
BEGIN
    -- Move from buffer to permanent table securely
    WITH swept AS (
        DELETE FROM interactions_queue_buffer
        WHERE id IN (
            SELECT id FROM interactions_queue_buffer LIMIT batch_size
        )
        RETURNING *
    )
    INSERT INTO interactions (user_id, target_log_id, target_list_id, type, created_at)
    SELECT user_id, target_log_id, target_list_id, type, created_at
    FROM swept
    ON CONFLICT DO NOTHING;
END;
$$;


--
-- Name: toggle_dossier_certify(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_dossier_certify(dossier_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  existing_id UUID;
  is_certified BOOLEAN;
BEGIN
  SELECT dc.id INTO existing_id
  FROM public.dossier_certifications dc
  WHERE dc.dossier_id = dossier_uuid AND dc.user_id = auth.uid();

  IF existing_id IS NOT NULL THEN
    DELETE FROM public.dossier_certifications WHERE id = existing_id;
    UPDATE public.dispatch_dossiers SET certify_count = GREATEST(0, certify_count - 1) WHERE id = dossier_uuid;
    is_certified := FALSE;
  ELSE
    INSERT INTO public.dossier_certifications (dossier_id, user_id) VALUES (dossier_uuid, auth.uid());
    UPDATE public.dispatch_dossiers SET certify_count = COALESCE(certify_count, 0) + 1 WHERE id = dossier_uuid;
    is_certified := TRUE;
  END IF;

  RETURN is_certified;
END;
$$;


--
-- Name: update_my_display_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_my_display_name(p_display_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  IF char_length(p_display_name) > 60 THEN RAISE EXCEPTION 'Display name too long (max 60 chars).'; END IF;
  UPDATE public.profiles SET display_name = p_display_name, updated_at = NOW() WHERE id = v_user_id;
END;
$$;


--
-- Name: update_my_preferences(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_my_preferences(p_preferences jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  UPDATE public.profiles SET preferences = preferences || p_preferences, updated_at = NOW() WHERE id = v_user_id;
END;
$$;


--
-- Name: analytics_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    event_name text NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cinema_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cinema_reviews (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    cinema_id text NOT NULL,
    cinema_name text NOT NULL,
    rating numeric NOT NULL,
    review text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cinema_reviews_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric)))
);


--
-- Name: dispatch_dossiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispatch_dossiers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    author_username text NOT NULL,
    title text NOT NULL,
    excerpt text,
    full_content text,
    is_published boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    views integer DEFAULT 0,
    certify_count integer DEFAULT 0
);


--
-- Name: dossier_certifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dossier_certifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    dossier_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: dossier_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dossier_comments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    dossier_id uuid NOT NULL,
    user_id uuid NOT NULL,
    username text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    error_type text NOT NULL,
    error_message text NOT NULL,
    error_stack text,
    component text,
    url text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: founding_seat_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.founding_seat_counter (
    id smallint DEFAULT 1 NOT NULL,
    seats_claimed integer DEFAULT 0 NOT NULL,
    CONSTRAINT founding_seat_counter_singleton CHECK ((id = 1))
);


--
-- Name: interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interactions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    target_user_id uuid,
    target_log_id uuid,
    target_list_id uuid,
    type text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: interactions_queue_buffer; Type: TABLE; Schema: public; Owner: -
--

CREATE UNLOGGED TABLE public.interactions_queue_buffer (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    target_id text,
    target_log_id text,
    target_list_id text,
    type text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: list_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.list_comments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    list_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: list_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.list_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    list_id uuid NOT NULL,
    film_id integer NOT NULL,
    film_title text NOT NULL,
    rank_position integer,
    notes text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    poster_path text
);


--
-- Name: lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lists (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    is_ranked boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    is_private boolean DEFAULT false
);


--
-- Name: log_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_comments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    log_id uuid NOT NULL,
    user_id uuid NOT NULL,
    username text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lounge_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lounge_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lounge_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now(),
    joined_at timestamp with time zone DEFAULT now()
);


--
-- Name: lounge_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lounge_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lounge_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text DEFAULT ''::text,
    type text DEFAULT 'text'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    reply_to_id uuid,
    reply_to_content text,
    reply_to_username text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: lounges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lounges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text,
    creator_id uuid NOT NULL,
    is_private boolean DEFAULT false,
    invite_code text,
    cover_image text,
    member_count integer DEFAULT 1,
    max_members integer DEFAULT 50,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mod_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid,
    target_user_id uuid NOT NULL,
    admin_id uuid NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    duration_hours integer,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mod_actions_action_check CHECK ((action = ANY (ARRAY['dismiss'::text, 'delete_content'::text, 'warn'::text, 'mute_user'::text, 'suspend'::text, 'ban'::text, 'permanent_exile'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text DEFAULT 'system'::text,
    from_username text,
    message text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['follow'::text, 'endorse'::text, 'comment'::text, 'annotate'::text, 'retransmit'::text, 'system'::text, 'reaction'::text, 'follow_request'::text, 'follow_accept'::text])))
);


--
-- Name: physical_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.physical_archive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    film_id integer NOT NULL,
    film_title text NOT NULL,
    poster_path text,
    year integer,
    formats text[] DEFAULT '{}'::text[] NOT NULL,
    notes text DEFAULT ''::text,
    condition text DEFAULT 'good'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text NOT NULL,
    role text DEFAULT 'cinephile'::text,
    avatar_url text,
    bio text,
    favorite_films jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    taste_seeds jsonb DEFAULT '[]'::jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    is_social_private boolean DEFAULT false,
    tier text,
    persona text,
    followers_count integer DEFAULT 0,
    following_count integer DEFAULT 0,
    total_logs integer DEFAULT 0,
    following text[] DEFAULT '{}'::text[],
    followers text[] DEFAULT '{}'::text[],
    preferences jsonb DEFAULT '{}'::jsonb,
    display_name text,
    social_visibility text DEFAULT 'public'::text,
    badges jsonb DEFAULT '[]'::jsonb,
    current_streak integer DEFAULT 0,
    longest_streak integer DEFAULT 0,
    last_log_date date,
    email text,
    is_banned boolean DEFAULT false,
    ban_reason text DEFAULT ''::text,
    social_links jsonb DEFAULT '{}'::jsonb,
    trust_score integer DEFAULT 100,
    is_founding boolean DEFAULT false,
    suspended_until timestamp with time zone,
    suspension_reason text,
    warning_count integer DEFAULT 0 NOT NULL,
    banned_at timestamp with time zone,
    CONSTRAINT check_role_valid CHECK ((role = ANY (ARRAY['cinephile'::text, 'archivist'::text, 'auteur'::text, 'projectionist'::text, 'free'::text]))),
    CONSTRAINT check_username_not_empty CHECK (((username IS NOT NULL) AND (username <> ''::text))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['cinephile'::text, 'archivist'::text, 'auteur'::text, 'projectionist'::text]))),
    CONSTRAINT profiles_social_visibility_check CHECK ((social_visibility = ANY (ARRAY['public'::text, 'members'::text, 'private'::text])))
);


--
-- Name: programmes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programmes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    films jsonb DEFAULT '[]'::jsonb,
    is_public boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_id uuid,
    content_type text NOT NULL,
    content_id text NOT NULL,
    reason text NOT NULL,
    details text DEFAULT ''::text,
    status text DEFAULT 'pending'::text,
    resolved_by uuid,
    resolution text,
    created_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    target_user_id uuid,
    resolution_action text,
    resolution_notes text,
    CONSTRAINT reports_content_type_check CHECK ((content_type = ANY (ARRAY['log'::text, 'list'::text, 'log_comment'::text, 'list_comment'::text, 'dossier'::text, 'dossier_comment'::text, 'lounge_message'::text, 'profile'::text]))),
    CONSTRAINT reports_reason_check CHECK ((reason = ANY (ARRAY['spoiler_unmarked'::text, 'harassment'::text, 'hate_speech'::text, 'spam'::text, 'inappropriate'::text, 'impersonation'::text, 'misinformation'::text, 'copyright'::text, 'other'::text])))
);


--
-- Name: showtimes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.showtimes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    venue_id uuid NOT NULL,
    film_id integer NOT NULL,
    film_title text NOT NULL,
    date date NOT NULL,
    slots jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    screen_name text,
    duration_minutes integer
);


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    showtime_id uuid NOT NULL,
    slot_id text NOT NULL,
    seat text NOT NULL,
    ticket_type text NOT NULL,
    amount numeric NOT NULL,
    qr_code text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    screen_name text
);


--
-- Name: tips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_user_id uuid NOT NULL,
    from_username text,
    to_user_id uuid NOT NULL,
    video_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tips_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_blocks_check CHECK ((blocker_id <> blocked_id)),
    CONSTRAINT user_blocks_type_check CHECK ((type = ANY (ARRAY['block'::text, 'mute'::text])))
);


--
-- Name: user_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_id uuid,
    reported_id uuid NOT NULL,
    log_id uuid,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'actioned'::text, 'dismissed'::text])))
);


--
-- Name: vaults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vaults (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    film_id integer NOT NULL,
    film_title text NOT NULL,
    format text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    poster_path text,
    year integer
);


--
-- Name: venues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venues (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    location text NOT NULL,
    vibes jsonb DEFAULT '[]'::jsonb,
    seat_layout jsonb DEFAULT '{"cols": 15, "rows": 10, "vipRows": 2, "aisleAfterCol": 7}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    screens jsonb DEFAULT '[]'::jsonb,
    lat double precision,
    lng double precision,
    is_verified boolean DEFAULT false,
    payment_connected boolean DEFAULT false,
    platform_fee_percent integer DEFAULT 15,
    address text,
    description text,
    bio text,
    email text,
    phone text,
    website text,
    instagram text,
    logo_url text
);


--
-- Name: video_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    username text NOT NULL,
    avatar text,
    film_id integer NOT NULL,
    film_title text NOT NULL,
    film_poster text,
    title text NOT NULL,
    video_url text NOT NULL,
    thumbnail_url text,
    duration_seconds integer DEFAULT 0,
    views integer DEFAULT 0,
    tip_total numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    tier text DEFAULT 'archivist'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: warnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warnings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    admin_id uuid NOT NULL,
    reason text NOT NULL,
    acknowledged boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: watchlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlists (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    film_id integer NOT NULL,
    film_title text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    poster_path text,
    year integer
);


--
-- Name: logs logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: global_feed_materialized; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.global_feed_materialized AS
 SELECT l.id,
    l.user_id,
    p.username,
    p.avatar_url,
    p.role AS user_tier,
    l.film_id,
    l.film_title,
    l.poster_path,
    l.year,
    l.rating,
    l.review,
    l.status,
    l.watched_date,
    l.is_spoiler,
    l.created_at,
    count(i.id) FILTER (WHERE (i.type = 'endorse_log'::text)) AS endorse_count
   FROM ((public.logs l
     LEFT JOIN public.profiles p ON ((l.user_id = p.id)))
     LEFT JOIN public.interactions i ON ((l.id = i.target_log_id)))
  WHERE ((l.status <> 'abandoned'::text) AND (p.is_social_private = false) AND (l.private_notes IS NULL))
  GROUP BY l.id, p.id
  ORDER BY l.created_at DESC
  WITH NO DATA;


--
-- Name: analytics_events analytics_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (id);


--
-- Name: cinema_reviews cinema_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cinema_reviews
    ADD CONSTRAINT cinema_reviews_pkey PRIMARY KEY (id);


--
-- Name: cinema_reviews cinema_reviews_user_id_cinema_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cinema_reviews
    ADD CONSTRAINT cinema_reviews_user_id_cinema_id_key UNIQUE (user_id, cinema_id);


--
-- Name: dispatch_dossiers dispatch_dossiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatch_dossiers
    ADD CONSTRAINT dispatch_dossiers_pkey PRIMARY KEY (id);


--
-- Name: dossier_certifications dossier_certifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_certifications
    ADD CONSTRAINT dossier_certifications_pkey PRIMARY KEY (id);


--
-- Name: dossier_certifications dossier_certifications_user_id_dossier_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_certifications
    ADD CONSTRAINT dossier_certifications_user_id_dossier_id_key UNIQUE (user_id, dossier_id);


--
-- Name: dossier_comments dossier_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_comments
    ADD CONSTRAINT dossier_comments_pkey PRIMARY KEY (id);


--
-- Name: error_logs error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (id);


--
-- Name: founding_seat_counter founding_seat_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founding_seat_counter
    ADD CONSTRAINT founding_seat_counter_pkey PRIMARY KEY (id);


--
-- Name: interactions interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_pkey PRIMARY KEY (id);


--
-- Name: interactions_queue_buffer interactions_queue_buffer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions_queue_buffer
    ADD CONSTRAINT interactions_queue_buffer_pkey PRIMARY KEY (id);


--
-- Name: list_comments list_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_comments
    ADD CONSTRAINT list_comments_pkey PRIMARY KEY (id);


--
-- Name: list_items list_items_list_id_film_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_list_id_film_id_key UNIQUE (list_id, film_id);


--
-- Name: list_items list_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_pkey PRIMARY KEY (id);


--
-- Name: lists lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_pkey PRIMARY KEY (id);


--
-- Name: log_comments log_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_comments
    ADD CONSTRAINT log_comments_pkey PRIMARY KEY (id);


--
-- Name: logs logs_user_id_film_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_user_id_film_id_key UNIQUE (user_id, film_id);


--
-- Name: lounge_members lounge_members_lounge_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lounge_members
    ADD CONSTRAINT lounge_members_lounge_id_user_id_key UNIQUE (lounge_id, user_id);


--
-- Name: lounge_members lounge_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lounge_members
    ADD CONSTRAINT lounge_members_pkey PRIMARY KEY (id);


--
-- Name: lounge_messages lounge_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lounge_messages
    ADD CONSTRAINT lounge_messages_pkey PRIMARY KEY (id);


--
-- Name: lounges lounges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lounges
    ADD CONSTRAINT lounges_pkey PRIMARY KEY (id);


--
-- Name: mod_actions mod_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_actions
    ADD CONSTRAINT mod_actions_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: physical_archive physical_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.physical_archive
    ADD CONSTRAINT physical_archive_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: profiles profiles_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_unique UNIQUE (username);


--
-- Name: programmes programmes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programmes
    ADD CONSTRAINT programmes_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_token_key UNIQUE (token);


--
-- Name: push_tokens push_tokens_user_id_platform_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_platform_key UNIQUE (user_id, platform);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: showtimes showtimes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.showtimes
    ADD CONSTRAINT showtimes_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: tips tips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tips
    ADD CONSTRAINT tips_pkey PRIMARY KEY (id);


--
-- Name: physical_archive unique_user_film; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.physical_archive
    ADD CONSTRAINT unique_user_film UNIQUE (user_id, film_id);


--
-- Name: user_blocks user_blocks_blocker_id_blocked_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_id_blocked_id_key UNIQUE (blocker_id, blocked_id);


--
-- Name: user_blocks user_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (id);


--
-- Name: user_reports user_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_pkey PRIMARY KEY (id);


--
-- Name: user_reports user_reports_reporter_id_reported_id_log_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_reporter_id_reported_id_log_id_key UNIQUE (reporter_id, reported_id, log_id);


--
-- Name: vaults vaults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vaults
    ADD CONSTRAINT vaults_pkey PRIMARY KEY (id);


--
-- Name: vaults vaults_user_id_film_id_format_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vaults
    ADD CONSTRAINT vaults_user_id_film_id_format_key UNIQUE (user_id, film_id, format);


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);


--
-- Name: video_reviews video_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_reviews
    ADD CONSTRAINT video_reviews_pkey PRIMARY KEY (id);


--
-- Name: waitlist waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);


--
-- Name: warnings warnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warnings
    ADD CONSTRAINT warnings_pkey PRIMARY KEY (id);


--
-- Name: watchlists watchlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlists
    ADD CONSTRAINT watchlists_pkey PRIMARY KEY (id);


--
-- Name: watchlists watchlists_user_id_film_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlists
    ADD CONSTRAINT watchlists_user_id_film_id_key UNIQUE (user_id, film_id);


--
-- Name: analytics_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_created_at_idx ON public.analytics_events USING btree (created_at DESC);


--
-- Name: analytics_event_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_event_name_idx ON public.analytics_events USING btree (event_name);


--
-- Name: analytics_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_user_id_idx ON public.analytics_events USING btree (user_id);


--
-- Name: cinema_reviews_cinema_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cinema_reviews_cinema_id_idx ON public.cinema_reviews USING btree (cinema_id);


--
-- Name: dispatch_dossiers_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dispatch_dossiers_created_at_idx ON public.dispatch_dossiers USING btree (created_at DESC);


--
-- Name: dossier_comments_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dossier_comments_created_at_idx ON public.dossier_comments USING btree (created_at DESC);


--
-- Name: dossier_comments_dossier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dossier_comments_dossier_id_idx ON public.dossier_comments USING btree (dossier_id);


--
-- Name: idx_buffer_user_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buffer_user_target ON public.interactions_queue_buffer USING btree (user_id, target_log_id);


--
-- Name: idx_error_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_created_at ON public.error_logs USING btree (created_at DESC);


--
-- Name: idx_global_feed_mat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_global_feed_mat_id ON public.global_feed_materialized USING btree (id);


--
-- Name: idx_interactions_covering; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interactions_covering ON public.interactions USING btree (target_log_id, user_id) INCLUDE (type);


--
-- Name: idx_interactions_target_list_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interactions_target_list_id ON public.interactions USING btree (target_list_id);


--
-- Name: idx_interactions_target_log_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interactions_target_log_id ON public.interactions USING btree (target_log_id);


--
-- Name: idx_interactions_target_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interactions_target_user_id ON public.interactions USING btree (target_user_id);


--
-- Name: idx_interactions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interactions_user_id ON public.interactions USING btree (user_id);


--
-- Name: idx_lists_created_at_id_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lists_created_at_id_desc ON public.lists USING btree (created_at DESC, id DESC) WHERE (is_private = false);


--
-- Name: idx_logs_composite_user_film; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_composite_user_film ON public.logs USING btree (user_id, film_id);


--
-- Name: idx_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_created_at ON public.logs USING btree (created_at DESC);


--
-- Name: idx_logs_created_at_id_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_created_at_id_desc ON public.logs USING btree (created_at DESC, id DESC);


--
-- Name: idx_logs_film_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_film_id ON public.logs USING btree (film_id);


--
-- Name: idx_logs_social_pulse_covering; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_social_pulse_covering ON public.logs USING btree (created_at DESC, user_id) INCLUDE (film_id, rating, review, id);


--
-- Name: idx_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_user_id ON public.logs USING btree (user_id);


--
-- Name: idx_logs_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_user_id_created_at ON public.logs USING btree (user_id, created_at DESC);


--
-- Name: idx_mod_actions_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mod_actions_admin ON public.mod_actions USING btree (admin_id, created_at DESC);


--
-- Name: idx_mod_actions_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mod_actions_report ON public.mod_actions USING btree (report_id);


--
-- Name: idx_mod_actions_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mod_actions_target ON public.mod_actions USING btree (target_user_id, created_at DESC);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_notifications_user_id_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id_read ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_physical_archive_created_at_id_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_physical_archive_created_at_id_desc ON public.physical_archive USING btree (created_at DESC, id DESC);


--
-- Name: idx_physical_archive_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_physical_archive_user ON public.physical_archive USING btree (user_id);


--
-- Name: idx_profiles_feed_join; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_feed_join ON public.profiles USING btree (id) INCLUDE (username, avatar_url, tier);


--
-- Name: idx_profiles_is_founding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_is_founding ON public.profiles USING btree (is_founding) WHERE (is_founding = true);


--
-- Name: idx_profiles_trust_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_trust_score ON public.profiles USING btree (id, trust_score);


--
-- Name: idx_profiles_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_username ON public.profiles USING btree (username);


--
-- Name: idx_reports_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_content ON public.reports USING btree (content_type, content_id);


--
-- Name: idx_reports_reporter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_reporter ON public.reports USING btree (reporter_id);


--
-- Name: idx_reports_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_status_created ON public.reports USING btree (status, created_at DESC);


--
-- Name: idx_reports_target_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_target_user ON public.reports USING btree (target_user_id);


--
-- Name: idx_tips_to_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tips_to_user ON public.tips USING btree (to_user_id);


--
-- Name: idx_tips_video; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tips_video ON public.tips USING btree (video_id);


--
-- Name: idx_user_blocks_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_blocks_blocked ON public.user_blocks USING btree (blocked_id);


--
-- Name: idx_user_blocks_blocker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_blocks_blocker ON public.user_blocks USING btree (blocker_id);


--
-- Name: idx_user_blocks_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_blocks_type ON public.user_blocks USING btree (blocker_id, type);


--
-- Name: idx_video_reviews_film; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_reviews_film ON public.video_reviews USING btree (film_id);


--
-- Name: idx_video_reviews_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_reviews_user ON public.video_reviews USING btree (user_id);


--
-- Name: idx_warnings_unacknowledged; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warnings_unacknowledged ON public.warnings USING btree (user_id) WHERE (acknowledged = false);


--
-- Name: idx_warnings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warnings_user ON public.warnings USING btree (user_id, created_at DESC);


--
-- Name: idx_watchlists_created_at_id_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_watchlists_created_at_id_desc ON public.watchlists USING btree (created_at DESC, id DESC);


--
-- Name: idx_watchlists_film_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_watchlists_film_id ON public.watchlists USING btree (film_id);


--
-- Name: idx_watchlists_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_watchlists_user_id ON public.watchlists USING btree (user_id);


--
-- Name: interactions_endorse_log_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interactions_endorse_log_idx ON public.interactions USING btree (target_log_id, type) WHERE (type = 'endorse_log'::text);


--
-- Name: interactions_target_log_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interactions_target_log_id_idx ON public.interactions USING btree (target_log_id);


--
-- Name: interactions_target_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interactions_target_user_id_idx ON public.interactions USING btree (target_user_id);


--
-- Name: interactions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interactions_user_id_idx ON public.interactions USING btree (user_id);


--
-- Name: list_comments_list_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX list_comments_list_id_idx ON public.list_comments USING btree (list_id);


--
-- Name: lists_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lists_user_id_idx ON public.lists USING btree (user_id);


--
-- Name: log_comments_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX log_comments_created_at_idx ON public.log_comments USING btree (created_at);


--
-- Name: log_comments_log_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX log_comments_log_id_idx ON public.log_comments USING btree (log_id);


--
-- Name: log_comments_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX log_comments_user_id_idx ON public.log_comments USING btree (user_id);


--
-- Name: logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX logs_created_at_idx ON public.logs USING btree (created_at DESC);


--
-- Name: logs_featured_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX logs_featured_idx ON public.logs USING btree (created_at DESC) WHERE ((review IS NOT NULL) AND (review <> ''::text) AND (rating > (0)::numeric));


--
-- Name: logs_film_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX logs_film_id_idx ON public.logs USING btree (film_id);


--
-- Name: logs_pulse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX logs_pulse_idx ON public.logs USING btree (created_at DESC) WHERE ((rating > (0)::numeric) OR ((review IS NOT NULL) AND (review <> ''::text)));


--
-- Name: logs_user_film_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX logs_user_film_idx ON public.logs USING btree (user_id, film_id, created_at DESC);


--
-- Name: logs_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX logs_user_id_idx ON public.logs USING btree (user_id);


--
-- Name: notifications_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at DESC);


--
-- Name: profiles_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_email_idx ON public.profiles USING btree (email);


--
-- Name: profiles_last_log_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_last_log_date_idx ON public.profiles USING btree (last_log_date);


--
-- Name: profiles_tier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_tier_idx ON public.profiles USING btree (tier);


--
-- Name: profiles_username_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_username_idx ON public.profiles USING btree (username);


--
-- Name: profiles_username_lower_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_username_lower_unique ON public.profiles USING btree (lower(username));


--
-- Name: profiles_username_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_username_unique_idx ON public.profiles USING btree (username) WHERE (username IS NOT NULL);


--
-- Name: programmes_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX programmes_user_id_idx ON public.programmes USING btree (user_id);


--
-- Name: vaults_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vaults_user_id_idx ON public.vaults USING btree (user_id);


--
-- Name: waitlist_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX waitlist_created_at_idx ON public.waitlist USING btree (created_at DESC);


--
-- Name: waitlist_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX waitlist_email_unique ON public.waitlist USING btree (email);


--
-- Name: watchlists_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX watchlists_user_id_idx ON public.watchlists USING btree (user_id);


--
-- Name: interactions enforce_interaction_rate_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_interaction_rate_limit BEFORE INSERT ON public.interactions FOR EACH ROW EXECUTE FUNCTION public.check_interaction_rate_limit();


--
-- Name: video_reviews enforce_video_review_security; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_video_review_security BEFORE UPDATE ON public.video_reviews FOR EACH ROW EXECUTE FUNCTION public.protect_video_review_metrics();


--
-- Name: tips on_tip_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_tip_created AFTER INSERT ON public.tips FOR EACH ROW EXECUTE FUNCTION public.increment_video_tips();


--
-- Name: interactions set_interactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_interactions_updated_at BEFORE UPDATE ON public.interactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: list_items set_list_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_list_items_updated_at BEFORE UPDATE ON public.list_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: lists set_lists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_lists_updated_at BEFORE UPDATE ON public.lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: logs set_logs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_logs_updated_at BEFORE UPDATE ON public.logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notifications set_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles set_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: showtimes set_showtimes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_showtimes_updated_at BEFORE UPDATE ON public.showtimes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tickets set_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: log_comments set_updated_at_log_comments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_log_comments BEFORE UPDATE ON public.log_comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: vaults set_vaults_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_vaults_updated_at BEFORE UPDATE ON public.vaults FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: venues set_venues_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_venues_updated_at BEFORE UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: watchlists set_watchlists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_watchlists_updated_at BEFORE UPDATE ON public.watchlists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: interactions tr_enforce_privacy_on_follow; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_enforce_privacy_on_follow BEFORE INSERT ON public.interactions FOR EACH ROW EXECUTE FUNCTION public.enforce_privacy_on_follow();


--
-- Name: profiles tr_handle_privacy_switch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_handle_privacy_switch BEFORE UPDATE ON public.profiles FOR EACH ROW WHEN ((old.is_social_private IS DISTINCT FROM new.is_social_private)) EXECUTE FUNCTION public.handle_privacy_switch();


--
-- Name: interactions tr_notify_interaction; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_interaction AFTER INSERT ON public.interactions FOR EACH ROW EXECUTE FUNCTION public.notify_on_interaction();


--
-- Name: list_comments tr_notify_list_comment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_list_comment AFTER INSERT ON public.list_comments FOR EACH ROW EXECUTE FUNCTION public.notify_on_list_comment();


--
-- Name: log_comments tr_notify_log_comment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_log_comment AFTER INSERT ON public.log_comments FOR EACH ROW EXECUTE FUNCTION public.notify_on_log_comment();


--
-- Name: profiles tr_profiles_username_policy; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_profiles_username_policy BEFORE INSERT OR UPDATE OF username ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_username_policy();


--
-- Name: interactions trigger_follow_count_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_follow_count_change AFTER INSERT OR DELETE ON public.interactions FOR EACH ROW EXECUTE FUNCTION public.handle_follow_count_change();


--
-- Name: user_reports trigger_process_user_report; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_process_user_report AFTER INSERT ON public.user_reports FOR EACH ROW EXECUTE FUNCTION public.process_user_report();


--
-- Name: analytics_events analytics_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: cinema_reviews cinema_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cinema_reviews
    ADD CONSTRAINT cinema_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: dispatch_dossiers dispatch_dossiers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatch_dossiers
    ADD CONSTRAINT dispatch_dossiers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: dossier_certifications dossier_certifications_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_certifications
    ADD CONSTRAINT dossier_certifications_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.dispatch_dossiers(id) ON DELETE CASCADE;


--
-- Name: dossier_certifications dossier_certifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_certifications
    ADD CONSTRAINT dossier_certifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: dossier_comments dossier_comments_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_comments
    ADD CONSTRAINT dossier_comments_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.dispatch_dossiers(id) ON DELETE CASCADE;


--
-- Name: dossier_comments dossier_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_comments
    ADD CONSTRAINT dossier_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: interactions interactions_target_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_target_list_id_fkey FOREIGN KEY (target_list_id) REFERENCES public.lists(id);


--
-- Name: interactions interactions_target_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_target_log_id_fkey FOREIGN KEY (target_log_id) REFERENCES public.logs(id);


--
-- Name: interactions interactions_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id);


--
-- Name: interactions interactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: list_comments list_comments_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_comments
    ADD CONSTRAINT list_comments_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lists(id) ON DELETE CASCADE;


--
-- Name: list_comments list_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_comments
    ADD CONSTRAINT list_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: list_items list_items_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lists(id) ON DELETE CASCADE;


--
-- Name: lists lists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: log_comments log_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_comments
    ADD CONSTRAINT log_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: logs logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: lounge_members lounge_members_lounge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lounge_members
    ADD CONSTRAINT lounge_members_lounge_id_fkey FOREIGN KEY (lounge_id) REFERENCES public.lounges(id) ON DELETE CASCADE;


--
-- Name: lounge_members lounge_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lounge_members
    ADD CONSTRAINT lounge_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: lounge_messages lounge_messages_lounge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lounge_messages
    ADD CONSTRAINT lounge_messages_lounge_id_fkey FOREIGN KEY (lounge_id) REFERENCES public.lounges(id) ON DELETE CASCADE;


--
-- Name: lounge_messages lounge_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lounge_messages
    ADD CONSTRAINT lounge_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: lounges lounges_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lounges
    ADD CONSTRAINT lounges_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: mod_actions mod_actions_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_actions
    ADD CONSTRAINT mod_actions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id);


--
-- Name: mod_actions mod_actions_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_actions
    ADD CONSTRAINT mod_actions_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE SET NULL;


--
-- Name: mod_actions mod_actions_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_actions
    ADD CONSTRAINT mod_actions_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: physical_archive physical_archive_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.physical_archive
    ADD CONSTRAINT physical_archive_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);


--
-- Name: programmes programmes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programmes
    ADD CONSTRAINT programmes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: push_tokens push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reports reports_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id);


--
-- Name: showtimes showtimes_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.showtimes
    ADD CONSTRAINT showtimes_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: tickets tickets_showtime_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_showtime_id_fkey FOREIGN KEY (showtime_id) REFERENCES public.showtimes(id);


--
-- Name: tickets tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: tips tips_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tips
    ADD CONSTRAINT tips_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tips tips_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tips
    ADD CONSTRAINT tips_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tips tips_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tips
    ADD CONSTRAINT tips_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.video_reviews(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocked_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_reports user_reports_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_log_id_fkey FOREIGN KEY (log_id) REFERENCES public.logs(id) ON DELETE CASCADE;


--
-- Name: user_reports user_reports_reported_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_reported_id_fkey FOREIGN KEY (reported_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_reports user_reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vaults vaults_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vaults
    ADD CONSTRAINT vaults_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: venues venues_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id);


--
-- Name: video_reviews video_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_reviews
    ADD CONSTRAINT video_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: warnings warnings_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warnings
    ADD CONSTRAINT warnings_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id);


--
-- Name: warnings warnings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warnings
    ADD CONSTRAINT warnings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: watchlists watchlists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlists
    ADD CONSTRAINT watchlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: error_logs Anyone can insert error logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert error logs" ON public.error_logs FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: error_logs Anyone can insert error logs.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert error logs." ON public.error_logs FOR INSERT WITH CHECK (true);


--
-- Name: waitlist Anyone can join waitlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can join waitlist" ON public.waitlist FOR INSERT WITH CHECK (true);


--
-- Name: physical_archive Anyone can read archives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read archives" ON public.physical_archive FOR SELECT USING (true);


--
-- Name: lounge_messages Anyone can read public lounge messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read public lounge messages" ON public.lounge_messages FOR SELECT USING (((lounge_id IN ( SELECT lounges.id
   FROM public.lounges
  WHERE (lounges.is_private = false))) OR (lounge_id IN ( SELECT lounge_members.lounge_id
   FROM public.lounge_members
  WHERE (lounge_members.user_id = auth.uid())))));


--
-- Name: lounges Anyone can view lounges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view lounges" ON public.lounges FOR SELECT USING (((is_private = false) OR (creator_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.lounge_members lm
  WHERE ((lm.lounge_id = lounges.id) AND (lm.user_id = auth.uid()))))));


--
-- Name: dossier_certifications Authenticated users can certify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can certify" ON public.dossier_certifications FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: dossier_comments Authenticated users can comment on dossiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can comment on dossiers" ON public.dossier_comments FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: lounges Authenticated users can create lounges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create lounges" ON public.lounges FOR INSERT WITH CHECK ((auth.uid() = creator_id));


--
-- Name: log_comments Authenticated users can insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert" ON public.log_comments FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: dossier_certifications Certifications viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Certifications viewable by everyone" ON public.dossier_certifications FOR SELECT USING (true);


--
-- Name: cinema_reviews Cinema reviews are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cinema reviews are viewable by everyone." ON public.cinema_reviews FOR SELECT USING (true);


--
-- Name: lounge_members Creators can remove members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can remove members" ON public.lounge_members FOR DELETE USING (((auth.uid() IN ( SELECT lounges.creator_id
   FROM public.lounges
  WHERE (lounges.id = lounge_members.lounge_id))) OR (auth.uid() = user_id)));


--
-- Name: lounges Creators can update own lounges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can update own lounges" ON public.lounges FOR UPDATE USING ((auth.uid() = creator_id)) WITH CHECK ((auth.uid() = creator_id));


--
-- Name: dossier_comments Dossier comments viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Dossier comments viewable by everyone" ON public.dossier_comments FOR SELECT USING (true);


--
-- Name: lounge_messages Members can send messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can send messages" ON public.lounge_messages FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (lounge_id IN ( SELECT lounge_members.lounge_id
   FROM public.lounge_members
  WHERE (lounge_members.user_id = auth.uid())))));


--
-- Name: lounge_members Members can view memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view memberships" ON public.lounge_members FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: showtimes Owners can manage their showtimes.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage their showtimes." ON public.showtimes USING ((auth.uid() IN ( SELECT venues.owner_id
   FROM public.venues
  WHERE (venues.id = showtimes.venue_id))));


--
-- Name: venues Owners can manage their venues.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage their venues." ON public.venues USING ((auth.uid() = owner_id));


--
-- Name: profiles Public profiles are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (true);


--
-- Name: programmes Public programmes are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public programmes are viewable by everyone." ON public.programmes FOR SELECT USING (((is_public = true) OR (auth.uid() = user_id)));


--
-- Name: dispatch_dossiers Published dossiers are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Published dossiers are viewable by everyone." ON public.dispatch_dossiers FOR SELECT USING ((is_published = true));


--
-- Name: analytics_events Service role can read analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read analytics" ON public.analytics_events FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: showtimes Showtimes are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Showtimes are viewable by everyone." ON public.showtimes FOR SELECT USING (true);


--
-- Name: tickets Users can buy tickets.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can buy tickets." ON public.tickets FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: list_items Users can delete list items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete list items" ON public.list_items FOR DELETE USING ((auth.uid() IN ( SELECT lists.user_id
   FROM public.lists
  WHERE (lists.id = list_items.list_id))));


--
-- Name: physical_archive Users can delete own archive; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own archive" ON public.physical_archive FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: log_comments Users can delete own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own comments" ON public.log_comments FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: lounge_messages Users can delete own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own messages" ON public.lounge_messages FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: notifications Users can delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: interactions Users can delete their own interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own interactions" ON public.interactions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: logs Users can delete their own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own logs" ON public.logs FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: push_subscriptions Users can delete their own push subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own push subscriptions" ON public.push_subscriptions FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: analytics_events Users can insert analytics events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert analytics events" ON public.analytics_events FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: list_items Users can insert list items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert list items" ON public.list_items FOR INSERT WITH CHECK ((auth.uid() IN ( SELECT lists.user_id
   FROM public.lists
  WHERE (lists.id = list_items.list_id))));


--
-- Name: log_comments Users can insert log comments.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert log comments." ON public.log_comments FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: physical_archive Users can insert own archive; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own archive" ON public.physical_archive FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: interactions Users can insert their own interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own interactions" ON public.interactions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: logs Users can insert their own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own logs" ON public.logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert their own profile.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: push_subscriptions Users can insert their own push subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own push subscriptions" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: lounge_members Users can join lounges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can join lounges" ON public.lounge_members FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: cinema_reviews Users can manage their cinema reviews.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their cinema reviews." ON public.cinema_reviews USING ((auth.uid() = user_id));


--
-- Name: dispatch_dossiers Users can manage their dossiers.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their dossiers." ON public.dispatch_dossiers USING ((auth.uid() = user_id));


--
-- Name: interactions Users can manage their interactions.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their interactions." ON public.interactions USING ((auth.uid() = user_id));


--
-- Name: list_comments Users can manage their list comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their list comments" ON public.list_comments USING ((auth.uid() = user_id));


--
-- Name: lists Users can manage their lists.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their lists." ON public.lists USING ((auth.uid() = user_id));


--
-- Name: log_comments Users can manage their log comments.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their log comments." ON public.log_comments USING ((auth.uid() = user_id));


--
-- Name: logs Users can manage their logs.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their logs." ON public.logs USING ((auth.uid() = user_id));


--
-- Name: dossier_comments Users can manage their own dossier comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own dossier comments" ON public.dossier_comments USING ((auth.uid() = user_id));


--
-- Name: programmes Users can manage their programmes.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their programmes." ON public.programmes USING ((auth.uid() = user_id));


--
-- Name: vaults Users can manage their vaults.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their vaults." ON public.vaults USING ((auth.uid() = user_id));


--
-- Name: watchlists Users can manage their watchlists.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their watchlists." ON public.watchlists USING ((auth.uid() = user_id));


--
-- Name: physical_archive Users can read own archive; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own archive" ON public.physical_archive FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: list_items Users can select list items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can select list items" ON public.list_items FOR SELECT USING (true);


--
-- Name: user_reports Users can submit reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can submit reports" ON public.user_reports FOR INSERT WITH CHECK ((auth.uid() = reporter_id));


--
-- Name: dossier_certifications Users can uncertify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can uncertify" ON public.dossier_certifications FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: list_items Users can update list items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update list items" ON public.list_items FOR UPDATE USING ((auth.uid() IN ( SELECT lists.user_id
   FROM public.lists
  WHERE (lists.id = list_items.list_id))));


--
-- Name: physical_archive Users can update own archive; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own archive" ON public.physical_archive FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: lounge_members Users can update own membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own membership" ON public.lounge_members FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: notifications Users can update their notifications (mark read); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their notifications (mark read)" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: logs Users can update their own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own logs" ON public.logs FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: error_logs Users can view own errors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own errors" ON public.error_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: notifications Users can view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: notifications Users can view their notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: tickets Users can view their own tickets.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own tickets." ON public.tickets FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_reports Users cannot view reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users cannot view reports" ON public.user_reports FOR SELECT USING (false);


--
-- Name: error_logs Users insert their own error logs.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert their own error logs." ON public.error_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: vaults Vaults are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vaults are viewable by everyone." ON public.vaults FOR SELECT USING (true);


--
-- Name: venues Venues are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Venues are viewable by everyone." ON public.venues FOR SELECT USING (true);


--
-- Name: reports admin_select_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_select_reports ON public.reports FOR SELECT TO authenticated USING ((auth.uid() = 'd1c40ed8-10bc-4a6e-b51a-b6d3559bf755'::uuid));


--
-- Name: reports admin_update_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_update_reports ON public.reports FOR UPDATE TO authenticated USING ((auth.uid() = 'd1c40ed8-10bc-4a6e-b51a-b6d3559bf755'::uuid));


--
-- Name: mod_actions admins_insert_mod_actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_insert_mod_actions ON public.mod_actions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: warnings admins_insert_warnings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_insert_warnings ON public.warnings FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: reports admins_select_all_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_select_all_reports ON public.reports FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: warnings admins_select_all_warnings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_select_all_warnings ON public.warnings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: mod_actions admins_select_mod_actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_select_mod_actions ON public.mod_actions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: reports admins_update_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_update_reports ON public.reports FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: analytics_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

--
-- Name: dossier_comments ban_block_dossier_comments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ban_block_dossier_comments_insert ON public.dossier_comments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());


--
-- Name: dispatch_dossiers ban_block_dossiers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ban_block_dossiers_insert ON public.dispatch_dossiers AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());


--
-- Name: dispatch_dossiers ban_block_dossiers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ban_block_dossiers_update ON public.dispatch_dossiers AS RESTRICTIVE FOR UPDATE TO authenticated WITH CHECK (public.is_user_not_banned());


--
-- Name: interactions ban_block_interactions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ban_block_interactions_insert ON public.interactions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());


--
-- Name: list_comments ban_block_list_comments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ban_block_list_comments_insert ON public.list_comments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());


--
-- Name: list_items ban_block_list_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ban_block_list_items_insert ON public.list_items AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());


--
-- Name: lists ban_block_lists_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ban_block_lists_insert ON public.lists AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());


--
-- Name: log_comments ban_block_log_comments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ban_block_log_comments_insert ON public.log_comments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());


--
-- Name: logs ban_block_logs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ban_block_logs_insert ON public.logs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());


--
-- Name: logs ban_block_logs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ban_block_logs_update ON public.logs AS RESTRICTIVE FOR UPDATE TO authenticated WITH CHECK (public.is_user_not_banned());


--
-- Name: lounge_messages ban_block_lounge_messages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ban_block_lounge_messages_insert ON public.lounge_messages AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());


--
-- Name: watchlists ban_block_watchlists_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ban_block_watchlists_insert ON public.watchlists AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());


--
-- Name: cinema_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cinema_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: dispatch_dossiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dispatch_dossiers ENABLE ROW LEVEL SECURITY;

--
-- Name: dossier_certifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dossier_certifications ENABLE ROW LEVEL SECURITY;

--
-- Name: dossier_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dossier_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: error_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: founding_seat_counter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.founding_seat_counter ENABLE ROW LEVEL SECURITY;

--
-- Name: interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: interactions_queue_buffer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interactions_queue_buffer ENABLE ROW LEVEL SECURITY;

--
-- Name: interactions interactions_select_authorized; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY interactions_select_authorized ON public.interactions FOR SELECT USING (((auth.uid() = user_id) OR (auth.uid() = target_user_id) OR public.can_view_user_data(user_id) OR public.can_view_user_data(target_user_id)));


--
-- Name: list_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.list_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: list_comments list_comments_select_authorized; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY list_comments_select_authorized ON public.list_comments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.lists l
  WHERE ((l.id = list_comments.list_id) AND public.can_view_user_data(l.user_id)))));


--
-- Name: list_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

--
-- Name: lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

--
-- Name: lists lists_select_authorized; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lists_select_authorized ON public.lists FOR SELECT USING (public.can_view_user_data(user_id));


--
-- Name: log_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.log_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: log_comments log_comments_select_authorized; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY log_comments_select_authorized ON public.log_comments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.logs l
  WHERE ((l.id = log_comments.log_id) AND public.can_view_user_data(l.user_id)))));


--
-- Name: logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

--
-- Name: logs logs_insert_rate_limit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY logs_insert_rate_limit ON public.logs FOR INSERT WITH CHECK (((auth.uid() = user_id) AND public.rate_limit_check('logs'::text, 'user_id'::text, 200, 1440)));


--
-- Name: logs logs_select_authorized; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY logs_select_authorized ON public.logs FOR SELECT USING (public.can_view_user_data(user_id));


--
-- Name: lounge_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lounge_members ENABLE ROW LEVEL SECURITY;

--
-- Name: lounge_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lounge_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: lounges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lounges ENABLE ROW LEVEL SECURITY;

--
-- Name: mod_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mod_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: dossier_comments owner_delete_dossier_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_delete_dossier_comments ON public.dossier_comments FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));


--
-- Name: dossier_comments owner_insert_dossier_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_insert_dossier_comments ON public.dossier_comments FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: dossier_comments owner_update_dossier_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_update_dossier_comments ON public.dossier_comments FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: physical_archive; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.physical_archive ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: programmes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;

--
-- Name: dossier_comments public_read_dossier_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_dossier_comments ON public.dossier_comments FOR SELECT TO authenticated USING (true);


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: push_tokens push_tokens_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_tokens_delete_own ON public.push_tokens FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: push_tokens push_tokens_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_tokens_select_own ON public.push_tokens FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: showtimes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.showtimes ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: tips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

--
-- Name: tips tips_insert_rate_limit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tips_insert_rate_limit ON public.tips FOR INSERT WITH CHECK (((auth.uid() = from_user_id) AND public.rate_limit_check('tips'::text, 'from_user_id'::text, 50, 1440)));


--
-- Name: tips tips_select_from; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tips_select_from ON public.tips FOR SELECT USING ((auth.uid() = from_user_id));


--
-- Name: tips tips_select_to; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tips_select_to ON public.tips FOR SELECT USING ((auth.uid() = to_user_id));


--
-- Name: user_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: user_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: warnings users_acknowledge_own_warnings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_acknowledge_own_warnings ON public.warnings FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK (((user_id = auth.uid()) AND (acknowledged = true)));


--
-- Name: user_blocks users_delete_own_blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_delete_own_blocks ON public.user_blocks FOR DELETE USING ((blocker_id = auth.uid()));


--
-- Name: user_blocks users_insert_own_blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_own_blocks ON public.user_blocks FOR INSERT WITH CHECK ((blocker_id = auth.uid()));


--
-- Name: reports users_insert_own_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_own_reports ON public.reports FOR INSERT WITH CHECK ((reporter_id = auth.uid()));


--
-- Name: reports users_insert_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_reports ON public.reports FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: user_blocks users_select_own_blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_own_blocks ON public.user_blocks FOR SELECT USING ((blocker_id = auth.uid()));


--
-- Name: mod_actions users_select_own_mod_actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_own_mod_actions ON public.mod_actions FOR SELECT USING ((target_user_id = auth.uid()));


--
-- Name: reports users_select_own_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_own_reports ON public.reports FOR SELECT USING ((reporter_id = auth.uid()));


--
-- Name: warnings users_select_own_warnings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_own_warnings ON public.warnings FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: vaults; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;

--
-- Name: venues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

--
-- Name: video_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: video_reviews video_reviews_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY video_reviews_delete ON public.video_reviews FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: video_reviews video_reviews_insert_rate_limit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY video_reviews_insert_rate_limit ON public.video_reviews FOR INSERT WITH CHECK (((auth.uid() = user_id) AND public.rate_limit_check('video_reviews'::text, 'user_id'::text, 10, 1440)));


--
-- Name: video_reviews video_reviews_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY video_reviews_select ON public.video_reviews FOR SELECT USING (true);


--
-- Name: video_reviews video_reviews_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY video_reviews_update ON public.video_reviews FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: waitlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: warnings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warnings ENABLE ROW LEVEL SECURITY;

--
-- Name: watchlists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;

--
-- Name: watchlists watchlists_select_authorized; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY watchlists_select_authorized ON public.watchlists FOR SELECT USING (public.can_view_user_data(user_id));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION accept_follow_request(requester_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.accept_follow_request(requester_id uuid) TO anon;
GRANT ALL ON FUNCTION public.accept_follow_request(requester_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.accept_follow_request(requester_id uuid) TO service_role;


--
-- Name: FUNCTION batch_insert_list_items(p_list_id uuid, p_owner_id uuid, p_items jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.batch_insert_list_items(p_list_id uuid, p_owner_id uuid, p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.batch_insert_list_items(p_list_id uuid, p_owner_id uuid, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.batch_insert_list_items(p_list_id uuid, p_owner_id uuid, p_items jsonb) TO service_role;


--
-- Name: FUNCTION book_showtime_seat(p_showtime_id uuid, p_slot_id text, p_seat_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.book_showtime_seat(p_showtime_id uuid, p_slot_id text, p_seat_id text) TO anon;
GRANT ALL ON FUNCTION public.book_showtime_seat(p_showtime_id uuid, p_slot_id text, p_seat_id text) TO authenticated;
GRANT ALL ON FUNCTION public.book_showtime_seat(p_showtime_id uuid, p_slot_id text, p_seat_id text) TO service_role;


--
-- Name: FUNCTION bulk_dismiss_reports(p_report_ids uuid[], p_admin_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.bulk_dismiss_reports(p_report_ids uuid[], p_admin_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bulk_dismiss_reports(p_report_ids uuid[], p_admin_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.bulk_dismiss_reports(p_report_ids uuid[], p_admin_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION can_view_user_data(target_uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_view_user_data(target_uid uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_user_data(target_uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_user_data(target_uid uuid) TO service_role;


--
-- Name: FUNCTION check_interaction_rate_limit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_interaction_rate_limit() TO anon;
GRANT ALL ON FUNCTION public.check_interaction_rate_limit() TO authenticated;
GRANT ALL ON FUNCTION public.check_interaction_rate_limit() TO service_role;


--
-- Name: FUNCTION claim_founding_seat(p_user_id uuid, p_max_seats integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_founding_seat(p_user_id uuid, p_max_seats integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_founding_seat(p_user_id uuid, p_max_seats integer) TO service_role;


--
-- Name: FUNCTION create_lounge_with_member(p_name text, p_description text, p_is_private boolean, p_invite_code text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_lounge_with_member(p_name text, p_description text, p_is_private boolean, p_invite_code text) TO anon;
GRANT ALL ON FUNCTION public.create_lounge_with_member(p_name text, p_description text, p_is_private boolean, p_invite_code text) TO authenticated;
GRANT ALL ON FUNCTION public.create_lounge_with_member(p_name text, p_description text, p_is_private boolean, p_invite_code text) TO service_role;


--
-- Name: FUNCTION decline_follow_request(requester_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.decline_follow_request(requester_id uuid) TO anon;
GRANT ALL ON FUNCTION public.decline_follow_request(requester_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.decline_follow_request(requester_id uuid) TO service_role;


--
-- Name: FUNCTION decrement_follow_counts(follower_id uuid, followed_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.decrement_follow_counts(follower_id uuid, followed_id uuid) TO anon;
GRANT ALL ON FUNCTION public.decrement_follow_counts(follower_id uuid, followed_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.decrement_follow_counts(follower_id uuid, followed_id uuid) TO service_role;


--
-- Name: FUNCTION delete_list_cascade(p_list_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_list_cascade(p_list_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_list_cascade(p_list_id uuid) TO service_role;


--
-- Name: FUNCTION enforce_privacy_on_follow(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_privacy_on_follow() TO anon;
GRANT ALL ON FUNCTION public.enforce_privacy_on_follow() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_privacy_on_follow() TO service_role;


--
-- Name: FUNCTION enforce_username_policy(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_username_policy() TO anon;
GRANT ALL ON FUNCTION public.enforce_username_policy() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_username_policy() TO service_role;


--
-- Name: FUNCTION get_community_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_community_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_community_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_community_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO service_role;


--
-- Name: FUNCTION get_email_by_username(lookup_username text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_email_by_username(lookup_username text) TO anon;
GRANT ALL ON FUNCTION public.get_email_by_username(lookup_username text) TO authenticated;
GRANT ALL ON FUNCTION public.get_email_by_username(lookup_username text) TO service_role;


--
-- Name: TABLE logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.logs TO anon;
GRANT ALL ON TABLE public.logs TO authenticated;
GRANT ALL ON TABLE public.logs TO service_role;


--
-- Name: FUNCTION get_featured_critique(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_featured_critique() TO anon;
GRANT ALL ON FUNCTION public.get_featured_critique() TO authenticated;
GRANT ALL ON FUNCTION public.get_featured_critique() TO service_role;


--
-- Name: FUNCTION get_filtered_stacks_auth_cursor(p_search text, p_filter_following boolean, p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_filtered_stacks_auth_cursor(p_search text, p_filter_following boolean, p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_filtered_stacks_auth_cursor(p_search text, p_filter_following boolean, p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_filtered_stacks_auth_cursor(p_search text, p_filter_following boolean, p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO service_role;


--
-- Name: FUNCTION get_filtered_stacks_cursor(p_search text, p_following text[], p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_filtered_stacks_cursor(p_search text, p_following text[], p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_filtered_stacks_cursor(p_search text, p_following text[], p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_filtered_stacks_cursor(p_search text, p_following text[], p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO service_role;


--
-- Name: FUNCTION get_following_feed(p_usernames text[], p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_following_feed(p_usernames text[], p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_following_feed(p_usernames text[], p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_following_feed(p_usernames text[], p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION get_following_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_following_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_following_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_following_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO service_role;


--
-- Name: FUNCTION get_following_feed_cursor(p_usernames text[], p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_following_feed_cursor(p_usernames text[], p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_following_feed_cursor(p_usernames text[], p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_following_feed_cursor(p_usernames text[], p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO service_role;


--
-- Name: FUNCTION get_lounge_unread_counts(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_lounge_unread_counts(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_lounge_unread_counts(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_lounge_unread_counts(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_priority_reports(p_limit integer, p_cursor timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_priority_reports(p_limit integer, p_cursor timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_priority_reports(p_limit integer, p_cursor timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_priority_reports(p_limit integer, p_cursor timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_profile_counts(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_profile_counts(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_profile_counts(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_profile_counts(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_profile_metrics(uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_profile_metrics(uid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_profile_metrics(uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_profile_metrics(uid uuid) TO service_role;


--
-- Name: FUNCTION get_public_profile_analytics(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_public_profile_analytics(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_public_profile_analytics(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_public_profile_analytics(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_user_analytics(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_analytics(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_user_analytics(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_analytics(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_user_blocks(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_blocks(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_user_blocks(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_blocks(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_user_lounges(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_lounges(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_user_lounges(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_lounges(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION handle_follow_count_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_follow_count_change() TO anon;
GRANT ALL ON FUNCTION public.handle_follow_count_change() TO authenticated;
GRANT ALL ON FUNCTION public.handle_follow_count_change() TO service_role;


--
-- Name: FUNCTION handle_interaction_removal(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_interaction_removal() TO anon;
GRANT ALL ON FUNCTION public.handle_interaction_removal() TO authenticated;
GRANT ALL ON FUNCTION public.handle_interaction_removal() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION handle_privacy_switch(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_privacy_switch() TO anon;
GRANT ALL ON FUNCTION public.handle_privacy_switch() TO authenticated;
GRANT ALL ON FUNCTION public.handle_privacy_switch() TO service_role;


--
-- Name: FUNCTION handle_user_deletion(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_user_deletion() TO anon;
GRANT ALL ON FUNCTION public.handle_user_deletion() TO authenticated;
GRANT ALL ON FUNCTION public.handle_user_deletion() TO service_role;


--
-- Name: FUNCTION increment_dossier_views(dossier_uuid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_dossier_views(dossier_uuid uuid) TO anon;
GRANT ALL ON FUNCTION public.increment_dossier_views(dossier_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.increment_dossier_views(dossier_uuid uuid) TO service_role;


--
-- Name: FUNCTION increment_follow_counts(follower_id uuid, followed_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_follow_counts(follower_id uuid, followed_id uuid) TO anon;
GRANT ALL ON FUNCTION public.increment_follow_counts(follower_id uuid, followed_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.increment_follow_counts(follower_id uuid, followed_id uuid) TO service_role;


--
-- Name: FUNCTION increment_video_tips(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_video_tips() TO anon;
GRANT ALL ON FUNCTION public.increment_video_tips() TO authenticated;
GRANT ALL ON FUNCTION public.increment_video_tips() TO service_role;


--
-- Name: FUNCTION increment_video_views(p_video_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_video_views(p_video_id uuid) TO anon;
GRANT ALL ON FUNCTION public.increment_video_views(p_video_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.increment_video_views(p_video_id uuid) TO service_role;


--
-- Name: FUNCTION is_blocked_by(viewer_id uuid, author_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_blocked_by(viewer_id uuid, author_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_blocked_by(viewer_id uuid, author_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_blocked_by(viewer_id uuid, author_id uuid) TO service_role;


--
-- Name: FUNCTION is_hidden_by(viewer_id uuid, author_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_hidden_by(viewer_id uuid, author_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_hidden_by(viewer_id uuid, author_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_hidden_by(viewer_id uuid, author_id uuid) TO service_role;


--
-- Name: FUNCTION is_user_not_banned(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_user_not_banned() TO anon;
GRANT ALL ON FUNCTION public.is_user_not_banned() TO authenticated;
GRANT ALL ON FUNCTION public.is_user_not_banned() TO service_role;


--
-- Name: FUNCTION notify_on_interaction(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_on_interaction() TO anon;
GRANT ALL ON FUNCTION public.notify_on_interaction() TO authenticated;
GRANT ALL ON FUNCTION public.notify_on_interaction() TO service_role;


--
-- Name: FUNCTION notify_on_list_comment(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_on_list_comment() TO anon;
GRANT ALL ON FUNCTION public.notify_on_list_comment() TO authenticated;
GRANT ALL ON FUNCTION public.notify_on_list_comment() TO service_role;


--
-- Name: FUNCTION notify_on_log_comment(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_on_log_comment() TO anon;
GRANT ALL ON FUNCTION public.notify_on_log_comment() TO authenticated;
GRANT ALL ON FUNCTION public.notify_on_log_comment() TO service_role;


--
-- Name: FUNCTION process_secure_tip(p_to_user_id uuid, p_video_id uuid, p_amount numeric, p_message text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.process_secure_tip(p_to_user_id uuid, p_video_id uuid, p_amount numeric, p_message text) TO anon;
GRANT ALL ON FUNCTION public.process_secure_tip(p_to_user_id uuid, p_video_id uuid, p_amount numeric, p_message text) TO authenticated;
GRANT ALL ON FUNCTION public.process_secure_tip(p_to_user_id uuid, p_video_id uuid, p_amount numeric, p_message text) TO service_role;


--
-- Name: FUNCTION process_user_report(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.process_user_report() TO anon;
GRANT ALL ON FUNCTION public.process_user_report() TO authenticated;
GRANT ALL ON FUNCTION public.process_user_report() TO service_role;


--
-- Name: FUNCTION protect_video_review_metrics(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_video_review_metrics() TO anon;
GRANT ALL ON FUNCTION public.protect_video_review_metrics() TO authenticated;
GRANT ALL ON FUNCTION public.protect_video_review_metrics() TO service_role;


--
-- Name: FUNCTION rate_limit_check(table_name text, user_col text, max_count integer, window_minutes integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rate_limit_check(table_name text, user_col text, max_count integer, window_minutes integer) TO anon;
GRANT ALL ON FUNCTION public.rate_limit_check(table_name text, user_col text, max_count integer, window_minutes integer) TO authenticated;
GRANT ALL ON FUNCTION public.rate_limit_check(table_name text, user_col text, max_count integer, window_minutes integer) TO service_role;


--
-- Name: FUNCTION refresh_global_feed(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_global_feed() TO anon;
GRANT ALL ON FUNCTION public.refresh_global_feed() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_global_feed() TO service_role;


--
-- Name: FUNCTION register_push_token(p_token text, p_platform text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.register_push_token(p_token text, p_platform text) TO anon;
GRANT ALL ON FUNCTION public.register_push_token(p_token text, p_platform text) TO authenticated;
GRANT ALL ON FUNCTION public.register_push_token(p_token text, p_platform text) TO service_role;


--
-- Name: FUNCTION replace_list_items(p_list_id uuid, p_user_id uuid, p_items jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.replace_list_items(p_list_id uuid, p_user_id uuid, p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.replace_list_items(p_list_id uuid, p_user_id uuid, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.replace_list_items(p_list_id uuid, p_user_id uuid, p_items jsonb) TO service_role;


--
-- Name: FUNCTION request_account_deletion(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.request_account_deletion() TO anon;
GRANT ALL ON FUNCTION public.request_account_deletion() TO authenticated;
GRANT ALL ON FUNCTION public.request_account_deletion() TO service_role;


--
-- Name: FUNCTION resolve_moderation_report_v2(p_report_id uuid, p_action text, p_admin_id uuid, p_reason text, p_duration_hours integer, p_notify_user boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_moderation_report_v2(p_report_id uuid, p_action text, p_admin_id uuid, p_reason text, p_duration_hours integer, p_notify_user boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_moderation_report_v2(p_report_id uuid, p_action text, p_admin_id uuid, p_reason text, p_duration_hours integer, p_notify_user boolean) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_moderation_report_v2(p_report_id uuid, p_action text, p_admin_id uuid, p_reason text, p_duration_hours integer, p_notify_user boolean) TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION submit_report(p_reporter_id uuid, p_content_id uuid, p_content_type text, p_reason text, p_details text, p_target_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_report(p_reporter_id uuid, p_content_id uuid, p_content_type text, p_reason text, p_details text, p_target_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_report(p_reporter_id uuid, p_content_id uuid, p_content_type text, p_reason text, p_details text, p_target_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.submit_report(p_reporter_id uuid, p_content_id uuid, p_content_type text, p_reason text, p_details text, p_target_user_id uuid) TO service_role;


--
-- Name: FUNCTION sweep_interaction_buffer(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sweep_interaction_buffer() TO anon;
GRANT ALL ON FUNCTION public.sweep_interaction_buffer() TO authenticated;
GRANT ALL ON FUNCTION public.sweep_interaction_buffer() TO service_role;


--
-- Name: FUNCTION toggle_dossier_certify(dossier_uuid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.toggle_dossier_certify(dossier_uuid uuid) TO anon;
GRANT ALL ON FUNCTION public.toggle_dossier_certify(dossier_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.toggle_dossier_certify(dossier_uuid uuid) TO service_role;


--
-- Name: FUNCTION update_my_display_name(p_display_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_my_display_name(p_display_name text) TO anon;
GRANT ALL ON FUNCTION public.update_my_display_name(p_display_name text) TO authenticated;
GRANT ALL ON FUNCTION public.update_my_display_name(p_display_name text) TO service_role;


--
-- Name: FUNCTION update_my_preferences(p_preferences jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_my_preferences(p_preferences jsonb) TO anon;
GRANT ALL ON FUNCTION public.update_my_preferences(p_preferences jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.update_my_preferences(p_preferences jsonb) TO service_role;


--
-- Name: TABLE analytics_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.analytics_events TO anon;
GRANT ALL ON TABLE public.analytics_events TO authenticated;
GRANT ALL ON TABLE public.analytics_events TO service_role;


--
-- Name: TABLE cinema_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cinema_reviews TO anon;
GRANT ALL ON TABLE public.cinema_reviews TO authenticated;
GRANT ALL ON TABLE public.cinema_reviews TO service_role;


--
-- Name: TABLE dispatch_dossiers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dispatch_dossiers TO anon;
GRANT ALL ON TABLE public.dispatch_dossiers TO authenticated;
GRANT ALL ON TABLE public.dispatch_dossiers TO service_role;


--
-- Name: TABLE dossier_certifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dossier_certifications TO anon;
GRANT ALL ON TABLE public.dossier_certifications TO authenticated;
GRANT ALL ON TABLE public.dossier_certifications TO service_role;


--
-- Name: TABLE dossier_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dossier_comments TO anon;
GRANT ALL ON TABLE public.dossier_comments TO authenticated;
GRANT ALL ON TABLE public.dossier_comments TO service_role;


--
-- Name: TABLE error_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.error_logs TO anon;
GRANT ALL ON TABLE public.error_logs TO authenticated;
GRANT ALL ON TABLE public.error_logs TO service_role;


--
-- Name: TABLE founding_seat_counter; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.founding_seat_counter TO anon;
GRANT ALL ON TABLE public.founding_seat_counter TO authenticated;
GRANT ALL ON TABLE public.founding_seat_counter TO service_role;


--
-- Name: TABLE interactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.interactions TO anon;
GRANT ALL ON TABLE public.interactions TO authenticated;
GRANT ALL ON TABLE public.interactions TO service_role;


--
-- Name: TABLE interactions_queue_buffer; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.interactions_queue_buffer TO anon;
GRANT ALL ON TABLE public.interactions_queue_buffer TO authenticated;
GRANT ALL ON TABLE public.interactions_queue_buffer TO service_role;


--
-- Name: TABLE list_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.list_comments TO anon;
GRANT ALL ON TABLE public.list_comments TO authenticated;
GRANT ALL ON TABLE public.list_comments TO service_role;


--
-- Name: TABLE list_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.list_items TO anon;
GRANT ALL ON TABLE public.list_items TO authenticated;
GRANT ALL ON TABLE public.list_items TO service_role;


--
-- Name: TABLE lists; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lists TO anon;
GRANT ALL ON TABLE public.lists TO authenticated;
GRANT ALL ON TABLE public.lists TO service_role;


--
-- Name: TABLE log_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.log_comments TO anon;
GRANT ALL ON TABLE public.log_comments TO authenticated;
GRANT ALL ON TABLE public.log_comments TO service_role;


--
-- Name: TABLE lounge_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lounge_members TO anon;
GRANT ALL ON TABLE public.lounge_members TO authenticated;
GRANT ALL ON TABLE public.lounge_members TO service_role;


--
-- Name: TABLE lounge_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lounge_messages TO anon;
GRANT ALL ON TABLE public.lounge_messages TO authenticated;
GRANT ALL ON TABLE public.lounge_messages TO service_role;


--
-- Name: TABLE lounges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lounges TO anon;
GRANT ALL ON TABLE public.lounges TO authenticated;
GRANT ALL ON TABLE public.lounges TO service_role;


--
-- Name: TABLE mod_actions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mod_actions TO anon;
GRANT ALL ON TABLE public.mod_actions TO authenticated;
GRANT ALL ON TABLE public.mod_actions TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE physical_archive; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.physical_archive TO anon;
GRANT ALL ON TABLE public.physical_archive TO authenticated;
GRANT ALL ON TABLE public.physical_archive TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE programmes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.programmes TO anon;
GRANT ALL ON TABLE public.programmes TO authenticated;
GRANT ALL ON TABLE public.programmes TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_subscriptions TO anon;
GRANT ALL ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE push_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_tokens TO anon;
GRANT ALL ON TABLE public.push_tokens TO authenticated;
GRANT ALL ON TABLE public.push_tokens TO service_role;


--
-- Name: TABLE reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reports TO anon;
GRANT ALL ON TABLE public.reports TO authenticated;
GRANT ALL ON TABLE public.reports TO service_role;


--
-- Name: TABLE showtimes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.showtimes TO anon;
GRANT ALL ON TABLE public.showtimes TO authenticated;
GRANT ALL ON TABLE public.showtimes TO service_role;


--
-- Name: TABLE tickets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tickets TO anon;
GRANT ALL ON TABLE public.tickets TO authenticated;
GRANT ALL ON TABLE public.tickets TO service_role;


--
-- Name: TABLE tips; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tips TO anon;
GRANT ALL ON TABLE public.tips TO authenticated;
GRANT ALL ON TABLE public.tips TO service_role;


--
-- Name: TABLE user_blocks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_blocks TO anon;
GRANT ALL ON TABLE public.user_blocks TO authenticated;
GRANT ALL ON TABLE public.user_blocks TO service_role;


--
-- Name: TABLE user_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_reports TO anon;
GRANT ALL ON TABLE public.user_reports TO authenticated;
GRANT ALL ON TABLE public.user_reports TO service_role;


--
-- Name: TABLE vaults; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vaults TO anon;
GRANT ALL ON TABLE public.vaults TO authenticated;
GRANT ALL ON TABLE public.vaults TO service_role;


--
-- Name: TABLE venues; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venues TO anon;
GRANT ALL ON TABLE public.venues TO authenticated;
GRANT ALL ON TABLE public.venues TO service_role;


--
-- Name: TABLE video_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.video_reviews TO anon;
GRANT ALL ON TABLE public.video_reviews TO authenticated;
GRANT ALL ON TABLE public.video_reviews TO service_role;


--
-- Name: TABLE waitlist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.waitlist TO anon;
GRANT ALL ON TABLE public.waitlist TO authenticated;
GRANT ALL ON TABLE public.waitlist TO service_role;


--
-- Name: TABLE warnings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warnings TO anon;
GRANT ALL ON TABLE public.warnings TO authenticated;
GRANT ALL ON TABLE public.warnings TO service_role;


--
-- Name: TABLE watchlists; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.watchlists TO anon;
GRANT ALL ON TABLE public.watchlists TO authenticated;
GRANT ALL ON TABLE public.watchlists TO service_role;


--
-- Name: TABLE global_feed_materialized; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.global_feed_materialized TO anon;
GRANT ALL ON TABLE public.global_feed_materialized TO authenticated;
GRANT ALL ON TABLE public.global_feed_materialized TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict ximUOkxKGfizNKZlhwlehURJTbHHZALRzl9Z6l3nmG8E1wlzMLBfQFsEbVkBXMb

