import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

/**
 * social-pulse — Cached Social Feed Edge Function
 * ─────────────────────────────────────────────────
 * Serves the "The Pulse" feed with a 30-second in-memory cache
 * to protect the Postgres instance from read spikes when many 
 * users load the lobby simultaneously.
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ── In-Memory Cache ──
let cachedPulse: { data: unknown; expiry: number } | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds — fresh enough for social, protective enough for DB

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Check cache first
        if (cachedPulse && Date.now() < cachedPulse.expiry) {
            return new Response(JSON.stringify(cachedPulse.data), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
            });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const { data, error } = await supabase
            .from('logs')
            .select('id, film_id, film_title, poster_path, rating, review, status, abandoned_reason, watched_with, pull_quote, drop_cap, editorial_header, is_autopsied, autopsy, created_at, user_id, profiles!logs_user_id_fkey(username, role)')
            .neq('review', '')
            .not('review', 'is', null)
            .order('created_at', { ascending: false })
            .limit(6);

        if (error) throw error;

        cachedPulse = { data: data ?? [], expiry: Date.now() + CACHE_TTL_MS };

        return new Response(JSON.stringify(data ?? []), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch social pulse';
        console.error('Social Pulse Error:', message);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
