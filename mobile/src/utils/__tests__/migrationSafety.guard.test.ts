/**
 * A migration reaches production only as one safe unit, and the address it
 * reaches it by stays outside the repo and OneDrive.
 * ─────────────────────────────────────────────────────────────────────────────
 * Three pieces, each held here:
 *   - scripts/migration-lint.cjs: no transaction control in a file, the time
 *     limits set first, a CONCURRENTLY index alone with plain SETs;
 *   - supabase/diagnostics/apply.cjs: lints before it runs, always runs under
 *     the time limits, and takes --no-transaction for a CONCURRENTLY file only;
 *   - scripts/private-settings.cjs: the one reader of the address, refusing a
 *     folder inside OneDrive or the repo; no other script reads it from a
 *     `.env` file or writes it anywhere.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const { lint } = require('../../../scripts/migration-lint.cjs') as {
  lint: (sql: string, opts?: { undo?: boolean }) => { kind: 'transaction' | 'concurrently'; faults: string[] };
};
const { plan } = require('../../../supabase/diagnostics/apply.cjs') as {
  plan: (args: string[], sql: string) => { refuse?: string; psqlArgs?: string[]; pgoptions?: string };
};
const { refusal } = require('../../../scripts/private-settings.cjs') as { refusal: (dir: string) => string | null };

const LIMITS = "SET LOCAL lock_timeout = '2s';\nSET LOCAL statement_timeout = '30s';\n";
const GOOD = `-- a new column\n${LIMITS}ALTER TABLE public.t ADD COLUMN x text;\n`;
const CONCURRENT = "SET lock_timeout = '2s';\nSET statement_timeout = '15min';\nCREATE INDEX CONCURRENTLY t_x ON public.t (x);\n";

describe('the migration lint', () => {
  it('passes a transaction file with its limits first, and a CONCURRENTLY file alone with plain SETs', () => {
    expect(lint(GOOD)).toEqual({ kind: 'transaction', faults: [] });
    expect(lint(CONCURRENT)).toEqual({ kind: 'concurrently', faults: [] });
  });

  it('reads a function body and a DO block as their own: their BEGIN and END are not transaction control', () => {
    const sql = `${LIMITS}CREATE FUNCTION public.f() RETURNS void LANGUAGE plpgsql AS $$ BEGIN COMMIT; END $$;\nDO $do$ BEGIN PERFORM 1; END $do$;\n`;
    expect(lint(sql).faults).toEqual([]);
  });

  it.each([
    ['transaction control', `${LIMITS}BEGIN;\nALTER TABLE public.t ADD COLUMN x text;\nCOMMIT;\n`, 'transaction control: BEGIN'],
    ['no limits', 'ALTER TABLE public.t ADD COLUMN x text;', "no SET LOCAL lock_timeout = '2s' before the first statement"],
    ['limits after the first statement', `ALTER TABLE public.t ADD COLUMN x text;\n${LIMITS}`, "no SET LOCAL lock_timeout = '2s' before the first statement"],
    ['a longer lock wait', GOOD.replace("'2s'", "'10s'"), "no SET LOCAL lock_timeout = '2s' before the first statement"],
    ['a plain SET in a transaction file', GOOD.replace("SET LOCAL statement_timeout", 'SET statement_timeout'), "no SET LOCAL statement_timeout = '30s' before the first statement"],
    ['SET LOCAL in a CONCURRENTLY file', CONCURRENT.replace("SET lock_timeout", 'SET LOCAL lock_timeout'), "SET LOCAL does nothing outside a transaction: SET LOCAL lock_timeout = '2s'"],
    ['a CONCURRENTLY index with company', `${CONCURRENT}ALTER TABLE public.t ADD COLUMN y text;\n`, 'a CONCURRENTLY statement must be alone in its file (2 statements here)'],
    ['a CONCURRENTLY file with no statement limit', CONCURRENT.replace("SET statement_timeout = '15min';\n", ''), 'no plain SET statement_timeout'],
  ])('says NO to %s', (_name, sql, fault) => {
    expect(lint(sql).faults).toContain(fault);
  });

  it('refuses transaction control in an undo file, and asks nothing else of it', () => {
    expect(lint('ALTER TABLE public.t DROP COLUMN x;', { undo: true }).faults).toEqual([]);
    expect(lint('ROLLBACK;', { undo: true }).faults).toEqual(['transaction control: ROLLBACK']);
  });
});

describe('apply.cjs', () => {
  it('runs a transaction file as one transaction, under the time limits', () => {
    expect(plan(['m.sql'], GOOD)).toEqual({
      file: 'm.sql', psqlArgs: ['-X', '-1', '-v', 'ON_ERROR_STOP=1', '-f', 'm.sql'], pgoptions: '-c lock_timeout=2s -c statement_timeout=30s',
    });
  });

  it('runs a CONCURRENTLY file without one, only when told to', () => {
    expect(plan(['--no-transaction', 'i.sql'], CONCURRENT).psqlArgs).toEqual(['-X', '-v', 'ON_ERROR_STOP=1', '-f', 'i.sql']);
    expect(plan(['i.sql'], CONCURRENT).refuse).toBe('a CONCURRENTLY file cannot run in a transaction: add --no-transaction');
  });

  it('refuses --no-transaction for any other file, a file the lint refuses, and anything but one file', () => {
    expect(plan(['--no-transaction', 'm.sql'], GOOD).refuse).toBe('--no-transaction is only for a CONCURRENTLY file; this one runs as one transaction');
    expect(plan(['m.sql'], 'ALTER TABLE public.t ADD COLUMN x text;').refuse).toMatch(/^the migration lint refuses m\.sql/);
    expect(plan(['a.sql', 'b.sql'], GOOD).refuse).toMatch(/^usage/);
    expect(plan(['--force', 'm.sql'], GOOD).refuse).toMatch(/^usage/);
  });
});

describe('every change has a tested undo', () => {
  const ROOT = join(MOBILE, '..');
  const listed = readFileSync(join(MOBILE, 'supabase/APPLIED.txt'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  const withCode = (p: string) => readFileSync(p, 'utf8').split('\n').some((l) => l.trim() && !l.trim().startsWith('--'));
  const files = ['supabase/migrations', 'mobile/supabase/migrations'].flatMap((d) =>
    readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.sql') && withCode(join(ROOT, d, f))));

  it('the applied list names only migrations that exist, once each', () => {
    expect(listed.length).toBeGreaterThan(200);
    expect(listed.filter((n) => !files.includes(n))).toEqual([]);
    expect(listed.filter((n, i) => listed.indexOf(n) !== i)).toEqual([]);
  });

  it('a pending migration has its undo, under its own name', () => {
    const pending = files.filter((f) => !listed.includes(f));
    const undos = readdirSync(join(MOBILE, 'supabase/migrations-down')).filter((f) => f.endsWith('.sql'));
    expect(pending.filter((f) => !undos.includes(f))).toEqual([]);
    expect(undos.filter((f) => !pending.includes(f))).toEqual([]);
  });

  it('CI proves the undo can fail, then runs every pending one up, down and up', () => {
    const ci = readFileSync(join(ROOT, '.github/workflows/db-integration.yml'), 'utf8');
    const selfTest = ci.indexOf('node mobile/e2e/db/up-down-up.mjs --self-test');
    const run = ci.indexOf('run: node mobile/e2e/db/up-down-up.mjs\n');
    expect(selfTest).toBeGreaterThan(ci.indexOf('schema-snapshot.mjs --check'));
    expect(run).toBeGreaterThan(selfTest);
    expect(ci.indexOf('-f mobile/e2e/db/security.sql')).toBeGreaterThan(run);
  });
});

describe('the copy taken before a change', () => {
  const { plan: dumpPlan } = require('../../../scripts/dump-production.cjs') as {
    plan: (kind: string, tables: string[], stamp: string) => { refuse?: string; name?: string; args?: string[] };
  };

  it('takes the whole database, or the named tables\' rows', () => {
    expect(dumpPlan('full', [], 'T')).toEqual({ name: 'T-full.dump', args: ['--format=custom'] });
    expect(dumpPlan('data', ['public.push_subscriptions', 'public.profiles'], 'T')).toEqual({
      name: 'T-data-push_subscriptions+profiles.dump',
      args: ['--format=custom', '--data-only', '--table', 'public.push_subscriptions', '--table', 'public.profiles'],
    });
  });

  it('says NO to anything else, a table name that is more than a name included', () => {
    for (const [kind, tables] of [['full', ['public.x']], ['data', []], ['data', ['x']], ['data', ['public.x; DROP']], ['schema', []]] as const) {
      expect(dumpPlan(kind, [...tables], 'T').refuse).toMatch(/^usage/);
    }
  });
});

describe('the database address', () => {
  it('may live outside the repo and OneDrive, and nowhere else', () => {
    expect(refusal(join(homedir(), 'reelhouse-private'))).toBeNull();
    expect(refusal(join(homedir(), 'OneDrive', 'private'))).toMatch(/inside OneDrive$/);
    expect(refusal(join(homedir(), 'OneDrive - House', 'x'))).toMatch(/inside OneDrive$/);
    // This checkout may itself sit in OneDrive (this PC's does), and that refusal comes first.
    const inOneDrive = /[\\/]OneDrive[\\/]/i.test(MOBILE);
    expect(refusal(join(MOBILE, 'private'))).toMatch(inOneDrive ? /inside OneDrive$/ : /inside the repo$/);
  });

  it('is read through private-settings.cjs alone, and written by it alone', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (!['node_modules', '__tests__', 'fixtures'].includes(name)) walk(p); } else if (/\.(c|m)?js$|\.ts$|\.sh$/.test(name)) files.push(p);
      }
    };
    ['scripts', 'supabase/diagnostics', 'e2e'].forEach((d) => walk(join(MOBILE, d)));
    expect(files.length).toBeGreaterThan(40);
    const code = (p: string) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*|#)/.test(l)).join('\n');
    const readers = files.filter((p) => !p.endsWith('private-settings.cjs') && /SUPABASE_DB_URL/.test(code(p)));
    expect(readers.length).toBeGreaterThanOrEqual(4);
    // Read from a file (a .env.local, or a line matched out of any text), or
    // written as a line: both refused.
    const fromText = (l: string) => /SUPABASE_DB_URL/.test(l) && /readFileSync|\.match\(|\.exec\(|=\$\{/.test(l);
    const wrong = readers.filter((p) => code(p).includes('.env.local') || code(p).split('\n').some(fromText));
    expect(wrong.map((p) => p.slice(MOBILE.length + 1))).toEqual([]);
  });
});
