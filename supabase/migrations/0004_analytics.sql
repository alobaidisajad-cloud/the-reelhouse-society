-- ══════════════════════════════════════════════════════════════
-- ReelHouse — Analytics Events Table
-- Lightweight event tracking for user behavior analysis.
-- Version: 0004
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_name TEXT NOT NULL,
    properties JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own events
CREATE POLICY "Users can insert analytics events" ON public.analytics_events
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Only service role can read (admin dashboard, future)
CREATE POLICY "Service role can read analytics" ON public.analytics_events
    FOR SELECT USING (auth.role() = 'service_role');

-- Indexes for querying
CREATE INDEX IF NOT EXISTS analytics_event_name_idx ON public.analytics_events(event_name);
CREATE INDEX IF NOT EXISTS analytics_created_at_idx ON public.analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_user_id_idx ON public.analytics_events(user_id);

-- Partition hint: for production scale, consider partitioning by month
COMMENT ON TABLE public.analytics_events IS 'Lightweight analytics tracking. Auto-partitioning recommended at 1M+ rows.';
