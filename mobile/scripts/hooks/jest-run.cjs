#!/usr/bin/env node
/**
 * jest-run.cjs — one jest run over every test file the push names, with no command line to outgrow.
 *
 *   node scripts/hooks/jest-run.cjs --workers <n> --out <report> [--paths <file>] [--related <file>] [--leave <regex>]
 *
 * --paths names test files, one per line, from mobile/; --related names changed files, one per line,
 * whose related tests jest finds itself (`--listTests --findRelatedTests`, in batches that fit on one
 * Windows command line). Every file of both, once, minus any whose path --leave matches, runs in one
 * jest run (jest's API, so the list is handed over whole), its workers --workers, the worktrees and
 * Stryker's sandbox inside the checkout left out as the push leaves them. Writes jest's --json report
 * to --out and the list it ran beside it (<out>.files). Exits as jest does; 0 with nothing to run.
 */
const { execFileSync } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');
const { isAbsolute, join, relative, sep } = require('path');
const { ignored, inBatches } = require('./pre-push.cjs');

const MOBILE = join(__dirname, '..', '..');
const JEST = join(MOBILE, 'node_modules', 'jest', 'bin', 'jest.js');

/** A path as the push names a test: from mobile/, with forward slashes. */
const fromMobile = (p) => (isAbsolute(p) ? relative(MOBILE, p) : p).split(sep).join('/');
const lines = (file) => (file ? readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : []);

/** The tests jest relates to these changed files, by its own reading of the imports. */
const relatedTo = (changed) => inBatches(changed).flatMap((batch) => JSON.parse(execFileSync(process.execPath,
  [JEST, '--listTests', '--json', '--passWithNoTests', '--testPathIgnorePatterns', ...ignored(MOBILE), '--findRelatedTests', ...batch],
  { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1e8 }) || '[]'));

/** The run's files: every one named or related, once, sorted, minus those left out. */
const toRun = (named, related, leave) => [...new Set([...named, ...related].map(fromMobile))]
  .filter((p) => !(leave && leave.test(p))).sort();

async function main(argv) {
  const flag = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
  const workers = Number(flag('--workers'));
  const out = flag('--out');
  if (!(workers >= 1) || !out) { console.error('usage: jest-run.cjs --workers <n> --out <report> [--paths <file>] [--related <file>] [--leave <regex>]'); process.exit(2); }
  const changed = lines(flag('--related'));
  const files = toRun(lines(flag('--paths')), changed.length ? relatedTo(changed) : [], flag('--leave') ? new RegExp(flag('--leave')) : null);
  writeFileSync(`${out}.files`, `${files.join('\n')}\n`);
  if (!files.length) { console.log('no test file to run'); return 0; }
  console.log(`${files.length} test files, ${workers} workers`);
  const { runCLI } = require(join(MOBILE, 'node_modules', 'jest'));
  const { results } = await runCLI({
    _: files.map((f) => join(MOBILE, f)), $0: 'jest', runTestsByPath: true, maxWorkers: workers,
    testPathIgnorePatterns: ignored(MOBILE), json: true, outputFile: out,
  }, [MOBILE]);
  return results.success ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
}

module.exports = { fromMobile, toRun };
