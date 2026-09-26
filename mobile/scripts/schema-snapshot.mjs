#!/usr/bin/env node
/**
 * schema-snapshot.mjs — reconcile the live database against the repo.
 *
 *   node scripts/schema-snapshot.mjs           write the snapshot
 *   node scripts/schema-snapshot.mjs --check   compare live against it, exit 1 on drift
 *
 * ── Why a snapshot and not a migration ledger ──────────────────────────────
 * The obvious fix for "nothing records which migrations are live" is to backfill
 * supabase_migrations.schema_migrations. That table holds **0 rows**, the
 * database was built outside the migration system, and 143 SQL files across two
 * trees were applied by hand. Any backfill would be a guess recorded as fact.
 *
 * A snapshot records what IS, not what was intended, and it catches drift from
 * every source — a hand-run statement in the SQL editor, a dashboard click, an
 * extension upgrade — not just "a migration file was skipped". Hand-running SQL
 * is how this project actually works, so that is the drift that matters.
 *
 * ── Three files, because `-n public` is blind outside public ───────────────
 * A `pg_dump --schema-only -n public` captures ZERO cron jobs and ZERO storage
 * buckets, because those are rows rather than DDL. The two worst things the
 * recent batches found lived exactly there: a PUBLIC storage bucket with no size
 * limit that any member could upload to, and a cron job that had failed 171,883
 * times. A DDL-only snapshot would have reported "clean" for both.
 *
 * It is just as blind to what this app attached to Supabase's own tables: the
 * triggers on auth.users that make and erase a profile, the upload rules on
 * storage.objects, the tables live updates are sent for, and the event trigger
 * that switches RLS on for every new table. None of that is in `public`.
 *
 *   live-extensions.sql     the extensions, at their versions — run FIRST
 *   live-schema.sql         pg_dump of `public`: tables, columns, constraints,
 *                           indexes, RLS policies, functions, triggers, grants
 *   live-outside-public.sql everything else this app owns — run LAST
 *
 * The first and last are SQL, not a description, so the three together build
 * the database, in that order (the sealed E2E world is built from them). Every
 * expression in them is printed with search_path set to pg_catalog, so each
 * name carries its schema and the file means the same thing wherever it runs.
 *
 * ── Two things that make it lie if unpinned ────────────────────────────────
 * 1. pg_dump emits a random \restrict token on two lines every run. Stripped
 *    with an anchored pattern verified to match only those two lines.
 * 2. pg_dump's output format is tied to its version. This snapshot was taken
 *    with the version recorded in the header; a different one produces
 *    formatting differences that look exactly like real drift. Asserted below.
 *
 * Line endings are pinned by .gitattributes — see the note there. Without it
 * this command reports drift on a clean database, permanently.
 *
 * `vault` is never dumped. It holds a real secret (notify_push_secret), and a
 * committed schema file is the wrong place for one. Only the secrets' NAMES are
 * recorded, and nothing is written or printed if any of the three files holds
 * something shaped like a key or a token (secret-shapes.cjs).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import secretShapes from './secret-shapes.cjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'supabase', 'schema');
const EXT_FILE = join(OUT_DIR, 'live-extensions.sql');
const SCHEMA_FILE = join(OUT_DIR, 'live-schema.sql');
const OUTSIDE_FILE = join(OUT_DIR, 'live-outside-public.sql');
const CHECK = process.argv.includes('--check');

/** Read SUPABASE_DB_URL the same way check-backend-live.mjs does. */
function dbUrl() {
  for (const f of ['.env.local', '.env']) {
    const p = join(HERE, '..', f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

/** Strip credentials before anything is printed — the connection string carries a password. */
const redact = (s) => String(s ?? '').replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://<redacted>');

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}

/**
 * psql and pg_dump on Windows write stdout in text mode: every \n they print
 * arrives as \r\n. Undo exactly that one layer. A function body saved with
 * CRLF holds a real \r\n in the database, printed as \r\r\n; this turns it
 * back into \r\n, so the database's own text survives byte for byte, and the
 * files are the same whichever machine takes them.
 */
const undoHostNewlines = (s) => s.replace(/\r\n/g, '\n');

/** One query, with search_path pinned so every printed expression is schema-qualified. */
function psql(url, sql) {
  return undoHostNewlines(run('psql', [url, '-X', '-q', '-tA', '-c', 'SET search_path = pg_catalog', '-c', sql],
    { env: { ...process.env, PGCLIENTENCODING: 'UTF8' } })).trim();
}

/** The two \restrict lines pg_dump randomises per run. Anchored so it cannot eat real SQL. */
const stripSessionToken = (s) => s.split('\n').filter((l) => !/^\\(un)?restrict /.test(l)).join('\n');

function dumpSchema(url, pgDumpVersion) {
  const raw = run('pg_dump', [
    url, '--schema-only', '--no-owner', '-n', 'public',
    // `vault` is not listed, and cannot be: -n restricts to exactly what is named.
  ], { env: { ...process.env, PGCLIENTENCODING: 'UTF8' } });
  const body = stripSessionToken(undoHostNewlines(raw));
  return `-- Generated by scripts/schema-snapshot.mjs\n-- pg_dump: ${pgDumpVersion}\n-- Do not edit by hand. Re-run the script after a migration and commit the result.\n${body}`;
}

const HEADER = (runs) => [
  '-- Generated by scripts/schema-snapshot.mjs',
  `-- ${runs}`,
  '-- Do not edit by hand. Re-run the script after a migration and commit the result.',
];

/** A section: its heading, then one statement per line, or a note that there are none. */
const section = (title, body) => ['', `-- ── ${title}`, body || '-- (none)'];

/** The extensions, at the schema and version production has them. Runs before live-schema.sql. */
function dumpExtensions(url) {
  return [
    ...HEADER('Run FIRST: live-extensions.sql, then live-schema.sql, then live-outside-public.sql.'),
    ...section('extensions', psql(url, `
      SELECT string_agg(format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I VERSION %L;', e.extname, n.nspname, e.extversion), E'\\n' ORDER BY e.extname)
      FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
      WHERE e.extname <> 'plpgsql'`)),
    '',
  ].join('\n');
}

/**
 * Everything this app owns outside `public`. Runs after live-schema.sql.
 *
 * "Owns" is decided by what it points at, not by a list of names, so a new one
 * is picked up without anyone remembering to add it here:
 *   triggers        on a table outside public that run a function IN public
 *   event triggers  that run a function in public
 *   publications    tables of public that a publication sends
 *   policies        on tables outside public that no extension created
 *                   (pg_cron makes cron's own; this app makes storage's)
 */
function dumpOutside(url) {
  const q = (sql) => psql(url, sql);
  return [
    ...HEADER('Run LAST, after live-schema.sql.'),

    ...section('triggers this app put on tables outside public', q(`
      SELECT string_agg(pg_get_triggerdef(t.oid) || ';' || CASE t.tgenabled
          WHEN 'D' THEN format(' ALTER TABLE %s DISABLE TRIGGER %I;', t.tgrelid::regclass, t.tgname)
          WHEN 'R' THEN format(' ALTER TABLE %s ENABLE REPLICA TRIGGER %I;', t.tgrelid::regclass, t.tgname)
          WHEN 'A' THEN format(' ALTER TABLE %s ENABLE ALWAYS TRIGGER %I;', t.tgrelid::regclass, t.tgname)
          ELSE '' END, E'\\n' ORDER BY t.tgrelid::regclass::text, t.tgname)
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace pn ON pn.oid = p.pronamespace
      WHERE NOT t.tgisinternal AND n.nspname <> 'public' AND pn.nspname = 'public'`)),

    ...section('event triggers', q(`
      SELECT string_agg(format('CREATE EVENT TRIGGER %I ON %s%s EXECUTE FUNCTION %I.%I();%s',
          e.evtname, e.evtevent,
          CASE WHEN e.evttags IS NULL THEN '' ELSE ' WHEN TAG IN (' || (SELECT string_agg(quote_literal(tag), ', ' ORDER BY tag) FROM unnest(e.evttags) tag) || ')' END,
          pn.nspname, p.proname,
          CASE e.evtenabled WHEN 'O' THEN '' WHEN 'D' THEN format(' ALTER EVENT TRIGGER %I DISABLE;', e.evtname)
            WHEN 'R' THEN format(' ALTER EVENT TRIGGER %I ENABLE REPLICA;', e.evtname) ELSE format(' ALTER EVENT TRIGGER %I ENABLE ALWAYS;', e.evtname) END),
        E'\\n' ORDER BY e.evtname)
      FROM pg_event_trigger e JOIN pg_proc p ON p.oid = e.evtfoid JOIN pg_namespace pn ON pn.oid = p.pronamespace
      WHERE pn.nspname = 'public'`)),

    ...section('tables whose changes are published (live updates)', q(`
      SELECT string_agg(format('ALTER PUBLICATION %I ADD TABLE %I.%I%s%s;', pub.pubname, n.nspname, c.relname,
          CASE WHEN pr.prattrs IS NULL THEN '' ELSE ' (' || (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = pr.prrelid AND a.attnum = ANY (pr.prattrs)) || ')' END,
          CASE WHEN pr.prqual IS NULL THEN '' ELSE ' WHERE (' || pg_get_expr(pr.prqual, pr.prrelid) || ')' END),
        E'\\n' ORDER BY pub.pubname, n.nspname, c.relname)
      FROM pg_publication_rel pr JOIN pg_publication pub ON pub.oid = pr.prpubid
      JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'`)),

    ...section('storage buckets', q(`
      SELECT string_agg(format('INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, avif_autodetection) VALUES (%L, %L, %L, %s, %s, %L);',
          b.id, b.name, b.public, COALESCE(b.file_size_limit::text, 'NULL'),
          COALESCE(quote_literal(b.allowed_mime_types::text) || '::text[]', 'NULL'), b.avif_autodetection),
        E'\\n' ORDER BY b.id)
      FROM storage.buckets b`)),

    ...section('row-level security on tables outside public', q(`
      SELECT string_agg(format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
          pol.polname, n.nspname, c.relname,
          CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END,
          CASE WHEN pol.polroles = '{0}' THEN 'public' ELSE (SELECT string_agg(quote_ident(r.rolname), ', ' ORDER BY r.rolname) FROM pg_roles r WHERE r.oid = ANY (pol.polroles)) END,
          CASE WHEN pol.polqual IS NULL THEN '' ELSE ' USING (' || pg_get_expr(pol.polqual, pol.polrelid) || ')' END,
          CASE WHEN pol.polwithcheck IS NULL THEN '' ELSE ' WITH CHECK (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')' END),
        E'\\n' ORDER BY n.nspname, c.relname, pol.polname)
      FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname <> 'public'
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')`)),

    ...section('scheduled jobs', q(`
      SELECT string_agg(format('SELECT cron.schedule_in_database(%L, %L, %L, %L, %L, %L);', j.jobname, j.schedule, j.command, j.database, j.username, j.active),
        E'\\n' ORDER BY j.jobname)
      FROM cron.job j`)),

    ...section('vault secrets — names only; a stand-in must be made wherever this is built', q(`
      SELECT string_agg('-- ' || s.name, E'\\n' ORDER BY s.name) FROM vault.secrets s`)),

    ...section('migration ledger', q(`
      SELECT '-- supabase_migrations.schema_migrations rows: ' || count(*) FROM supabase_migrations.schema_migrations`)),
    '',
  ].join('\n');
}

const url = dbUrl();
if (!url) {
  console.error('SUPABASE_DB_URL not found in mobile/.env.local or mobile/.env — cannot reach the database.');
  process.exit(2);
}

let version;
try {
  version = run('pg_dump', ['--version']).trim();
} catch {
  console.error('pg_dump is not on PATH. Install the PostgreSQL client tools.');
  process.exit(2);
}

let live;
try {
  live = [
    [EXT_FILE, dumpExtensions(url)],
    [SCHEMA_FILE, dumpSchema(url, version)],
    [OUTSIDE_FILE, dumpOutside(url)],
  ];
} catch (e) {
  console.error('Could not read the database: ' + redact(e.stderr?.toString() || e.message).split('\n')[0]);
  process.exit(2);
}

// Before anything is written OR printed — a drift report would print the line.
for (const [file, text] of live) {
  const hit = secretShapes.findSecret(text);
  if (hit) {
    console.error(`✗ ${basename(file)} line ${hit.line} is shaped like a key or token (${hit.shape}).`);
    console.error('  Nothing was written or printed. Move the secret into vault and read it from there.');
    process.exit(2);
  }
}

if (!CHECK) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [file, text] of live) {
    writeFileSync(file, text, 'utf8');
    console.log(`✓ ${basename(file)}  (${text.split('\n').length} lines)`);
  }
  console.log(`  taken with ${version}`);
  process.exit(0);
}

