-- Undo of 20261120_00: a member's sign-in attempts are kept per door, per member and per phone, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A1's tables undone · run after H-A1.down (its functions name them) ──
DROP TABLE IF EXISTS public.sign_in_devices;
DROP TABLE IF EXISTS public.sign_in_handles;
DROP TABLE IF EXISTS public.sign_in_doors;
