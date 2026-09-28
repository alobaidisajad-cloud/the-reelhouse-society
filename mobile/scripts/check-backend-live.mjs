#!/usr/bin/env node
/**
 * check-backend-live.mjs — verify the live backend matches the contract.
 * ──────────────────────────────────────────────────────────────────────
 * Companion to __tests__/backendContract.test.ts. The Jest test guards the
 * CODE side (what the app calls); this script guards the DEPLOY side (what
 * actually exists in production): an RPC or edge function the app needs that
 * is not deployed.
 *
 * It also verifies SECURITY POSTURE, live facts no file can: a lockdown written
 * in a migration is not a lockdown that is ON, and a schema snapshot can
 * disagree with the database it was taken from. Only the database can say.
 *
 * Run this before/after a deploy:
 *   SUPABASE_PROJECT_REF=xxxx SUPABASE_DB_URL=postgres://... node scripts/check-backend-live.mjs
 *
 * Config (env):
 *   SUPABASE_PROJECT_REF  project ref for `supabase functions list` (edge fns)
 *   SUPABASE_DB_URL       postgres connection string, for RPC signatures +
 *                         column grants, trigger enablement, RLS, ceiling count
 *   (the anon-visibility half needs NO config — the anon key is public by
 *    design and is read from .env, so that half always runs)
 *
 * Each check is skipped (with a warning) if its config / tool is unavailable,
 * and a SKIPPED CHECK COUNTS AS A FAILURE. An unrun check is not a pass; this
 * script once printed "Verified present in production: nothing." and exited 0.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(join(__dirname, 'backend-contract.json'), 'utf8'));

/**
 * Reading a value out of a KEY=value file, tolerating CRLF.
 */
function fromEnvFile(file, key) {
  try {
    for (const line of readFileSync(join(__dirname, '..', file), 'utf8').split('\n')) {
      const i = line.indexOf('=');
      if (i < 0) continue;
      if (line.slice(0, i).trim() === key) return line.slice(i + 1).trim();
    }
  } catch {
    /* no such file */
  }
  return '';
}

// A connection string still carrying its placeholder, caught before psql fails on it.
const PLACEHOLDERS = ['YOURPASSWORD', 'YOUR-PASSWORD', 'YOUR_PASSWORD', '[YOUR', 'PASTE', 'XXXX'];
const looksUnfinished = (s) => PLACEHOLDERS.some((p) => s.toUpperCase().includes(p));

let PROJECT_REF = process.env.SUPABASE_PROJECT_REF || fromEnvFile('.env.local', 'SUPABASE_PROJECT_REF');
let DB_URL = process.env.SUPABASE_DB_URL || fromEnvFile('.env.local', 'SUPABASE_DB_URL');

if (DB_URL && looksUnfinished(DB_URL)) {
  console.warn(
    '⚠ The saved connection string still has [YOUR-PASSWORD] in it, so it cannot connect.\n' +
      '  You will be asked for it again below.',
  );
  DB_URL = '';
}

// ASK for the connection string (a shell variable outlives its window and a wrong
// one poisons every later run), but only at a terminal, so CI never waits on a human.
if (!DB_URL && process.stdin.isTTY) {
  const { createInterface } = await import('readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(
    '\nThe deeper checks (column permissions, trigger state, RLS, length ceilings)\n' +
      'need your database connection string. Supabase dashboard → Connect → Direct.\n' +
      'Remember to swap [YOUR-PASSWORD] for your real database password.\n' +
      'Press Enter alone to skip — the rest of the checks still run.\n',
  );
  const answer = (await rl.question('Connection string: ')).trim();
  if (answer && looksUnfinished(answer)) {
    console.warn(
      '\n⚠ That still contains [YOUR-PASSWORD]. Replace it with your actual database\n' +
        '  password (Project Settings → Database → Database password) and run again.',
    );
  } else if (answer) {
    DB_URL = answer;
    const save = (await rl.question('Save it so you are not asked again? (y/N) ')).trim().toLowerCase();
    if (save === 'y' || save === 'yes') {
      // .env.local is gitignored (mobile/.gitignore: `.env*.local`), so the
      // password cannot be committed by accident.
      const path = join(__dirname, '..', '.env.local');
      let existing = '';
      try {
        existing = readFileSync(path, 'utf8');
      } catch {
        /* first time */
      }
      const kept = existing
        .split('\n')
        .filter((l) => !l.startsWith('SUPABASE_DB_URL=') && !l.startsWith('SUPABASE_PROJECT_REF='))
        .join('\n')
        .replace(/\n+$/, '');
      writeFileSync(
        path,
        `${kept ? `${kept}\n` : ''}SUPABASE_DB_URL=${DB_URL}\nSUPABASE_PROJECT_REF=${PROJECT_REF || 'wihyqkpoymwcvbprslyz'}\n`,
      );
      console.log('  Saved to mobile/.env.local (gitignored).');
    }
  }
  rl.close();
}

// The anon key is public by design (it ships in the app bundle). Reading it from
// .env means the security-posture half needs no secret and therefore actually runs.
let SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
let ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
if (!SUPABASE_URL || !ANON_KEY) {
  try {
    const env = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    for (const line of env.split('\n')) {
      const i = line.indexOf('=');
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (k === 'EXPO_PUBLIC_SUPABASE_URL' && !SUPABASE_URL) SUPABASE_URL = v;
      if (k === 'EXPO_PUBLIC_SUPABASE_ANON_KEY' && !ANON_KEY) ANON_KEY = v;
    }
  } catch {
    /* no .env — the check reports itself skipped, which is a failure */
  }
}