const absent = live.map(([file]) => file).filter((file) => !existsSync(file));
if (absent.length) {
  console.error(`Not committed yet: ${absent.map((f) => basename(f)).join(', ')}. Run: node scripts/schema-snapshot.mjs`);
  process.exit(2);
}

const committedSchema = readFileSync(SCHEMA_FILE, 'utf8');

// A version mismatch produces formatting differences indistinguishable from real
// drift. Say so plainly rather than printing a 500-line diff nobody can read.
const recorded = committedSchema.match(/^-- pg_dump: (.+)$/m)?.[1];
if (recorded && recorded !== version) {
  console.error(`✗ pg_dump version mismatch.\n    snapshot taken with: ${recorded}\n    yours:               ${version}\n  Formatting differs between versions, so any diff below would be noise.\n  Use the recorded version, or re-take the snapshot deliberately.`);
  process.exit(2);
}

/**
 * Report what was ADDED and REMOVED, as a multiset difference.
 *
 * Not a positional line-by-line comparison. Inserting one table near the top of
 * the dump shifts every line below it, and a positional diff called that "3,987
 * lines differ" for a single new table. Nobody reads a 3,987-line diff, so
 * nobody acts on it — the same failure mode as a check that cries wolf.
 *
 * A multiset difference reports that same change as "+4 added", which is the
 * truth and is actionable. Counts are kept so a duplicated line is not silently
 * absorbed by an identical one elsewhere.
 */
