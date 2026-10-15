/**
 * The production rehearsals run in CI, and each can only pass by holding.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every supabase/diagnostics/*_rehearsal.sql is run by a person on production
 * and by e2e/db/rehearsals.mjs on the sealed copy (db-integration.yml). Held
 * here, for every rehearsal there is:
 *   - it opens with ON_ERROR_STOP, BEGIN and the shared kit, and ends with the
 *     kit's verdict and ROLLBACK: a miss raises, so psql exits non-zero;
 *   - no other transaction control (a nested COMMIT or ROLLBACK would end the
 *     file's own transaction early, and write on production);
 *   - no id of a real member: an id written in a file has the made-up shape
 *     -0000-4000-8000-, which no generated id has (odds of 1 in 2^42);
 *   - every case is recorded through the kit, never printed alone;
 *   - no migration applied that production already holds (it would run old
 *     code over the new).
 * The rules are checked on planted text first, so each is seen to say no.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { pathToFileURL } from 'url';
import { files as universe } from '@/test-utils/universe';

const { parse } = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');
const { statements } = require('../../../scripts/add-only.cjs') as {
  statements: (sql: string) => { text: string; masked: string }[];
};

const MOBILE = join(__dirname, '..', '..', '..');
const DIAGNOSTICS = join(MOBILE, 'supabase', 'diagnostics');
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const MADE_UP = /^[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$/i;
const OPENING = ['\\set ON_ERROR_STOP 1', 'BEGIN;', '\\ir rehearsal_kit.sql'];
const ENDING = ['SELECT pg_temp.rh_verdict();', 'ROLLBACK;'];
const CONTROL = /^(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|START TRANSACTION|END|ABORT|PREPARE TRANSACTION)\b/;
const RECOVERY = /^(?:SAVEPOINT|RELEASE|ROLLBACK TO)\b/;

/** The SQL lines that are not comments or blank. */
const codeLines = (sql: string) => sql.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('--'));

/** The file's statements, psql's own commands taken out (a trailing \gset ends its statement). */
const sqlStatements = (sql: string) => statements(sql.split('\n')
  .filter((l) => !l.trim().startsWith('\\'))
  .map((l) => l.replace(/\s\\gset\b.*$/, ';'))
  .join('\n'));

