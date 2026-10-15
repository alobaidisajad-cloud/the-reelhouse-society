/**
 * advisers.test.ts — Supabase's advisers held to their allowlist, shown saying
 * no to each way the list can fall behind the findings.
 *
 * advisers.mjs is run as db-integration.yml runs it, but on a saved answer of
 * the CLI's (--from), in the shape `supabase db advisors --output-format json`
 * prints it, so no database is needed. What it prints is held to names and
 * counts: the repository is public.
 */
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = join(__dirname, '..', 'db', 'advisers.mjs');
const REAL_LIST = join(__dirname, '..', 'db', 'advisers-allowlist.json');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'advisers-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

type Finding = { name: string; cacheKey: string };
const finding = (name: string, cacheKey: string): Finding => ({ name, cacheKey });
const PRODUCTION_ONLY = [{ lint: 'unused_index', reason: 'a copy has served no one' }];
const LIST = {
  productionOnly: PRODUCTION_ONLY,
  entries: [
    { id: 'ADV-001', lint: 'auth_rls_initplan', key: 'auth_rls_init_plan_public_lists_own', class: 'EXT-DB-03' },
    { id: 'ADV-002', lint: 'rls_enabled_no_policy', key: 'rls_enabled_no_policy_public_counter', reason: 'server only' },
  ],
};

function run(answer: unknown, list: unknown = LIST, ...extra: string[]) {
  const answerFile = join(dir, 'answer.json');
  const listFile = join(dir, 'list.json');
  writeFileSync(answerFile, typeof answer === 'string' ? answer : JSON.stringify(answer));
  writeFileSync(listFile, JSON.stringify(list));
  const r = spawnSync(process.execPath, [SCRIPT, '--from', answerFile, '--allowlist', listFile, ...extra], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr, problems: r.stdout.split('\n').filter((l) => l.startsWith('✗ ')) };
}
const BOTH = [finding('auth_rls_initplan', 'auth_rls_init_plan_public_lists_own'), finding('rls_enabled_no_policy', 'rls_enabled_no_policy_public_counter')];

it('passes when every finding is on the list, printing each lint with its counts', () => {
  const r = run({ results: [...BOTH, finding('unused_index', 'unused_index_public_t_i')], message: 'db advisors' });
  expect({ code: r.code, problems: r.problems }).toEqual({ code: 0, problems: [] });
  expect(r.out.trim().split('\n')).toEqual([
    'auth_rls_initplan: 1 found, 1 on the allowlist, 0 not',
    'rls_enabled_no_policy: 1 found, 1 on the allowlist, 0 not',
    'unused_index: 1 found, judged on production only',
  ]);
});

it('says no to a finding not on the list, by its lint and count, never its object', () => {
  const r = run({ results: [...BOTH, finding('rls_disabled_in_public', 'rls_disabled_in_public_public_secret_table')] });
  expect(r.code).toBe(1);
  expect(r.problems).toEqual(['✗ rls_disabled_in_public: 1 finding(s) not on the allowlist']);
  expect(r.out).toContain('rls_disabled_in_public: 1 found, 0 on the allowlist, 1 not');
  expect(r.out).not.toContain('secret_table');
});

it('names the refused finding only when a local run asks for details', () => {
  const r = run({ results: [...BOTH, finding('rls_disabled_in_public', 'rls_disabled_in_public_public_secret_table')] }, LIST, '--details');
  expect(r.code).toBe(1);
  expect(r.out).toContain('  not on the allowlist: rls_disabled_in_public rls_disabled_in_public_public_secret_table');
});

it('says no to an entry that no longer fires, by its id', () => {
  const r = run({ results: [BOTH[0]] });
  expect(r.code).toBe(1);
  expect(r.problems).toEqual(['✗ 1 allowlist entry no longer fires: ADV-002']);
});

it('says no to an empty answer when the list still excuses findings: nothing found is not a pass', () => {
  const r = run({ results: [] });
  expect(r.code).toBe(1);
  expect(r.out).toContain('(the advisers found nothing)');
  expect(r.problems).toEqual(['✗ 2 allowlist entries no longer fire: ADV-001, ADV-002']);
});

it('holds a finding by its key\'s sha256, so the list need not name the object', () => {
  const key = 'rls_disabled_in_public_public_held_table';
  const list = {
    productionOnly: PRODUCTION_ONLY,
    entries: [{ id: 'ADV-007', lint: 'rls_disabled_in_public', keySha256: createHash('sha256').update(key).digest('hex'), reason: 'held privately' }],
  };
  const r = run({ results: [finding('rls_disabled_in_public', key)] }, list);
  expect({ code: r.code, problems: r.problems }).toEqual({ code: 0, problems: [] });
  expect(JSON.stringify(list)).not.toContain('held_table');
});

