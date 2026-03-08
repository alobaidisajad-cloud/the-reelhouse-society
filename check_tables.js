import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://wihyqkpoymwcvbprslyz.supabase.co', 'sb_publishable_y1kmD0C9P9lrOChVkg8AgA_vH-Ab98u')
async function run() {
    const tables = ['profiles', 'venues', 'showtimes', 'tickets', 'logs', 'watchlists', 'vaults', 'lists', 'list_items', 'interactions'];
    console.log("Checking Supabase tables...");
    for (const t of tables) {
        const res = await supabase.from(t).select('id').limit(1);
        console.log(`Table ${t}:`, res.error ? `ERROR (${res.error.message})` : 'EXISTS & READY');
    }
}
run()
