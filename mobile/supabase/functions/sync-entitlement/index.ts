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
 *
 * Paced as a person calls it (a_members_call_is_paced, kind store_read: a room
 * of 10, one more each 30 seconds, 200 a day), before the store is asked: each
 * call spends the house's own allowance at RevenueCat, which every member's
 * purchase and the store's own word to the house share. Past the pace, 429 with
 * the seconds to wait (Retry-After), which the app's queue waits on.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyStoreRecord } from '../_shared/storeRecord.ts';

const json = (body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

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
    if (authError) {
      // Auth refusing the token (its 4xx) is the caller's; Auth unreachable or failing is the
      // house's, 503, so the app's queue keeps the purchase and asks again.
      if (typeof authError.status === 'number' && authError.status >= 400 && authError.status < 500) {
        return json({ error: 'Invalid or expired token' }, 401);
      }
      return json({ error: 'Sign-in could not be checked' }, 503);
    }
    if (!user) return json({ error: 'Invalid or expired token' }, 401);

    const storeKey = Deno.env.get('REVENUECAT_SECRET_KEY');
    if (!storeKey) return json({ error: 'The store is not configured' }, 500);

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // The member's pace, before the store is asked; a pace the house could not ask is a moment's
    // failure (502, asked again), never a call let through unpaced.
    const { error: paceError } = await admin.rpc('a_members_call_is_paced', { p_member: user.id, p_kind: 'store_read' });
    if (paceError?.code === 'RH429') {
      const wait = /^[0-9]+$/.test(paceError.hint ?? '') ? String(paceError.hint) : '30';
      return json({ error: 'Rate limit exceeded', retry_after: Number(wait) }, 429, { 'Retry-After': wait });
    }
    if (paceError) return json({ error: 'could not ask the house' }, 502);
    const applied = await applyStoreRecord(admin, user.id, storeKey, Date.now(), Deno.env.get('REVENUECAT_API_URL'));
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
