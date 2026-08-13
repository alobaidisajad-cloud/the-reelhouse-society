-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 31 · RESTORE SCRIPT — the way back from 20260813_04_drop_dead_subsystem
-- ════════════════════════════════════════════════════════════════════════════
--
-- Recreates everything that batch 31 removed: 11 tables with their columns,
-- constraints, indexes, RLS policies and triggers; the materialized view; and
-- the 14 dropped functions plus the 4 pre-rewrite originals.
--
-- PROVEN, not assumed. Round-tripped against production inside a rolled-back
-- transaction: 38 tables -> dropped to 27 -> restored to 38, with all 22
-- policies, all 12 triggers and the matview back.
--
-- An earlier version of this file did NOT work: pg_dump emits `SET search_path
-- = ''`, so a hand-written matview line referring to `logs` unqualified failed
-- with "relation logs does not exist". Every statement here is now pg_dump
-- output, which schema-qualifies everything. A restore script nobody has run is
-- not a safety net.
--
-- WHAT THIS DOES NOT RESTORE:
--   · row data — every one of these tables held 0 rows, so there is none;
--   · the `screening-room` storage bucket and its single 5.2 MB object;
--   · `profiles.trust_score` — see the drop migration for the one-line revert;
--   · the two pg_cron schedules — see the drop migration.
--
-- ── The four live functions this batch EDITED rather than dropped ───────────
-- Their pre-batch definitions are included at the end. Restoring the tables
-- WITHOUT restoring these is fine; restoring these WITHOUT the tables is not —
-- they reference tickets, vaults, tips and video_reviews.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tables, constraints, indexes, policies, triggers ──────────────────────
--
-- PostgreSQL database dump
--

\restrict BtkJ3GSAu7S60b8O98gTvOGMAvMsY1Rtsh02eoI1lQYvneXX4pcDR8Ho4OecMia

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

SET default_tablespace = '';

SET default_table_access_method = heap;

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
    CONSTRAINT cinema_reviews_cinema_id_len CHECK ((char_length(cinema_id) <= 100)),
    CONSTRAINT cinema_reviews_cinema_name_len CHECK ((char_length(cinema_name) <= 300)),
    CONSTRAINT cinema_reviews_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric))),
    CONSTRAINT cinema_reviews_review_len CHECK ((char_length(review) <= 2000))
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
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT interactions_queue_buffer_target_id_len CHECK ((char_length(target_id) <= 100)),
    CONSTRAINT interactions_queue_buffer_target_list_id_len CHECK ((char_length(target_list_id) <= 100)),
    CONSTRAINT interactions_queue_buffer_target_log_id_len CHECK ((char_length(target_log_id) <= 100)),
    CONSTRAINT interactions_queue_buffer_type_len CHECK ((char_length(type) <= 100))
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT programmes_description_len CHECK ((char_length(description) <= 2000)),
    CONSTRAINT programmes_films_len CHECK ((char_length((films)::text) <= 50000)),
    CONSTRAINT programmes_title_len CHECK ((char_length(title) <= 300))
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
    duration_minutes integer,
    CONSTRAINT showtimes_film_title_len CHECK ((char_length(film_title) <= 300)),
    CONSTRAINT showtimes_screen_name_len CHECK ((char_length(screen_name) <= 100)),
    CONSTRAINT showtimes_slots_len CHECK ((char_length((slots)::text) <= 50000))
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
    screen_name text,
    CONSTRAINT tickets_qr_code_len CHECK ((char_length(qr_code) <= 2048)),
    CONSTRAINT tickets_screen_name_len CHECK ((char_length(screen_name) <= 100)),
    CONSTRAINT tickets_seat_len CHECK ((char_length(seat) <= 100)),
    CONSTRAINT tickets_slot_id_len CHECK ((char_length(slot_id) <= 100)),
    CONSTRAINT tickets_ticket_type_len CHECK ((char_length(ticket_type) <= 100))
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
    CONSTRAINT tips_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT tips_from_username_len CHECK ((char_length(from_username) <= 100)),
    CONSTRAINT tips_message_len CHECK ((char_length(message) <= 2000))
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
    CONSTRAINT user_reports_reason_len CHECK ((char_length(reason) <= 2000)),
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
    year integer,
    CONSTRAINT vaults_film_title_len CHECK ((char_length(film_title) <= 300)),
    CONSTRAINT vaults_format_len CHECK ((char_length(format) <= 100)),
    CONSTRAINT vaults_poster_path_len CHECK ((char_length(poster_path) <= 2048))
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
    logo_url text,
    CONSTRAINT venues_address_len CHECK ((char_length(address) <= 2000)),
    CONSTRAINT venues_bio_len CHECK ((char_length(bio) <= 2000)),
    CONSTRAINT venues_description_len CHECK ((char_length(description) <= 2000)),
    CONSTRAINT venues_email_len CHECK ((char_length(email) <= 320)),
    CONSTRAINT venues_instagram_len CHECK ((char_length(instagram) <= 2048)),
    CONSTRAINT venues_location_len CHECK ((char_length(location) <= 2000)),
    CONSTRAINT venues_logo_url_len CHECK ((char_length(logo_url) <= 2048)),
    CONSTRAINT venues_name_len CHECK ((char_length(name) <= 300)),
    CONSTRAINT venues_phone_len CHECK ((char_length(phone) <= 50)),
    CONSTRAINT venues_screens_len CHECK ((char_length((screens)::text) <= 50000)),
    CONSTRAINT venues_seat_layout_len CHECK ((char_length((seat_layout)::text) <= 50000)),
    CONSTRAINT venues_vibes_len CHECK ((char_length((vibes)::text) <= 8000)),
    CONSTRAINT venues_website_len CHECK ((char_length(website) <= 2048))
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
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT video_reviews_avatar_len CHECK ((char_length(avatar) <= 2048)),
    CONSTRAINT video_reviews_film_poster_len CHECK ((char_length(film_poster) <= 2048)),
    CONSTRAINT video_reviews_film_title_len CHECK ((char_length(film_title) <= 300)),
    CONSTRAINT video_reviews_thumbnail_url_len CHECK ((char_length(thumbnail_url) <= 2048)),
    CONSTRAINT video_reviews_title_len CHECK ((char_length(title) <= 300)),
    CONSTRAINT video_reviews_username_len CHECK ((char_length(username) <= 100)),
    CONSTRAINT video_reviews_video_url_len CHECK ((char_length(video_url) <= 2048))
);


