import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import webpush from 'https://esm.sh/web-push@3.6.7'

// Set up VAPID details from environment variables
// Note: In production, the user MUST set SUPABASE_VAPID_PUBLIC_KEY and SUPABASE_VAPID_PRIVATE_KEY
webpush.setVapidDetails(
  'mailto:support@thereelhouse.io',
  Deno.env.get('SUPABASE_VAPID_PUBLIC_KEY') || '',
  Deno.env.get('SUPABASE_VAPID_PRIVATE_KEY') || ''
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Determine if request is an authorized Database Webhook
    // OR if it's sent manually. For Webhooks, we can use a structural check.
    const { record, type } = await req.json()

    // Assuming this is triggered from public.notifications AFTER INSERT
    if (!record || !record.user_id) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch the target user's push subscriptions
    const targetUserId = record.user_id;
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', targetUserId)

    if (subError || !subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: 'No active subscriptions for user' }), { headers: corsHeaders })
    }

    // Determine the push message payload
    let title = 'ReelHouse Activity'
    let body = 'You have a new notification.'
    let url = '/'

    if (record.type === 'follow') {
      title = 'New Social Connection'
      body = 'Someone started following your archive.'
      url = '/user/' // Ideally passing the exact username
    } else if (record.type === 'endorse_log') {
      title = 'Log Endorsed'
      body = 'A society member endorsed your recent film log.'
    }

    const payload = JSON.stringify({
      title,
      body,
      url
    })

    // Broadcast the push notification to all of the user's registered devices
    const pushPromises = subscriptions.map(sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      }
      return webpush.sendNotification(pushSubscription, payload)
        .catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription has expired or is no longer valid, delete it
            console.log('Subscription expired. Deleting...', sub.endpoint)
            return supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          } else {
            console.error('Push notification failed:', err)
          }
        })
    })

    await Promise.all(pushPromises)

    return new Response(JSON.stringify({ success: true, count: pushPromises.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
