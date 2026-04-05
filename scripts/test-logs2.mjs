import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    console.log("Checking EXACT SocialPulse Query...");
    const { data: pulseLogs, error: err2 } = await supabase
        .from('logs')
        .select(`
            id, film_id, film_title, poster_path, rating, review, status, watched_with, pull_quote, drop_cap, editorial_header, created_at, user_id,
            profiles!logs_user_id_fkey ( username, role )
        `)
        .neq('review', '')
        .not('review', 'is', null)
        .order('created_at', { ascending: false })
        .limit(6);
    
    console.log("Returned Logs:", pulseLogs?.length);
    console.log("Query Error:", JSON.stringify(err2, null, 2));
}
check();
