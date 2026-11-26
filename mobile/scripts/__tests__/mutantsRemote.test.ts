/**
 * mutantsRemote.test.ts — scripts/mutants-remote.cjs: a builder's mutants run on GitHub's runners are
 * recorded only as a run here records them: every part at the one commit, each id once, each verdict
 * with its record; the private half never sent.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

type R = { class: string; mutant: string; proof: string | null; commit: string; verdict: string };
type Part = { results: R[]; records: (R & { why: string })[] };
const remote = require('../mutants-remote.cjs') as {
  argumentsFault: (command: string | undefined, argv: string[]) => string | null;
  idsOf: (spec: string, mutants: { id: string; private?: boolean }[]) => { ids?: string; fault?: string };
  readParts: (parts: Part[]) => { results: R[]; commit: string | null; faults: string[] };
};
const mutants = require('../mutants.cjs') as { writeResults: (out: string, ran: R[], all: { id: string; private?: boolean }[], fresh?: boolean) => void };

const r = (mutant: string, commit = 'c1', verdict = 'caught'): R => ({ class: 'X-y', mutant, proof: 'm1', commit, verdict });
const part = (...rs: R[]): Part => ({ results: rs, records: rs.map((x) => ({ ...x, why: '' })) });

it('records a run\'s parts only when every verdict is at the one commit, each id once, each with its record', () => {
  expect(remote.readParts([part(r('shape-a')), part(r('shape-b'))])).toEqual({ results: [r('shape-a'), r('shape-b')], records: expect.any(Array), commit: 'c1', faults: [] });
  expect(remote.readParts([part(r('shape-a')), part(r('shape-b', 'c2'))]).faults).toEqual(['the parts ran at 2 commits: c1, c2']);
  expect(remote.readParts([part(r('shape-a')), part(r('shape-a'))]).faults).toEqual(['shape-a: in more than one part']);
  expect(remote.readParts([{ results: [r('shape-a')], records: [{ ...r('shape-a', 'c1', 'survived'), why: '' }] }]).faults).toEqual(['shape-a: no record of its verdict']);
});

it('writes the results as a run here writes them: each mutant once, in the registry\'s order, the others kept', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-'));
  try {
    const out = join(dir, 'mutant-results.json');
    const all = [{ id: 'shape-a' }, { id: 'shape-b' }, { id: 'shape-c' }, { id: 'shape-hidden', private: true }];
    writeFileSync(out, `${JSON.stringify([r('shape-a', 'old'), r('shape-c', 'old')], null, 2)}\n`);
    mutants.writeResults(out, [r('shape-b', 'c1'), r('shape-a', 'c1')], all);
    expect(readFileSync(out, 'utf8')).toBe(`${JSON.stringify([r('shape-a', 'c1'), r('shape-b', 'c1'), r('shape-c', 'old')], null, 2)}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('sends no private mutant, and no id the registry does not hold; refuses a mistyped option', () => {
  const all = [{ id: 'shape-a' }, { id: 'shape-hidden', private: true }];
  expect([remote.idsOf('shape-a', all), remote.idsOf('all', all)]).toEqual([{ ids: 'shape-a' }, { ids: 'all' }]);
  expect(remote.idsOf('shape-a,shape-hidden', all).fault).toBe('private mutants run on this machine, never on GitHub: 1 of the ids');
  expect(remote.idsOf('shape-x', all).fault).toBe('no such mutant: shape-x');
  expect([remote.argumentsFault('run', ['--ids', 'a']), remote.argumentsFault('record', ['--run', '1'])]).toEqual([null, null]);
  expect([remote.argumentsFault('run', ['--help']), remote.argumentsFault('run', ['--parts', '2']), remote.argumentsFault('start', [])])
    .toEqual([expect.stringMatching(/^unknown argument --help/), 'run wants --ids', 'unknown command start: run, status or record']);
});
