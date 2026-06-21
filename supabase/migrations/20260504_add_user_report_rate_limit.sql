-- ============================================================
-- REELHOUSE SOCIETY — RATE LIMITING (TRUST & SAFETY)
-- Date: 2026-05-04
-- Purpose: Enforce a strict rate limit on user_reports to 
--          prevent automated spam from manipulating the 
--          shadowban engine.
-- ============================================================

-- Function to check rate limit: Max 3 reports per 10 minutes per reporter
CREATE OR REPLACE FUNCTION enforce_user_report_rate_limit()
RETURNS trigger AS $$
DECLARE
    recent_reports_count INTEGER;
BEGIN
    -- Count reports by this user in the last 10 minutes
    SELECT COUNT(*)
    INTO recent_reports_count
    FROM public.user_reports
    WHERE reporter_id = NEW.reporter_id
      AND created_at > NOW() - INTERVAL '10 minutes';

    -- If 3 or more reports already exist in the window, block the insert
    IF recent_reports_count >= 3 THEN
        RAISE EXCEPTION 'Rate limit exceeded: You can only submit 3 reports per 10 minutes. Please wait before reporting again.'
        USING ERRCODE = '42900'; -- HTTP 429 Too Many Requests equivalent
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute BEFORE INSERT on user_reports
DROP TRIGGER IF EXISTS trigger_enforce_user_report_rate_limit ON public.user_reports;
CREATE TRIGGER trigger_enforce_user_report_rate_limit
    BEFORE INSERT ON public.user_reports
    FOR EACH ROW
    EXECUTE FUNCTION enforce_user_report_rate_limit();
