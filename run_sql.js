import pg from 'pg';
const { Client } = pg;

const password = 'alobaidi1999.';
// fallback to session pooler (IPv4)
const dbUrl = `postgresql://postgres.wihyqkpoymwcvbprslyz:${password}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`;

// Because standard pg requires SSL for supabase
const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

const sql = `
-- WATCHLISTS 
create table if not exists public.watchlists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  film_id integer not null,
  film_title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, film_id)
);
alter table public.watchlists enable row level security;
do $$ begin create policy "Watchlists are viewable by everyone." on watchlists for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "Users can manage their watchlists." on watchlists for all using (auth.uid() = user_id); exception when duplicate_object then null; end $$;

-- VAULTS 
create table if not exists public.vaults (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  film_id integer not null,
  film_title text not null,
  format text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, film_id, format)
);
alter table public.vaults enable row level security;
do $$ begin create policy "Vaults are viewable by everyone." on vaults for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "Users can manage their vaults." on vaults for all using (auth.uid() = user_id); exception when duplicate_object then null; end $$;

-- CUSTOM LISTS
create table if not exists public.lists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  title text not null,
  description text,
  is_ranked boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.lists enable row level security;
do $$ begin create policy "Lists are viewable by everyone." on lists for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "Users can manage their lists." on lists for all using (auth.uid() = user_id); exception when duplicate_object then null; end $$;

create table if not exists public.list_items (
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
do $$ begin create policy "List items are viewable by everyone." on list_items for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "Users can manage list items" on list_items for all using (
  auth.uid() in (select user_id from lists where id = list_id)
); exception when duplicate_object then null; end $$;

-- INTERACTIONS
create table if not exists public.interactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  target_user_id uuid references public.profiles(id),
  target_log_id uuid references public.logs(id),
  target_list_id uuid references public.lists(id),
  type text not null check (type in ('follow', 'endorse_log', 'endorse_list')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.interactions enable row level security;
do $$ begin create policy "Interactions viewable by everyone." on interactions for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "Users can manage their interactions." on interactions for all using (auth.uid() = user_id); exception when duplicate_object then null; end $$;
`;

async function run() {
    try {
        await client.connect();
        console.log("Connected to Supabase Postgres.");
        await client.query(sql);
        console.log("SQL schema built successfully!");
    } catch (err) {
        console.error("Database connection or query error:", err);
    } finally {
        await client.end();
    }
}

run();
