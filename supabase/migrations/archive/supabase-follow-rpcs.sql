-- ============================================================
-- REELHOUSE — FOLLOW SYSTEM RPCs
-- Run this in the Supabase SQL Editor to enable the follow system.
-- These run as SECURITY DEFINER so they bypass RLS and can update
-- any user's followers_count / following_count.
-- ============================================================

-- 1. Increment counts when someone follows
create or replace function public.increment_follow_counts(follower_id uuid, followed_id uuid)
returns void as $$
begin
  update public.profiles set following_count = following_count + 1 where id = follower_id;
  update public.profiles set followers_count = followers_count + 1 where id = followed_id;
end;
$$ language plpgsql security definer;

-- 2. Decrement counts when someone unfollows (never goes below 0)
create or replace function public.decrement_follow_counts(follower_id uuid, followed_id uuid)
returns void as $$
begin
  update public.profiles set following_count = greatest(0, following_count - 1) where id = follower_id;
  update public.profiles set followers_count = greatest(0, followers_count - 1) where id = followed_id;
end;
$$ language plpgsql security definer;
