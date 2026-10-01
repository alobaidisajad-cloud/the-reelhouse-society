/**
 * notify-push — Expo push sender (BACKEND-PUSH).
 * ────────────────────────────────────────────────
 * Triggered by a Database Webhook on INSERT into public.notifications. Looks up
 * the recipient's Expo push tokens and delivers the notification via Expo's push
 * service. The mobile app registers Expo tokens (getExpoPushTokenAsync) into
 * public.push_tokens, so this uses Expo's API directly — NO VAPID/web-push.
 *
 * Webhook payload (Supabase): { type:'INSERT', table:'notifications', record:{...} }
 *
 * Authentication: FUNCTION_SHARED_SECRET is REQUIRED. If unset or if the caller
 * omits the `x-function-secret` header, the request is rejected (fail closed).
 * The DB trigger reads the secret from Supabase Vault and sends it automatically.
 * Stale tokens that Expo reports as DeviceNotRegistered are pruned automatically.
 *
 * v3 (2026-09-27): fail-closed auth (was fail-open when secret unset), accept
 * both ExponentPushToken and ExpoPushToken formats, verify Expo API response.
 *
 * v2 (2026-07-15): per-type banner titles + the actor's name in the body.
 * Previously every push was titled 'The ReelHouse Society' with a bare message
 * ("started following your frequency.") — no WHO, no WHAT. Now the lock screen
 * explains itself: "At Your Door — @name is at your door — asking to follow you."
 * Social messages get the @name prefixed; lounge/house messages are already
 * self-contained sentences (prefixing would duplicate the name).
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { timingSafeEqual } from 'https://deno.land/std@0.177.0/crypto/timing_safe_equal.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') || '' // optional
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-function-secret',
}

interface NotificationRecord {
  id?: string
  user_id?: string
  type?: string
  from_username?: string | null
  message?: string
}

// ── The banner voice ────────────────────────────────────────────────────────
// Title tells you WHAT KIND of notice this is; body tells you who and what.
const TYPE_TITLES: Record<string, string> = {
  follow: 'A New Follower',
  follow_request: 'At Your Door',
  endorse: 'A Certification',
  comment: 'A New Critique',
  system: 'The Lounge',                 // lounge doors: requests + admissions
  moderation: 'A Notice from the House',
}
const DEFAULT_TITLE = 'The ReelHouse Society'

// Social notices store the actor separately (in-app renders "@name message");
// the push body must do the same or the banner has no WHO. Lounge/house
// messages are already complete sentences — never prefix those.
const ACTOR_PREFIXED_TYPES = new Set(['follow', 'follow_request', 'endorse', 'comment'])

function composeBanner(record: NotificationRecord): { title: string; body: string } {
  const type = record.type ?? 'system'
  const title = TYPE_TITLES[type] ?? DEFAULT_TITLE
  const message = record.message ?? ''
  const body = ACTOR_PREFIXED_TYPES.has(type) && record.from_username
    ? `@${record.from_username} ${message}`
    : message
  return { title, body }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ── Authentication: fail closed ──────────────────────────────────────────────
  // Require the shared secret set in Supabase Vault + the function env var.
  // If FUNCTION_SHARED_SECRET is unset or the caller omits the header, reject.
  // Compared in constant time: how long a wrong guess takes says nothing of the secret.
  const FUNCTION_SECRET = Deno.env.get('FUNCTION_SHARED_SECRET') ?? ''
  const presented = req.headers.get('x-function-secret') ?? ''
  // exact-sized buffers: timingSafeEqual reads a view's WHOLE underlying buffer
  const bytes = (s: string) => new TextEncoder().encode(s).slice().buffer
  if (!FUNCTION_SECRET || !timingSafeEqual(bytes(presented), bytes(FUNCTION_SECRET))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const record: NotificationRecord = body?.record ?? body ?? {}
    if (!record.user_id || !record.message) {
      return new Response(JSON.stringify({ skipped: 'no user_id/message' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // Recipient's device tokens.
    const { data: tokens, error } = await admin
      .from('push_tokens')
      .select('token')
      .eq('user_id', record.user_id)
    if (error) throw error
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ delivered: 0, reason: 'no tokens' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build one Expo message per token. Keep only well-formed Expo tokens.
    const banner = composeBanner(record)
    const messages = tokens
      .map((t: { token: string }) => t.token)
      .filter((tok: string) => typeof tok === 'string' && (tok.startsWith('ExponentPushToken') || tok.startsWith('ExpoPushToken')))
      .map((tok: string) => ({
        to: tok,
        sound: 'default',
        title: banner.title,
        body: banner.body,
        data: { type: record.type ?? 'system', notificationId: record.id ?? null },
      }))

    if (messages.length === 0) {
      return new Response(JSON.stringify({ delivered: 0, reason: 'no valid expo tokens' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send to Expo (chunks of 100).
    let delivered = 0
    const staleTokens: string[] = []
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100)
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(chunk),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Expo push API returned ${res.status}: ${text.slice(0, 200)}`)
      }
      const json = await res.json().catch(() => ({}))
      const tickets: { status?: string; details?: { error?: string } }[] = json?.data ?? []
      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          delivered++
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          staleTokens.push(chunk[idx].to) // prune below
        }
      })
    }

    // Prune tokens Expo says are dead, so they don't accumulate.
    if (staleTokens.length > 0) {
      await admin.from('push_tokens').delete().in('token', staleTokens)
    }

    return new Response(JSON.stringify({ delivered, pruned: staleTokens.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
