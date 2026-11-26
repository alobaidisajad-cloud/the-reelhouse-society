/**
 * Every edge function: which folder holds its one copy, and how it is deployed.
 *
 * Two folders hold functions, supabase/functions (the web's tree) and
 * mobile/supabase/functions, and both deploy to the same project, so each
 * function has exactly ONE copy, named here, and it is the one that runs:
 *   · edgeFunctions.guard.test.ts — every folder is listed, in the right tree,
 *     and no name is in both.
 *   · npm run functions:check — downloads every deployed function and
 *     compares it with its copy here, file by file, and its verify_jwt.
 *
 * verifyJwt is the deploy flag, with no config.toml to hold it: a redeploy
 * without `--no-verify-jwt` silently gates a function that must be open.
 */
const WEB = 'supabase/functions';
const MOBILE = 'mobile/supabase/functions';

/** Deployed. Paths are from the repository root. */
const DEPLOYED = {
  'tmdb-proxy': { dir: WEB, verifyJwt: false }, // the apps' only road to TMDB; guarded by paths.js
  'sign-in-with-username': { dir: WEB, verifyJwt: false }, // called before there is a session
  'sync-films': { dir: WEB, verifyJwt: true },
  'fetch-rss': { dir: MOBILE, verifyJwt: false }, // installed builds call it signed out
  'notify-push': { dir: MOBILE, verifyJwt: false }, // the database calls it; own secret
  'sync-entitlement': { dir: MOBILE, verifyJwt: true },
  'revenuecat-webhook': { dir: MOBILE, verifyJwt: false }, // RevenueCat calls it; own secret
};

/** In the repo on purpose, not deployed — and why. */
const NOT_DEPLOYED = {
  'paytabs-handler': {
    dir: WEB,
    why: 'Web payments do not work yet. Live, it granted any rank, a founding seat included, to whoever posted a "paid" message with its URL token, and asked PayTabs nothing. Redeploy only with the payment verified with PayTabs itself.',
  },
  'send-email': {
    dir: WEB,
    why: 'Welcome and digest emails, written but never deployed. Nothing calls it; support mail goes through Resend SMTP.',
  },
};

/**
 * The command that deploys a function the way this file says it is deployed —
 * printed by functions:check, so no one types the flags from memory.
 */
const deployCommand = (name, root) => {
  const f = DEPLOYED[name];
  const cwd = f.dir === MOBILE ? 'mobile' : '.';
  // Never before the house holds what it calls (waitsFor): no command is given until the train has.
  const waiting = waitsFor(name, root);
  if (waiting.length) {
    return `NOT YET: ${name} calls ${waiting.map((w) => `${w.object} (${w.car ? `made by ${w.car}: deploy after the train applies it, and its snapshot is recorded` : 'which no car makes'})`).join(', ')}`;
  }
  return `cd ${cwd}; npx supabase functions deploy ${name} --use-api${f.verifyJwt ? '' : ' --no-verify-jwt'}`;
};

const fs = require('fs');
const path = require('path');
const universe = require('../test-utils/universe');

/** A file's place under a checkout, with forward slashes. */
const under = (root, file) => path.relative(root, file).split(path.sep).join('/');

/**
 * The database's functions and tables a function's code names (`.rpc('x'`, `.from('t'` but a storage
 * bucket's), read from its own folder and the shared files it imports (the shared file list's functions).
 */
const namedObjects = (name, root) => {
  const f = DEPLOYED[name] ?? NOT_DEPLOYED[name];
  const code = universe.at(root).files('functions');
  const texts = code.filter((file) => under(root, file).startsWith(`${f.dir}/${name}/`)).map((file) => fs.readFileSync(file, 'utf8'));
  for (const t of [...texts]) {
    for (const m of t.matchAll(/from ['"]\.\.\/_shared\/(?<file>[\w.-]+)['"]/g)) {
      const shared = code.find((file) => under(root, file) === `${f.dir}/_shared/${m.groups.file}`);
      if (shared) texts.push(fs.readFileSync(shared, 'utf8'));
    }
  }
  const out = new Set();
  for (const t of texts) {
    for (const m of t.matchAll(/(?<bucket>storage\s*)?\.(?<kind>rpc|from)\(\s*['"](?<object>[a-z_][a-z0-9_]*)['"]/g)) {
      if (!m.groups.bucket) out.add(m.groups.object);
    }
  }
  return [...out].sort();
};

/** The migrations production has not had (not in mobile/supabase/APPLIED.txt), by name, with their text. */
const pendingCars = (root) => {
  const applied = new Set(fs.readFileSync(path.join(root, 'mobile', 'supabase', 'APPLIED.txt'), 'utf8')
    .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  return universe.at(root).files('migrations').map((file) => ({ name: path.basename(file), file }))
    .filter((c) => !applied.has(c.name))
    .map((c) => ({ name: c.name, sql: fs.readFileSync(c.file, 'utf8') }))
    .sort((x, y) => x.name.localeCompare(y.name));
};

const makes = (sql, object) => new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:FUNCTION|TABLE|VIEW|MATERIALIZED\\s+VIEW)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:"?public"?\\.)?"?${object}"?\\s*\\(`, 'i').test(sql)
  || new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:VIEW|MATERIALIZED\\s+VIEW)\\s+(?:"?public"?\\.)?"?${object}"?\\s`, 'i').test(sql);

/**
 * What a function's code names that production does not hold yet (mobile/supabase/schema/live-schema.sql,
 * production's snapshot): each object with the pending car that makes it, or `car: null` when no car does.
 * A function that names one is deployed only after the train applies its car (the deploy order): deployed
 * first, its call finds nothing to ask and answers 502 (sync-entitlement and 20261125_10). One no car
 * makes is never deployed: it names what the house has not got.
 */
const waitsFor = (name, root = path.join(__dirname, '..', '..')) => {
  const snapshot = fs.readFileSync(path.join(root, 'mobile', 'supabase', 'schema', 'live-schema.sql'), 'utf8');
  const cars = pendingCars(root);
  return namedObjects(name, root).filter((o) => !makes(snapshot, o))
    .map((object) => ({ object, car: cars.find((c) => makes(c.sql, object))?.name ?? null }));
};

module.exports = { WEB, MOBILE, DEPLOYED, NOT_DEPLOYED, deployCommand, namedObjects, waitsFor };
