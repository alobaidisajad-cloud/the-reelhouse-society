import pg from 'pg';
const { Client } = pg;

const password = 'alobaidi1999.';
// Try direct DB host
const dbUrl = `postgresql://postgres:${password}@db.wihyqkpoymwcvbprslyz.supabase.co:5432/postgres`;

const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

const sql = `
-- 1. Check profiles columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('display_name', 'preferences')
ORDER BY column_name;

-- 2. Check log_comments table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'log_comments';

-- 3. Check indexes
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'log_comments_log_id_idx',
    'log_comments_user_id_idx',
    'log_comments_created_at_idx',
    'logs_pulse_idx',
    'logs_featured_idx',
    'interactions_endorse_log_idx'
  )
ORDER BY indexname;

-- 4. Check RPCs exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('update_my_preferences', 'update_my_display_name')
ORDER BY routine_name;
`;

async function run() {
    try {
        await client.connect();
        console.log('✅ Connected to Supabase Postgres.\n');

        // Run each check separately for clean output
        const profileCols = await client.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'profiles'
              AND column_name IN ('display_name', 'preferences')
            ORDER BY column_name;
        `);
        console.log('── PROFILES COLUMNS ─────────────────────');
        if (profileCols.rows.length === 0) {
            console.log('❌ display_name and preferences NOT found — migration not applied!');
        } else {
            profileCols.rows.forEach(r => console.log(`  ✅ ${r.column_name} (${r.data_type})`));
        }

        const tableCheck = await client.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'log_comments';
        `);
        console.log('\n── LOG_COMMENTS TABLE ───────────────────');
        if (tableCheck.rows.length === 0) {
            console.log('  ❌ log_comments table NOT found — migration not applied!');
        } else {
            console.log('  ✅ log_comments table exists');
        }

        const indexes = await client.query(`
            SELECT indexname FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname IN (
                'log_comments_log_id_idx','log_comments_user_id_idx','log_comments_created_at_idx',
                'logs_pulse_idx','logs_featured_idx','interactions_endorse_log_idx'
              )
            ORDER BY indexname;
        `);
        console.log('\n── PERFORMANCE INDEXES ──────────────────');
        const expectedIndexes = [
            'interactions_endorse_log_idx','log_comments_created_at_idx',
            'log_comments_log_id_idx','log_comments_user_id_idx',
            'logs_featured_idx','logs_pulse_idx'
        ];
        const foundIndexes = indexes.rows.map(r => r.indexname);
        expectedIndexes.forEach(idx => {
            if (foundIndexes.includes(idx)) console.log(`  ✅ ${idx}`);
            else console.log(`  ❌ ${idx} — MISSING`);
        });

        const rpcs = await client.query(`
            SELECT routine_name FROM information_schema.routines
            WHERE routine_schema = 'public'
              AND routine_name IN ('update_my_preferences', 'update_my_display_name')
            ORDER BY routine_name;
        `);
        console.log('\n── RPCs ─────────────────────────────────');
        const expectedRpcs = ['update_my_display_name', 'update_my_preferences'];
        const foundRpcs = rpcs.rows.map(r => r.routine_name);
        expectedRpcs.forEach(rpc => {
            if (foundRpcs.includes(rpc)) console.log(`  ✅ ${rpc}()`);
            else console.log(`  ❌ ${rpc}() — MISSING`);
        });

        console.log('\n─────────────────────────────────────────');
        console.log('Done.');
    } catch (err) {
        console.error('Connection/query error:', err.message);
    } finally {
        await client.end();
    }
}

run();
