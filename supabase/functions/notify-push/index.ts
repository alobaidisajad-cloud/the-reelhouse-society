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
 * Hardening: if FUNCTION_SHARED_SECRET is set, require it as `x-function-secret`
 * (configure the same header on the DB webhook). Stale tokens that Expo reports
 * as DeviceNotRegistered are pruned automatically.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Optional shared-secret gate (set FUNCTION_SHARED_SECRET + send x-function-secret on the webhook).
  const FUNCTION_SECRET = Deno.env.get('FUNCTION_SHARED_SECRET') || ''
  if (FUNCTION_SECRET && (req.headers.get('x-function-secret') || '') !== FUNCTION_SECRET) {
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
    const messages = tokens
      .map((t: { token: string }) => t.token)
      .filter((tok: string) => typeof tok === 'string' && tok.startsWith('ExponentPushToken'))
      .map((tok: string) => ({
        to: tok,
        sound: 'default',
        title: 'The ReelHouse Society',
        body: record.message,
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
