-- The undo of 20261015_03: visitors may run the three functions again, and a new
-- function in public starts open to visitors and members again.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.salon_channel_readable(text),
    public.salon_channel_seated(text),
    public.send_salon_typing(uuid)
  TO anon;
