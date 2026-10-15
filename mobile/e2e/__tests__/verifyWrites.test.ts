/**
 * verifyWrites.test.ts — a flow's write is checked as exactly one row, except
 * where a shipped client's own crash ended an attempt (run-flows.sh's list);
 * and only the flows that ran are checked, one shard's when it listed them.
 *
 * verify-writes.mjs is loaded as node loads it; the database is not touched.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = pathToFileURL(join(__dirname, '..', 'db', 'verify-writes.mjs')).href;
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'verify-writes-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** What the script's own functions answer, for a list file and each mark. */
function ask(list: string | null) {
  const file = join(dir, 'own-crash-flows.txt');
  if (list !== null) writeFileSync(file, list);
  const code = `import { readOwnCrashFlows, rowsAccepted } from ${JSON.stringify(SCRIPT)};
    const marks = readOwnCrashFlows(${JSON.stringify(file)});
    console.log(JSON.stringify(['a_flow', 'b_flow', 'c_flow'].map((f) => rowsAccepted(marks.get(f)))));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  expect(r.stderr).toBe('');
  return JSON.parse(r.stdout);
}

it('wants exactly one row of every flow when no own crash ended any attempt', () => {
  expect(ask(null)).toEqual([[1], [1], [1]]);
  expect(ask('')).toEqual([[1], [1], [1]]);
});

it('takes one or two of a flow run again after one, and checks none of a flow not judged', () => {
  expect(ask('a_flow\tretried\nb_flow\tretried\nb_flow\tnot-judged\n')).toEqual([[1, 2], null, [1]]);
});

describe('the flows it checks', () => {
  /** What flowsRan answers for a flows folder and, when given, one shard's list. */
  function ran(list: string | null) {
    const flows = join(dir, 'flows');
    mkdirSync(flows, { recursive: true });
    for (const f of ['a_flow', 'b_flow', 'c_flow', 'config']) writeFileSync(join(flows, `${f}.yaml`), '');
    const runList = join(dir, 'flows-run.txt');
    if (list !== null) writeFileSync(runList, list);
    const code = `import { flowsRan } from ${JSON.stringify(SCRIPT)};
      console.log(JSON.stringify(flowsRan(${JSON.stringify(flows)}, ${JSON.stringify(runList)}).sort()));`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    return JSON.parse(r.stdout);
  }

  it('are every flow in the folder when no shard listed its own', () => {
    expect(ran(null)).toEqual(['a_flow.yaml', 'b_flow.yaml', 'c_flow.yaml']);
  });

  it('are only the shard\'s own when run-flows.sh listed them, none when it listed none', () => {
    expect(ran('c_flow\na_flow\n')).toEqual(['a_flow.yaml', 'c_flow.yaml']);
    expect(ran('')).toEqual([]);
  });
});
