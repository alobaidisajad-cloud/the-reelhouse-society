#!/usr/bin/env node
/**
 * merge-coverage.cjs — a jest run split across machines, its coverage judged as one run.
 *
 *   node scripts/merge-coverage.cjs [--config <jest config>] <coverage/coverage-final.json>...
 *
 * CI runs the suite in parts (`--shard=i/N --coverage`), each with the floors
 * off: a part covers only some of the code, so each would fail them. Each part
 * keeps its coverage/coverage-final.json, and here they are handed to jest's own
 * CoverageReporter, the one a whole run uses, as a whole run hands it each
 * test file's coverage. It writes the reports the config names (among them
 * coverage/coverage-summary.json, which coverage-ratchet.js reads) and judges the
 * config's coverageThreshold with jest's own check, so a floor means here what
 * it means in a whole run: a directory key takes its files out of `global`.
 *
 * The jest is the one `npx jest` runs from this folder, its parts found
 * through its own dependencies; the config is read by its own reader. Jest
 * reads a floor's path from the folder it is run in, which in CI is the
 * config's own folder, so this runs there too.
 *
 * Exits 0 when every floor holds; 1 with jest's own words for each that does
 * not; 2 when it cannot judge: no file given, one missing or not coverage, or
 * a config whose coverage this cannot read the way jest did.
 */
const fs = require('fs');
const path = require('path');

const MOBILE = path.join(__dirname, '..');

/** A package's folder, found from `from` as Node would find it there. */
const home = (name, from) => path.dirname(require.resolve(`${name}/package.json`, { paths: [from] }));
const JEST = home('jest', MOBILE);
const CORE = home('@jest/core', JEST);
const { CoverageReporter } = require(home('@jest/reporters', CORE));
const { readConfig } = require(home('jest-config', CORE));

function refuse(why) {
  console.error(`✗ ${why}`);
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--config');
  const config = at === -1 ? null : path.resolve(args.splice(at, 2)[1] ?? '');
  if (!args.length) refuse('usage: node scripts/merge-coverage.cjs [--config <jest config>] <coverage-final.json>...');

  const parts = [];
  for (const file of args) {
    if (!fs.existsSync(file)) refuse(`${file} does not exist: that part kept no coverage`);
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = null; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) refuse(`${file} is not a coverage-final.json`);
    parts.push({ file, data });
  }

  const argv = { _: [], $0: 'jest', ...(config ? { config } : {}) };
  const { globalConfig } = await readConfig(argv, config ? path.dirname(config) : MOBILE);
  // The V8 provider hands the reporter another shape (and merges it another way).
  if (globalConfig.coverageProvider !== 'babel') refuse(`the config's coverageProvider is ${globalConfig.coverageProvider}; this reads babel's coverage only`);
  process.chdir(globalConfig.rootDir);

  const reporter = new CoverageReporter(globalConfig, {});
  for (const { file, data } of parts) {
    reporter.onTestResult({}, { coverage: data });
    console.log(`${file}: ${Object.keys(data).length} files`);
  }
  // No test contexts: every file collectCoverageFrom names is already in some
  // part's coverage, each part having added its untested files at zero.
  await reporter.onRunComplete(new Set(), {});
  const error = reporter.getLastError();
  if (error) {
    console.log(`\nThe coverage floors, on ${parts.length} parts together: NOT met`);
    process.exit(1);
  }
  console.log(`\nThe coverage floors, on ${parts.length} parts together: met`);
}

main().catch((e) => refuse(String(e && e.stack ? e.stack : e)));