--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    tier text DEFAULT 'archivist'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT waitlist_email_len CHECK ((char_length(email) <= 320)),
    CONSTRAINT waitlist_tier_len CHECK ((char_length(tier) <= 100))
);


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
-- Name: interactions_queue_buffer interactions_queue_buffer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions_queue_buffer
    ADD CONSTRAINT interactions_queue_buffer_pkey PRIMARY KEY (id);


--
-- Name: programmes programmes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programmes
    ADD CONSTRAINT programmes_pkey PRIMARY KEY (id);


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
-- Name: cinema_reviews_cinema_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cinema_reviews_cinema_id_idx ON public.cinema_reviews USING btree (cinema_id);


--
-- Name: idx_buffer_user_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buffer_user_target ON public.interactions_queue_buffer USING btree (user_id, target_log_id);


--
-- Name: idx_tips_to_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tips_to_user ON public.tips USING btree (to_user_id);


--
-- Name: idx_tips_video; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tips_video ON public.tips USING btree (video_id);


--
-- Name: idx_video_reviews_film; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_reviews_film ON public.video_reviews USING btree (film_id);


--
-- Name: idx_video_reviews_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_reviews_user ON public.video_reviews USING btree (user_id);


--
-- Name: programmes_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX programmes_user_id_idx ON public.programmes USING btree (user_id);


--
-- Name: waitlist_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX waitlist_created_at_idx ON public.waitlist USING btree (created_at DESC);


--
-- Name: waitlist_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX waitlist_email_unique ON public.waitlist USING btree (email);


--
-- Name: video_reviews enforce_video_review_security; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_video_review_security BEFORE UPDATE ON public.video_reviews FOR EACH ROW EXECUTE FUNCTION public.protect_video_review_metrics();


--
-- Name: tips on_tip_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_tip_created AFTER INSERT ON public.tips FOR EACH ROW EXECUTE FUNCTION public.increment_video_tips();


--
-- Name: showtimes set_showtimes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_showtimes_updated_at BEFORE UPDATE ON public.showtimes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tickets set_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: vaults set_vaults_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_vaults_updated_at BEFORE UPDATE ON public.vaults FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: venues set_venues_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_venues_updated_at BEFORE UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: programmes tr_ban_gate_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_ban_gate_insert BEFORE INSERT ON public.programmes FOR EACH ROW EXECUTE FUNCTION public.enforce_not_restricted();


--
-- Name: vaults tr_ban_gate_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_ban_gate_insert BEFORE INSERT ON public.vaults FOR EACH ROW EXECUTE FUNCTION public.enforce_not_restricted();


--
-- Name: programmes tr_ban_gate_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_ban_gate_update BEFORE UPDATE ON public.programmes FOR EACH ROW EXECUTE FUNCTION public.enforce_not_restricted();


