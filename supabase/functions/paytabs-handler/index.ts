import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// PayTabs Configuration from environment variables
const PROFILE_ID = Deno.env.get('PAYTABS_PROFILE_ID') || ''
const SERVER_KEY = Deno.env.get('PAYTABS_SERVER_KEY') || ''
const REGION_URL = 'https://secure.paytabs.com/payment/request' // Change if using a different regional endpoint

// CORS Headers for frontend requests
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)

        // ROUTE 1: Create a Payment Link (Called by the Frontend)
        if (url.pathname.endsWith('/create') && req.method === 'POST') {
            const { user_id, tier } = await req.json()

            if (!user_id || !tier) {
                return new Response(JSON.stringify({ error: 'Missing user_id or tier' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }

            const amount = tier === 'auteur' ? 4.99 : 1.99
            const description = tier === 'auteur' ? 'ReelHouse Auteur Patronage' : 'ReelHouse Archivist Patronage'

            // Construct PayTabs Request Payload
            const payload = {
                profile_id: PROFILE_ID,
                tran_type: "sale",
                tran_class: "ecom",
                cart_id: user_id, // We store the User ID here so the IPN knows who paid
                cart_currency: "USD",
                cart_amount: amount,
                cart_description: description,
                paypage_lang: "en",
                return: "https://your-domain.com/patronage", // Where the user goes after paying
                callback: "https://your-supabase-project.supabase.co/functions/v1/paytabs-handler/webhook" // The IPN listener below
            }

            // Call PayTabs API to generate the Hosted Payment Page
            const paytabsRes = await fetch(REGION_URL, {
                method: 'POST',
                headers: {
                    'Authorization': SERVER_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })

            const paytabsData = await paytabsRes.json()

            if (paytabsData.redirect_url) {
                return new Response(JSON.stringify({ redirect_url: paytabsData.redirect_url }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            } else {
                console.error("PayTabs Error:", paytabsData)
                return new Response(JSON.stringify({ error: 'Failed to generate checkout link' }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }
        }

        // ROUTE 2: PayTabs IPN Webhook Listener (Called silently by PayTabs servers)
        if (url.pathname.endsWith('/webhook') && req.method === 'POST') {
            const ipnPayload = await req.json()

            console.log("PayTabs IPN Received:", ipnPayload)

            // Verified 'A' means Authorized/Success in PayTabs
            // Ensure the transaction is approved
            if (ipnPayload.payment_result?.response_status === 'A') {
                const userId = ipnPayload.cart_id // We passed user_id in as cart_id during /create
                const amount = ipnPayload.cart_amount

                if (!userId) {
                    console.error("IPN missing cart_id (user_id). Cannot upgrade user.")
                    return new Response('Missing User ID', { status: 400 })
                }

                const newRole = amount >= 4.99 ? 'auteur' : 'archivist'

                // Initialize Supabase Admin client to bypass RLS
                const supabaseAdmin = createClient(
                    Deno.env.get('SUPABASE_URL') ?? '',
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
                )

                // Upgrade the user in the database
                const { error } = await supabaseAdmin
                    .from('profiles')
                    .update({ role: newRole })
                    .eq('id', userId)

                if (error) {
                    console.error('Error updating user role in DB via IPN:', error)
                    return new Response('Database update failed', { status: 500 })
                }

                console.log(`✅ IPN Success: User ${userId} upgraded to ${newRole}!`)
            }

            // Always return 200 to PayTabs so it knows we received it
            return new Response('IPN received', { status: 200 })
        }

        // Default route catch
        return new Response('Not Found', { status: 404 })

    } catch (err: any) {
        console.error('Unhandled error in PayTabs Function:', err)
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
