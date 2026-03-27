-- ============================================================
-- REELHOUSE SOCIETY — SUPABASE SCHEMA v2.0
-- Elite Production-Grade Database
-- Run this full script in the Supabase SQL Editor
-- ============================================================

-- ENABLE UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- ============================================================
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  username text unique not null,
  role text default 'cinephile' check (role in ('cinephile', 'archivist', 'auteur', 'venue_owner', 'admin')),
  tier text default 'free' check (tier in ('free', 'archivist', 'auteur')),
  avatar_url text,
  bio text,
  persona text default 'The Cinephile',
  favorite_films jsonb default '[]'::jsonb,
  is_social_private boolean default false,
  followers_count integer default 0,
  following_count integer default 0,
  total_logs integer default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone." on profiles;
drop policy if exists "Users can insert their own profile." on profiles;
drop policy if exists "Users can update own profile." on profiles;

create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);


-- ============================================================
-- 2. FILM LOGS (Core Feature — expanded with all 20+ columns)
-- ============================================================
create table if not exists public.logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  film_id integer not null,
  film_title text not null,
  poster_path text,
  year integer,
  rating numeric check (rating >= 0 and rating <= 5),
  review text,
  status text default 'watched' check (status in ('watched', 'abandoned', 'rewatched')),
  watched_date date not null default current_date,
  is_spoiler boolean default false,
  watched_with text,
  private_notes text,
  abandoned_reason text,
  physical_media text,
  format text default 'Digital',
  is_autopsied boolean default false,
  autopsy jsonb,
  alt_poster text,
  editorial_header text,
  drop_cap boolean default false,
  pull_quote text default '',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.logs enable row level security;

drop policy if exists "Logs are viewable by everyone." on logs;
drop policy if exists "Users can manage their logs." on logs;

create policy "Logs are viewable by everyone." on logs for select using (true);
create policy "Users can insert their logs." on logs for insert with check (auth.uid() = user_id);
create policy "Users can update their logs." on logs for update using (auth.uid() = user_id);
create policy "Users can delete their logs." on logs for delete using (auth.uid() = user_id);

create index if not exists logs_user_id_idx on public.logs(user_id);
create index if not exists logs_created_at_idx on public.logs(created_at desc);
create index if not exists logs_film_id_idx on public.logs(film_id);


-- ============================================================
-- 3. WATCHLISTS (expanded with poster_path)
-- ============================================================
create table if not exists public.watchlists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  film_id integer not null,
  film_title text not null,
  poster_path text,
  year integer,
  created_at timestamptz default now() not null,
  unique(user_id, film_id)
);
alter table public.watchlists enable row level security;

drop policy if exists "Watchlists are viewable by everyone." on watchlists;
drop policy if exists "Users can manage their watchlists." on watchlists;

create policy "Watchlists are viewable by everyone." on watchlists for select using (true);
create policy "Users can manage their watchlists." on watchlists for all using (auth.uid() = user_id);

create index if not exists watchlists_user_id_idx on public.watchlists(user_id);


-- ============================================================
-- 4. VAULTS (Physical media archive — expanded)
-- ============================================================
create table if not exists public.vaults (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  film_id integer not null,
  film_title text not null,
  poster_path text,
  year integer,
  format text not null default 'Digital',
  created_at timestamptz default now() not null,
  unique(user_id, film_id, format)
);
alter table public.vaults enable row level security;

drop policy if exists "Vaults are viewable by everyone." on vaults;
drop policy if exists "Users can manage their vaults." on vaults;

create policy "Vaults are viewable by everyone." on vaults for select using (true);
create policy "Users can manage their vaults." on vaults for all using (auth.uid() = user_id);

create index if not exists vaults_user_id_idx on public.vaults(user_id);


-- ============================================================
-- 5. CUSTOM LISTS
-- ============================================================
create table if not exists public.lists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  is_ranked boolean default false,
  is_private boolean default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.lists enable row level security;

drop policy if exists "Lists are viewable by everyone." on lists;
drop policy if exists "Users can manage their lists." on lists;

create policy "Lists are viewable by everyone." on lists for select using (true);
create policy "Users can manage their lists." on lists for all using (auth.uid() = user_id);

