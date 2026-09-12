#!/usr/bin/env node
/**
 * check-backend-live.mjs — verify the live backend matches the contract.
 * ──────────────────────────────────────────────────────────────────────
 * Companion to __tests__/backendContract.test.ts. The Jest test guards the
 * CODE side (what the app calls); this script guards the DEPLOY side (what
 * actually exists in production), catching the exact drift found on 2026-06-26:
 * an RPC/edge function the app needs that isn't deployed.
 *
 * It also verifies SECURITY POSTURE — live facts no test can derive from this
 * repo. Added 2026-08-10 after the schema snapshot misled three times in two
 * days: it showed a column-unrestricted profiles UPDATE policy (live is locked
 * to 7 columns), two conflicting role whitelists (live has one, permitting
 * 'admin' — acting on the snapshot would have locked out the moderators), and a
 * world-readable email column (live denies it). A lockdown written in a
 * migration is not a lockdown that is ON. Only the database can say.
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

// A connection string that still carries its placeholder is not a connection
// string. Left unhandled it reaches psql, fails on authentication, and prints
// the failed command as a wall of text that reads like a bug in this script.
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

// ASK, rather than making someone assemble shell variables by hand.
//
// This used to require exporting SUPABASE_DB_URL yourself before running. That
// is a two-step dance in PowerShell, the variable then persists for the life of
// the window, and a wrong value silently poisons every later run — which is
// exactly what happened. A tool that needs a value should ask for it.
// Only when attached to a terminal, so CI never hangs waiting on a human.
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

// The project ref is public — it is the subdomain of the API URL the app ships,
// so there is no reason to make anyone type it. Derived below, once the app's
// own URL has been read from .env.

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
/** Declared signature no longer matches production — the #24 failure mode. */
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
 *   { p_id: x }  explicit    { p_id }   shorthand
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
 * Strip credentials before anything is printed.
 *
 * execSync's `e.message` is "Command failed: psql <the whole command>", and the
 * command carries the connection string — user, host AND password. On a terminal
 * that is untidy; in a CI log it is a leaked database password. Every path that
 * can surface a raw message goes through here.
 */
function redact(s) {
  return String(s ?? '').replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://<redacted>');
}

/**
 * The REASON psql failed, not the fact that it did.
 *
 * `e.message` is only "Command failed: psql <the entire query>" — it echoes back
 * a wall of SQL and says nothing about the cause, so "network unreachable" and
 * "password authentication failed" look identical and neither is actionable.
 * The cause is on stderr. This surfaces it, and recognises the one that is not
 * a mistake anyone can see: Supabase's direct host is IPv6-only, so on an IPv4
 * network the connection never reaches the point of checking a password.
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
    // SIGNATURES, not names.
    //
    // This selected `proname` alone, which is exactly how #24 stayed invisible:
    // `get_priority_reports` existed under a name the app knew and a signature it
    // could not call, so this reported it healthy while every call 404'd. A name
    // says a function exists; only the signature says the app can reach it.
    const out = sh(
      `psql "${DB_URL}" -tAc "SELECT proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'"`,
    );
    const liveSignatures = new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
    const liveNames = new Set([...liveSignatures].map((s) => s.slice(0, s.indexOf('('))));

    for (const entry of contract.rpcs) {
      // An entry is either a bare name (legacy — existence only) or
      // { name, signature } which is checked exactly.
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
// A pinned signature proves the server did not move. It does NOT prove the app
// can call it: both sides can be internally consistent and still disagree, which
// is precisely #24 — `get_priority_reports` existed under a name the app knew
// and a signature it could not call. Pinning would have pinned the broken one.
//
// So this reads every `supabase.rpc(...)` in the app and asks the database
// whether that exact call is satisfiable: every key the app sends must be a
// parameter, and every parameter without a default must be sent.
//
// Two parsing traps, both of which produced a WRONG answer before they were
// handled, and both of which now fail loudly rather than quietly passing:
//   · `{ dossier_uuid }` — ES6 shorthand has no colon. Counting only `key:`
//     reported two healthy call sites as broken.
//   · a comment inside an object literal, whose prose comma split the argument
//     list. Comments are blanked in place first, preserving offsets.
// Anything still unparseable (a spread, a computed key) is REPORTED, never
// assumed fine.
if (DB_URL) {
  try {
    const liveArgs = new Map();          // name -> [{ params, required }]
    // IN PARAMETERS ONLY. `proargnames` also carries the OUT columns of a
    // function that RETURNS TABLE — `dispatch_door` reported its five result
    // columns as acceptable arguments — so an app passing an output column name
    // would have been waved through. `proargmodes` is NULL when every argument
    // is IN, and an array of modes otherwise; 'i'/'b'/'v' are the input ones.
    // `pronargs` already counts inputs only, so the required count is right.
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
      // `.rpc('name')` with no second argument is a call that sends NOTHING —
      // which is only valid if some overload has no required parameter. Skipping
      // it (the first version did) waves through exactly the call most likely to
      // be wrong: one that forgot its arguments entirely.
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

// ── Security posture ──────────────────────────────────────────────────────
// Facts about the live database that this repo cannot derive. The schema
// snapshot misled three times in two days — it showed a column-unrestricted
// profiles UPDATE policy, two conflicting role whitelists, and a world-readable
// email column, and live was different (stricter) every time. Reading a
// migration proves someone WROTE a lockdown; only the database says it is on.
const sec = contract.security || {};
const posture = [];
let checkedAnon = false;
/** Whether anon's table grants were compared against the allowlist. */
let checkedAnonGrants = false;
/**
 * How many grants failed that comparison. Kept separately for the reason this
 * file already records about `checkedAnon`: "it ran" is not "it was clean", and
 * a run that FOUND drift must not also print a green tick for the same check.
 */
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

    // The CONTROL first. If the API is unreachable or the key is wrong, every
    // "must not read" probe below fails-closed and the whole check passes while
    // verifying nothing — the exact green-tick-for-looking-at-nothing this
    // script was already fixed for once.
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