// Derive the project ref from the app's own API URL rather than asking for it.
// It is the subdomain, it ships inside the app bundle, and it is not a secret.
if (!PROJECT_REF && SUPABASE_URL) {
  const m = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./);
  if (m) PROJECT_REF = m[1];
}

const missing = { rpcs: [], edgeFunctions: [] };
/** A declared signature production no longer has: a name the app knows, a call that 404s. */
const signatureDrift = [];
/** Entries still checked by name alone, so still blind to that failure mode. */
const unsignedRpcs = [];
/** A `supabase.rpc(...)` in the app that production would refuse. */
const callMismatches = [];
let checkedEdges = false;
let checkedRpcs = false;
let ranCallCheck = false;
let checkedCalls = 0;

// ── Reading the app's own RPC calls ───────────────────────────────────────
const APP_ROOTS = [join(__dirname, '..', 'src'), join(__dirname, '..', 'app')];
const UNPARSED = '<unparsed>';

/**
 * Blank every comment, keeping the file the SAME LENGTH so offsets and reported
 * line numbers stay true. String and template literals are tracked so a URL like
 * `'https://x'` is never mistaken for the start of a comment.
 */
function blankComments(src) {
  const out = src.split('');
  let i = 0;
  const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1;
      i++;
    } else if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
    } else i++;
  }
  return out.join('');
}

/** The substring inside a balanced pair starting at `i`. */
function balanced(src, i, open, close) {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === open) depth++;
    else if (src[j] === close) { depth--; if (!depth) return src.slice(i + 1, j); }
  }
  return null;
}

/**
 * Top-level keys of an object literal, in all four forms a key is written:
 *   { p_lounge_id: x }  explicit    { p_lounge_id }   shorthand
 *   { ...rest }  spread      { [k]: v } computed   -> both unknowable, reported
 */
