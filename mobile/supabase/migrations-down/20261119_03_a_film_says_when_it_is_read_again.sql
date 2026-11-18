-- Undo of 20261119_03: a film says when it is to be read again, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- Undo of H-C5 (locks): the films' read bookkeeping goes. Undo H-C5's index and H-C5.up first: the
-- claim and the taste profile they put back read none of these columns.
-- add-only (1): no shipped client uses it: columns this piece makes, read and written by sync-films and the house's functions alone (TestFlight build 41 and the website checked)
ALTER TABLE public.films
  DROP COLUMN IF EXISTS release_date,
  DROP COLUMN IF EXISTS reread_after,
  DROP COLUMN IF EXISTS sync_reads;
