-- The undo of 20261015_05: the drift schema and every grant to drift_reader go,
-- then the login itself. A role is dropped only once nothing names it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DROP SCHEMA drift CASCADE;

REVOKE EXECUTE ON FUNCTION
    public.viewing_fields(),
    public.viewing_fields_uncovered(),
    public.profile_tier_weight(p_tier text, p_role text, p_is_founding boolean),
    public.tier_weight(t text)
  FROM drift_reader;
REVOKE SELECT (id, user_id, created_at) ON public.push_subscriptions FROM drift_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE SELECT ON TABLES FROM drift_reader;
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM drift_reader;
REVOKE USAGE ON SCHEMA public FROM drift_reader;

DROP ROLE drift_reader;
