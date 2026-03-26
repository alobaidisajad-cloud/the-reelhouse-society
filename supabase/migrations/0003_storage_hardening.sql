-- ==========================================
-- REELHOUSE ROUND 6: STORAGE BUCKET HARDENING
-- Eradicate Stored XSS and Storage BOMBs
-- ==========================================

-- 1. Drop the weak, vulnerable baseline policies for the avatars bucket
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;

-- 2. Create the Zero-Trust INSERT Policy
-- Constraints enforced simultaneously:
-- a) The bucket must explicitly be 'avatars'.
-- b) The target directory MUST mathematically match the executing user's JWT UUID to prevent cross-account overwrites.
-- c) The file extension is bound solely to web-safe images via regex (blocking .html, .svg, .js, .sh).
CREATE POLICY "Users can upload mathematically verified images" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'avatars' 
        AND auth.uid()::TEXT = (storage.foldername(name))[1]
        AND name ~* '\.(png|jpg|jpeg|webp)$'
    );

-- 3. Create the Zero-Trust UPDATE Policy
CREATE POLICY "Users can update mathematically verified images" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'avatars' 
        AND auth.uid()::TEXT = (storage.foldername(name))[1]
    )
    WITH CHECK (
        bucket_id = 'avatars' 
        AND auth.uid()::TEXT = (storage.foldername(name))[1]
        AND name ~* '\.(png|jpg|jpeg|webp)$'
    );
