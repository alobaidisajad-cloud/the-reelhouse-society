
$PAT = "sbp_d3002dd928770d4328f745709f2e2027b01d6e7c"
$REF = "gzhntuwosrakevulmcry"
$API = "https://api.supabase.com/v1/projects/$REF/database/query"
$H = @{ "Authorization" = "Bearer $PAT"; "Content-Type" = "application/json" }

function Q {
    param($sql, $lbl)
    $b = @{ query = $sql } | ConvertTo-Json -Depth 5
    try {
        Invoke-WebRequest -Uri $API -Method POST -Headers $H -Body $b -UseBasicParsing -ErrorAction Stop | Out-Null
        Write-Host "OK  $lbl"
    } catch {
        $msg = $_.ErrorDetails.Message
        Write-Host "ERR $lbl -- $msg"
    }
}

Write-Host "=== ReelHouse Staging Migration ==="

Q 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"' "uuid-ossp"

Q @'
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  role TEXT DEFAULT 'cinephile',
  bio TEXT,
  avatar_url TEXT,
  is_social_private BOOLEAN DEFAULT FALSE,
  following TEXT[] DEFAULT '{}',
  followers TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
'@ "profiles"

Q "ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY" "profiles_rls"
Q "CREATE POLICY ""Profiles are viewable by everyone"" ON public.profiles FOR SELECT USING (TRUE)" "profiles_select"
Q "CREATE POLICY ""Users can update their own profile"" ON public.profiles FOR UPDATE USING (auth.uid() = id)" "profiles_update"

Q @'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $func$
BEGIN
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'cinephile')
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER
'@ "handle_new_user"

Q "DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users" "drop_trigger"
Q "CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()" "signup_trigger"

Q @'
CREATE TABLE IF NOT EXISTS public.logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  film_id INTEGER NOT NULL,
  film_title TEXT NOT NULL,
  poster_path TEXT,
  year INTEGER,
  rating NUMERIC(3,1) DEFAULT 0,
  review TEXT,
  status TEXT DEFAULT 'watched',
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
)
'@ "logs"

Q "ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY" "logs_rls"
Q "CREATE POLICY ""Logs viewable by everyone"" ON public.logs FOR SELECT USING (TRUE)" "logs_select"
Q "CREATE POLICY ""Users can insert their own logs"" ON public.logs FOR INSERT WITH CHECK (auth.uid() = user_id)" "logs_insert"
Q "CREATE POLICY ""Users can update their own logs"" ON public.logs FOR UPDATE USING (auth.uid() = user_id)" "logs_update"
Q "CREATE POLICY ""Users can delete their own logs"" ON public.logs FOR DELETE USING (auth.uid() = user_id)" "logs_delete"
Q "CREATE INDEX IF NOT EXISTS logs_user_id_idx ON public.logs(user_id)" "logs_idx1"
Q "CREATE INDEX IF NOT EXISTS logs_created_at_idx ON public.logs(created_at DESC)" "logs_idx2"

Q @'
CREATE TABLE IF NOT EXISTS public.watchlists (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  film_id INTEGER NOT NULL,
  film_title TEXT NOT NULL,
  poster_path TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, film_id)
)
'@ "watchlists"
Q "ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY" "watchlists_rls"
Q "CREATE POLICY ""Watchlists viewable by owner"" ON public.watchlists FOR SELECT USING (auth.uid() = user_id)" "watchlists_select"
Q "CREATE POLICY ""Users can manage their watchlist"" ON public.watchlists FOR ALL USING (auth.uid() = user_id)" "watchlists_all"

Q @'
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
)
'@ "vaults"
Q "ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY" "vaults_rls"
Q "CREATE POLICY ""Vaults viewable by owner"" ON public.vaults FOR SELECT USING (auth.uid() = user_id)" "vaults_select"
Q "CREATE POLICY ""Users can manage their vault"" ON public.vaults FOR ALL USING (auth.uid() = user_id)" "vaults_all"

Q @'
CREATE TABLE IF NOT EXISTS public.lists (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_ranked BOOLEAN DEFAULT FALSE,
  is_private BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
'@ "lists"
Q "ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY" "lists_rls"
Q "CREATE POLICY ""Lists viewable by everyone"" ON public.lists FOR SELECT USING (TRUE)" "lists_select"
Q "CREATE POLICY ""Users can manage their lists"" ON public.lists FOR ALL USING (auth.uid() = user_id)" "lists_all"

Q @'
CREATE TABLE IF NOT EXISTS public.list_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  list_id UUID REFERENCES public.lists(id) ON DELETE CASCADE NOT NULL,
  film_id INTEGER NOT NULL,
  film_title TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, film_id)
)
'@ "list_items"
Q "ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY" "list_items_rls"
Q "CREATE POLICY ""List items viewable by everyone"" ON public.list_items FOR SELECT USING (TRUE)" "list_items_select"
Q "CREATE POLICY ""Users can manage items in their lists"" ON public.list_items FOR ALL USING (EXISTS (SELECT 1 FROM public.lists WHERE id = list_id AND user_id = auth.uid()))" "list_items_all"

