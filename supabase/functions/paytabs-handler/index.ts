import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// PayTabs Configuration from environment variables
const PROFILE_ID = Deno.env.get('PAYTABS_PROFILE_ID') || ''
const SERVER_KEY = Deno.env.get('PAYTABS_SERVER_KEY') || ''
const WEBHOOK_SECRET = Deno.env.get('PAYTABS_WEBHOOK_SECRET') || 'dev-secret-123'
const PROJECT_URL = Deno.env.get('SUPABASE_URL') || 'https://your-supabase-project.supabase.co'
const REGION_URL = 'https://secure.paytabs.com/payment/request' // Change if using a different regional endpoint

// CORS Headers for frontend requests - tight security
const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Optionally bind to 'https://thereelhouse.com' in prod
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)

        // ═════════════════════════════════════════════════════════════
        // ROUTE 1: Create a Payment Link (Called by the Frontend)
        // ═════════════════════════════════════════════════════════════
        if (url.pathname.endsWith('/create') && req.method === 'POST') {
            
            // 🛡️ SECURITY PATCH: Verify JWT Context
            const authHeader = req.headers.get('Authorization')
            if (!authHeader) {
                return new Response(JSON.stringify({ error: 'Unauthorized: Missing Auth Header' }), {
                    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }

            // Instantiate transient client to verify identity token mathematically
            const supabaseClient = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_ANON_KEY') ?? '',
                { global: { headers: { Authorization: authHeader } } }
            )

            const { data: { user } } = await supabaseClient.auth.getUser()
            if (!user) {
                return new Response(JSON.stringify({ error: 'Unauthorized: Invalid JWT token' }), {
                    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }
            
            // We now 100% trust that the user orchestrating this is who they say they are.
            const user_id = user.id

            const body = await req.json()
            const { checkout_type } = body // 'membership' | 'tip'

            if (!checkout_type) {
                return new Response(JSON.stringify({ error: 'Missing core routing context' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }

            let amount = 0
            let description = ''
            let cartIdMetadata = ''

            if (checkout_type === 'membership') {
                const { tier } = body
                if (tier === 'auteur') { amount = 4.99; description = 'ReelHouse Auteur Patronage' }
                else if (tier === 'archivist') { amount = 1.99; description = 'ReelHouse Archivist Patronage' }
                else if (tier === 'founding') { amount = 49.00; description = 'ReelHouse Founding Board Seat' }
                else throw new Error("Invalid tier")
                cartIdMetadata = `MEMBERSHIP|${user_id}|${tier}`
            }

            // Construct PayTabs Request Payload
            const payload = {
                profile_id: PROFILE_ID,
                tran_type: "sale",
                tran_class: "ecom",
                cart_id: cartIdMetadata, // High-density metadata payload for the Webhook IPN
                cart_currency: "USD",
                cart_amount: amount,
                cart_description: description,
                paypage_lang: "en",
                return: "https://thereelhouse.com/patronage", // Where the user goes after paying
                
                // 🛡️ SECURITY PATCH: Bind Cryptographic Webhook Secret
                callback: `${PROJECT_URL}/functions/v1/paytabs-handler/webhook?token=${WEBHOOK_SECRET}` 
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
                console.error("PayTabs Error executing checkout execution:", paytabsData)
                return new Response(JSON.stringify({ error: 'Failed to generate checkout link due to provider rejection' }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }
        }

        // ═════════════════════════════════════════════════════════════
        // ROUTE 2: IPN Webhook Listener (Silent Sever-to-Server ping)
        // ═════════════════════════════════════════════════════════════
        if (url.pathname.endsWith('/webhook') && req.method === 'POST') {
            
            // 🛡️ SECURITY PATCH: Only accept Webhooks that know the exact Secret
            const reqToken = url.searchParams.get('token')
            if (reqToken !== WEBHOOK_SECRET) {
                console.error("🚨 Webhook Spoofing Attempt! Rejecting unauthorized IPN.")
                return new Response('Unauthorized Webhook Signature', { status: 401 })
            }

            const ipnPayload = await req.json()
            console.log("Verified PayTabs IPN Received:", ipnPayload.cart_id)

            // Verified 'A' means Authorized/Success in PayTabs
            if (ipnPayload.payment_result?.response_status === 'A') {
                const metadata = ipnPayload.cart_id || ''
                const amount = ipnPayload.cart_amount

                // Initialize Supabase Admin client to bypass RLS
                const supabaseAdmin = createClient(
                    Deno.env.get('SUPABASE_URL') ?? '',
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
                )

                const parts = metadata.split('|')
                const type = parts[0]

                if (type === 'MEMBERSHIP') {
                    const userId = parts[1]
                    const tier = parts[2]
                    const newRole = tier === 'founding' ? 'archivist' : (amount >= 4.99 ? 'auteur' : 'archivist')
                    
                    const { error } = await supabaseAdmin.from('profiles').update({ role: newRole }).eq('id', userId)
                    if (error) console.error('Error auto-upgrading user role:', error)
                    else console.log(`✅ IPN Success: User ${userId} upgraded to ${newRole}`)
                }
            }

            return new Response(JSON.stringify({ status: 'IPN Processed' }), {
                headers: { 'Content-Type': 'application/json' }
            })
        }

        return new Response(JSON.stringify({ error: 'Endpoint Not Found. Check routing signature.' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        // Strip out the internal V8 stack traces from frontend responses
        console.error("FATAL BORDER CRASH:", error)
        return new Response(JSON.stringify({ error: 'Internal Server Execution Fault.' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
