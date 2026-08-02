/**
 * sync-entitlement — Server-Side Entitlement Validation
 * ──────────────────────────────────────────────────────
 * Validates RevenueCat entitlement data server-side before
 * writing subscription tier to the profiles table.
 *
 * Why this exists:
 *   The mobile client cannot be trusted to write its own
 *   subscription tier — a jailbroken device could set
 *   `role = 'auteur'` without paying. This Edge Function
 *   validates the tier is legitimate before writing.
 *
 * Flow:
 *   1. Client sends { tier } with auth JWT
 *   2. Edge Function validates JWT → extracts user_id
 *   3. Validates tier is one of the allowed values
 *   4. Writes to profiles.role using service-role key
 *   5. Returns { tier } on success
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
    // 1. Validate auth
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

    // 2. Fetch authoritative entitlements from RevenueCat (S2S)
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
        // 404 simply means the user has never made a purchase and has no RevenueCat history.
        // It is perfectly safe to assume they have an empty entitlements object.
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
    
    // Determine highest active tier (cryptographically verified truth)
    // Mobile client relies on 'cinephile' as the base tier.
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

    // 3. The founding -> auteur mapping used to live here AND, copy-pasted, in
    //    paytabs-handler. It now lives once, inside public.apply_entitlement.
    //    'founding' is a purchase type, not a storable value: profiles_role_check
    //    permits free|cinephile|archivist|auteur|projectionist|admin and not
    //    'founding'. The seat itself is recorded by claim_founding_seat below.

    // 4. Write with service-role key (bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // The 100-seat cap can only be enforced atomically inside claim_founding_seat
    // (row-locked counter — see supabase/migrations/20260620_claim_founding_seat_rpc.sql).
    // RevenueCat has already charged the user by the time this function runs, so even if
    // the cap is reached we still grant the 'auteur' tier they paid for — we just don't
    // mark them is_founding. seatClaimed=false in the response lets the client surface
    // "founding seats are full, you've been granted Auteur tier instead" if desired.
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

    // ⚠️ #47 — this used to be `.update({ role: dbRole, tier: dbRole })`, which
    // overwrote `role` unconditionally. `role` is BOTH the subscription tier and the
    // admin permission flag, so an admin tapping "Restore Purchases" — a button
    // Apple requires — had role rewritten to 'cinephile' and permanently lost the
    // Tribunal. Every RLS policy that reads `role` gates on role='admin' (reports,
    // mod_actions, warnings, dossier comment moderation), so one button destroyed
    // the entire moderation system with no in-app way back.
    //
    // apply_entitlement preserves 'admin', still writes the tier into `role` for
    // everyone else (the web has 27 gates reading `role` and zero reading `tier` —
    // stop writing it and web purchasers get nothing), validates the tier, and
    // raises if no profile matched instead of silently succeeding.
    // ⚠️ p_source MUST be 'revenuecat' here. RevenueCat only knows about App Store /
    // Play purchases. A member who bought on the WEBSITE through PayTabs and then taps
    // "Restore Purchases" in the app gets a truthful "this Apple ID never bought
    // anything" — and before the source rule existed, that answer overwrote their paid
    // tier with cinephile, destroying the purchase on BOTH surfaces (same account).
    // apply_entitlement now refuses a downgrade from a provider that did not grant the
    // current tier. A genuinely lapsed App Store subscription still downgrades, because
    // that IS a revenuecat-granted tier. See 20260803_01_entitlement_source.sql.
    const { data: applyRows, error: updateError } = await adminClient
      .rpc('apply_entitlement', { p_user_id: user.id, p_tier: tier, p_source: 'revenuecat' });

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Failed to update profile' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // A refusal is NOT an error — it is the rule working. But we must not report the
    // requested tier back as though it had been applied, or the client would show a
    // demotion that never happened to the account.
    const applied = Array.isArray(applyRows) ? applyRows[0] : applyRows;
    const wasApplied = applied?.out_applied !== false;
    const effectiveTier = wasApplied ? tier : (applied?.out_tier ?? tier);

    // 5. Success
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
