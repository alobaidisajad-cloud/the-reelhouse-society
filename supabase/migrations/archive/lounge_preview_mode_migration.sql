-- ═══════════════════════════════════════════════════════════
-- THE LOUNGE — Preview Mode Enhancement Migration
-- Run this AFTER the reply system migration
-- ═══════════════════════════════════════════════════════════

-- Allows non-members to view messages in a public lounge, enabling "preview mode".
-- This replaces the strict "Members can read lounge messages" policy.

DROP POLICY IF EXISTS "Members can read lounge messages" ON public.lounge_messages;

CREATE POLICY "Anyone can read public lounge messages" ON public.lounge_messages
FOR SELECT USING (
    lounge_id IN (SELECT id FROM public.lounges WHERE is_private = false)
    OR lounge_id IN (SELECT lounge_id FROM public.lounge_members WHERE user_id = auth.uid())
);
