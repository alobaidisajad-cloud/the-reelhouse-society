#!/usr/bin/env node
/**
 * jest-run.cjs — one jest run over every test file the push names, with no command line to outgrow.
 *
 *   node scripts/hooks/jest-run.cjs --workers <n> --out <report> [--paths <file>] [--related <file>] [--leave <regex>] [--titles <file>]
 *
 * --paths names test files, one per line, from mobile/; --related names changed files, one per line,
 * whose related tests jest finds itself (`--listTests --findRelatedTests`, in batches that fit on one
 * Windows command line). Every file of both, once, minus any whose path --leave matches, runs in one
 * jest run (jest's API, so the list is handed over whole), its workers --workers, the worktrees and
 * Stryker's sandbox inside the checkout left out as the push leaves them. --titles runs only the tests
 * whose name is one of those titles, or ends in one after its describe's (a mutant's proof is named by
 * its title). Writes jest's --json report to --out and the list it ran beside it (<out>.files). Exits
 * as jest does; 0 with nothing to run. The run has NODE_ENV as jest's own command gives it (asJestsBin).
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

/**
 * The environment jest's own command gives a run: NODE_ENV 'test' when nothing set it (the jest
 * command jest-cli ships). runCLI is not that command and sets nothing, and its workers take this process's
 * environment. Without it React Native takes its device paths: its Animated throws "Unable to locate
 * attached view" for a view the test renderer never attaches, where under 'test' it carries on.
 */
const asJestsBin = (env) => {
  if (env.NODE_ENV == null) env.NODE_ENV = 'test';
  return env;
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** jest's -t for every test whose full name is one of these titles, or ends in one after its describe's. */
const titlesPattern = (titles) => `(?:^| )(?:${titles.map(escapeRe).join('|')})$`;

async function main(argv) {
  const flag = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
  const workers = Number(flag('--workers'));
  const out = flag('--out');
  if (!(workers >= 1) || !out) { console.error('usage: jest-run.cjs --workers <n> --out <report> [--paths <file>] [--related <file>] [--leave <regex>] [--titles <file>]'); process.exit(2); }
  const changed = lines(flag('--related'));
  const files = toRun(lines(flag('--paths')), changed.length ? relatedTo(changed) : [], flag('--leave') ? new RegExp(flag('--leave')) : null);
  writeFileSync(`${out}.files`, `${files.join('\n')}\n`);
  const titles = lines(flag('--titles'));
  if (!files.length || (flag('--titles') && !titles.length)) { console.log('no test to run'); return 0; }
  console.log(`${files.length} test files, ${workers} workers${titles.length ? `, ${titles.length} tests by title` : ''}`);
  process.chdir(MOBILE);
  asJestsBin(process.env);
  const { runCLI } = require(join(MOBILE, 'node_modules', 'jest'));
  const { results } = await runCLI({
    // From mobile/, with forward slashes: jest also reads the list as a pattern, which a Windows path's
    // backslashes make invalid.
    _: files, $0: 'jest', runTestsByPath: true, maxWorkers: workers,
    testPathIgnorePatterns: ignored(MOBILE), json: true, outputFile: out, ...(titles.length ? { testNamePattern: titlesPattern(titles) } : {}),
  }, [MOBILE]);
  return results.success ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
}

module.exports = { asJestsBin, fromMobile, titlesPattern, toRun };
