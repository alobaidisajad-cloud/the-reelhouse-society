import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'

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
        
        // Extract the path after /tmdb-proxy
        const pathPart = url.pathname.replace('/functions/v1/tmdb-proxy', '')
        
        // If there is no path, return a 400
        if (!pathPart || pathPart === '/') {
            return new Response(JSON.stringify({ error: 'Missing TMDB endpoint path' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Forward all query parameters from the original request
        const tmdbUrl = new URL(`${TMDB_BASE}${pathPart}`)
        url.searchParams.forEach((value, key) => {
            tmdbUrl.searchParams.append(key, value)
        })
        
        // Append the secret API key
        tmdbUrl.searchParams.append('api_key', TMDB_API_KEY)

        // Make the request to TMDB
        const response = await fetch(tmdbUrl.toString(), {
            method: req.method,
            headers: { 'Accept': 'application/json' }
        })

        const data = await response.json()

        // Return the TMDB response back to the client
        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (err: any) {
        console.error('TMDB Proxy Error:', err)
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
