// Applies ONE migration file to production as a single transaction (-1): any error rolls all of it back.
// The URL comes from mobile/.env.local and is never printed.
const fs = require('fs');
const { spawnSync } = require('child_process');
const env = fs.readFileSync('C:/Users/OMEN/OneDrive/Desktop/divisionops/reelhouse/mobile/.env.local', 'utf8');
const url = /^SUPABASE_DB_URL=(.*)$/m.exec(env)[1].trim().replace(/^["']|["']$/g, '');
const file = process.argv[2];
const r = spawnSync('psql', [url, '-X', '-1', '-v', 'ON_ERROR_STOP=1', '-f', file], { encoding: 'utf8' });
process.stdout.write((r.stdout || '').replace(/\r/g, ''));
process.stderr.write((r.stderr || '').replace(url, '***'));
console.log(`\nexit ${r.status}`);
process.exit(r.status ?? 1);
