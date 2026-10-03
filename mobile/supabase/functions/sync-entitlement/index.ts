/**
 * sync-entitlement — a member's rank, from RevenueCat's own record
 * ──────────────────────────────────────────────────────
 * The client cannot be trusted to name its own rank (a jailbroken device could
 * claim 'auteur'), so it names nothing: the caller is identified from their
 * JWT, and ../_shared/storeRecord.ts reads their whole record from RevenueCat,
 * server to server, claims a founding seat if one is held, and grants the
 * highest rank in force through grant_entitlement, source 'revenuecat' (each
 * source keeps its own grant, so the store never touches a rank given on the
 * web or by hand). The webhook does the same, whenever the store changes.
 *
 * Answers the rank now in force. A store that could not be read is 502, so the
 * app's queue tries again; it is never taken for "holds nothing".
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyStoreRecord } from '../_shared/storeRecord.ts';

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid or expired token' }, 401);

    const storeKey = Deno.env.get('REVENUECAT_SECRET_KEY');
    if (!storeKey) return json({ error: 'The store is not configured' }, 500);

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const applied = await applyStoreRecord(admin, user.id, storeKey);
    if (!applied.ok) return json({ error: applied.error }, applied.status);

    return json({
      userId: user.id,
      tier: applied.tier,
      storeTier: applied.storeTier,
      seatClaimed: applied.seatClaimed,
      changed: applied.changed,
    }, 200);
  } catch {
    return json({ error: 'Internal server error' }, 500);
  }
});