create table if not exists public.list_items (
  id uuid default uuid_generate_v4() primary key,
  list_id uuid references public.lists(id) on delete cascade not null,
  film_id integer not null,
  film_title text not null,
  poster_path text,
  rank_position integer,
  notes text,
  created_at timestamptz default now() not null,
  unique(list_id, film_id)
);
alter table public.list_items enable row level security;

drop policy if exists "List items are viewable by everyone." on list_items;
drop policy if exists "Users can manage list items" on list_items;

create policy "List items are viewable by everyone." on list_items for select using (true);
create policy "Users can manage list items." on list_items for all using (
  auth.uid() in (select user_id from lists where id = list_id)
);


-- ============================================================
-- 6. INTERACTIONS (follows, endorsements, reactions)
-- NOTE: type uses text with NO strict CHECK — allows react_🎬 etc.
-- ============================================================
create table if not exists public.interactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  target_user_id uuid references public.profiles(id) on delete cascade,
  target_log_id uuid references public.logs(id) on delete cascade,
  target_list_id uuid references public.lists(id) on delete cascade,
  type text not null,  -- 'follow', 'endorse_log', 'endorse_list', 'react_🎬', etc.
  created_at timestamptz default now() not null,
  -- Prevent duplicate interactions of the same type on the same target
  unique nulls not distinct (user_id, target_user_id, type),
  unique nulls not distinct (user_id, target_log_id, type),
  unique nulls not distinct (user_id, target_list_id, type)
);
alter table public.interactions enable row level security;

drop policy if exists "Interactions viewable by everyone." on interactions;
drop policy if exists "Users can manage their interactions." on interactions;

create policy "Interactions viewable by everyone." on interactions for select using (true);
create policy "Users can manage their interactions." on interactions for all using (auth.uid() = user_id);

create index if not exists interactions_user_id_idx on public.interactions(user_id);
create index if not exists interactions_target_log_id_idx on public.interactions(target_log_id);
create index if not exists interactions_target_user_id_idx on public.interactions(target_user_id);


-- ============================================================
-- 7. NOTIFICATIONS
-- ============================================================
create table if not exists public.notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null,  -- 'follow', 'reaction', 'endorse', 'comment'
  from_username text not null,
  from_user_id uuid references public.profiles(id) on delete set null,
  message text not null,
  is_read boolean default false,
  related_log_id uuid references public.logs(id) on delete set null,
  created_at timestamptz default now() not null
);
alter table public.notifications enable row level security;

drop policy if exists "Users can view their own notifications." on notifications;
drop policy if exists "Users can insert notifications." on notifications;
drop policy if exists "Users can update their own notifications." on notifications;

create policy "Users can view their own notifications." on notifications for select using (auth.uid() = user_id);
create policy "Authenticated users can insert notifications." on notifications for insert with check (auth.role() = 'authenticated');
create policy "Users can update their own notifications." on notifications for update using (auth.uid() = user_id);

create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_is_read_idx on public.notifications(is_read);


-- ============================================================
-- 8. PROGRAMMES (Auteur Nightly Programmes)
-- ============================================================
create table if not exists public.programmes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  films jsonb default '[]'::jsonb,  -- Array of { id, title, poster_path, note }
  is_public boolean default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.programmes enable row level security;

create policy "Public programmes are viewable by everyone." on programmes for select using (is_public = true or auth.uid() = user_id);
create policy "Users can manage their programmes." on programmes for all using (auth.uid() = user_id);

create index if not exists programmes_user_id_idx on public.programmes(user_id);


