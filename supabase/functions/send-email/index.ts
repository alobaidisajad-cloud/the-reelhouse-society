/**
 * ReelHouse — Email Sender Edge Function
 * Supabase Edge Function that sends transactional emails using the built-in
 * Supabase email system or Resend API.
 *
 * Endpoint: POST /functions/v1/send-email
 * Body: { type: 'welcome' | 'digest', userId: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
// Resend's own address; the sealed world names its stand-in.
const RESEND_API_URL = Deno.env.get('RESEND_API_URL') || 'https://api.resend.com'
// How long Resend may take, its answer read: past it, the mail was not sent.
const RESEND_LIMIT_MS = 10_000
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const FROM_EMAIL = 'noreply@thereelhousesociety.com'
const APP_URL = 'https://thereelhousesociety.com'

// Rate limit: 1 email per type per user per day
const rateLimitCache = new Map<string, number>()

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // BACKEND-EMAIL-1: welcome/digest are meant to be triggered by the signup hook /
  // cron, not arbitrary clients. Fail closed: with no FUNCTION_SHARED_SECRET set,
  // or without it sent as `x-function-secret`, every request is refused, so a
  // deploy without its secret can never mail any member's address to anyone.
  const FUNCTION_SECRET = Deno.env.get('FUNCTION_SHARED_SECRET') || ''
  if (!FUNCTION_SECRET || (req.headers.get('x-function-secret') || '') !== FUNCTION_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const { type, userId } = await req.json()

    if (!type || !userId) {
      return new Response(JSON.stringify({ error: 'type and userId required' }), { status: 400 })
    }

    // Rate limit check
    const rateKey = `${userId}:${type}:${new Date().toISOString().slice(0, 10)}`
    if (rateLimitCache.get(rateKey)) {
      return new Response(JSON.stringify({ error: 'Rate limited — 1 email per type per day' }), { status: 429 })
    }
    // BACKEND-EMAIL-2: evict stale (older-than-today) entries so the Map can't grow
    // unbounded on a long-lived edge worker. (Per-instance only; a durable rate-limit
    // would be DB-backed — see BACKEND-EMAIL-1.)
    if (rateLimitCache.size > 5000) {
      const todayPrefix = new Date().toISOString().slice(0, 10)
      for (const k of rateLimitCache.keys()) {
        if (!k.endsWith(todayPrefix)) rateLimitCache.delete(k)
      }
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // A read that failed is the house's failure, never "no such member".
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username, bio, avatar_url, tier')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) return json({ error: 'The member could not be read' }, 500)
    if (!profile) return json({ error: 'User not found' }, 404)

    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId)
    if (authError) return json({ error: 'The member\'s address could not be read' }, 500)
    const email = authUser?.user?.email

    if (!email) {
      return new Response(JSON.stringify({ error: 'No email for user' }), { status: 404 })
    }

    let subject = ''
    let htmlBody = ''

    if (type === 'welcome') {
      subject = 'Welcome to The ReelHouse Society'
      htmlBody = getWelcomeEmail(profile.username)
    } else if (type === 'digest') {
      // Fetch weekly stats
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data: weekLogs, error: logsError } = await supabase
        .from('logs')
        .select('rating')
        .eq('user_id', userId)
        .gte('created_at', weekAgo)
      if (logsError) return json({ error: 'The week could not be read' }, 500)

      const filmsLogged = weekLogs?.length || 0
      const avgRating = filmsLogged > 0
        ? (weekLogs!.reduce((sum: number, l: any) => sum + (l.rating || 0), 0) / filmsLogged).toFixed(1)
        : '0'

      // Fetch unread notifications count
      const { count, error: unreadError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
      if (unreadError) return json({ error: 'The unread notices could not be counted' }, 500)

      subject = `Your Weekly Dispatch — ${filmsLogged} films logged`
      htmlBody = getDigestEmail(profile.username, filmsLogged, avgRating, count || 0)
    } else {
      return new Response(JSON.stringify({ error: 'Unknown email type' }), { status: 400 })
    }

    // Sent through Resend, or not at all: with no key, nothing is said to be sent.
    if (!RESEND_API_KEY) return json({ error: 'Mail is not configured (RESEND_API_KEY)' }, 503)
    const res = await fetch(`${RESEND_API_URL}/emails`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject,
        html: htmlBody,
      }),
      signal: AbortSignal.timeout(RESEND_LIMIT_MS),
    })
    if (!res.ok) return json({ error: `Resend answered ${res.status}` }, 502)

    // Mark rate limit
    rateLimitCache.set(rateKey, Date.now())

    return new Response(JSON.stringify({ success: true, type, email: email.slice(0, 3) + '***' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

// ── Email templates (inlined for Edge Function simplicity) ──

function getWelcomeEmail(username: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0703;font-family:Georgia,serif;">
<table width="100%" style="background:#0A0703;"><tr><td align="center" style="padding:40px 20px;">
<table width="600" style="max-width:600px;background:#0F0B07;border:1px solid #3A3228;border-radius:4px;">
<tr><td style="padding:40px 40px 20px;text-align:center;border-bottom:1px solid #3A3228;">
<div style="font-size:28px;color:#F2E8A0;letter-spacing:0.15em;">THE REELHOUSE SOCIETY</div>
<div style="font-family:Courier New,monospace;font-size:10px;letter-spacing:0.3em;color:#8B6914;">EST. 2024 · ADMISSION GRANTED</div>
</td></tr>
<tr><td style="padding:40px;">
<div style="font-size:22px;color:#E8DFC8;margin-bottom:20px;">Welcome, ${username}</div>
<p style="font-size:15px;color:#B8AFA0;line-height:1.75;">Your admission into The ReelHouse Society has been processed. Begin by logging your first film.</p>
<table width="100%" style="margin-top:30px;"><tr><td align="center">
<a href="${APP_URL}/discover" style="display:inline-block;padding:14px 36px;background:#8B6914;color:#0A0703;font-family:Courier New,monospace;font-size:11px;letter-spacing:0.2em;text-decoration:none;border-radius:2px;font-weight:bold;">ENTER THE HOUSE</a>
</td></tr></table></td></tr>
<tr><td style="padding:20px 40px;text-align:center;"><div style="font-family:Courier New,monospace;font-size:9px;color:#6B6560;">THE REELHOUSE SOCIETY · CINEMATIC PRESERVATION</div></td></tr>
</table></td></tr></table></body></html>`
}

function getDigestEmail(username: string, films: number, avgRating: string, unread: number): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0703;font-family:Georgia,serif;">
<table width="100%" style="background:#0A0703;"><tr><td align="center" style="padding:40px 20px;">
<table width="600" style="max-width:600px;background:#0F0B07;border:1px solid #3A3228;border-radius:4px;">
<tr><td style="padding:30px 40px;border-bottom:1px solid #3A3228;">
<div style="font-family:Courier New,monospace;font-size:10px;letter-spacing:0.3em;color:#8B6914;">THE REELHOUSE SOCIETY</div>
<div style="font-size:22px;color:#E8DFC8;margin-top:8px;">Your Weekly Dispatch, ${username}</div>
</td></tr>
<tr><td style="padding:24px 40px;">
<table width="100%"><tr>
<td width="33%" style="text-align:center;padding:12px;"><div style="font-size:28px;color:#F2E8A0;">${films}</div><div style="font-family:Courier New,monospace;font-size:9px;color:#6B6560;letter-spacing:0.15em;margin-top:4px;">FILMS LOGGED</div></td>
<td width="33%" style="text-align:center;padding:12px;border-left:1px solid #3A3228;border-right:1px solid #3A3228;"><div style="font-size:28px;color:#F2E8A0;">${avgRating}</div><div style="font-family:Courier New,monospace;font-size:9px;color:#6B6560;letter-spacing:0.15em;margin-top:4px;">AVG RATING</div></td>
<td width="33%" style="text-align:center;padding:12px;"><div style="font-size:28px;color:#F2E8A0;">${unread}</div><div style="font-family:Courier New,monospace;font-size:9px;color:#6B6560;letter-spacing:0.15em;margin-top:4px;">UNREAD</div></td>
</tr></table></td></tr>
<tr><td align="center" style="padding:20px 40px;">
<a href="${APP_URL}/feed" style="display:inline-block;padding:12px 30px;background:#8B6914;color:#0A0703;font-family:Courier New,monospace;font-size:10px;letter-spacing:0.2em;text-decoration:none;border-radius:2px;font-weight:bold;">VIEW ACTIVITY</a>
</td></tr>
<tr><td style="padding:20px 40px;text-align:center;"><div style="font-size:11px;color:#4A4540;"><a href="${APP_URL}/settings" style="color:#8B6914;text-decoration:none;">Manage notifications</a></div></td></tr>
</table></td></tr></table></body></html>`
}
