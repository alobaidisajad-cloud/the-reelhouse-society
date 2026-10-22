// The batch report, generated from the register (WORKLIST P0.58).
//
//   node mobile/scripts/batch-report.cjs <label>
//
// A class CLOSED as "agent process only" stays closed only while the process that closes it is
// kept: so each batch answers, for every such class, how this batch kept it. This writes
// <private>/batches/<date>-<label>.md with one line per such class (the committed register and its
// private half), each ending in an empty answer; theBatchReportIsAnswered.test.ts refuses the
// latest report while any answer is empty. It never overwrites a report.
const { existsSync, mkdirSync, writeFileSync } = require('fs');
const { execFileSync } = require('child_process');
const { join } = require('path');
const { readCommitted, readPrivate } = require('./register.cjs');

const MOBILE = join(__dirname, '..');
const ANSWER = 'answered:';

/** The private folder the journals live in, through the main checkout (worktrees share it). */
const batchesDir = () => {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: MOBILE, encoding: 'utf8' }).trim();
  return join(common, '..', 'mobile', 'audit', 'final', 'private', 'batches');
};

/** The report's text for these classes. */
const report = (label, date, classes) => {
  const kept = classes.filter((c) => c.status === 'CLOSED' && c.closed?.reason === 'agent process only');
  return [
    `# Batch ${label} (${date})`,
    '',
    'Every class CLOSED as "agent process only", and how this batch kept the process that closes it.',
    '',
    ...(kept.length ? kept.map((c) => `- ${c.id}: ${c.title ?? ''}\n  ${ANSWER} `) : ['(none is closed that way)']),
    '',
  ].join('\n');
};

/** The answers a report leaves empty, by class id. */
const unanswered = (text) => text.split('\n').flatMap((line, i, all) =>
  (line.trim() === ANSWER ? [(/^- ([A-Z][\w-]*):/.exec(all[i - 1] ?? '') ?? [])[1] ?? `line ${i + 1}`] : []));

if (require.main === module) {
  const label = process.argv[2];
  if (!label || !/^[\w.-]+$/.test(label)) { console.error('usage: node mobile/scripts/batch-report.cjs <label>'); process.exit(2); }
  const date = new Date().toISOString().slice(0, 10);
  const classes = [...(readCommitted() ?? []), ...(readPrivate() ?? [])];
  const dir = batchesDir();
  const file = join(dir, `${date}-${label}.md`);
  if (existsSync(file)) { console.error(`${file} exists: a report is never written over`); process.exit(2); }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, report(label, date, classes));
  console.log(`written: ${file}`);
}

module.exports = { ANSWER, batchesDir, report, unanswered };
