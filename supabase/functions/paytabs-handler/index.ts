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
            const body = await req.json()
            const { checkout_type, user_id } = body // 'membership' | 'tip'

            if (!user_id || !checkout_type) {
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
            else if (checkout_type === 'tip') {
                const { amount: tipAmount, video_id, to_user_id, message, from_username } = body
                amount = parseFloat(tipAmount)
                description = `Tip to Creator / Video Support`
                // Compress metadata: TIP|fromId|fromUsername|toId|videoId|message
                // Limit cart_id size (PayTabs usually allows 255 chars)
                const safeMessage = (message || '').replace(/\|/g, '').substring(0, 50)
                cartIdMetadata = `TIP|${user_id}|${from_username}|${to_user_id}|${video_id}|${safeMessage}`
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
                    if (error) console.error('Error updating user role:', error)
                    else console.log(`✅ IPN Success: User ${userId} upgraded to ${newRole}`)
                } 
                else if (type === 'TIP') {
                    const fromUserId = parts[1]
                    const fromUsername = parts[2]
                    const toUserId = parts[3]
                    const videoId = parts[4]
                    const message = parts[5] || null

                    // Insert the Tip safely
                    const { error: tipError } = await supabaseAdmin.from('tips').insert({
                        from_user_id: fromUserId,
                        from_username: fromUsername,
                        to_user_id: toUserId,
                        video_id: videoId,
                        amount: amount,
                        message: message
                    })

                    // Extract logic out of client into IPN: update video tip total
                    if (!tipError) {
                        const { data: video } = await supabaseAdmin.from('video_reviews').select('tip_total').eq('id', videoId).single()
                        if (video) {
                            await supabaseAdmin.from('video_reviews').update({ tip_total: (video.tip_total || 0) + amount }).eq('id', videoId)
                        }
                        console.log(`✅ IPN Success: Tip of $${amount} delivered to Video ${videoId}`)
                    } else {
                        console.error('IPN Tip Database Error:', tipError)
                    }
                }
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
