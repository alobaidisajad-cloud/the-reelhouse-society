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
 * v6 (2026-11-11): the caller names a notice by its id, and nothing else is taken from it. The
 * notice is read from the house and claimed (pushed_at, 20261111_01) while it is fresh, so it is
 * pushed once, in its own words. The secret travels in the trigger's request, which waits in
 * pg_net's queue where any role that can log in may read it (Supabase cannot narrow pg_net's grants
 * per project, SU-546605); whoever reads it can now push only a notice already due, never words of
 * their own. A send Expo refused lets the claim go.
 *
 * v5 (2026-10-30): each message names its kind's Android channel (KIND_CHANNEL), which the app
 * creates at start; a kind with none goes to 'default'.
 *
 * v4 (2026-10-03): the sender is named whenever there is one (20261003_02 keeps
 * every message free of it), an accepted request has its own title, and a house
 * notice is "The Lounge" only when it is about a salon.
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
// Expo's own address; the sealed world names its stand-in.
const EXPO_PUSH_URL = Deno.env.get('EXPO_PUSH_URL') || 'https://exp.host/--/api/v2/push/send'
// How long Expo may take to take one chunk, its answer read: past it, the send failed.
const EXPO_LIMIT_MS = 10_000
// How long after it was written a notice may be pushed: the trigger calls at once, and a call later
// than this is no delivery of it.
const PUSH_WINDOW_MS = 15 * 60_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** What a push is made of, read from the house: never the caller's words. */
const NOTICE_COLUMNS = 'id, user_id, type, from_username, message, related_lounge_id'

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
  related_lounge_id?: string | null
}

// ── The banner voice ────────────────────────────────────────────────────────
// Title tells you WHAT KIND of notice this is; body tells you who and what.
const TYPE_TITLES: Record<string, string> = {
  follow: 'A New Follower',
  follow_request: 'At Your Door',
  follow_accept: 'The Door Is Open',
  endorse: 'A Certification',
  comment: 'A New Critique',
  moderation: 'A Notice from the House',
}
const DEFAULT_TITLE = 'The ReelHouse Society'

/**
 * Each kind's Android channel: the app creates these at start (src/lib/noticeChannels.ts, the same
 * map, held equal by theNoticesKnowTheirChannels.test.ts), so a member can quiet one kind alone.
 */
const KIND_CHANNEL: Record<string, string> = {
  comment: 'critiques',
  annotate: 'critiques',
  retransmit: 'critiques',
  follow: 'members',
  follow_request: 'members',
  follow_accept: 'members',
  endorse: 'honours',
  reaction: 'honours',
  featured: 'honours',
  system: 'the-house',
  moderation: 'the-house',
}

// The sender lives in from_username and the message never repeats it (the table
// refuses a named notice that begins with "@"), so the banner prints "@name
// message" whenever there is a sender — as the notices sheet does.
function composeBanner(record: NotificationRecord): { title: string; body: string } {
  const type = record.type ?? 'system'
  // a house notice is about a salon when it names one: a request to enter, an admission
  const title = type === 'system'
    ? (record.related_lounge_id ? 'The Lounge' : DEFAULT_TITLE)
    : TYPE_TITLES[type] ?? DEFAULT_TITLE
  const message = record.message ?? ''
  const body = record.from_username ? `@${record.from_username} ${message}` : message
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

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  // The notice this call claimed, let go again if its send fails.
  let claimed: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    const id = [body?.record?.id, body?.id].find((v) => typeof v === 'string' && UUID.test(v))
    // Claimed while fresh, once: a second call for it, or a late one, pushes nothing.
    const { data: record, error: claimError } = id
      ? await admin.from('notifications')
          .update({ pushed_at: new Date().toISOString() })
          .eq('id', id).is('pushed_at', null).gte('created_at', new Date(Date.now() - PUSH_WINDOW_MS).toISOString())
          .select(NOTICE_COLUMNS).maybeSingle<NotificationRecord>()
      : { data: null, error: null }
    if (claimError) throw claimError
    if (!record?.id || !record.user_id || !record.message) {
      return new Response(JSON.stringify({ skipped: 'no notice due a push' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    claimed = record.id

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
        channelId: KIND_CHANNEL[record.type ?? 'system'] ?? 'default',
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
        signal: AbortSignal.timeout(EXPO_LIMIT_MS),
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
    // A prune that failed is said, never counted as done: the tokens are pruned at the next notice.
    let pruned = 0
    if (staleTokens.length > 0) {
      const { error: pruneError } = await admin.from('push_tokens').delete().in('token', staleTokens)
      if (pruneError) console.error('[notify-push] the dead tokens were not pruned:', pruneError.code ?? pruneError.message)
      else pruned = staleTokens.length
    }

    return new Response(JSON.stringify({ delivered, pruned }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    // Not sent: the notice is let go, so a later call may push it while it is fresh.
    if (claimed) {
      const { error: releaseError } = await admin.from('notifications').update({ pushed_at: null }).eq('id', claimed)
      if (releaseError) console.error('[notify-push] the claim was not let go:', releaseError.code ?? releaseError.message)
    }
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
