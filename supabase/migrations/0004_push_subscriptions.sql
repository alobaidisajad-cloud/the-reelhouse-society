-- ==========================================
-- REELHOUSE ROUND 7: WEB PUSH INFRASTRUCTURE
-- ==========================================

create table if not exists public.push_subscriptions (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Shielding
alter table public.push_subscriptions enable row level security;

-- Users can insert their own browser subscriptions
create policy "Users can insert their own push subscriptions" ON public.push_subscriptions
    for insert to authenticated
    with check (auth.uid() = user_id);

-- System uses service_role logic to read and broadcast pushes via Edge Function,
-- so authenticated users don't need SELECT access to other users' tokens.
create policy "Users can delete their own push subscriptions" ON public.push_subscriptions
    for delete to authenticated
    using (auth.uid() = user_id);
