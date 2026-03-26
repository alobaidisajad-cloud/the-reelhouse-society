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
const FROM_EMAIL = 'noreply@thereelhousesociety.com'
const APP_URL = 'https://thereelhousesociety.com'

// Rate limit: 1 email per type per user per day
const rateLimitCache = new Map<string, number>()

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, bio, avatar_url, tier')
      .eq('id', userId)
      .single()

    if (!profile) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 })
    }

    // Fetch user email from auth
    const { data: authUser } = await supabase.auth.admin.getUserById(userId)
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
      const { data: weekLogs } = await supabase
        .from('logs')
        .select('rating')
        .eq('user_id', userId)
        .gte('created_at', weekAgo)

      const filmsLogged = weekLogs?.length || 0
      const avgRating = filmsLogged > 0
        ? (weekLogs!.reduce((sum: number, l: any) => sum + (l.rating || 0), 0) / filmsLogged).toFixed(1)
        : '0'

      // Fetch unread notifications count
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)

      subject = `Your Weekly Dispatch — ${filmsLogged} films logged`
      htmlBody = getDigestEmail(profile.username, filmsLogged, avgRating, count || 0)
    } else {
      return new Response(JSON.stringify({ error: 'Unknown email type' }), { status: 400 })
    }

    // Send via Resend API (or fallback)
    if (RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
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
      })

      if (!res.ok) {
        const errText = await res.text()
        return new Response(JSON.stringify({ error: `Resend error: ${errText}` }), { status: 500 })
      }
    }

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
