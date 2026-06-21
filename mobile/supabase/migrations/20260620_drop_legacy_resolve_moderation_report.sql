-- SECURITY FIX: resolve_moderation_report (v1) had no admin-role check.
-- Any authenticated user could call it directly via the Supabase REST/RPC
-- endpoint to delete arbitrary reviews/lists/logs/dossiers or ban arbitrary
-- users, since the only gate was a client-side route redirect in the app.
--
-- resolve_moderation_report_v2 already does this correctly (verifies
-- profiles.role = 'admin' for p_admin_id before acting — see
-- society_report_system.sql). The mobile client has been migrated to call
-- only v2. This migration removes the unguarded v1 function entirely so
-- there is no longer a callable RPC without the admin check.

-- Guarded with to_regprocedure() so this is a no-op (not an error) on
-- environments where the legacy function was never deployed.
DO $$
BEGIN
  IF to_regprocedure('resolve_moderation_report(uuid, text, text, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION resolve_moderation_report(uuid, text, text, uuid) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION resolve_moderation_report(uuid, text, text, uuid) FROM anon;
    DROP FUNCTION resolve_moderation_report(uuid, text, text, uuid);
  END IF;
END $$;