it('counts a production-only lint but never excuses or refuses it here, and refuses an entry for one', () => {
  const r = run({ results: [...BOTH, finding('unused_index', 'unused_index_public_a'), finding('unused_index', 'unused_index_public_b')] });
  expect(r.out).toContain('unused_index: 2 found, judged on production only');
  const listed = run({ results: BOTH }, { ...LIST, entries: [...LIST.entries, { id: 'ADV-003', lint: 'unused_index', key: 'x', reason: 'y' }] });
  expect(listed.code).toBe(1);
  expect(listed.err).toContain('ADV-003: unused_index is judged on production only, so it has no entry here');
});

it('refuses a malformed list before judging anything', () => {
  const bad = {
    productionOnly: [{ lint: 'table_bloat' }],
    entries: [
      { id: 'ADV-1', lint: 'a', key: 'k1', reason: 'r' },
      { id: 'ADV-002', lint: 'b', key: 'k2', reason: 'r', class: 'PRF-19' },
      { id: 'ADV-003', lint: 'c', key: 'k3' },
      { id: 'ADV-004', lint: 'd', key: 'k4', class: 'not a class' },
      { id: 'ADV-005', lint: 'e', keySha256: 'a'.repeat(64), reason: 'a reason that says too much' },
      { id: 'ADV-006', lint: 'f', key: 'k6', keySha256: 'b'.repeat(64), reason: 'r' },
      { id: 'ADV-006', lint: 'g', key: 'k7', reason: 'r' },
      { id: 'ADV-008', lint: 'g', key: 'k7', reason: 'r' },
    ],
  };
  const r = run({ results: [] }, bad);
  expect(r.code).toBe(1);
  expect(r.err).toContain('a productionOnly lint needs its name and a reason');
  for (const said of [
    "ADV-1: an entry's id is ADV- and three digits",
    'ADV-002: gives a reason or a register class, one of the two',
    'ADV-003: gives a reason or a register class, one of the two',
    'ADV-004: "not a class" is not a register class id',
    'ADV-005: an entry held by its key\'s sha256 says only "held privately"',
    'ADV-006: names its object by a key or by a key\'s sha256, one of the two',
    'ADV-006: listed twice',
    'ADV-008: another entry already names this finding',
  ]) expect(r.err).toContain(said);
});

it('fails by name on an answer it cannot read, rather than passing on no findings', () => {
  for (const answer of ['Connecting to remote database...', { message: 'db advisors' }, { results: [{ title: 'no name' }] }]) {
    const r = run(answer);
    expect({ code: r.code, said: r.err.includes('holds no list of findings this script can read') }).toEqual({ code: 1, said: true });
  }
});

it('refuses to run without what it needs, or with a request it cannot follow', () => {
  expect(spawnSync(process.execPath, [SCRIPT, '--self-test', '--from', 'x.json'], { encoding: 'utf8' }).status).toBe(2);
  expect(spawnSync(process.execPath, [SCRIPT, 'stray'], { encoding: 'utf8' }).status).toBe(2);
  const elsewhere = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...process.env, E2E_DB_HOST: 'db.example.com' } });
  expect({ code: elsewhere.status, said: elsewhere.stderr.includes('only against a local database') }).toEqual({ code: 2, said: true });
});

it('the committed list is well formed, and excuses exactly the findings it names', () => {
  const list = JSON.parse(readFileSync(REAL_LIST, 'utf8')) as { entries: { lint: string; key?: string }[] };
  expect(list.entries.length).toBeGreaterThan(0);
  const answer = { results: list.entries.filter((e) => e.key).map((e) => finding(e.lint, e.key!)) };
  const r = run(answer, list);
  expect({ code: r.code, problems: r.problems }).toEqual({ code: 0, problems: [] });
});

it('reads the API schemas from the [api] section of a config.toml, and from the real one', () => {
  const ask = (toml: string) => {
    const code = `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); console.log(JSON.stringify(m.apiSchemas(${JSON.stringify(toml)})));`;
    return JSON.parse(spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }).stdout);
  };
  expect(ask('[db]\nschemas = ["no"]\n[api]\nenabled = true\nschemas = ["public", "graphql_public"]\n[api.tls]\n')).toEqual(['public', 'graphql_public']);
  expect(ask('[db]\nschemas = ["no"]\n[api]\nenabled = true\n')).toBeNull();
  expect(ask(readFileSync(join(__dirname, '..', 'supabase', 'config.toml'), 'utf8'))).toEqual(expect.arrayContaining(['public']));
});
