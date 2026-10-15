-- An undo that forgets to give the visitors their function back.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
SELECT 1;
