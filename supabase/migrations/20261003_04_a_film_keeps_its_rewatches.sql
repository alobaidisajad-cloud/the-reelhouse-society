-- ════════════════════════════════════════════════════════════════════════════
-- 20261003_04 — a film keeps its rewatches
-- ════════════════════════════════════════════════════════════════════════════
-- Each rewatch archives the viewing the log was on into logs.viewing_history:
-- its review (up to 5,000 characters), pull quote, companion and the rest —
-- about 5,850 characters at most within what the apps let a member write. The
-- history's ceiling was 50,000, so a log rewatched with long reviews refused
-- its ninth or so with an error naming a constraint.
--
-- 500,000 keeps some 85 such viewings, more for any review shorter than the
-- longest. It stays a ceiling (the history can still be written straight from
-- an older client, and a row must not grow without bound).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.logs DROP CONSTRAINT logs_viewing_history_len;
ALTER TABLE public.logs ADD CONSTRAINT logs_viewing_history_len
  CHECK (char_length(viewing_history::text) <= 500000);
