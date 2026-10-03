-- ════════════════════════════════════════════════════════════════════════════
-- 20261003_06 — a stack's entry keeps no notes
-- ════════════════════════════════════════════════════════════════════════════
-- list_items.notes was never written and never read: neither app, the importer,
-- the export, an edge function nor a database function names it, and every row
-- on production holds NULL. A column a member could write and no one reads is a
-- place for words no one sees, so it goes.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.list_items DROP COLUMN notes;