function topKeys(obj) {
  const parts = [];
  let depth = 0, buf = '';
  for (const c of obj) {
    if ('{(['.includes(c)) depth++;
    else if ('})]'.includes(c)) depth--;
    if (c === ',' && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  parts.push(buf);

  const keys = [];
  for (const raw of parts) {
    const seg = raw.trim();
    if (!seg) continue;
    if (seg.startsWith('...') || seg.startsWith('[')) return [UNPARSED];
    let d = 0, cut = -1;
    for (let i = 0; i < seg.length; i++) {
      const c = seg[i];
      if ('{(['.includes(c)) d++;
      else if ('})]'.includes(c)) d--;
      else if (c === ':' && d === 0) { cut = i; break; }
    }
    const key = (cut === -1 ? seg : seg.slice(0, cut)).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return [UNPARSED];
    keys.push(key);
  }
  return keys;
}

/** Every `supabase.rpc('name', {...})` the app makes. Tests are not the app. */
function collectRpcCalls(roots) {
  const files = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.expo', 'android', 'ios', '__tests__'].includes(e.name)) continue;
      const f = join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.tsx?$/.test(e.name)) files.push(f);
    }
  };
  roots.forEach(walk);

  const calls = [];
  for (const file of files) {
    const src = blankComments(readFileSync(file, 'utf8'));
    const re = /\.rpc\(\s*'([a-z_0-9]+)'/g;
    let m;
    while ((m = re.exec(src))) {
      const rest = src.slice(m.index + m[0].length);
      const lead = rest.match(/^\s*,\s*\{/);
      let args = null;
      if (lead) {
        const body = balanced(src, m.index + m[0].length + lead[0].length - 1, '{', '}');
        args = body === null ? [UNPARSED] : topKeys(body);
      }
      calls.push({
        name: m[1],
        args,
        at: `${file.slice(join(__dirname, '..').length + 1).replace(/\\/g, '/')}:${src.slice(0, m.index).split('\n').length}`,
      });
    }
  }
  return calls;
}

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

/**
 * Strip credentials before anything is printed: execSync's message echoes the
 * whole psql command, connection string and password with it.
 */
function redact(s) {
  return String(s ?? '').replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://<redacted>');
}

/**
 * WHY psql failed, from stderr (the message is only the command). One cause is
 * named outright: Supabase's direct host is IPv6-only, unreachable from IPv4.
 */
function why(e) {
  const err =
    (e.stderr?.toString() || '').trim().split('\n')[0] || redact(e.message).split('\n')[0];
  if (/unreachable|Cannot assign requested address|could not translate host|timeout expired/i.test(err)) {
    return (
      `${err}\n` +
      '    → the DIRECT host (db.<ref>.supabase.co) is IPv6-only. On an IPv4 network it\n' +
      '      is unreachable. Use the SESSION POOLER string instead (Connect → Session\n' +
      '      pooler); it looks like postgres.<ref>@aws-N-<region>.pooler.supabase.com.'
    );
  }
  return err;
}

// ── Edge functions (via supabase CLI) ──
if (PROJECT_REF) {
  try {
    const out = sh(`supabase functions list --project-ref ${PROJECT_REF} -o json`);
    const live = new Set(JSON.parse(out).map((f) => f.slug));
    for (const fn of contract.edgeFunctions) {
      if (!live.has(fn)) missing.edgeFunctions.push(fn);
    }
    checkedEdges = true;
  } catch (e) {
    console.warn(`⚠ edge-function check skipped (supabase CLI failed): ${e.message.split('\n')[0]}`);
  }
} else {
  console.warn('⚠ edge-function check skipped (set SUPABASE_PROJECT_REF).');
}

// ── RPCs (via psql against the live DB) ──
if (DB_URL) {
  try {
    // SIGNATURES, not names: a name says a function exists; only the signature says
    // the app can reach it.
    const out = sh(
      `psql "${DB_URL}" -tAc "SELECT proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'"`,
    );
    const liveSignatures = new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
    const liveNames = new Set([...liveSignatures].map((s) => s.slice(0, s.indexOf('('))));

    for (const entry of contract.rpcs) {
      // A bare name (existence only) or { name, signature }, checked exactly.
      const name = typeof entry === 'string' ? entry : entry.name;
      const signature = typeof entry === 'string' ? null : entry.signature;

      if (!liveNames.has(name)) {
        missing.rpcs.push(name);
        continue;
      }
      if (signature && !liveSignatures.has(signature)) {
        const actual = [...liveSignatures].filter((s) => s.startsWith(`${name}(`));
        signatureDrift.push(
          `${name}\n      declared: ${signature}\n      live:     ${actual.join(' | ') || '(none)'}`,
        );
      }
      if (!signature) unsignedRpcs.push(name);
    }
    checkedRpcs = true;
  } catch (e) {
    console.warn(`⚠ RPC check skipped — psql could not connect:\n    ${why(e)}`);
  }
} else {
  console.warn('⚠ RPC check skipped (set SUPABASE_DB_URL).');
}

// ── THE APP'S OWN CALLS ───────────────────────────────────────────────────
// A pinned signature proves the server did not move, not that the app can call
// it. So every `supabase.rpc(...)` in the app is asked of the database: each key
// sent must be a parameter, and each parameter without a default must be sent.
// Shorthand keys and comments inside the object are read correctly; anything
// unreadable (a spread, a computed key) is REPORTED, never assumed fine.
if (DB_URL) {
  try {
    const liveArgs = new Map();          // name -> [{ params, required }]
    // IN parameters only: `proargnames` also lists a RETURNS TABLE's output
    // columns. 'i'/'b'/'v' are the input modes (NULL modes = all IN); `pronargs`
    // counts inputs only.
    const argRows = sh(
      `psql "${DB_URL}" -tAc "SELECT p.proname || E'\\t' || coalesce(CASE WHEN p.proargmodes IS NULL THEN array_to_string(p.proargnames, ',') ELSE (SELECT string_agg(a.name, ',' ORDER BY a.ord) FROM unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(name, mode, ord) WHERE a.mode IN ('i','b','v')) END, '') || E'\\t' || (p.pronargs - p.pronargdefaults) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'"`,
    );
    for (const row of argRows.split('\n')) {
      const [rawName, names, req] = row.split('\t');
      const name = (rawName ?? '').trim();
      if (!name) continue;
      const params = (names ?? '').trim().split(',').map((s) => s.trim()).filter(Boolean);
      liveArgs.set(name, [
        ...(liveArgs.get(name) ?? []),
        { params, required: params.slice(0, Number((req ?? '').trim())) },
      ]);
    }

    for (const call of collectRpcCalls(APP_ROOTS)) {
      const overloads = liveArgs.get(call.name);
      if (!overloads) { callMismatches.push(`${call.at}\n      ${call.name} — NOT IN THE DATABASE`); continue; }
      if (call.args && call.args.includes(UNPARSED)) {
        callMismatches.push(`${call.at}\n      ${call.name} — arguments could not be read (spread or computed key); check by hand`);
        continue;
      }
      // `.rpc('name')` alone sends NOTHING: valid only if an overload requires nothing.
      const sent = call.args ?? [];
      checkedCalls++;
      const ok = overloads.some((o) =>
        sent.every((a) => o.params.includes(a)) &&
        o.required.every((r) => sent.includes(r)));
      if (!ok) {
        callMismatches.push(
          `${call.at}\n      ${call.name}\n        app sends: ${sent.join(', ') || '(nothing)'}` +
          overloads.map((o) =>
            `\n        db takes:  ${o.params.join(', ') || '(none)'}    required: ${o.required.join(', ') || '(none)'}`).join(''));
      }
    }
    ranCallCheck = true;
  } catch (e) {
    console.warn(`⚠ app-call check skipped — psql could not connect:\n    ${why(e)}`);
  }
} else {
  console.warn('⚠ app-call check skipped (set SUPABASE_DB_URL).');
}

// ── Security posture: what only the live database can say ──────────────────
const sec = contract.security || {};
const posture = [];
let checkedAnon = false;
/** Whether anon's table grants were compared against the allowlist. */
let checkedAnonGrants = false;
/** How many failed it: a check that RAN and found drift must not also print a tick. */
let anonGrantViolations = 0;
/** Whether anon's SECURITY DEFINER reach was compared against the allowlist. */
let checkedDefiners = false;
let definerViolations = 0;
/** Whether any private room still carries a key anyone can read. */
let checkedLoungeKeys = false;
let loungeKeyViolations = 0;
let checkedGrants = false;
// How many violations each half found — a section that RAN is not a section that PASSED.
let anonViolations = 0;
let grantViolations = 0;
let checkedVault = false;
let vaultViolations = 0;

// Tier A — anon probes. No secrets: the anon key is public by design and lives
// in .env, so this half runs anywhere, including a laptop with no DB access.
if (SUPABASE_URL && ANON_KEY) {
  try {
    const probe = async (table, column) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${column}&limit=0`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      });
      return { status: r.status, body: r.status === 200 ? '' : await r.text() };
    };

    // The CONTROL first: with the API unreachable or the key wrong, every "must not
    // read" probe below would fail closed and pass while verifying nothing.
    const postureBeforeAnon = posture.length;
    let controlOk = true;
    for (const { table, column } of sec.anonMustRead || []) {
      const { status } = await probe(table, column);
      if (status !== 200) {
        controlOk = false;
        posture.push(
          `CONTROL FAILED: anon cannot read ${table}.${column} (HTTP ${status}). ` +
            `Every "hidden column" result below is therefore meaningless — not a pass.`,
        );
      }
    }

    if (controlOk) {
      for (const { table, column, why } of sec.anonMustNotRead || []) {
        const { status, body } = await probe(table, column);
        const denied = /42501|permission denied/.test(body);
        if (status === 200 || !denied) {
          posture.push(`anon CAN read ${table}.${column} — ${why}`);
        }
      }
      anonViolations = posture.length - postureBeforeAnon;
      checkedAnon = true;
    }
  } catch (e) {
    console.warn(`⚠ anon posture check skipped (fetch failed): ${e.message.split('\n')[0]}`);
  }
} else {
  console.warn('⚠ anon posture check skipped (set EXPO_PUBLIC_SUPABASE_URL + _ANON_KEY).');
}

// ── ANON'S TABLE GRANTS, AGAINST AN ALLOWLIST ──────────────────────────────
// What anon may DO, table by table. A grant RLS happens to deny is still surface:
// one policy left at `{public}` turns it live. Anything not allowed is a violation.
if (DB_URL) {
  try {
    const rows = sh(
      `psql "${DB_URL}" -tAc "SELECT table_name || ' ' || string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon' AND table_name IN ('dispatch_posts','dispatch_comments','dispatch_certifications','dispatch_saves','dispatch_votes','member_drafts','notifications') GROUP BY table_name ORDER BY 1"`,
    );
    /** The paper is public; nothing else about a member is. */
    const ALLOWED = { dispatch_posts: 'SELECT', dispatch_comments: 'SELECT' };
    const before = posture.length;
    for (const line of rows.split('\n').map((s) => s.trim()).filter(Boolean)) {
      const [table, privs] = line.split(' ');
      const want = ALLOWED[table];
      if (!want) {
        posture.push(`anon holds ${privs} on ${table} — it should hold nothing there`);
      } else if (privs !== want) {
        posture.push(`anon holds ${privs} on ${table} — only ${want} is intended`);
      }
    }
    anonGrantViolations = posture.length - before;
    checkedAnonGrants = true;
  } catch (e) {
    console.warn(`⚠ anon grant check skipped — psql could not connect:\n    ${why(e)}`);
  }
}

// ── DEFINERS THAT TAKE THE CALLER'S WORD FOR IT ────────────────────────────
// A SECURITY DEFINER that takes the actor as a PARAMETER (never reading auth.uid())
// believes whatever it is told; granted to anon, a stranger simply names someone.
// Each exception below says why. RLS policy helpers must stay: a policy evaluates
// as the querying role, so revoking one breaks public reads rather than tightening.
if (DB_URL) {
  try {
    const ALLOWED_FOR_ANON = {
      can_annotate_list: 'RLS policy helper — anon needs it for the policy to evaluate',
      can_annotate_log: 'RLS policy helper',
      can_endorse_content: 'RLS policy helper',
      get_featured_critique: 'public editorial content, meant for signed-out readers',
      increment_dossier_views: 'live web caller; moves a view counter and nothing else',
      rls_auto_enable: 'event trigger, not callable',
      like_escape: 'pure string helper, no data',
      // Strangers meeting a rope ARE the count; at worst it lies (500 rows a day cap).
      record_gate_event: 'aggregate counter; names no actor and touches no member row',
    };
    const rows = sh(
      `psql "${DB_URL}" -tAc "SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND p.prorettype <> 'trigger'::regtype AND has_function_privilege('anon', p.oid, 'EXECUTE') AND p.prosrc NOT ILIKE '%auth.uid()%' ORDER BY 1"`,
    );
    const before = posture.length;
    for (const name of rows.split('\n').map((s) => s.trim()).filter(Boolean)) {
      if (!ALLOWED_FOR_ANON[name]) {
        posture.push(
          `anon may EXECUTE ${name}() — a SECURITY DEFINER that never reads auth.uid(), ` +
            'so it trusts whatever actor the caller names',
        );
      }
    }
    definerViolations = posture.length - before;
    checkedDefiners = true;
  } catch (e) {
    console.warn(`⚠ definer check skipped — psql could not connect:\n    ${why(e)}`);
  }
}

// ── NO ROOM CARRIES A KEY ──────────────────────────────────────────────────
// Every member can read `lounges` (you see a room and ask at the door), so an
// invite_code in that row would be a key around the door. It stays NULL, and
// create_lounge never mints one.
if (DB_URL) {
  try {
    const before = posture.length;
    const withCodes = sh(
      `psql "${DB_URL}" -tAc "SELECT count(*) FROM public.lounges WHERE invite_code IS NOT NULL"`,
    ).trim();
    if (withCodes !== '0') {
      posture.push(
        `${withCodes} lounge(s) carry an invite_code — every member can read it off a discoverable table`,
      );
    }
    const mints = sh(
      `psql "${DB_URL}" -tAc "SELECT (prosrc ~* 'INSERT INTO public.lounges[^;]*invite_code')::text FROM pg_proc WHERE proname='create_lounge' AND pronamespace='public'::regnamespace"`,
    ).trim();
    if (mints === 't') {
      posture.push('create_lounge mints an invite_code again — a key to a private room, in a table every member reads');
    }
    loungeKeyViolations = posture.length - before;
    checkedLoungeKeys = true;
  } catch (e) {
    console.warn(`⚠ lounge key check skipped — psql could not connect:\n    ${why(e)}`);
  }
}

// Tier B — grants, triggers, RLS, ceilings. Needs real DB access.
if (DB_URL) {
  try {
    const postureBeforeGrants = posture.length;
    const q = (sql) => sh(`psql "${DB_URL}" -tAc "${sql.replace(/"/g, '\\"')}"`).trim();

    // Exactly which columns an ordinary member may write on their own row: too many
    // is self-elevation, too few silently breaks profile editing.
    const grants = q(
      `SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.column_privileges ` +
        `WHERE table_schema='public' AND table_name='profiles' AND privilege_type='UPDATE' AND grantee='authenticated'`,
    );
    const expected = [...(sec.profilesUpdatableColumns || [])].sort().join(',');
    if (grants !== expected) {
      posture.push(
        `profiles UPDATE grant drift for 'authenticated'\n      expected: ${expected || '(none)'}\n      live:     ${grants || '(none — profile editing is broken)'}`,
      );
    }
    // A blanket table-level grant makes the column list above cosmetic.
    const blanket = q(
      `SELECT count(*) FROM information_schema.role_table_grants ` +
        `WHERE table_schema='public' AND table_name='profiles' AND privilege_type='UPDATE' AND grantee IN ('anon','authenticated')`,
    );
    if (blanket !== '0') {
      posture.push(
        `profiles has a TABLE-level UPDATE grant (${blanket}) — that overrides the column list and re-opens self-elevation`,
      );
    }

    // Triggers must exist AND be enabled ('D', disabled, reads like any other in a migration).
    for (const { table, trigger, why } of sec.mustBeEnabledTriggers || []) {
      const state = q(
        `SELECT t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace ` +
          `WHERE n.nspname='public' AND c.relname='${table}' AND t.tgname='${trigger}' AND NOT t.tgisinternal`,
      );
      if (!state) posture.push(`trigger MISSING: ${table}.${trigger} — ${why}`);
      else if (state !== 'O') posture.push(`trigger DISABLED (tgenabled=${state}): ${table}.${trigger} — ${why}`);
    }

    // RLS on every public table.
    if (sec.rlsRequiredOnEveryPublicTable) {
      const off = q(
        `SELECT string_agg(c.relname, ', ' ORDER BY c.relname) FROM pg_class c ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace ` +
          `WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity`,
      );
      if (off) posture.push(`RLS is OFF on: ${off}`);
    }

    // The length ceilings are still there (dropping one is otherwise silent).
    if (sec.minLengthCeilings) {
      const n = Number(
        q(`SELECT count(*) FROM pg_constraint WHERE contype='c' AND conname LIKE '%\\_len'`),
      );
      if (!(n >= sec.minLengthCeilings)) {
        posture.push(`length ceilings dropped: ${n} live, expected at least ${sec.minLengthCeilings}`);
      }
    }
    // Every function in public demotes pg_temp. `search_path = public` alone is
    // VACUOUS: pg_temp is searched first for relations unless named, so a member's
    // temp table (both roles hold TEMP) shadows the real one. Proven on production.
    if (sec.everyFunctionDemotesPgTemp) {
      const bad = q(
        `SELECT string_agg(p.proname, ', ' ORDER BY p.proname) FROM pg_proc p ` +
          `JOIN pg_namespace n ON n.oid=p.pronamespace ` +
          `WHERE n.nspname='public' AND p.prokind='f' AND NOT COALESCE(` +
          `(SELECT cfg FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%') LIKE '%pg_temp%', false)`,
      );
      if (bad) posture.push(`search_path is not pg_temp-safe on: ${bad}`);
    }

    // Only the declared columns are invisible to every client. Column-level grants do
    // not reach a column added later, so a new one is unreadable, and the error names
    // the TABLE ("permission denied for table profiles"). Private by default is right;
    // an undeclared one means a forgotten grant.
    if (sec.columnsInvisibleToEveryClient) {
      const expected = [...sec.columnsInvisibleToEveryClient].sort().join(', ');
      const live = q(
        `SELECT COALESCE(string_agg(x, ', ' ORDER BY x), '') FROM (` +
          `SELECT c.table_name||'.'||c.column_name AS x ` +
          `FROM information_schema.columns c ` +
          `JOIN information_schema.tables t ON t.table_name=c.table_name AND t.table_schema=c.table_schema ` +
          `WHERE c.table_schema='public' AND t.table_type='BASE TABLE' ` +
          `AND NOT has_column_privilege('anon','public.'||quote_ident(c.table_name),c.column_name,'SELECT') ` +
          `AND NOT has_column_privilege('authenticated','public.'||quote_ident(c.table_name),c.column_name,'SELECT')) s`,
      );
      if (live !== expected) {
        posture.push(
          `columns invisible to every client changed\n      expected: ${expected}\n      live:     ${live || '(none)'}` +
            `\n    A new one means a column was added without extending the column-level grant;` +
            `\n    reads of it will fail with "permission denied for table <name>".`,
        );
      }
    }

    // THE VAULT: a note belongs to one viewing, and only its writer reads it. Each
    // rule below is one the repo cannot see kept.
    if (sec.theVault) {
      const v = sec.theVault;
      const postureBeforeVault = posture.length;

      // A column added to logs later must be declared part of a viewing or not.
      // Otherwise a rewatch silently drops it from the archived viewing, and the
      // member's own writing comes back missing a field.
      if (v.everyLogColumnIsDecided) {
        const undecided = q(
          `SELECT COALESCE(array_to_string(public.viewing_fields_uncovered(), ', '), '')`,
        );
        if (undecided) {
          posture.push(
            `logs holds column(s) nobody decided about: ${undecided}\n` +
              `    Say in viewing_fields() whether each is part of a viewing or not,\n` +
              `    or a rewatch will quietly stop carrying it.`,
          );
        }
      }

      // A history is read by every member and by anon. Nothing private lives in
      // it, every viewing carries an identity, and the count is the history's.
      if (v.noNoteTravelsInAHistory) {
        const leaks = q(
          `SELECT count(*) FROM public.logs l, jsonb_array_elements(l.viewing_history) e ` +
            `WHERE jsonb_typeof(e) <> 'object' OR NOT e ? 'viewingId' ` +
            `OR e ? 'privateNotes' OR e ? 'private_notes'`,
        );
        if (leaks !== '0') {
          posture.push(`${leaks} viewing(s) in a history are malformed or carry a private note — histories are world-readable`);
        }
        const notLists = q(
          `SELECT count(*) FROM public.logs WHERE jsonb_typeof(viewing_history) <> 'array'`,
        );
        if (notLists !== '0') posture.push(`${notLists} viewing_history value(s) are not a list — a client wrote a JSON string`);

        const miscounted = q(
          `SELECT count(*) FROM public.logs WHERE view_count <> jsonb_array_length(viewing_history) + 1`,
        );
        if (miscounted !== '0') posture.push(`${miscounted} log(s) disagree with their own viewing count`);

        const onColumn = q(`SELECT count(*) FROM public.logs WHERE private_notes IS NOT NULL`);
        if (onColumn !== '0') posture.push(`${onColumn} note(s) are sitting on logs.private_notes instead of the Vault`);

        const orphans = q(
          `SELECT count(*) FROM public.log_private_notes n WHERE NOT EXISTS (` +
            `SELECT 1 FROM public.logs l WHERE l.id = n.log_id AND (l.viewing_id = n.viewing_id ` +
            `OR EXISTS (SELECT 1 FROM jsonb_array_elements(l.viewing_history) x WHERE x->>'viewingId' = n.viewing_id::text)))`,
        );
        if (orphans !== '0') posture.push(`${orphans} note(s) belong to no viewing of their log`);

        const shared = q(
          `SELECT count(*) - count(DISTINCT v) FROM (` +
            `SELECT viewing_id::text AS v FROM public.logs ` +
            `UNION ALL SELECT e->>'viewingId' FROM public.logs l, jsonb_array_elements(l.viewing_history) e) i`,
        );
        if (shared !== '0') posture.push(`${shared} viewing identit(ies) are shared by more than one viewing — a note could land on the wrong one`);
      }

      // A viewing's identity is public (it sits in every history), so it must belong
      // to ONE log, or another member can take yours first and swallow your note.
      if (v.everyViewingBelongsToOneLog) {
        const registry = q(
          `SELECT CASE WHEN to_regclass('public.viewings') IS NULL THEN 'missing' ` +
            `WHEN has_table_privilege('anon', 'public.viewings', 'SELECT,INSERT,UPDATE,DELETE') ` +
            `  OR has_table_privilege('authenticated', 'public.viewings', 'SELECT,INSERT,UPDATE,DELETE') THEN 'open to clients' ` +
            `ELSE 'ok' END`,
        );
        if (registry !== 'ok') {
          posture.push(`the viewings registry is ${registry} — nothing stops one member taking another's viewing`);
        } else {
          const unregistered = q(
            `SELECT count(*) FROM (SELECT l.id, l.viewing_id AS vid FROM public.logs l ` +
              `UNION ALL SELECT l.id, (e->>'viewingId')::uuid FROM public.logs l, jsonb_array_elements(l.viewing_history) e) s ` +
              `WHERE NOT EXISTS (SELECT 1 FROM public.viewings r WHERE r.viewing_id = s.vid AND r.log_id = s.id)`,
          );
          if (unregistered !== '0') posture.push(`${unregistered} viewing(s) are not registered to their own log`);
          const stale = q(
            `SELECT count(*) FROM public.viewings r JOIN public.logs l ON l.id = r.log_id ` +
              `WHERE r.viewing_id <> l.viewing_id AND NOT EXISTS (` +
              `SELECT 1 FROM jsonb_array_elements(l.viewing_history) e WHERE e->>'viewingId' = r.viewing_id::text)`,
          );
          if (stale !== '0') posture.push(`${stale} registered viewing(s) no longer exist on their log — their notes outlive them`);
          const fk = q(
            `SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.log_private_notes'::regclass ` +
              `AND contype = 'f' AND confrelid = 'public.viewings'::regclass AND confdeltype = 'c'`,
          );
          if (fk !== '1') posture.push(`a note's viewing is not a cascading foreign key into the registry — a removed viewing's note would outlive it`);
        }
      }

      // The four actions the apps call: present, and closed to a logged-out
      // visitor. A missing one is a feature that silently stops working; a
      // granted one is the Vault open to the world.
      for (const fn of v.noteActions || []) {
        const state = q(
          `SELECT CASE WHEN count(*) = 0 THEN 'missing' ` +
            `WHEN bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) THEN 'open to anon' ` +
            `WHEN NOT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) THEN 'closed to members' ` +
            `ELSE 'ok' END FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname='${fn}'`,
        );
        if (state !== 'ok') posture.push(`${fn} is ${state}`);
      }

      // pg_input_is_valid keeps the type of its FIRST call at each call site (proven:
      // numeric, text, date, boolean answered true, false, false, false), so the type
      // is always written out, never held in a variable.
      if (v.pgInputIsValidTypesAreWrittenOut) {
        const guessy = q(
          `SELECT COALESCE(string_agg(p.proname, ', ' ORDER BY p.proname), '') FROM pg_proc p ` +
            `WHERE p.pronamespace='public'::regnamespace AND p.prosrc LIKE '%pg_input_is_valid(%' ` +
            `AND (length(p.prosrc) - length(replace(p.prosrc, 'pg_input_is_valid(', ''))) / length('pg_input_is_valid(') ` +
            `<> (SELECT count(*) FROM regexp_matches(p.prosrc, 'pg_input_is_valid\\([^()]*,\\s*''[a-zA-Z ]+''\\s*\\)', 'g'))`,
        );
        if (guessy) {
          posture.push(
            `pg_input_is_valid is asked about a type held in a variable in: ${guessy}\n` +
              `    It answers about the type of its FIRST call there, for ever after.\n` +
              `    Write the type out, or ask the column with jsonb_populate_record.`,
          );
        }
      }

      vaultViolations = posture.length - postureBeforeVault;
      checkedVault = true;
    }

    // Index hygiene. Redundant means STRUCTURALLY covered (identical, or a wider
    // index with the same leading columns, at any width), never "looks unused": scan
    // counts say nothing on small tables. An unindexed FK makes every parent delete
    // scan the child (143x measured on 200k rows; deleting an account crosses ~12).
    if (sec.indexHygiene) {
      const dup = q(
        `SELECT string_agg(x, ', ') FROM (SELECT DISTINCT ic.relname AS x FROM pg_index i ` +
          `JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class c ON c.oid=i.indrelid ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' ` +
          `WHERE i.indnatts=i.indnkeyatts AND NOT i.indisunique AND i.indpred IS NULL ` +
          `AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid=i.indexrelid) ` +
          `AND EXISTS (SELECT 1 FROM pg_index o WHERE o.indrelid=i.indrelid AND o.indexrelid<>i.indexrelid ` +
          `AND o.indpred IS NULL AND o.indkey[0:i.indnkeyatts-1]=i.indkey[0:i.indnkeyatts-1] ` +
          `AND (o.indnkeyatts>i.indnkeyatts OR (o.indisunique AND o.indnkeyatts=i.indnkeyatts)))) s`,
      );
      if (dup) posture.push(`redundant index(es) — already covered by another: ${dup}`);

      const maxFk = Number(sec.maxUnindexedForeignKeys ?? 0);
      const fk = Number(
        q(
          `SELECT count(*) FROM pg_constraint con ` +
            `JOIN pg_namespace n ON n.oid=con.connamespace AND n.nspname='public' ` +
            `JOIN LATERAL unnest(con.conkey) k(attnum) ON true ` +
            `WHERE con.contype='f' AND array_length(con.conkey,1)=1 ` +
            `AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=con.conrelid AND i.indkey[0]=k.attnum)`,
        ),
      );
      if (fk > maxFk) {
        posture.push(
          `${fk} unindexed foreign key(s), expected at most ${maxFk} — every parent delete scans the child table`,
        );
      }
    }

    // No TRUNCATE (nor REFERENCES, TRIGGER, MAINTAIN) for the client roles: TRUNCATE
    // is the one write RLS cannot filter, nothing needs it, and a new table arrives
    // with Supabase's default GRANT ALL.
    if (sec.noWipePrivileges) {
      const bad = q(
        `SELECT string_agg(DISTINCT c.relname, ', ') FROM pg_class c ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' ` +
          `CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role) ` +
          `CROSS JOIN (VALUES ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) AS pp(priv) ` +
          `WHERE c.relkind IN ('r','p','m') AND has_table_privilege(rr.role, c.oid, pp.priv)`,
      );
      if (bad) posture.push(`anon/authenticated still hold TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on: ${bad}`);

      // A materialized view cannot carry RLS, so SELECT on one is every row it holds.
      const mv = q(
        `SELECT string_agg(DISTINCT c.relname, ', ') FROM pg_class c ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' ` +
          `CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role) ` +
          `WHERE c.relkind='m' AND has_table_privilege(rr.role, c.oid, 'SELECT')`,
      );
      if (mv) posture.push(`materialized view readable by anon/authenticated (RLS cannot protect it): ${mv}`);
    }

    // No test account in production: the sealed E2E world's members (@e2e.test, an RFC
    // 2606 domain) or the old test@reelhouse.app would let a test write among members.
    const testAccounts = q(
      `SELECT count(*) FROM auth.users WHERE lower(email) LIKE '%@e2e.test' OR lower(email) = 'test@reelhouse.app'`,
    );
    if (testAccounts !== '0') posture.push(`${testAccounts} test account(s) exist in production (…@e2e.test or test@reelhouse.app)`);

    // RUN the admin read RPCs, as an admin, in a rolled-back transaction: a RETURNS
    // TABLE descriptor is checked only when called, so existence is not health. Only
    // when an admin exists (a null subject would raise on every call, crying wolf).
    // The claim is built with json_build_object, so the SQL carries no double quotes.
    const adminId =
      (sec.smokeExecuteAsAdmin || []).length > 0
        ? q(`SELECT id FROM public.profiles WHERE role='admin' LIMIT 1`)
        : '';
    if ((sec.smokeExecuteAsAdmin || []).length > 0 && !adminId) {
      console.warn('⚠ admin RPC smoke test skipped — no profile with role=admin exists.');
    }
    for (const call of adminId ? sec.smokeExecuteAsAdmin : []) {
      try {
        q(
          `BEGIN; ` +
            `SELECT set_config('request.jwt.claims', json_build_object(` +
            `'sub',(SELECT id FROM public.profiles WHERE role='admin' LIMIT 1),` +
            `'role','authenticated')::text, true); ` +
            `SELECT count(*) FROM ${call}; ` +
            `ROLLBACK;`,
        );
      } catch (e) {
        posture.push(`admin RPC raises when called: ${call} — ${why(e)}`);
      }
    }

    grantViolations = posture.length - postureBeforeGrants;
    checkedGrants = true;
  } catch (e) {
    console.warn(`⚠ grant/trigger/RLS check skipped — psql could not connect:\n    ${why(e)}`);
  }
} else {
  console.warn('⚠ grant/trigger/RLS check skipped (set SUPABASE_DB_URL).');
}

