#!/usr/bin/env node
/**
 * test-weights.cjs — what each test file takes, from the runs' own records, for the weighted split
 * (test-utils/weightedSequencer.js).
 *
 *   node scripts/test-weights.cjs --kind <captures|plain> --parts-dir <dir> --name <folder, {i} for the part>
 *        --shards <N> --runs <record>[,<record>...] [--out <file>] [--root <folder the parts ran jest in>]
 *
 * Each part of god_tier_ci.yml's split run keeps, in its own folder, the records `jest --json` wrote
 * (captures: the capture run's one record; the plain suite: one per time zone, named by a pattern). A file weighs the seconds it took
 * over every record that ran it (a zone's run is time the part spent on it too), to a tenth. Prints
 * each part's seconds as its records measured them, with the split the weights now make; warns when
 * the heaviest part took more than a fifth over the lightest, so a split gone out of balance is seen
 * before a part outgrows its job's limit. With --out, writes test-weights.json with this kind's table
 * replaced by the one measured and the other kind's kept (from test-utils/test-weights.json).
 * Exits 2 when called wrongly or a part kept no record.
 */
const { existsSync, readdirSync, readFileSync, writeFileSync } = require('fs');
const { join, relative, sep } = require('path');
const { split } = require('../test-utils/weightedSequencer');

const TABLE = join(__dirname, '..', 'test-utils', 'test-weights.json');
/** How far over the lightest part the heaviest may go before the split is called out of balance. */
const BALANCE = 1.2;

/** A test's path under `root`, with forward slashes: a Linux runner's record read on Windows too. */
const under = (root, name) => {
  const [r, n] = [root, String(name)].map((p) => p.split(sep).join('/').replace(/\/$/, ''));
  return n.startsWith(`${r}/`) ? n.slice(r.length + 1) : relative(root, String(name)).split(sep).join('/');
};

/** Each file's seconds in one jest --json record, by its path under `root`: [[path, seconds]]. */
const timesIn = (record, root) => (record.testResults ?? [])
  .filter((t) => typeof t.startTime === 'number' && typeof t.endTime === 'number')
  .map((t) => [under(root, t.name), (t.endTime - t.startTime) / 1000]);

/** Every file's seconds summed over the records, to a tenth, keyed and sorted by path. */
const weigh = (records, root) => {
  const sum = {};
  for (const r of records) for (const [file, s] of timesIn(r, root)) sum[file] = (sum[file] ?? 0) + s;
  return Object.fromEntries(Object.keys(sum).sort().map((f) => [f, Math.max(0.1, Math.round(sum[f] * 10) / 10)]));
};

/** The table file with one kind replaced, the other kept: its text. */
const withKind = (table, kind, weights) => `${JSON.stringify({
  about: 'Each test file\'s seconds, by its path under mobile/, as the runs measured them: captures when every screen is drawn (MOCKUPS_CAPTURE=1), plain otherwise. test-utils/weightedSequencer.js splits the suite by them; scripts/test-weights.cjs writes them.',
  captures: kind === 'captures' ? weights : table.captures ?? {},
  plain: kind === 'plain' ? weights : table.plain ?? {},
}, null, 1)}\n`;

/** The records in a part's folder a pattern names (`*` for any letters): jest-*.json, one per zone. */
const matching = (folder, pattern) => {
  if (!existsSync(folder)) return [];
  const re = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return readdirSync(folder).filter((f) => re.test(f)).sort().map((f) => join(folder, f));
};

/** Whether the heaviest of these loads is over the lightest by more than BALANCE allows. */
const outOfBalance = (loads) => Math.max(...loads) > BALANCE * Math.min(...loads);

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  const kind = flag('--kind');
  const dir = flag('--parts-dir');
  const name = flag('--name');
  const shards = Number(flag('--shards'));
  const runs = (flag('--runs') ?? '').split(',').filter(Boolean);
  if (!['captures', 'plain'].includes(kind) || !dir || !name?.includes('{i}') || !(shards >= 1) || !runs.length) {
    console.error('usage: node scripts/test-weights.cjs --kind <captures|plain> --parts-dir <dir> --name <folder with {i}> --shards <N> --runs <record>[,...] [--out <file>]');
    process.exit(2);
  }
  // Where the parts ran jest: this folder on CI's together-job; --root for records made elsewhere.
  const root = flag('--root') ?? process.cwd();
  const parts = [];
  for (let i = 1; i <= shards; i++) {
    const folder = join(dir, name.split('{i}').join(String(i)));
    const records = runs.flatMap((r) => (r.includes('*') ? matching(folder, r) : [join(folder, r)]));
    const missing = records.length ? records.filter((f) => !existsSync(f)) : [join(folder, runs.join(','))];
    if (missing.length) { console.error(`part ${i} kept no record: ${missing.join(', ')}`); process.exit(2); }
    parts.push(weigh(records.map((f) => JSON.parse(readFileSync(f, 'utf8'))), root));
  }
  const measured = parts.map((p) => Object.values(p).reduce((a, b) => a + b, 0));
  const weights = Object.assign({}, ...parts);
  const next = split(Object.entries(weights).map(([key, weight]) => ({ key, weight })), shards).map((p) => p.load);
  console.log('| part | seconds its records measured | seconds in the split these weights make |\n|---|---|---|');
  measured.forEach((s, i) => console.log(`| ${i + 1} | ${Math.round(s)} | ${Math.round(next[i])} |`));
  if (outOfBalance(measured)) {
    console.log(`::warning title=The ${kind} parts are out of balance::the heaviest part took ${Math.round(Math.max(...measured))} s of tests, the lightest ${Math.round(Math.min(...measured))} s: commit this run's test-weights.json as mobile/test-utils/test-weights.json`);
  }
  const out = flag('--out');
  if (out) {
    const table = existsSync(TABLE) ? JSON.parse(readFileSync(TABLE, 'utf8')) : {};
    writeFileSync(out, withKind(table, kind, weights));
    console.log(`${Object.keys(weights).length} files weighed (${kind}), written to ${out}`);
  }
}

module.exports = { BALANCE, outOfBalance, timesIn, weigh, withKind };