function diff(label, a, b) {
  if (a === b) return 0;

  const count = (s) => {
    const m = new Map();
    for (const l of s.split('\n')) m.set(l, (m.get(l) || 0) + 1);
    return m;
  };
  const ca = count(a), cb = count(b);
  const removed = [], added = [];
  for (const [line, n] of ca) {
    const d = n - (cb.get(line) || 0);
    for (let i = 0; i < d; i++) removed.push(line);
  }
  for (const [line, n] of cb) {
    const d = n - (ca.get(line) || 0);
    for (let i = 0; i < d; i++) added.push(line);
  }

  // Same lines, different order: the multiset matches but the text does not.
  if (!removed.length && !added.length) {
    console.error(`\n✗ ${label}: same lines in a different order`);
    return 1;
  }

  console.error(`\n✗ ${label}: ${added.length} line(s) added, ${removed.length} removed`);

  // Show the lines that say something. A pg_dump hunk is mostly blank lines and
  // `--` rules; printing those first buried the one line that named the change
  // ("CREATE TABLE public._drift_probe") below twenty separators. Noise is
  // counted, not displayed.
  const meaningful = (l) => l.trim() !== '' && !/^--+$/.test(l.trim()) && !/^--\s*$/.test(l);
  const show = (arr, sign, word) => {
    if (!arr.length) return;
    const real = arr.filter(meaningful);
    const noise = arr.length - real.length;
    for (const l of real.slice(0, 20)) console.error(`    ${sign} ${l}`);
    if (real.length > 20) console.error(`    … ${real.length - 20} more ${word}`);
    if (noise) console.error(`    (+ ${noise} blank/separator line${noise === 1 ? '' : 's'})`);
  };
  show(removed, '-', 'removed');
  show(added, '+', 'added');
  return added.length + removed.length;
}

const n = live.reduce((sum, [file, text]) => sum + diff(basename(file), readFileSync(file, 'utf8'), text), 0);

if (n === 0) {
  console.log('✓ Live database matches the committed snapshot — extensions, public, and everything outside it.');
  process.exit(0);
}
console.error(`\n  The live database no longer matches the repo.`);
console.error(`  If the change was intentional, re-run without --check and commit the result`);
console.error(`  alongside the migration that caused it.`);
process.exit(1);
