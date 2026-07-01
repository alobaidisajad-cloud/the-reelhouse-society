-- Elite Fix for Infinite Recursion in lounge_members RLS policy

-- 1. Create a security definer function to avoid recursive RLS evaluations
CREATE OR REPLACE FUNCTION public.is_lounge_member_or_host(_lounge_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lounges
    WHERE id = _lounge_id AND creator_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.lounge_members
    WHERE lounge_id = _lounge_id AND user_id = auth.uid() AND status = 'approved'
  );
$$;

-- 2. Drop the recursively broken policy
DROP POLICY IF EXISTS "Roster visible to members and host" ON public.lounge_members;

-- 3. Create the optimized policy
CREATE POLICY "Roster visible to members and host" ON public.lounge_members FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_lounge_member_or_host(lounge_id)
);