// ── ANON'S TABLE GRANTS, AGAINST AN EXPLICIT ALLOWLIST ─────────────────────
// The check above asks whether anon can READ a column. This asks the wider
// question it cannot: what is anon permitted to DO, table by table.
//
// anon held SELECT, INSERT, UPDATE and DELETE on dispatch_certifications,
// dispatch_saves and dispatch_votes. None was exploitable — every policy on
// those tables names `authenticated`, so RLS denied every row — but the ONLY
// thing holding the line was that no policy had been left at `{public}`. One
// such policy turns twelve dead grants live at once, and `notifications` was
// found with exactly that mistake on this database the same day.
//
// So the grants are the thing asserted, not the exploit. A grant anon does not
// need is surface, and surface is what a later mistake is built from. The list
// is an ALLOWLIST: anything not named here is a violation, so a table added
// later cannot quietly arrive with anon writes attached.
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
// A SECURITY DEFINER runs with the owner's rights. One that reads auth.uid()
// decides for itself who is calling; one that takes the ACTOR AS A PARAMETER
// believes whatever it is told. If `anon` may execute the second kind, an
// anonymous caller simply names themselves.
//
// `get_taste_profile(<any uuid>)` handed back a member's taste profile to anon,
// and `audience_allows(actor, owner, pref)` answered "may this member see that
// one" for any pair — a privacy graph, one call at a time.
//
// The allowlist below is what anon is ALLOWED to execute of that kind, and each
// entry states why. Three are RLS POLICY HELPERS: a policy expression evaluates
// as the querying role, so revoking those would not tighten anything — it would
// stop policies evaluating and break legitimate public reads. That is why this
// is an allowlist with reasons rather than a blanket revoke.
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
      // The rule this check enforces is "a definer granted to anon must not
      // trust an actor the caller names". This one names no actor: it takes a
      // closed event vocabulary and increments an aggregate per-day counter,
      // and there is no user, device or session column in the table for a
      // caller to point at. Granting it to anon is the POINT — a stranger
      // meeting a rope is the most informative event in the funnel, and The
      // Reel is open to strangers now. Worst case a hostile caller makes the
      // numbers wrong; the function caps the table at 500 rows a day and can
      // write nothing else.
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
// `lounges` is readable by every member — "Lounges are discoverable" USING
// (true) — which is the design: you may see that a room exists and ask at the
// door. `invite_code` was a way AROUND that door, sitting in the same readable
// row, minted on every room `create_lounge` made.
//
// It was a dead credential: no function anywhere accepts a code to join, and
// both clients retired codes. But the danger was never today — it was the first
// person to add "join by code" to a private room and find every room already
// open, with no reason to suspect it.
//
// So the secret was removed rather than guarded, and this keeps it removed. A
// column that is always NULL cannot leak; a check that says so cannot be
// quietly undone by a future `create_lounge` that starts minting again.
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

    // 1. Exactly which columns may an ordinary member write to their own row.
    //    Too many is self-elevation; too few silently breaks profile editing.
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

    // 2. Triggers must exist AND be enabled. 'D' is disabled; it looks identical
    //    to a working trigger in every migration file.
    for (const { table, trigger, why } of sec.mustBeEnabledTriggers || []) {
      const state = q(
        `SELECT t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace ` +
          `WHERE n.nspname='public' AND c.relname='${table}' AND t.tgname='${trigger}' AND NOT t.tgisinternal`,
      );
      if (!state) posture.push(`trigger MISSING: ${table}.${trigger} — ${why}`);
      else if (state !== 'O') posture.push(`trigger DISABLED (tgenabled=${state}): ${table}.${trigger} — ${why}`);
    }

    // 3. RLS on every public table.
    if (sec.rlsRequiredOnEveryPublicTable) {
      const off = q(
        `SELECT string_agg(c.relname, ', ' ORDER BY c.relname) FROM pg_class c ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace ` +
          `WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity`,
      );
      if (off) posture.push(`RLS is OFF on: ${off}`);
    }

    // 4. The length ceilings are still there. Dropping one is silent otherwise.
    if (sec.minLengthCeilings) {
      const n = Number(
        q(`SELECT count(*) FROM pg_constraint WHERE contype='c' AND conname LIKE '%\\_len'`),
      );
      if (!(n >= sec.minLengthCeilings)) {
        posture.push(`length ceilings dropped: ${n} live, expected at least ${sec.minLengthCeilings}`);
      }
    }
    // 5. Every function in public demotes pg_temp.
    //    `SET search_path = public` is a VACUOUS pin: PostgreSQL searches pg_temp
    //    FIRST — before pg_catalog — for relation names unless pg_temp is named
    //    explicitly, so a temp table shadows the real one. Both anon and
    //    authenticated hold TEMP privilege here.
    //    Proven on production 2026-08-10: with a decoy `logs` table planted,
    //    get_profile_counts reported logs_count 0 / ledger_count 0 instead of
    //    145 / 93. After pinning `public, pg_temp` the same attack returned the
    //    true numbers. This check exists because the repo cannot see proconfig —
    //    a function added straight through the SQL editor would never appear in
    //    a migration file, and only the live DB knows.
    if (sec.everyFunctionDemotesPgTemp) {
      const bad = q(
        `SELECT string_agg(p.proname, ', ' ORDER BY p.proname) FROM pg_proc p ` +
          `JOIN pg_namespace n ON n.oid=p.pronamespace ` +
          `WHERE n.nspname='public' AND p.prokind='f' AND NOT COALESCE(` +
          `(SELECT cfg FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%') LIKE '%pg_temp%', false)`,
      );
      if (bad) posture.push(`search_path is not pg_temp-safe on: ${bad}`);
    }

    // 9. No column is invisible to every client.
    //    profiles is protected by COLUMN-level grants, and PostgreSQL does not
    //    extend those to columns created later. So the next ALTER TABLE ADD
    //    COLUMN produces a column no client can read — and the error names the
    //    TABLE, not the column: "permission denied for table profiles". The
    //    cause looks nothing like the symptom.
    //    Reproduced live: adding a column left it unreadable by anon AND
    //    authenticated, while existing named-column queries kept working, so
    //    nothing fails until someone selects the new column.
    //    Private-by-default is the RIGHT posture — it is the same whitelist
    //    logic the email-harvest fix chose deliberately. What was missing is
    //    noticing. Exactly two columns are meant to be invisible to both roles;
    //    a third means someone added a column and forgot the grant.
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

    // 8. Index hygiene: no redundant indexes, and no unindexed foreign keys.
    //    Both are invisible to the repo — an index added through the SQL editor,
    //    or a new FK created without one, appears in no migration file.
    //    Redundant means STRUCTURALLY covered by another index (identical, or a
    //    wider index starting with the same column), never "looks unused":
    //    proven on this database that a 32-row table ignores a good index while a
    //    54-row table uses one, so scan counts say nothing about worth.
    //    An unindexed FK makes every parent delete scan the whole child table —
    //    measured at 143x on 200k rows, and account deletion crosses ~12 of them.
    if (sec.indexHygiene) {
      // Coverage is compared at ANY width, not just single-column. The first
      // version of this check only looked at indnkeyatts=1, and two multi-column
      // duplicates survived the batch because of it — idx_logs_composite_user_film
      // (user_id, film_id) sat beside both a UNIQUE index on exactly those columns
      // and a wider one starting with them, on the hottest write table in the app.
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

    // 6. Actually RUN the admin read RPCs, as an admin, inside a rolled-back
    //    transaction.
    //    Existence is not health. get_priority_reports existed, was granted, and
    //    had the right signature — and raised on every single call for days,
    //    because it declared `content_id uuid` while reports.content_id is text.
    //    PostgreSQL validates a RETURNS TABLE descriptor at execution, so no
    //    static check could see it; only calling it could. The Tribunal docket
    //    was unopenable and every name-and-signature check reported healthy.
    //    The jwt claim is built with json_build_object so this SQL carries no
    //    double quotes to survive shell escaping.
    // 7. anon/authenticated hold no TRUNCATE, REFERENCES or TRIGGER.
    //    TRUNCATE is the one write RLS cannot defend: a DELETE with the anon key
    //    returns 204 and removes nothing because the policies filter the rows,
    //    but TRUNCATE has no rows to filter. Nothing needs it — PostgREST answers
    //    the verb with 501 and no function contains it — so it is simply gone.
    //    This also catches a NEW table arriving with Supabase's default GRANT ALL,
    //    which is the way this drifts back.
    if (sec.noWipePrivileges) {
      const bad = q(
        `SELECT string_agg(DISTINCT c.relname, ', ') FROM pg_class c ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' ` +
          `CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role) ` +
          `CROSS JOIN (VALUES ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) AS pp(priv) ` +
          `WHERE c.relkind IN ('r','p','m') AND has_table_privilege(rr.role, c.oid, pp.priv)`,
      );
      if (bad) posture.push(`anon/authenticated still hold TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on: ${bad}`);

      // A materialized view cannot carry RLS — PostgreSQL has no policy to apply —
      // so a SELECT grant on one is unconditional access to every row it holds.
      // global_feed_materialized served 263 rows of usernames and review text to
      // `anon` over HTTP 200, and sealing a member changed nothing. Any matview
      // readable by these roles is that same leak.
      const mv = q(
        `SELECT string_agg(DISTINCT c.relname, ', ') FROM pg_class c ` +
          `JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' ` +
          `CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role) ` +
          `WHERE c.relkind='m' AND has_table_privilege(rr.role, c.oid, 'SELECT')`,
      );
      if (mv) posture.push(`materialized view readable by anon/authenticated (RLS cannot protect it): ${mv}`);
    }

    //    Guarded on an admin existing: with no admin row, set_config would write a
    //    null subject and every one of these RPCs would raise "Not authenticated",
    //    reporting the whole admin surface broken when nothing is. A guard that
    //    cries wolf is a guard someone eventually deletes.
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
].filter(Boolean);