-- ============================================================
-- 9. LIST COMMENTS
-- ============================================================
create table if not exists public.list_comments (
  id uuid default uuid_generate_v4() primary key,
  list_id uuid references public.lists(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now()
);
alter table public.list_comments enable row level security;

create policy "List comments viewable by everyone." on list_comments for select using (true);
create policy "Users can manage their list comments." on list_comments for all using (auth.uid() = user_id);

create index if not exists list_comments_list_id_idx on public.list_comments(list_id);
create index if not exists list_comments_user_id_idx on public.list_comments(user_id);


-- ============================================================
-- 10. CINEMA REVIEWS
-- ============================================================
create table if not exists public.cinema_reviews (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  cinema_id text not null,  -- External cinema identifier
  cinema_name text not null,
  rating numeric check (rating >= 0 and rating <= 5) not null,
  review text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(user_id, cinema_id)  -- One review per cinema per user
);
alter table public.cinema_reviews enable row level security;

create policy "Cinema reviews are viewable by everyone." on cinema_reviews for select using (true);
create policy "Users can manage their cinema reviews." on cinema_reviews for all using (auth.uid() = user_id);

create index if not exists cinema_reviews_cinema_id_idx on public.cinema_reviews(cinema_id);


-- ============================================================
-- 10. DISPATCH DOSSIERS (Community Essays / Articles)
-- ============================================================
create table if not exists public.dispatch_dossiers (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  author_username text not null,
  title text not null,
  excerpt text,
  full_content text,
  is_published boolean default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.dispatch_dossiers enable row level security;

create policy "Published dossiers are viewable by everyone." on dispatch_dossiers for select using (is_published = true);
create policy "Users can manage their dossiers." on dispatch_dossiers for all using (auth.uid() = user_id);

create index if not exists dispatch_dossiers_created_at_idx on public.dispatch_dossiers(created_at desc);


-- ============================================================
-- 11. VENUES
-- ============================================================
create table if not exists public.venues (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  location text not null,
  address text,
  description text,
  bio text,
  email text,
  phone text,
  website text,
  instagram text,
  logo_url text,
  vibes jsonb default '[]'::jsonb,
  seat_layout jsonb default '{"rows": 10, "cols": 15, "vipRows": 2, "aisleAfterCol": 7}'::jsonb,
  is_verified boolean default false,
  payment_connected boolean default false,
  platform_fee_percent integer default 15,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.venues enable row level security;

drop policy if exists "Venues are viewable by everyone." on venues;
drop policy if exists "Owners can manage their venues." on venues;

create policy "Venues are viewable by everyone." on venues for select using (true);
create policy "Owners can manage their venues." on venues for all using (auth.uid() = owner_id);


-- ============================================================
-- 12. SHOWTIMES
-- ============================================================
create table if not exists public.showtimes (
  id uuid default uuid_generate_v4() primary key,
  venue_id uuid references public.venues(id) on delete cascade not null,
  film_id integer not null,
  film_title text not null,
  date date not null,
  slots jsonb default '[]'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.showtimes enable row level security;

drop policy if exists "Showtimes are viewable by everyone." on showtimes;
drop policy if exists "Owners can manage their showtimes." on showtimes;

create policy "Showtimes are viewable by everyone." on showtimes for select using (true);
create policy "Owners can manage their showtimes." on showtimes for all using (
  auth.uid() in (select owner_id from venues where id = venue_id)
);

create index if not exists showtimes_venue_id_idx on public.showtimes(venue_id);
create index if not exists showtimes_date_idx on public.showtimes(date);


-- ============================================================
-- 13. TICKETS (Digital Stubs)
-- ============================================================
create table if not exists public.tickets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  showtime_id uuid references public.showtimes(id) not null,
  slot_id text not null,
  seat text not null,
  ticket_type text not null,
  amount numeric not null,
  qr_code text,
  created_at timestamptz default now() not null
);
alter table public.tickets enable row level security;

drop policy if exists "Users can view their own tickets." on tickets;
drop policy if exists "Users can buy tickets." on tickets;

create policy "Users can view their own tickets." on tickets for select using (auth.uid() = user_id);
create policy "Users can buy tickets." on tickets for insert with check (auth.uid() = user_id);

create index if not exists tickets_user_id_idx on public.tickets(user_id);


-- ============================================================
-- 14. AUTH TRIGGER — Auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
declare
  _username text;
  _role text;
begin
  _username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1)
  );
  _role := coalesce(new.raw_user_meta_data->>'role', 'cinephile');

  insert into public.profiles (id, username, role)
  values (new.id, _username, _role)
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============================================================
-- 15. UPDATED_AT TRIGGERS — Auto-update timestamps
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles before update on public.profiles for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_logs on public.logs;
create trigger set_updated_at_logs before update on public.logs for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_lists on public.lists;
create trigger set_updated_at_lists before update on public.lists for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_programmes on public.programmes;
create trigger set_updated_at_programmes before update on public.programmes for each row execute procedure public.set_updated_at();


-- ============================================================
-- 16. REALTIME — Enable live subscriptions on key tables
-- ============================================================
alter publication supabase_realtime add table public.logs;
alter publication supabase_realtime add table public.interactions;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.dispatch_dossiers;