// ── Report ──
const skipped = [
  !checkedEdges && 'edge functions',
  !checkedRpcs && 'RPCs',
  !ranCallCheck && "the app's own RPC calls",
  !checkedAnon && 'anon column visibility',
  !checkedAnonGrants && "anon's table grants",
  !checkedDefiners && "anon's SECURITY DEFINER reach",
  !checkedLoungeKeys && 'lounge invite codes',
  !checkedGrants && 'grants/triggers/RLS',
  !checkedVault && 'the Vault (notes per viewing)',
].filter(Boolean);

// A check that verified NOTHING is not a success: whether each ran is part of the result.
const failed =
  missing.rpcs.length > 0 ||
  missing.edgeFunctions.length > 0 ||
  signatureDrift.length > 0 ||
  callMismatches.length > 0 ||
  posture.length > 0 ||
  skipped.length > 0;

if (missing.rpcs.length || missing.edgeFunctions.length) {
  console.error('\n✗ Backend contract entries MISSING from production:');
  if (missing.rpcs.length) console.error('  RPCs:', missing.rpcs.join(', '));
  if (missing.edgeFunctions.length) console.error('  Edge functions:', missing.edgeFunctions.join(', '));
  console.error('\nDeploy the missing functions before shipping the app build.');
}

if (signatureDrift.length) {
  console.error('\n✗ Backend contract SIGNATURE DRIFT — the function exists but the app cannot call it:');
  for (const d of signatureDrift) console.error(`    ${d}`);
  console.error('\nA name that resolves and a signature that does not: every call from the app fails.');
}

