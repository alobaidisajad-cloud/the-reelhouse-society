import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    console.log("Checking EXACT FeaturedReview Queries...");
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: hotLogs, error: e1 } = await supabase
        .from('logs')
        .select(`
            id, film_id, film_title, poster_path, rating, review, created_at, user_id, autopsy, is_autopsied,
            profiles!logs_user_id_fkey ( username, role )
        `)
        .not('review', 'is', null)
        .neq('review', '')
        .gt('rating', 0)
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(20)

    console.log("Featured 24h:", hotLogs?.length, "Error:", JSON.stringify(e1));

    const { data: fallback, error: e2 } = await supabase
        .from('logs')
        .select(`
            id, film_id, film_title, poster_path, rating, review, created_at, user_id, autopsy, is_autopsied,
            profiles!logs_user_id_fkey ( username, role )
        `)
        .not('review', 'is', null)
        .neq('review', '')
        .gt('rating', 0)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    console.log("Featured Fallback:", !!fallback, "Error:", JSON.stringify(e2));
}
check();
