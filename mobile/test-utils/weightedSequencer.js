/**
 * weightedSequencer.js — jest's --shard split by each test file's measured time, not by its count.
 *
 * god_tier_ci.yml runs the suite in parts, one machine each, under a 30-minute limit. Jest's own split
 * hashes each path and gives every part the same number of files, so the heavy ones fall where they
 * fall: one capture part ran 26 minutes while another ran 12 (God-Tier 44554976834).
 * Here each file weighs what test-utils/test-weights.json says it took (the `captures` table when
 * MOCKUPS_CAPTURE=1 draws every screen, the `plain` table otherwise; scripts/test-weights.cjs
 * writes both from the runs' own records), a file the table does not hold weighs its table's median,
 * and the files go heaviest first, each to the lightest part so far (ties to the lower part, then by
 * path). The split depends only on the files and the table, both committed, so every machine makes
 * the same one and scripts/jest-shards.cjs still finds every file in exactly one part. The order
 * inside a part is jest's own.
 */
const { readFileSync } = require('fs');
const { join, posix, sep } = require('path');
const Sequencer = require('@jest/test-sequencer').default;

const WEIGHTS = join(__dirname, 'test-weights.json');

/** The table for this run: captures when every screen is drawn, plain otherwise. */
const kindOf = (env) => (env.MOCKUPS_CAPTURE === '1' ? 'captures' : 'plain');

/** A table's median weight, or 1 when it holds none. */
const median = (table) => {
  const v = Object.values(table).filter((x) => typeof x === 'number' && x > 0).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 1;
};

/**
 * The parts: each a list of the items given, heaviest first to the lightest part so far.
 * `items` are { key, weight }; the result keeps each item whole, in the order it was placed.
 */
const split = (items, count) => {
  const parts = Array.from({ length: count }, () => ({ load: 0, items: [] }));
  const order = [...items].sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const item of order) {
    let at = 0;
    for (let i = 1; i < count; i++) if (parts[i].load < parts[at].load) at = i;
    parts[at].items.push(item);
    parts[at].load += item.weight;
  }
  return parts;
};

/** Each test's weight from its table, by its path under jest's root, as every machine names it. */
const weighed = (tests, table) => {
  const fallback = median(table);
  return tests.map((test) => {
    const key = posix.relative(test.context.config.rootDir.split(sep).join('/'), test.path.split(sep).join('/'));
    return { key, weight: typeof table[key] === 'number' && table[key] > 0 ? table[key] : fallback, test };
  });
};

const readTable = (kind) => {
  try { return JSON.parse(readFileSync(WEIGHTS, 'utf8'))[kind] ?? {}; } catch { return {}; }
};

class WeightedSequencer extends Sequencer {
  shard(tests, { shardIndex, shardCount }) {
    return split(weighed(tests, readTable(kindOf(process.env))), shardCount)[shardIndex - 1].items.map((i) => i.test);
  }
}

module.exports = WeightedSequencer;
module.exports.split = split;
module.exports.weighed = weighed;
module.exports.median = median;
module.exports.kindOf = kindOf;