// A check that verifies NOTHING must not report success.
//
// This printed "✓ Verified present in production: nothing." and exited 0 when
// both halves were skipped — a green tick for having looked at nothing, which
// reads identically to a pass in any log or CI summary. Whether it ran is now
// part of the result.
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
  console.error('\nThis is the #24 failure mode: a name that resolves and a signature that does not.');
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
    '\nThese are live facts, not repo facts. The schema snapshot has been wrong about\n' +
      'all three of these before — a lockdown written in a migration is not a lockdown\n' +
      'that is on. Fix production, then update scripts/backend-contract.json.',
  );
}

if (skipped.length) {
  console.error(`\n✗ Not checked: ${skipped.join(' + ')}.`);
  console.error('  Set SUPABASE_DB_URL / SUPABASE_PROJECT_REF. An unrun check is not a pass.');
}

// Say what DID pass, even when something else was skipped.
//
// Without this the run is all warnings and one error: a member reads it as
// "everything is broken" when in fact the security posture was checked against
// production and was clean. Reporting only failures is the same defect as
// reporting only successes — the reader cannot tell verified-good from
// not-looked-at, which is the distinction this whole script exists to make.
// A section only counts as passed if it RAN and produced no violations.
// `checkedAnon` alone is not enough: it means "the probes completed", not "they
// were clean", so a run that FOUND drift would print the violation and a green
// tick for the very same check directly underneath it.
const passed = [
  checkedEdges && !missing.edgeFunctions.length && 'edge functions',
  checkedRpcs && !missing.rpcs.length && !signatureDrift.length && 'RPC signatures',
  ranCallCheck && !callMismatches.length && `every RPC call the app makes (${checkedCalls})`,
  checkedAnon && anonViolations === 0 && 'anon column visibility',
  checkedAnonGrants && anonGrantViolations === 0 && 'anon holds only what the paper needs',
  checkedDefiners && definerViolations === 0 && 'no definer takes an anonymous caller at their word',
  checkedLoungeKeys && loungeKeyViolations === 0 && 'no room carries a key',
  checkedGrants && grantViolations === 0 && 'profile grants + triggers + RLS + length ceilings',
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
    // Named-only entries cannot catch signature drift on their own. Reported
    // every run so the remaining blind spot is a number someone can watch
    // shrink, rather than a silence.
    //
    // An OVERLOADED function belongs here permanently and is not a gap: pinning
    // one of two signatures would invent drift on every run. The app-call check
    // above covers these, because it tries every overload.
    console.log(`  ${unsignedRpcs.length} RPC(s) not pinned to one signature (overloaded, or newly added):`);
    console.log(`    ${unsignedRpcs.join(', ')}`);
    console.log('    — these are still covered by the app-call check above.');
  }
}

process.exit(failed ? 1 : 0);
