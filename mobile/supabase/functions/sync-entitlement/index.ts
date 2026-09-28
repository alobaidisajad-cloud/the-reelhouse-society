/**
 * sync-entitlement — a member's tier, from RevenueCat's own record
 * ──────────────────────────────────────────────────────
 * The client cannot be trusted to name its own tier (a jailbroken device could
 * claim 'auteur'), so it names nothing:
 *   1. the caller is identified from their JWT;
 *   2. their entitlements are fetched from RevenueCat, server to server;
 *   3. the highest active one is granted through grant_entitlement, and the
 *      founding seat claimed;
 *   4. the tier actually in force is returned, with whether it was applied.
 *
 * Never a direct profile update: `role` is also the admin flag, which
 * grant_entitlement keeps (Restore Purchases must not un-admin a moderator). Its
 * source is 'revenuecat', as a provider may only lower a tier it granted, so a web
 * purchase survives "this Apple ID bought nothing". It is its own name, never an
 * overload of apply_entitlement: PostgREST ambiguity must not fail a payment.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_TIERS = ['free', 'cinephile', 'archivist', 'auteur', 'founding'] as const;
type Tier = typeof ALLOWED_TIERS[number];

serve(async (req: Request) => {
  // CORS preflight
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
    // Who is calling
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create anon client to validate JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Their entitlements, from RevenueCat, server to server
    const rcSecretKey = Deno.env.get('REVENUECAT_SECRET_KEY');
    if (!rcSecretKey) {
      throw new Error('Missing REVENUECAT_SECRET_KEY');
    }

    const rcResponse = await fetch(`https://api.revenuecat.com/v1/subscribers/${user.id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${rcSecretKey}`,
        'Accept': 'application/json'
      }
    });

    let rcData;
    if (!rcResponse.ok) {
      if (rcResponse.status === 404) {
        // 404: never purchased anything, so no entitlements.
        rcData = { subscriber: { entitlements: {} } };
      } else {
        return new Response(JSON.stringify({ error: 'Failed to verify subscriptions' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      rcData = await rcResponse.json();
    }

    const entitlements = rcData?.subscriber?.entitlements || {};
    
    // The highest active tier, from RevenueCat's record; 'cinephile' is the base.
    let tier: Tier = 'cinephile';
    const now = new Date();
    
    const isActive = (entKey: string) => {
      const ent = entitlements[entKey];
      if (!ent) return false;
      // If expires_date is null, it's a lifetime purchase
      if (ent.expires_date === null) return true;
      return new Date(ent.expires_date) > now;
    };

    if (isActive('founding')) tier = 'founding';
    else if (isActive('auteur')) tier = 'auteur';
    else if (isActive('archivist')) tier = 'archivist';
    else if (isActive('cinephile')) tier = 'cinephile';

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 'founding' is a purchase, stored as auteur; the seat is claim_founding_seat's,
    // which caps atomically. The member has paid, so a full house still grants auteur.
    let seatClaimed = true;
    if (tier === 'founding') {
      const { data: claimed, error: claimError } = await adminClient.rpc('claim_founding_seat', {
        p_user_id: user.id,
      });
      if (claimError) {
        return new Response(JSON.stringify({ error: 'Failed to verify founding seat availability' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      seatClaimed = claimed === true;
    }

    // Through grant_entitlement, source 'revenuecat' (see the header: both must stay).
    const { data: applyRows, error: updateError } = await adminClient
      .rpc('grant_entitlement', { p_user_id: user.id, p_tier: tier, p_source: 'revenuecat' });

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Failed to update profile' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // A refusal is the rule working, not an error: report the tier in force, not the one asked.
    const applied = Array.isArray(applyRows) ? applyRows[0] : applyRows;
    const wasApplied = applied?.out_applied !== false;
    const effectiveTier = wasApplied ? tier : (applied?.out_tier ?? tier);

    return new Response(JSON.stringify({
      tier: effectiveTier,
      userId: user.id,
      seatClaimed,
      applied: wasApplied,
      reason: applied?.out_reason ?? null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
