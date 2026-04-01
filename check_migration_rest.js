// Uses Supabase REST (HTTPS) — no TCP DB connection needed
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wihyqkpoymwcvbprslyz.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Set SUPABASE_SERVICE_ROLE_KEY env var first.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function check() {
  console.log('Checking migration status via Supabase REST...\n');

  // 1. Check display_name & preferences exist by fetching one profile row
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('display_name, preferences')
    .limit(1)
    .maybeSingle();

  console.log('── PROFILES COLUMNS ─────────────────────');
  if (profileErr) {
    console.log('  ❌ Error querying profiles:', profileErr.message);
  } else {
    const hasDisplayName = profile !== null ? 'display_name' in profile : true; // column exists even if row is null
    console.log(`  ✅ display_name column — EXISTS (query succeeded)`);
    console.log(`  ✅ preferences column  — EXISTS (query succeeded)`);
  }

  // 2. Check log_comments table
  const { data: comments, error: commentsErr } = await supabase
    .from('log_comments')
    .select('id')
    .limit(1);

  console.log('\n── LOG_COMMENTS TABLE ───────────────────');
  if (commentsErr && commentsErr.code === '42P01') {
    console.log('  ❌ log_comments does NOT exist — migration not applied!');
  } else if (commentsErr) {
    console.log('  ⚠️  Error:', commentsErr.message);
  } else {
    console.log('  ✅ log_comments table — EXISTS');
  }

  // 3. Check RPCs via invoke (they'll fail with auth error, not PGRST202)
  console.log('\n── RPCs ─────────────────────────────────');
  for (const fn of ['update_my_preferences', 'update_my_display_name']) {
    const { error: rpcErr } = await supabase.rpc(fn, fn === 'update_my_preferences'
      ? { p_preferences: {} }
      : { p_display_name: 'test' }
    );
    if (rpcErr && rpcErr.message.includes('Could not find')) {
      console.log(`  ❌ ${fn}() — NOT FOUND (migration not applied)`);
    } else if (rpcErr && (rpcErr.message.includes('Not authenticated') || rpcErr.code === 'PGRST301' || rpcErr.code === '42501')) {
      console.log(`  ✅ ${fn}() — EXISTS (auth guard working correctly)`);
    } else if (rpcErr) {
      console.log(`  ⚠️  ${fn}() — Error: ${rpcErr.message} [code: ${rpcErr.code}]`);
    } else {
      console.log(`  ✅ ${fn}() — EXISTS`);
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log('Done.\n');
}

check();
