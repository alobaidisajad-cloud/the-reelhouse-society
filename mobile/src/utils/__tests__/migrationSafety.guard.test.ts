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
    // A Windows checkout holds the file with CRLF; the steps are read line by line as LF.
    const ci = readFileSync(join(ROOT, '.github/workflows/db-integration.yml'), 'utf8').replace(/\r\n/g, '\n');
    const selfTest = ci.indexOf('node mobile/e2e/db/up-down-up.mjs --self-test');
    const run = ci.indexOf('run: node mobile/e2e/db/up-down-up.mjs\n');
    expect(selfTest).toBeGreaterThan(ci.indexOf('schema-snapshot.mjs --check'));
    expect(run).toBeGreaterThan(selfTest);
    expect(ci.indexOf('-f mobile/e2e/db/security.sql')).toBeGreaterThan(run);
  });
});

describe('the clients in members\' hands', () => {
  const record = JSON.parse(readFileSync(join(MOBILE, 'e2e/old-clients.json'), 'utf8')) as {
    clients: { name: string; commit: string | null; checked: boolean; note?: string }[];
  };

  it('are recorded, the TestFlight build checked at its own full commit, every unchecked one saying why', () => {
    const build41 = record.clients.find((c) => c.name === 'TestFlight build 41');
    expect(build41).toEqual(expect.objectContaining({ commit: 'ae569c0f33724ef3eec96762523d3cd98e008bbc', checked: true }));
    for (const c of record.clients) {
      if (c.checked) expect([c.name, /^[0-9a-f]{40}$/.test(c.commit ?? '')]).toEqual([c.name, true]);
      else expect([c.name, (c.note ?? '').length > 20]).toEqual([c.name, true]);
    }
  });

  it('are run end to end from their own commit, with only patches that name an app file, a commit and a reason', () => {
    const { clientNamed, HARNESS } = require('../../../e2e/old-clients.cjs') as {
      clientNamed: (r: unknown, n: string) => { refuse?: string; client?: { patches?: unknown[] } };
      HARNESS: string[];
    };
    expect(HARNESS).toEqual(['e2e', 'scripts', 'supabase', 'node_modules']);
    expect(clientNamed(record, 'TestFlight build 41').client?.patches).toHaveLength(4);
    expect(clientNamed(record, 'the website').refuse).toBe('the website is not a checked client with a full commit');
    expect(clientNamed(record, 'build 99').refuse).toBe('no client named "build 99" in old-clients.json');
    const bad = (patch: object) => clientNamed({ clients: [{ name: 'x', checked: true, commit: 'a'.repeat(40), patches: [patch] }] }, 'x').refuse;
    expect(bad({ path: 'mobile/e2e/run-flows.sh', from: 'b'.repeat(40), why: 'the harness' })).toMatch(/^x: a patch needs/);
    expect(bad({ path: 'mobile/src/x.ts', from: 'b'.repeat(40), why: '' })).toMatch(/^x: a patch needs/);
    expect(bad({ path: 'mobile/src/x.ts', from: 'bbbb', why: 'short commit' })).toMatch(/^x: a patch needs/);
    expect(bad({ path: 'mobile/src/x.ts', from: 'b'.repeat(40), why: 'a reason' })).toBeUndefined();
  });

  it('are checked in CI after every pending migration is applied, before the security checks', () => {
    const ci = readFileSync(join(MOBILE, '..', '.github/workflows/db-integration.yml'), 'utf8').replace(/\r\n/g, '\n');
    const at = ci.indexOf('run: node mobile/e2e/db/old-clients.mjs');
    expect(ci.indexOf('run: node mobile/e2e/db/up-down-up.mjs\n')).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(ci.indexOf('run: node mobile/e2e/db/up-down-up.mjs\n'));
    expect(ci.indexOf('-f mobile/e2e/db/security.sql')).toBeGreaterThan(at);
  });
});

describe('a rehearsal on production', () => {
  const { plan: rehearsePlan } = require('../../../supabase/diagnostics/rehearse.cjs') as {
    plan: (args: string[]) => { refuse?: string; psqlArgs?: string[]; pgoptions?: string };
  };

  it('runs one rehearsal file, under the time limits, with the pending train when asked', () => {
    const p = rehearsePlan(['train_0_rehearsal.sql', '--with-train']);
    expect(p.pgoptions).toBe('-c lock_timeout=2s -c statement_timeout=30s');
    expect(p.psqlArgs?.slice(0, 8)).toEqual(['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-v', 'with_train=1']);
    expect(p.psqlArgs?.[p.psqlArgs.length - 1]).toMatch(/[\\/]diagnostics[\\/]train_0_rehearsal\.sql$/);
    expect(rehearsePlan(['the_vault_rehearsal.sql']).psqlArgs).not.toContain('with_train=1');
  });

  it('says NO to anything that is not one rehearsal: a migration, two files, an unknown flag', () => {
    expect(rehearsePlan(['20261015_01_a_salon_channel_follows_the_salon.sql']).refuse).toMatch(/is not a rehearsal/);
    expect(rehearsePlan(['a_rehearsal.sql', 'b_rehearsal.sql']).refuse).toMatch(/^usage/);
    expect(rehearsePlan(['a_rehearsal.sql', '--commit']).refuse).toMatch(/^usage/);
  });
});

describe('a read-only check on production', () => {
  const { plan: checkPlan } = require('../../../supabase/diagnostics/read-only.cjs') as {
    plan: (args: string[]) => { refuse?: string; psqlArgs?: string[]; pgoptions?: string };
  };

  it('runs one check file in a session that cannot write, under the time limits', () => {
    const p = checkPlan(['drift_login_preflight_check.sql']);
    expect(p.pgoptions).toBe('-c default_transaction_read_only=on -c lock_timeout=2s -c statement_timeout=30s');
    expect(p.psqlArgs?.slice(0, 6)).toEqual(['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1']);
    expect(p.psqlArgs?.[p.psqlArgs.length - 1]).toMatch(/[\\/]diagnostics[\\/]drift_login_preflight_check\.sql$/);
  });

  it('says NO to anything that is not one check: a rehearsal, a migration, two files', () => {
    expect(checkPlan(['train_0_rehearsal.sql']).refuse).toMatch(/is not a check/);
    expect(checkPlan(['20261015_01_a_salon_channel_follows_the_salon.sql']).refuse).toMatch(/is not a check/);
    expect(checkPlan(['a_check.sql', 'b_check.sql']).refuse).toMatch(/^usage/);
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