--
-- Name: vaults tr_ban_gate_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_ban_gate_update BEFORE UPDATE ON public.vaults FOR EACH ROW EXECUTE FUNCTION public.enforce_not_restricted();


--
-- Name: video_reviews trg_derive_username; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_derive_username BEFORE INSERT OR UPDATE ON public.video_reviews FOR EACH ROW EXECUTE FUNCTION public.derive_username_column();


--
-- Name: user_reports trigger_process_user_report; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_process_user_report AFTER INSERT ON public.user_reports FOR EACH ROW EXECUTE FUNCTION public.process_user_report();


--
-- Name: cinema_reviews cinema_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cinema_reviews
    ADD CONSTRAINT cinema_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: programmes programmes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programmes
    ADD CONSTRAINT programmes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: showtimes showtimes_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.showtimes
    ADD CONSTRAINT showtimes_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_showtime_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_showtime_id_fkey FOREIGN KEY (showtime_id) REFERENCES public.showtimes(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


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
    ADD CONSTRAINT vaults_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: venues venues_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: video_reviews video_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_reviews
    ADD CONSTRAINT video_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: waitlist Anyone can join waitlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can join waitlist" ON public.waitlist FOR INSERT WITH CHECK (true);


--
-- Name: cinema_reviews Cinema reviews are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cinema reviews are viewable by everyone." ON public.cinema_reviews FOR SELECT USING (true);


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
-- Name: programmes Public programmes are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public programmes are viewable by everyone." ON public.programmes FOR SELECT USING (((is_public = true) OR (auth.uid() = user_id)));


--
-- Name: showtimes Showtimes are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Showtimes are viewable by everyone." ON public.showtimes FOR SELECT USING (true);


--
-- Name: tickets Users can buy tickets.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can buy tickets." ON public.tickets FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: cinema_reviews Users can manage their cinema reviews.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their cinema reviews." ON public.cinema_reviews USING ((auth.uid() = user_id));


--
-- Name: programmes Users can manage their programmes.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their programmes." ON public.programmes USING ((auth.uid() = user_id));


--
-- Name: vaults Users can manage their vaults.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their vaults." ON public.vaults USING ((auth.uid() = user_id));


--
-- Name: user_reports Users can submit reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can submit reports" ON public.user_reports FOR INSERT WITH CHECK ((auth.uid() = reporter_id));


--
-- Name: tickets Users can view their own tickets.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own tickets." ON public.tickets FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_reports Users cannot view reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users cannot view reports" ON public.user_reports FOR SELECT USING (false);


--
-- Name: vaults Vaults are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vaults are viewable by everyone." ON public.vaults FOR SELECT USING (true);


--
-- Name: venues Venues are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Venues are viewable by everyone." ON public.venues FOR SELECT USING (true);


--
-- Name: cinema_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cinema_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: interactions_queue_buffer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interactions_queue_buffer ENABLE ROW LEVEL SECURITY;

--
-- Name: programmes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;

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
-- Name: user_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

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
-- PostgreSQL database dump complete
--

\unrestrict BtkJ3GSAu7S60b8O98gTvOGMAvMsY1Rtsh02eoI1lQYvneXX4pcDR8Ho4OecMia


-- ── Materialized view ─────────────────────────────────────────────────────
--
-- PostgreSQL database dump
--

\restrict wRwocnIuylsZOqwWKFr4IzOmm4VVp0tgcNnWugKfHGUWOk7Li9r1B5hX9IyTasb

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

SET default_tablespace = '';

SET default_table_access_method = heap;

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
-- Name: idx_global_feed_mat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_global_feed_mat_id ON public.global_feed_materialized USING btree (id);


--
-- PostgreSQL database dump complete
--

\unrestrict wRwocnIuylsZOqwWKFr4IzOmm4VVp0tgcNnWugKfHGUWOk7Li9r1B5hX9IyTasb


-- ── Functions (14 dropped + 4 pre-rewrite originals) ──────────────────────
SET search_path TO public, pg_temp;
CREATE OR REPLACE FUNCTION public.book_showtime_seat(p_showtime_id uuid, p_slot_id text, p_seat_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.create_lounge_with_member(p_name text, p_description text, p_is_private boolean, p_invite_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.decrement_follow_counts(follower_id uuid, followed_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  begin  update public.profiles set following_count = greatest(0, following_count - 1) where id = follower_id;
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = followed_id;
    end;
    $function$
;
CREATE OR REPLACE FUNCTION public.get_filtered_stacks_cursor(p_search text DEFAULT ''::text, p_following text[] DEFAULT '{}'::text[], p_limit integer DEFAULT 60, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid, created_at timestamp with time zone, films jsonb, certify_count bigint, is_ranked boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.handle_interaction_removal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.handle_user_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.increment_follow_counts(follower_id uuid, followed_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin  update public.profiles set following_count = following_count + 1 where id = follower_id;
  update public.profiles set followers_count = followers_count + 1 where id = followed_id;
  end;
  $function$
;
CREATE OR REPLACE FUNCTION public.increment_video_tips()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    UPDATE public.video_reviews
    SET tip_total = tip_total + NEW.amount
    WHERE id = NEW.video_id;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.increment_video_views(p_video_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    UPDATE video_reviews
    SET views = COALESCE(views, 0) + 1
    WHERE id = p_video_id;
$function$
;
CREATE OR REPLACE FUNCTION public.is_blocked_by(viewer_id uuid, author_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE blocker_id = auth.uid() AND blocked_id = author_id AND type = 'block'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.process_secure_tip(p_to_user_id uuid, p_video_id uuid, p_amount numeric, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.process_user_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    UPDATE public.profiles
    SET trust_score = GREATEST(trust_score - 25, 0)
    WHERE id = NEW.reported_id;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.role := OLD.role;
    NEW.tier := OLD.tier;
    NEW.is_founding := OLD.is_founding;
    NEW.member_no := OLD.member_no;
    NEW.is_banned := OLD.is_banned;
    NEW.ban_reason := OLD.ban_reason;
    NEW.banned_at := OLD.banned_at;
    NEW.suspended_until := OLD.suspended_until;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.warning_count := OLD.warning_count;
    NEW.trust_score := OLD.trust_score;
    NEW.entitlement_source := OLD.entitlement_source;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_global_feed()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY global_feed_materialized;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.request_account_deletion()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid      uuid := auth.uid();
  -- Their handle, read while the profile still exists. Several erasures below
  -- can only be keyed on the name itself, and after the delete there is nothing
  -- left to look it up from.
  v_handle text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT username INTO v_handle FROM public.profiles WHERE id = uid;

  -- ── A lounge outlives the person who started it ──────────────────────────
  -- lounges.creator_id -> profiles is ON DELETE CASCADE, so deleting the founder
  -- destroys the lounge and every conversation in it. That never fired before
  -- only because account deletion was broken; fixing deletion ARMS it. Five real
  -- lounges with messages exist.
  --
  -- SET NULL is not the answer either. Every lounge policy is written as
  -- `auth.uid() = creator_id`, and there is no admin override, so a null creator
  -- leaves a lounge nobody can rename, moderate or even delete — a permanent
  -- zombie. Verified against the live policies, not assumed.
  --
  -- So: hand it on. The longest-standing approved member becomes the founder.
  -- If nobody else is left the lounge is empty, and letting it go with them is
  -- correct rather than destructive.
  UPDATE public.lounges l
     SET creator_id = (
           SELECT m.user_id FROM public.lounge_members m
            WHERE m.lounge_id = l.id AND m.user_id <> uid AND m.status = 'approved'
            ORDER BY m.joined_at ASC NULLS LAST
            LIMIT 1)
   WHERE l.creator_id = uid
     AND EXISTS (SELECT 1 FROM public.lounge_members m
                  WHERE m.lounge_id = l.id AND m.user_id <> uid AND m.status = 'approved');

  -- Whatever is left had no one else in it. The CASCADE below takes those.

  -- ── Shared content: the words stay, the name goes ────────────────────────
  -- user_id and the handle move together, in one statement, or the derive
  -- trigger writes the real name straight back over the tombstone.
  UPDATE public.log_comments
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dossier_comments
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dispatch_dossiers
     SET user_id = NULL, author_username = '[deleted]'
   WHERE user_id = uid;

  -- ── Names FROZEN into other people's rows at write time ─────────────────
  -- A foreign key can only null an ID. These columns are copies of the handle
  -- taken when the row was written, so they are not reachable by any cascade and
  -- survive the account entirely: 51 of 51 notifications carry one today. Leaving
  -- them is residual personal data after an erasure request — the account is gone
  -- and the name is still legible.
  --
  -- ⚠️ reply_to_username MUST be done before the lounge_messages line below.
  -- It is identified through the parent message's author, and that author is
  -- about to become NULL — after which there is nothing left to match on.
  UPDATE public.lounge_messages
     SET reply_to_username = '[deleted]'
   WHERE reply_to_id IN (SELECT id FROM public.lounge_messages WHERE user_id = uid);

  -- Notifications they CAUSED go entirely, rather than being tombstoned.
  -- The handle is not only in from_username, it is written into the prose:
  -- "@divisionops is now following you." — 14 of 51 rows. Blanking the column
  -- would leave the sentence perfectly legible, which is not erasure. And a
  -- notification from someone who no longer exists is noise to its recipient:
  -- there is nobody to visit and nothing to answer.
  DELETE FROM public.notifications WHERE from_user_id = uid;

  UPDATE public.tips          SET from_username = '[deleted]' WHERE from_user_id = uid;
  UPDATE public.video_reviews SET user_id = NULL, username = '[deleted]' WHERE user_id = uid;

  -- A share freezes the shared person's handle into someone else's message:
  -- ShareToLoungeModal writes { log_id, owner_username } and
  -- { dossier_id, author_username }. No id to match on inside the json, so this
  -- is keyed on the handle captured above — which is why it must run BEFORE the
  -- profile disappears. Zero rows carry these keys today; the path exists, so the
  -- erasure has to cover it.
  IF v_handle IS NOT NULL THEN
    UPDATE public.lounge_messages
       SET metadata = (metadata - 'owner_username') - 'author_username'
     WHERE metadata->>'owner_username' = v_handle
        OR metadata->>'author_username' = v_handle;
  END IF;

  -- These two carry no denormalised handle; they read the author through a join,
  -- so a null author is all that is needed.
  UPDATE public.list_comments   SET user_id = NULL WHERE user_id = uid;
  UPDATE public.lounge_messages SET user_id = NULL WHERE user_id = uid;

  -- ── Their uploads ────────────────────────────────────────────────────────
  -- Everything above this point is rows. A face is a file, and nothing removed
  -- it: 11 objects sit in `avatars` and `screening-room`, both PUBLIC buckets,
  -- reachable by URL forever after the person asked to be erased. A photograph
  -- of somebody is the most personal thing here and it was the one thing the
  -- deletion never touched.
  --
  -- `owner` is set on every object (10/10 and 1/1) and paths are prefixed with
  -- the uploader's id, so they are attributable either way; owner is the honest
  -- key. Removing the row is what makes the object unreachable — the storage API
  -- resolves every request through this table.
  -- Supabase guards this table with storage.protect_delete(), which raises
  -- 42501 on any direct DELETE unless `storage.allow_delete_query` is set. My
  -- throwaway had a plain table with no such trigger, so this passed there and
  -- BROKE ACCOUNT DELETION ENTIRELY on production — the whole function aborted
  -- at this line. Caught by running the real thing against the real database
  -- inside a rolled-back transaction; nothing else would have found it.
  --
  -- The guard exists to stop rows being removed while the underlying file stays
  -- in the bucket. That is the right default and the wrong answer here: the
  -- alternative is the client calling the Storage API separately, which can fail
  -- halfway and leave an account half-erased. Removing the row is what makes the
  -- object unreachable — every storage request resolves through this table — so
  -- the erasure is complete from the member's side and atomic with the rest.
  -- The physical file may linger in the bucket until a storage sweep; that is a
  -- housekeeping matter, not a privacy one.
  PERFORM set_config('storage.allow_delete_query', 'true', true);  -- true = this transaction only
  DELETE FROM storage.objects WHERE owner = uid;

  -- ── Everything else follows the account ──────────────────────────────────
  -- Personal content CASCADEs; moderation history SET NULLs. One statement, so
  -- it cannot half-succeed the way the old hand-written sequence did.
  DELETE FROM auth.users WHERE id = uid;
END
$function$
;
CREATE OR REPLACE FUNCTION public.sweep_interaction_buffer()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.sync_denormalized_username()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN

    UPDATE public.dispatch_dossiers
       SET author_username = NEW.username
     WHERE user_id = NEW.id
       AND author_username IS DISTINCT FROM NEW.username;

    UPDATE public.dossier_comments
       SET username = NEW.username
     WHERE user_id = NEW.id
       AND username IS DISTINCT FROM NEW.username;

    UPDATE public.log_comments
       SET username = NEW.username
     WHERE user_id = NEW.id
       AND username IS DISTINCT FROM NEW.username;

    UPDATE public.video_reviews
       SET username = NEW.username
     WHERE user_id = NEW.id
       AND username IS DISTINCT FROM NEW.username;

  END IF;

  RETURN NULL;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_my_display_name(p_display_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  IF char_length(p_display_name) > 60 THEN RAISE EXCEPTION 'Display name too long (max 60 chars).'; END IF;
  UPDATE public.profiles SET display_name = p_display_name, updated_at = NOW() WHERE id = v_user_id;
END;
$function$
;
