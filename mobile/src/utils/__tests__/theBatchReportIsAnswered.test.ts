/**
 * theBatchReportIsAnswered.test.ts — a class closed by a process stays closed only while the
 * process is kept (WORKLIST P0.58): every batch answers, for each, how it kept it.
 *
 * The report is made by scripts/batch-report.cjs from the register and lives with the journals in
 * the private folder, so on CI there is none to read; on this machine (and in the push gate) the
 * latest must have no empty answer.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const { batchesDir, report, unanswered } = require('../../../scripts/batch-report.cjs');

describe('the report', () => {
  const classes = [
    { id: 'PROC-reviewed-twice', title: 'A finding checked by a second reader', status: 'CLOSED', closed: { reason: 'agent process only' } },
    { id: 'CODE-fixed', title: 'A fixed defect', status: 'CLOSED', closed: { reason: 'cannot recur' } },
    { id: 'OPEN-still', title: 'Not yet', status: 'OPEN' },
  ];

  it('has a line for every class closed by a process, and only those, each awaiting its answer', () => {
    const text = report('b1', '2026-10-22', classes);
    expect(text).toContain('- PROC-reviewed-twice: A finding checked by a second reader\n  answered: ');
    expect(text).not.toContain('CODE-fixed');
    expect(text).not.toContain('OPEN-still');
    expect(unanswered(text)).toEqual(['PROC-reviewed-twice']);
  });

  it('counts an answer written as answered', () => {
    const text = report('b1', '2026-10-22', classes).replace('answered: ', 'answered: a second agent read every finding against the code');
    expect(unanswered(text)).toEqual([]);
  });

  it('says so when no class is closed that way', () => {
    expect(report('b1', '2026-10-22', [classes[1]])).toContain('(none is closed that way)');
  });
});

it('the latest batch report here leaves no answer empty', () => {
  const dir = batchesDir();
  const reports = existsSync(dir) ? readdirSync(dir).filter((f: string) => f.endsWith('.md')).sort() : [];
  const latest = reports[reports.length - 1];
  expect(latest ? unanswered(readFileSync(join(dir, latest), 'utf8')).map((id: string) => `${latest}: ${id}`) : []).toEqual([]);
});
