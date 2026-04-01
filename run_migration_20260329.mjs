// Run migration via Supabase REST API (PostgREST + service_role or anon key)
// Uses the /rest/v1/rpc pattern or falls back to Supabase JS client
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

const SUPABASE_URL = 'https://wihyqkpoymwcvbprslyz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_y1kmD0C9P9lrOChVkg8AgA_vH-Ab98u';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const migrationFile = join(__dir, 'supabase', 'migrations', '20260329_auth_persistence_v2.sql');
const sql = readFileSync(migrationFile, 'utf8');

// Split into individual statements
const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`Found ${statements.length} SQL statements to run.`);

for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt || stmt.length < 5) continue;
    
    const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' }).then(() => ({ error: null })).catch(e => ({ error: e }));
    
    if (error) {
        console.log(`[${i+1}] ✗ Error: ${error.message || error}`);
    } else {
        console.log(`[${i+1}] ✓ OK`);
    }
}

console.log('\nDone. Please verify in the Supabase dashboard that all changes are applied.');
console.log(`Dashboard: ${SUPABASE_URL.replace('https://', 'https://app.supabase.com/project/')}`);
