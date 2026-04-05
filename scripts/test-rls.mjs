import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data: dbPolicies, error } = await supabase.rpc('get_table_policies', { table_name: 'logs' });
    if (error) {
        console.log("RPC Error (trying standard query)...", error);
        // We will try inserting a log to see if it works? No
        return;
    }
    console.log("Policies for logs:", dbPolicies);
}
check();
