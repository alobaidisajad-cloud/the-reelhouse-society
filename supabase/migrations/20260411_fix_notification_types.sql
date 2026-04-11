-- ============================================================
-- FIX: Expand notification type constraint to include 'reaction'
-- The ReactionBar inserts type='reaction' but the original schema
-- only allowed: follow, endorse, comment, system
-- ============================================================

-- Drop old constraint and re-create with full type list
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'endorse', 'comment', 'reaction', 'system'));

-- ============================================================
-- ADD: list_comments table for stack critiques
-- ============================================================
CREATE TABLE IF NOT EXISTS public.list_comments (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  list_id uuid REFERENCES public.lists(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.list_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read list comments
DO $$ BEGIN
  CREATE POLICY "List comments viewable by everyone" ON public.list_comments FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can manage their own comments
DO $$ BEGIN
  CREATE POLICY "Users can manage their list comments" ON public.list_comments FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS list_comments_list_id_idx ON public.list_comments(list_id);
CREATE INDEX IF NOT EXISTS list_comments_user_id_idx ON public.list_comments(user_id);
