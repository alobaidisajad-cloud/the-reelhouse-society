-- ════════════════════════════════════════════════════════════════════════════
-- 20260927_01 — one storage rule per avatar act, and each one binds
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── WHAT WAS THERE ────────────────────────────────────────────────────────
-- Found when the schema snapshot started printing storage rules in full
-- (live-outside-public.sql). storage.objects carried nine rules:
--
--   avatars  SELECT  public         bucket only             — anyone could LIST every
--                                                             member's folder, i.e. every
--                                                             member id with an avatar
--   avatars  INSERT  public         own folder
--   avatars  INSERT  authenticated  own folder + extension
--   avatars  UPDATE  public         own folder (no WITH CHECK)
--   avatars  UPDATE  authenticated  own folder + extension
--   avatars  DELETE  public         own folder
--   screening-room ×3 (read, upload, delete) — a bucket that does not exist
--
-- Permissive rules are ORed. So the two "mathematically verified" rules, the
-- ones that check the file extension, never bound: the looser twin beside each
-- one let any name through. And the screening-room rules wait for a bucket; the
-- day one is made, its read rule makes it public.
--
-- ── WHAT REPLACES THEM ────────────────────────────────────────────────────
-- One rule per act, signed-in members only, in their own folder:
--
--   read    own folder             (the app lists its own folder to tidy old avatars;
--                                   the web's upsert needs to see the object it replaces)
--   upload  own folder + extension
--   replace own folder, and the replacement keeps an image extension
--   delete  own folder
--
-- Showing an avatar needs none of these: the bucket is public, and a public
-- URL is served without reading storage.objects. The extensions are the
-- bucket's own MIME list (jpeg, png, webp, gif) — what the mobile app writes
-- (jpg/png/webp/gif, from the file's magic bytes) and what the web keeps from
-- the picked file's name.
--
-- Account deletion is untouched: delete_user_account removes a member's
-- objects as the function owner, which these rules do not govern.
--
-- ── REHEARSED ─────────────────────────────────────────────────────────────
-- Against production in one transaction that rolls back, a SAVEPOINT per case,
-- as a member (request.jwt.claims) and as a visitor: see the SQL pasted with
-- this change. Every "must refuse" case was seen to refuse.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "Avatar images are publicly accessible." ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar." ON storage.objects;
DROP POLICY IF EXISTS "Users can upload mathematically verified images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar." ON storage.objects;
DROP POLICY IF EXISTS "Users can update mathematically verified images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar." ON storage.objects;
DROP POLICY IF EXISTS auth_upload ON storage.objects;
DROP POLICY IF EXISTS owner_delete ON storage.objects;
DROP POLICY IF EXISTS public_read ON storage.objects;

CREATE POLICY avatars_read_own ON storage.objects
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY avatars_upload_own ON storage.objects
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND name ~* '\.(png|jpe?g|webp|gif)$');

CREATE POLICY avatars_replace_own ON storage.objects
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND name ~* '\.(png|jpe?g|webp|gif)$');

CREATE POLICY avatars_delete_own ON storage.objects
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

COMMIT;