if (callMismatches.length) {
  console.error('\n✗ The APP MAKES A CALL production would refuse:');
  for (const m of callMismatches) console.error(`    ${m}`);
  console.error(
    '\nA pinned signature proves the server did not move; this proves the app can\n' +
      'actually reach it. Fix the call site, or the function, before shipping.',
  );
}

if (posture.length) {
  console.error('\n✗ SECURITY POSTURE has drifted from the contract:');
  for (const p of posture) console.error(`    ${p}`);
  console.error(
    '\nThese are live facts, not repo facts: a lockdown written in a migration is not a\n' +
      'lockdown that is on. Fix production, then update scripts/backend-contract.json.',
  );
}

if (skipped.length) {
  console.error(`\n✗ Not checked: ${skipped.join(' + ')}.`);
  console.error('  Set SUPABASE_DB_URL / SUPABASE_PROJECT_REF. An unrun check is not a pass.');
}

// What DID pass, even beside a skip, so verified-good reads apart from not-looked-at.
// A section passes only if it RAN and found nothing ("checked" alone means it ran).
const passed = [
  checkedEdges && !missing.edgeFunctions.length && 'edge functions',
  checkedRpcs && !missing.rpcs.length && !signatureDrift.length && 'RPC signatures',
  ranCallCheck && !callMismatches.length && `every RPC call the app makes (${checkedCalls})`,
  checkedAnon && anonViolations === 0 && 'anon column visibility',
  checkedAnonGrants && anonGrantViolations === 0 && 'anon holds only what the paper needs',
  checkedDefiners && definerViolations === 0 && 'no definer takes an anonymous caller at their word',
  checkedLoungeKeys && loungeKeyViolations === 0 && 'no room carries a key',
  checkedGrants && grantViolations === 0 && 'profile grants + triggers + RLS + length ceilings',
  checkedVault && vaultViolations === 0 && 'the Vault: no note rides in a history, each belongs to a viewing, and the actions are closed to anon',
].filter(Boolean);

if (passed.length && failed) {
  console.log(`\n✓ Checked against production and CLEAN: ${passed.join(', ')}.`);
  if (checkedAnon) {
    const n = (sec.anonMustNotRead || []).length;
    console.log(`  ${n} column(s) confirmed still hidden from anonymous readers.`);
  }
}

if (!failed) {
  console.log(`✓ Verified against production: ${passed.join(', ')}.`);
  if (unsignedRpcs.length) {
    // Named-only entries, counted every run (an overload stays named: the app-call
    // check covers it, trying every overload).
    console.log(`  ${unsignedRpcs.length} RPC(s) not pinned to one signature (overloaded, or newly added):`);
    console.log(`    ${unsignedRpcs.join(', ')}`);
    console.log('    — these are still covered by the app-call check above.');
  }
}

process.exit(failed ? 1 : 0);
