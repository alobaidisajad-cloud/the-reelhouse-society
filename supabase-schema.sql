-- REELHOUSE SUPABASE SCHEMA
-- Run this in the Supabase SQL Editor to set up the database

-- 1. PROFILES
create table public.profiles (
  id uuid references auth.users not null primary key,
  username text unique not null,
  role text default 'cinephile' check (role in ('cinephile', 'venue_owner', 'admin')),
  avatar_url text,
  bio text,
  favorite_films jsonb default '[]'::jsonb, -- Array of TMDB IDs
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);

-- 2. VENUES
create table public.venues (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) not null,
  name text not null,
  location text not null,
  vibes jsonb default '[]'::jsonb, -- Array of strings
  seat_layout jsonb default '{"rows": 10, "cols": 15, "vipRows": 2, "aisleAfterCol": 7}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.venues enable row level security;
create policy "Venues are viewable by everyone." on venues for select using (true);
create policy "Owners can manage their venues." on venues for all using (auth.uid() = owner_id);

-- 3. SHOWTIMES
create table public.showtimes (
  id uuid default uuid_generate_v4() primary key,
  venue_id uuid references public.venues(id) not null,
  film_id integer not null, -- TMDB ID
  film_title text not null,
  date date not null,
  slots jsonb default '[]'::jsonb, -- Array of slots e.g. [{id, time, format, bookedSeats, ticketTypes}]
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.showtimes enable row level security;
create policy "Showtimes are viewable by everyone." on showtimes for select using (true);
create policy "Owners can manage their showtimes." on showtimes for all using (
  auth.uid() in (select owner_id from venues where id = venue_id)
);

-- 4. TICKETS (Digital Stubs)
create table public.tickets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  showtime_id uuid references public.showtimes(id) not null,
  slot_id text not null,
  seat text not null,
  ticket_type text not null,
  amount numeric not null,
  qr_code text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.tickets enable row level security;
create policy "Users can view their own tickets." on tickets for select using (auth.uid() = user_id);
create policy "Users can buy tickets." on tickets for insert with check (auth.uid() = user_id);

-- 5. LOGS (User diary entries)
create table public.logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  film_id integer not null, -- TMDB ID
  film_title text not null,
  rating numeric check (rating >= 0 and rating <= 5),
  review text,
  watched_date date not null,
  format text, -- VHS, 35mm, Digital, etc.
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.logs enable row level security;
create policy "Logs are viewable by everyone." on logs for select using (true);
create policy "Users can manage their logs." on logs for all using (auth.uid() = user_id);

-- 6. WATCHLISTS (Films to watch)
create table public.watchlists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  film_id integer not null,
  film_title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, film_id)
);
alter table public.watchlists enable row level security;
create policy "Watchlists are viewable by everyone." on watchlists for select using (true);
create policy "Users can manage their watchlists." on watchlists for all using (auth.uid() = user_id);

-- 7. VAULTS (Physical media collection)
create table public.vaults (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  film_id integer not null,
  film_title text not null,
  format text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, film_id, format)
);
alter table public.vaults enable row level security;
create policy "Vaults are viewable by everyone." on vaults for select using (true);
create policy "Users can manage their vaults." on vaults for all using (auth.uid() = user_id);

-- 8. CUSTOM LISTS
create table public.lists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  title text not null,
  description text,
  is_ranked boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.lists enable row level security;
create policy "Lists are viewable by everyone." on lists for select using (true);
create policy "Users can manage their lists." on lists for all using (auth.uid() = user_id);

create table public.list_items (
  id uuid default uuid_generate_v4() primary key,
  list_id uuid references public.lists(id) on delete cascade not null,
  film_id integer not null,
  film_title text not null,
  rank_position integer,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(list_id, film_id)
);
alter table public.list_items enable row level security;
create policy "List items are viewable by everyone." on list_items for select using (true);
create policy "Users can manage list items" on list_items for all using (
  auth.uid() in (select user_id from lists where id = list_id)
);

-- 9. INTERACTIONS (Follows, Endorsements)
create table public.interactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  target_user_id uuid references public.profiles(id),
  target_log_id uuid references public.logs(id),
  target_list_id uuid references public.lists(id),
  type text not null check (type in ('follow', 'endorse_log', 'endorse_list')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.interactions enable row level security;
create policy "Interactions viewable by everyone." on interactions for select using (true);
create policy "Users can manage their interactions." on interactions for all using (auth.uid() = user_id);

-- Setup Auth trigger to auto-create profile on signup
create function public.handle_new_user() 
returns trigger as $$
declare
  _username text;
  _role text;
begin
  _username := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  _role := coalesce(new.raw_user_meta_data->>'role', 'cinephile');

  insert into public.profiles (id, username, role)
  values (new.id, _username, _role);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 10. ENABLE REALTIME ACROSS FEED TABLES
alter publication supabase_realtime add table public.logs;
alter publication supabase_realtime add table public.interactions;
