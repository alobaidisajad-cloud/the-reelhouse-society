-- ══════════════════════════════════════════════════════════════
-- ReelHouse Complete Schema Migration
-- Run this against a fresh Supabase project to bootstrap all tables.
-- Version: 0001 — Baseline
-- ══════════════════════════════════════════════════════════════

-- ── EXTENSIONS ──
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════════════════════
-- PROFILES — extends Supabase auth.users
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE,
    role TEXT DEFAULT 'cinephile' CHECK (role IN ('cinephile', 'archivist', 'auteur', 'venue')),
    bio TEXT,
    avatar_url TEXT,
    is_social_private BOOLEAN DEFAULT FALSE,
    following TEXT[] DEFAULT '{}',
    followers TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
    FOR SELECT USING (TRUE);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'cinephile')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ══════════════════════════════════════════════════════════════
-- LOGS — film diary entries
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    film_id INTEGER NOT NULL,
    film_title TEXT NOT NULL,
    poster_path TEXT,
    year INTEGER,
    rating NUMERIC(3,1) DEFAULT 0,
    review TEXT,
    status TEXT DEFAULT 'watched' CHECK (status IN ('watched', 'rewatched', 'abandoned')),
    is_spoiler BOOLEAN DEFAULT FALSE,
    watched_date DATE,
    watched_with TEXT,
    private_notes TEXT,
    abandoned_reason TEXT,
    physical_media TEXT,
    is_autopsied BOOLEAN DEFAULT FALSE,
    autopsy TEXT,
    alt_poster TEXT,
    editorial_header TEXT,
    drop_cap BOOLEAN DEFAULT FALSE,
    pull_quote TEXT DEFAULT '',
    format TEXT DEFAULT 'Digital',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Logs viewable by everyone" ON public.logs
    FOR SELECT USING (TRUE);

CREATE POLICY "Users can insert their own logs" ON public.logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own logs" ON public.logs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own logs" ON public.logs
    FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS logs_user_id_idx ON public.logs(user_id);
CREATE INDEX IF NOT EXISTS logs_created_at_idx ON public.logs(created_at DESC);

-- ══════════════════════════════════════════════════════════════
-- WATCHLISTS — saved films to watch
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.watchlists (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    film_id INTEGER NOT NULL,
    film_title TEXT NOT NULL,
    poster_path TEXT,
    year INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, film_id)
);

ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Watchlists viewable by owner" ON public.watchlists
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their watchlist" ON public.watchlists
    FOR ALL USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- VAULTS — private physical media collection
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.vaults (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    film_id INTEGER NOT NULL,
    film_title TEXT NOT NULL,
    poster_path TEXT,
    year INTEGER,
    format TEXT DEFAULT 'Digital',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, film_id)
);

ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vaults viewable by owner" ON public.vaults
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their vault" ON public.vaults
    FOR ALL USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- LISTS — curated film collections
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.lists (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    is_ranked BOOLEAN DEFAULT FALSE,
    is_private BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lists viewable by everyone" ON public.lists
    FOR SELECT USING (TRUE);

CREATE POLICY "Users can manage their lists" ON public.lists
    FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.list_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    list_id UUID REFERENCES public.lists(id) ON DELETE CASCADE NOT NULL,
    film_id INTEGER NOT NULL,
    film_title TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(list_id, film_id)
);

ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "List items viewable by everyone" ON public.list_items
    FOR SELECT USING (TRUE);

CREATE POLICY "Users can manage items in their lists" ON public.list_items
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.lists WHERE id = list_id AND user_id = auth.uid())
    );

-- ══════════════════════════════════════════════════════════════
-- INTERACTIONS — endorsements, social graph
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.interactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    target_log_id UUID REFERENCES public.logs(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('follow', 'endorse_log')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, target_log_id, type)
);

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Interactions viewable by everyone" ON public.interactions
    FOR SELECT USING (TRUE);

CREATE POLICY "Users can manage their own interactions" ON public.interactions
    FOR ALL USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- NOTIFICATIONS — in-app real-time alerts
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('follow', 'endorse', 'comment', 'system')),
    from_username TEXT,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert notifications" ON public.notifications
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);

-- ══════════════════════════════════════════════════════════════
-- DISPATCH DOSSIERS — Auteur editorial content
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dispatch_dossiers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    author_username TEXT,
    title TEXT NOT NULL,
    excerpt TEXT DEFAULT '',
    full_content TEXT DEFAULT '',
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.dispatch_dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published dossiers viewable by everyone" ON public.dispatch_dossiers
    FOR SELECT USING (is_published = TRUE);

CREATE POLICY "Users can manage their own dossiers" ON public.dispatch_dossiers
    FOR ALL USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- PROGRAMMES — Nightly double features
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.programmes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    films JSONB DEFAULT '[]',
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public programmes viewable by everyone" ON public.programmes
    FOR SELECT USING (is_public = TRUE OR auth.uid() = user_id);

CREATE POLICY "Users can manage their own programmes" ON public.programmes
    FOR ALL USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- VENUES — cinema/theatre operator profiles
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.venues (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT 'My Cinema',
    location TEXT DEFAULT '',
    address TEXT DEFAULT '',
    description TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    website TEXT DEFAULT '',
    instagram TEXT DEFAULT '',
    logo TEXT,
    vibes TEXT[] DEFAULT '{}',
    seat_layout JSONB DEFAULT '{"rows": 10, "cols": 15, "vipRows": 2, "aisleAfterCol": 7}',
    verified BOOLEAN DEFAULT FALSE,
    payment_connected BOOLEAN DEFAULT FALSE,
    platform_fee_percent INTEGER DEFAULT 15,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venues viewable by everyone" ON public.venues
    FOR SELECT USING (TRUE);

CREATE POLICY "Venue owners can manage their venue" ON public.venues
    FOR ALL USING (auth.uid() = owner_id);

-- ══════════════════════════════════════════════════════════════
-- SHOWTIMES — film screenings at venues
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.showtimes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE NOT NULL,
    film_id INTEGER DEFAULT 0,
    film_title TEXT NOT NULL,
    date DATE NOT NULL,
    slots JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.showtimes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Showtimes viewable by everyone" ON public.showtimes
    FOR SELECT USING (TRUE);

CREATE POLICY "Venue owners can manage showtimes" ON public.showtimes
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_id = auth.uid())
    );

CREATE INDEX IF NOT EXISTS showtimes_venue_id_idx ON public.showtimes(venue_id);
CREATE INDEX IF NOT EXISTS showtimes_date_idx ON public.showtimes(date);

-- ══════════════════════════════════════════════════════════════
-- CINEMA REVIEWS — community cinema ratings
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cinema_reviews (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    cinema_id TEXT NOT NULL,
    cinema_name TEXT NOT NULL,
    rating NUMERIC(3,1) NOT NULL CHECK (rating >= 0 AND rating <= 5),
    review TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, cinema_id)
);

ALTER TABLE public.cinema_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cinema reviews viewable by everyone" ON public.cinema_reviews
    FOR SELECT USING (TRUE);

CREATE POLICY "Users can manage their own cinema reviews" ON public.cinema_reviews
    FOR ALL USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- ERROR LOGS — Sentry-style internal error tracking
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.error_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    error_message TEXT,
    error_stack TEXT,
    context JSONB,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only authenticated users can insert error logs" ON public.error_logs
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Error logs viewable by owner" ON public.error_logs
    FOR SELECT USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- REALTIME — enable realtime on key tables
-- ══════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ══════════════════════════════════════════════════════════════
-- STORAGE — avatar bucket
-- ══════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar" ON storage.objects
    FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);
