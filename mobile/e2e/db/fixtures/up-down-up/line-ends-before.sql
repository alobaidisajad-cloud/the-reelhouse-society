-- A function as a Windows checkout applies it: its body's lines end in CRLF (made here with chr(13),
-- so this file itself keeps LF).
DO $$
BEGIN
  EXECUTE 'CREATE FUNCTION public.rh_line_ends() RETURNS integer LANGUAGE sql AS '
    || quote_literal('SELECT 1' || chr(13) || chr(10) || '  + 1');
END $$;
