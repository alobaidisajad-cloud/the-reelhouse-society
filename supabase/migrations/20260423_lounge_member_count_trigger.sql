-- ═══════════════════════════════════════════════════════════
-- THE LOUNGE — Elite Math: Member Count Synchronization
-- Ensures Lounge member_count perfectly reflects actual members
-- ═══════════════════════════════════════════════════════════

-- 1. Sync existing lounge member counts
UPDATE lounges l
SET member_count = (
    SELECT COUNT(*) 
    FROM lounge_members lm 
    WHERE lm.lounge_id = l.id
);

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION public.sync_lounge_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE lounges 
        SET member_count = member_count + 1 
        WHERE id = NEW.lounge_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE lounges 
        SET member_count = member_count - 1 
        WHERE id = OLD.lounge_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach the trigger to lounge_members
DROP TRIGGER IF EXISTS trigger_sync_lounge_member_count ON public.lounge_members;
CREATE TRIGGER trigger_sync_lounge_member_count
AFTER INSERT OR DELETE ON public.lounge_members
FOR EACH ROW EXECUTE PROCEDURE public.sync_lounge_member_count();
