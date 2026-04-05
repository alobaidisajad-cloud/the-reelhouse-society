import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    console.log("Checking DB Connection...");
    const { data: allLogs, error: err1 } = await supabase.from('logs').select('count', { count: 'exact' });
    console.log("Total logs in DB:", allLogs, err1);

    const { data: pulseLogs, error: err2 } = await supabase
        .from('logs')
        .select(`id, review`)
        .neq('review', '')
        .not('review', 'is', null)
        .order('created_at', { ascending: false })
        .limit(6);
    
    console.log("Logs with valid reviews for pulse:", pulseLogs?.length);
    console.log("Query Error?", err2);
    
    if (pulseLogs?.length === 0) {
        // Find if reviews exist at all
        const { data: anyReview, error: err3 } = await supabase.from('logs').select('review').not('review', 'is', null).limit(5);
        console.log("Any non-null reviews?", anyReview);
    }
}
check();