/** What is wrong with one rehearsal's text ([] when nothing). */
const faultsOf = (sql: string, applied: Set<string>) => {
  const faults: string[] = [];
  const lines = codeLines(sql);
  if (OPENING.some((l, i) => lines[i] !== l)) faults.push(`does not open with: ${OPENING.join(' / ')}`);
  if (ENDING.some((l, i) => lines[lines.length - ENDING.length + i] !== l)) faults.push(`does not end with the verdict: ${ENDING.join(' / ')}`);
  const control = sqlStatements(sql).map((s) => s.masked).filter((m) => CONTROL.test(m) && !RECOVERY.test(m));
  if (control.length !== 2 || control[0] !== 'BEGIN' || control[1] !== 'ROLLBACK') {
    faults.push(`transaction control besides its own BEGIN and ROLLBACK: ${control.join(', ')}`);
  }
  for (const id of sql.match(UUID) ?? []) if (!MADE_UP.test(id)) faults.push(`an id that is not made up: ${id}`);
  if (/RAISE NOTICE '%\s*\|\s*%\s*\|\s*%/.test(sql) || /'%s\|%s\|%s'/.test(sql)) faults.push('a case printed, not recorded through pg_temp.rh_case');
  for (const m of sql.matchAll(/^\\i[r]?\s+\S*migrations\/(\S+\.sql)/gm)) {
    if (applied.has(m[1])) faults.push(`applies ${m[1]}, which production already holds`);
  }
  return faults;
};

const applied = new Set(read(join(MOBILE, 'supabase', 'APPLIED.txt')).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
const rehearsals = universe('rehearsals').map((f) => relative(DIAGNOSTICS, f).split(sep).join('/'));
const GOOD = `-- a rehearsal\n${OPENING.join('\n')}\n\nSELECT pg_temp.rh_case('one', '1', '1');\nSAVEPOINT c;\nROLLBACK TO SAVEPOINT c;\n\n${ENDING.join('\n')}\n`;

describe('the rules say no', () => {
  it('pass a rehearsal that keeps them', () => {
    expect(faultsOf(GOOD, applied)).toEqual([]);
  });

  it.each([
    ['an id of the shape a real member has', GOOD.replace("'1', '1'", "'1', '3f2a9c1e-7b4d-4e2a-9f1c-5d8e7a6b4c3d'"),
      'an id that is not made up: 3f2a9c1e-7b4d-4e2a-9f1c-5d8e7a6b4c3d'],
    ['no verdict', GOOD.replace('SELECT pg_temp.rh_verdict();\n', ''), `does not end with the verdict: ${ENDING.join(' / ')}`],
    ['a verdict that is not last', GOOD.replace('ROLLBACK;\n', 'ROLLBACK;\nSELECT 1;\n'), `does not end with the verdict: ${ENDING.join(' / ')}`],
    ['no kit', GOOD.replace('\\ir rehearsal_kit.sql\n', ''), `does not open with: ${OPENING.join(' / ')}`],
    ['no ON_ERROR_STOP', GOOD.replace('\\set ON_ERROR_STOP 1\n', ''), `does not open with: ${OPENING.join(' / ')}`],
    ['a COMMIT inside', GOOD.replace('SAVEPOINT c;', 'COMMIT;\nSAVEPOINT c;'), 'transaction control besides its own BEGIN and ROLLBACK: BEGIN, COMMIT, ROLLBACK'],
    ['a case printed alone', GOOD.replace("SELECT pg_temp.rh_case('one', '1', '1');", () => "DO $$ BEGIN RAISE NOTICE '%|%|%', 'one', '1', '1'; END $$;"),
      'a case printed, not recorded through pg_temp.rh_case'],
    ['a migration production holds', GOOD.replace('SAVEPOINT c;', `\\ir ../../../supabase/migrations/${[...applied].pop()}\nSAVEPOINT c;`),
      `applies ${[...applied].pop()}, which production already holds`],
  ])('says NO to %s', (_name, sql, fault) => {
    expect(faultsOf(sql, applied)).toContain(fault);
  });

  it('reads a DO block\'s BEGIN and END as its own, not as transaction control', () => {
    // A function, so replace() reads no $$ in it as its own pattern.
    expect(faultsOf(GOOD.replace('SAVEPOINT c;', () => 'DO $$ BEGIN PERFORM 1; END $$;\nSAVEPOINT c;'), applied)).toEqual([]);
  });
});

describe('every rehearsal', () => {
  it('is found: the folder holds the rehearsals, not an empty list', () => {
    expect(rehearsals.length).toBeGreaterThanOrEqual(22);
  });

  it.each(rehearsals)('%s keeps the rules', (file) => {
    expect(faultsOf(read(join(DIAGNOSTICS, file)), applied)).toEqual([]);
  });

  it('includes only files that hold no transaction control of their own', () => {
    const included = new Set(rehearsals.flatMap((f) => [...read(join(DIAGNOSTICS, f)).matchAll(/^\\ir\s+(\S+)/gm)].map((m) => join(DIAGNOSTICS, m[1]))));
    expect(included.size).toBeGreaterThanOrEqual(2);
    for (const p of included) {
      expect({ file: p, control: sqlStatements(read(p)).map((s) => s.masked).filter((m) => CONTROL.test(m)) }).toEqual({ file: p, control: [] });
    }
  });
});

describe('the kit', () => {
  const kit = read(join(DIAGNOSTICS, 'rehearsal_kit.sql'));
  it('raises on a miss and when no case ran, and stops a pick that finds nothing', () => {
    expect(kit).toMatch(/IF cases = 0 THEN RAISE EXCEPTION 'REHEARSAL FAILED: no case ran'/);
    expect(kit).toMatch(/IF misses > 0 THEN\s+RAISE EXCEPTION 'REHEARSAL FAILED:/);
    expect(kit).toMatch(/IF value IS NULL THEN RAISE EXCEPTION 'REHEARSAL CANNOT RUN/);
    expect(kit).toMatch(/IF coalesce\(have, 0\) < need THEN\s+RAISE EXCEPTION 'REHEARSAL CANNOT RUN/);
  });
});

describe('the seed', () => {
  const seed = read(join(MOBILE, 'e2e', 'db', 'rehearsal-seed.sql'));
  it('invents every member: made-up ids, and addresses no one can own', () => {
    expect((seed.match(UUID) ?? []).filter((id) => !MADE_UP.test(id) && id !== '00000000-0000-0000-0000-000000000000')).toEqual([]);
    expect([...seed.matchAll(/'[\w.]*@([\w.]+)'/g)].map((m) => m[1]).filter((d) => d !== 'rehearsal.test')).toEqual([]);
  });
});

describe('CI', () => {
  type Step = { name?: string; run?: string };
  const wf = parse(read(join(MOBILE, '..', '.github', 'workflows', 'db-integration.yml'))) as { jobs: Record<string, { steps: Step[] }> };
  const steps = Object.values(wf.jobs).flatMap((j) => j.steps);
  const at = (pattern: RegExp) => steps.findIndex((s) => pattern.test(s.run ?? ''));

  it('proves the verdict can fail, then runs every rehearsal after the pending migrations and before the row rules', () => {
    const selfTest = at(/^node mobile\/e2e\/db\/rehearsals\.mjs --self-test\s*$/);
    const run = at(/^node mobile\/e2e\/db\/rehearsals\.mjs\s*$/);
    expect(at(/^node mobile\/e2e\/db\/up-down-up\.mjs\s*$/)).toBeGreaterThan(-1);
    expect(selfTest).toBeGreaterThan(at(/^node mobile\/e2e\/db\/up-down-up\.mjs\s*$/));
    expect(selfTest).toBeGreaterThan(at(/^node mobile\/e2e\/db\/old-clients\.mjs\s*$/));
    expect(run).toBeGreaterThan(selfTest);
    expect(at(/-f mobile\/e2e\/db\/security\.sql/)).toBeGreaterThan(run);
  });

  it('runs the rehearsals the shared file list names, so a new one runs without being named', () => {
    const runner = read(join(MOBILE, 'e2e', 'db', 'rehearsals.mjs'));
    const url = pathToFileURL(join(MOBILE, 'e2e', 'db', 'rehearsals.mjs')).href;
    // The runner's own list, as node loads it: imported, it runs nothing.
    const r = spawnSync(process.execPath, ['--input-type=module', '-e',
      `const m = await import(${JSON.stringify(url)}); console.log(JSON.stringify(m.rehearsals()));`],
    { encoding: 'utf8', env: { ...process.env, E2E_DB_HOST: '127.0.0.1' } });
    expect(JSON.parse(r.stdout.trim().split('\n').pop() ?? '[]')).toEqual(rehearsals);
    expect(rehearsals.filter((f) => runner.includes(f))).toEqual([]);
  });
});
