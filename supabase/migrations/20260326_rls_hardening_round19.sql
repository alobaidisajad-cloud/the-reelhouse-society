-- ============================================================
-- REELHOUSE SOCIETY — BACKEND SECURITY PATCH 003 (ROUND 19)
-- Elite Production Hardening for RLS, Tickets, and Tips
-- ============================================================

-- ------------------------------------------------------------
-- 1. TICKET ISSUANCE ENGINE (Bypassing RLS strictly)
-- ------------------------------------------------------------
-- Problem: Normal users cannot UPDATE showtimes.slots because
-- they do not own the venue.
-- Solution: A SECURITY DEFINER RPC to safely append a seat to the
-- JSONB array if it doesn't already exist.

CREATE OR REPLACE FUNCTION public.book_showtime_seat(
    p_showtime_id UUID,
    p_slot_id TEXT,
    p_seat_id TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_slots JSONB;
    v_slot JSONB;
    v_updated_slots JSONB;
    v_found BOOLEAN := FALSE;
    v_idx INT := 0;
BEGIN
    -- 1. Fetch the current slots array for the showtime
    SELECT slots INTO v_slots
    FROM public.showtimes
    WHERE id = p_showtime_id;

    IF v_slots IS NULL THEN
        RAISE EXCEPTION 'Showtime not found.';
    END IF;

    -- 2. Find the slot and append the seat
    -- We must reconstruct the JSONB array manually in PL/pgSQL
    SELECT jsonb_agg(
        CASE
            WHEN elem->>'id' = p_slot_id THEN
                -- Check if seat already exists in bookedSeats array
                CASE 
                    WHEN (elem->'bookedSeats') ? p_seat_id THEN
                        elem  -- Seat is already booked! Do nothing.
                    ELSE
                        -- Append seat to the bookedSeats array
                        jsonb_set(
                            elem,
                            '{bookedSeats}',
                            COALESCE(elem->'bookedSeats', '[]'::jsonb) || to_jsonb(p_seat_id)
                        )
                END
            ELSE
                elem
        END
    ) INTO v_updated_slots
    FROM jsonb_array_elements(v_slots) AS elem;

    -- 3. Only update if something changed (prevents double bookings)
    IF v_slots != COALESCE(v_updated_slots, '[]'::jsonb) THEN
        UPDATE public.showtimes
        SET slots = v_updated_slots
        WHERE id = p_showtime_id;
    END IF;

    RETURN v_updated_slots;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------
-- 2. FINANCIAL SECRECY: TIP PROCESSING ENGINE
-- ------------------------------------------------------------
-- Problem: Anyone can forge a client-side INSERT to the tips table.
-- Solution: Drop the insert policy. Create a secure RPC.

-- Remove client-side insert access entirely!
DROP POLICY IF EXISTS "tips_insert" ON public.tips;

-- The secure gateway for tips
-- (In a true production build, this would be restricted to service_role)
CREATE OR REPLACE FUNCTION public.process_secure_tip(
    p_to_user_id UUID,
    p_video_id UUID,
    p_amount NUMERIC(10,2),
    p_message TEXT
)
RETURNS UUID AS $$
DECLARE
    v_from_user_id UUID := auth.uid();
    v_from_username TEXT;
    v_tip_id UUID;
BEGIN
    IF v_from_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be authenticated to tip.';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Tip must be greater than zero.';
    END IF;

    SELECT username INTO v_from_username
    FROM public.profiles
    WHERE id = v_from_user_id;

    INSERT INTO public.tips (
        from_user_id,
        from_username,
        to_user_id,
        video_id,
        amount,
        message
    ) VALUES (
        v_from_user_id,
        v_from_username,
        p_to_user_id,
        p_video_id,
        p_amount,
        p_message
    ) RETURNING id INTO v_tip_id;

    RETURN v_tip_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to safely update video_reviews tip_total on server side
CREATE OR REPLACE FUNCTION public.increment_video_tips()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.video_reviews
    SET tip_total = tip_total + NEW.amount
    WHERE id = NEW.video_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_tip_created ON public.tips;
CREATE TRIGGER on_tip_created
    AFTER INSERT ON public.tips
    FOR EACH ROW EXECUTE PROCEDURE public.increment_video_tips();


-- ------------------------------------------------------------
-- 3. VIDEO REVIEWS: OWNERSHIP HIJACKING PREVENTION
-- ------------------------------------------------------------
-- Hardening the update policy to enforce payload boundaries
DROP POLICY IF EXISTS "video_reviews_update" ON public.video_reviews;

CREATE POLICY "video_reviews_update" ON public.video_reviews 
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Hardening payload fields using a Before Update Trigger
CREATE OR REPLACE FUNCTION public.protect_video_review_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Revert ownership or metric tampering
  NEW.user_id = OLD.user_id;
  NEW.username = OLD.username;
  NEW.views = OLD.views;
  NEW.tip_total = OLD.tip_total;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_video_review_security ON public.video_reviews;
CREATE TRIGGER enforce_video_review_security
  BEFORE UPDATE ON public.video_reviews
  FOR EACH ROW EXECUTE PROCEDURE public.protect_video_review_metrics();
