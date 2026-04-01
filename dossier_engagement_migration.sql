-- ══════════════════════════════════════════════════════
-- DISPATCH DOSSIER ENGAGEMENT — Views, Certifications, Critiques
-- Run in Supabase SQL Editor
-- ══════════════════════════════════════════════════════

-- 1) Add views + certify counters to dossiers
ALTER TABLE public.dispatch_dossiers
    ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS certify_count INTEGER DEFAULT 0;

-- 2) Certification tracking table (who certified what)
CREATE TABLE IF NOT EXISTS public.dossier_certifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    dossier_id UUID REFERENCES public.dispatch_dossiers(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, dossier_id)
);

ALTER TABLE public.dossier_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Certifications viewable by everyone" ON public.dossier_certifications
    FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can certify" ON public.dossier_certifications
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can uncertify" ON public.dossier_certifications
    FOR DELETE USING (auth.uid() = user_id);

-- 3) Dossier comments / critiques table
CREATE TABLE IF NOT EXISTS public.dossier_comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    dossier_id UUID REFERENCES public.dispatch_dossiers(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    username TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.dossier_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dossier comments viewable by everyone" ON public.dossier_comments
    FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can comment on dossiers" ON public.dossier_comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own dossier comments" ON public.dossier_comments
    FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS dossier_comments_dossier_id_idx ON public.dossier_comments(dossier_id);
CREATE INDEX IF NOT EXISTS dossier_comments_created_at_idx ON public.dossier_comments(created_at DESC);

-- 4) RPC to increment view count (avoids race conditions)
CREATE OR REPLACE FUNCTION public.increment_dossier_views(dossier_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.dispatch_dossiers
    SET views = COALESCE(views, 0) + 1
    WHERE id = dossier_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) RPC to toggle certification (insert or delete + update counter)
CREATE OR REPLACE FUNCTION public.toggle_dossier_certify(dossier_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    already_certified BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.dossier_certifications
        WHERE user_id = auth.uid() AND dossier_id = dossier_uuid
    ) INTO already_certified;

    IF already_certified THEN
        DELETE FROM public.dossier_certifications
        WHERE user_id = auth.uid() AND dossier_id = dossier_uuid;
        
        UPDATE public.dispatch_dossiers
        SET certify_count = GREATEST(0, COALESCE(certify_count, 0) - 1)
        WHERE id = dossier_uuid;
        
        RETURN FALSE;
    ELSE
        INSERT INTO public.dossier_certifications (user_id, dossier_id)
        VALUES (auth.uid(), dossier_uuid);
        
        UPDATE public.dispatch_dossiers
        SET certify_count = COALESCE(certify_count, 0) + 1
        WHERE id = dossier_uuid;
        
        RETURN TRUE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
