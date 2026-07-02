-- ═══════════════════════════════════════════════════════════════════════════════
-- PERF — indexes for the hot Dispatch/Dossier read paths
-- ═══════════════════════════════════════════════════════════════════════════════
-- First-load latency (the "retrieving dossier" lag) is bounded by query speed, not
-- the client cache. These indexes match the exact filter/order columns used by
-- DossierService + app/dossier/[id].tsx so those reads hit an index instead of a
-- sequential scan. Idempotent and non-destructive — safe to run any time.
--
-- Note: plain CREATE INDEX briefly locks the table while building. On these small
-- tables that's negligible; if any table is large, run the matching statement
-- manually with CREATE INDEX CONCURRENTLY (which cannot run inside a transaction).
-- ═══════════════════════════════════════════════════════════════════════════════

-- Comments for a dossier, ordered oldest→newest (app/dossier/[id].tsx).
CREATE INDEX IF NOT EXISTS idx_dossier_comments_dossier_created
  ON public.dossier_comments (dossier_id, created_at);

-- "Has this user certified this dossier?" point lookup.
CREATE INDEX IF NOT EXISTS idx_dossier_certifications_user_dossier
  ON public.dossier_certifications (user_id, dossier_id);

-- Dispatch feed: published dossiers, newest first (src/stores/content.ts loadDossiers).
CREATE INDEX IF NOT EXISTS idx_dispatch_dossiers_feed
  ON public.dispatch_dossiers (is_published, created_at DESC);

-- Newest-first log ordering used by the community/following feed cursor RPCs.
CREATE INDEX IF NOT EXISTS idx_logs_created_at
  ON public.logs (created_at DESC);
