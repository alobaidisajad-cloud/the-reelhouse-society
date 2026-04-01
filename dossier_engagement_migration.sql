-- ══════════════════════════════════════════════════════
-- DISPATCH DOSSIER ENGAGEMENT — Views, Certifications
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

-- 3) RPC to increment view count (avoids race conditions)
CREATE OR REPLACE FUNCTION public.increment_dossier_views(dossier_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.dispatch_dossiers
    SET views = COALESCE(views, 0) + 1
    WHERE id = dossier_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) RPC to toggle certification (insert or delete + update counter)
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