Q @'
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  from_username TEXT,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
'@ "notifications"
Q "ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY" "notifications_rls"
Q "CREATE POLICY ""Users can see their own notifications"" ON public.notifications FOR SELECT USING (auth.uid() = user_id)" "notifications_select"
Q "CREATE POLICY ""Authenticated users can insert notifications"" ON public.notifications FOR INSERT WITH CHECK (auth.role() = 'authenticated')" "notifications_insert"
Q "CREATE POLICY ""Users can update their own notifications"" ON public.notifications FOR UPDATE USING (auth.uid() = user_id)" "notifications_update"
Q "CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id)" "notifications_idx"

Q @'
CREATE TABLE IF NOT EXISTS public.dispatch_dossiers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  author_username TEXT,
  title TEXT NOT NULL,
  excerpt TEXT DEFAULT '',
  full_content TEXT DEFAULT '',
  is_published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
'@ "dispatch_dossiers"
Q "ALTER TABLE public.dispatch_dossiers ENABLE ROW LEVEL SECURITY" "dossiers_rls"
Q "CREATE POLICY ""Published dossiers viewable by everyone"" ON public.dispatch_dossiers FOR SELECT USING (is_published = TRUE)" "dossiers_select"
Q "CREATE POLICY ""Users can manage their own dossiers"" ON public.dispatch_dossiers FOR ALL USING (auth.uid() = user_id)" "dossiers_all"

Q @'
CREATE TABLE IF NOT EXISTS public.programmes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  films JSONB DEFAULT '[]',
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
'@ "programmes"
Q "ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY" "programmes_rls"
Q "CREATE POLICY ""Public programmes viewable by everyone"" ON public.programmes FOR SELECT USING (is_public = TRUE OR auth.uid() = user_id)" "programmes_select"
Q "CREATE POLICY ""Users can manage their own programmes"" ON public.programmes FOR ALL USING (auth.uid() = user_id)" "programmes_all"

Q @'
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
  seat_layout JSONB DEFAULT '{"rows":10,"cols":15,"vipRows":2,"aisleAfterCol":7}',
  verified BOOLEAN DEFAULT FALSE,
  payment_connected BOOLEAN DEFAULT FALSE,
  platform_fee_percent INTEGER DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
'@ "venues"
Q "ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY" "venues_rls"
Q "CREATE POLICY ""Venues viewable by everyone"" ON public.venues FOR SELECT USING (TRUE)" "venues_select"
Q "CREATE POLICY ""Venue owners can manage their venue"" ON public.venues FOR ALL USING (auth.uid() = owner_id)" "venues_all"

Q @'
CREATE TABLE IF NOT EXISTS public.showtimes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE NOT NULL,
  film_id INTEGER DEFAULT 0,
  film_title TEXT NOT NULL,
  date DATE NOT NULL,
  slots JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
)
'@ "showtimes"
Q "ALTER TABLE public.showtimes ENABLE ROW LEVEL SECURITY" "showtimes_rls"
Q "CREATE POLICY ""Showtimes viewable by everyone"" ON public.showtimes FOR SELECT USING (TRUE)" "showtimes_select"
Q "CREATE POLICY ""Venue owners can manage showtimes"" ON public.showtimes FOR ALL USING (EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_id = auth.uid()))" "showtimes_all"
Q "CREATE INDEX IF NOT EXISTS showtimes_venue_id_idx ON public.showtimes(venue_id)" "showtimes_idx"

Q @'
CREATE TABLE IF NOT EXISTS public.cinema_reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cinema_id TEXT NOT NULL,
  cinema_name TEXT NOT NULL,
  rating NUMERIC(3,1) NOT NULL,
  review TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, cinema_id)
)
'@ "cinema_reviews"
Q "ALTER TABLE public.cinema_reviews ENABLE ROW LEVEL SECURITY" "cinema_reviews_rls"
Q "CREATE POLICY ""Cinema reviews viewable by everyone"" ON public.cinema_reviews FOR SELECT USING (TRUE)" "cinema_reviews_select"
Q "CREATE POLICY ""Users can manage their own cinema reviews"" ON public.cinema_reviews FOR ALL USING (auth.uid() = user_id)" "cinema_reviews_all"

Q "INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', TRUE) ON CONFLICT (id) DO NOTHING" "avatars_bucket"
Q "CREATE POLICY ""Avatar images are publicly accessible"" ON storage.objects FOR SELECT USING (bucket_id = 'avatars')" "avatars_select"
Q "CREATE POLICY ""Users can upload their own avatar"" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1])" "avatars_insert"

Write-Host ""
Write-Host "=== VERIFICATION ==="
$b2 = @{ query = "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" } | ConvertTo-Json
$r2 = Invoke-WebRequest -Uri $API -Method POST -Headers $H -Body $b2 -UseBasicParsing
$tables = $r2.Content | ConvertFrom-Json
$tables | ForEach-Object { Write-Host "  TABLE: $($_.tablename)" }
Write-Host "Total: $($tables.Count) tables created"
Write-Host "=== DONE ==="
