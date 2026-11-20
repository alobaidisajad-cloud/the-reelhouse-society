#!/usr/bin/env node
/**
 * mutant-lanes.cjs — the mutants a push stands on, run side by side, each lane a checkout of its own.
 *
 *   node scripts/hooks/mutant-lanes.cjs --changed <base> --lanes <n> [--green <report>[,<report>]]
 *
 * A mutant writes its mistake into the files it names, so two can never share a checkout, and none
 * can share the one the push's jest run reads. Each lane is a git worktree of this repository at the
 * pushed commit, kept between pushes under the system's temp folder (made once, then moved to the
 * commit by `git checkout --detach --force`), its mobile/node_modules a junction to this checkout's.
 * Nothing here removes a lane: `git worktree remove --force` follows such a junction and deletes the
 * real node_modules (unlink the junction first, by hand). The mutants mutants.cjs --changed picks are dealt to
 * the lanes heaviest first by their last measured seconds, each lane runs mutants.cjs --ids on its
 * own share with the same --green reports, and every verdict is printed under its lane. Exits 1 when
 * any lane does, as mutants.cjs does for a mutant not caught.
 */
const { execFileSync, spawn } = require('child_process');
const { createHash } = require('crypto');
const { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join, relative } = require('path');
const { readMutants, touchedSince } = require('../mutants.cjs');

const ROOT = join(__dirname, '..', '..', '..');
const MOBILE = join(ROOT, 'mobile');
/** This checkout's lanes: one folder per checkout, so two checkouts never share a lane. */
const LANES = join(tmpdir(), 'rh-mutant-lanes', createHash('sha256').update(ROOT.toLowerCase()).digest('hex').slice(0, 10));
const TIMES = join(LANES, 'seconds.json');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'pipe'] });

/** Lane i at the commit, made if it is not there, its node_modules this checkout's: its folder. */
const laneAt = (i, commit) => {
  const dir = join(LANES, String(i));
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(LANES, { recursive: true });
    git(ROOT, 'worktree', 'add', '--detach', '--force', dir, commit);
  } else {
    git(dir, 'checkout', '--detach', '--force', commit);
  }
  const modules = join(dir, 'mobile', 'node_modules');
  if (!existsSync(modules)) symlinkSync(join(MOBILE, 'node_modules'), modules, 'junction');
  return dir;
};

/** The mutants dealt to n lanes, heaviest first, each to the lane with the fewest seconds so far. */
const deal = (ids, n, seconds) => {
  const lanes = Array.from({ length: n }, () => ({ load: 0, ids: [] }));
  const weigh = (id) => seconds[id] ?? 20;
  for (const id of [...ids].sort((a, b) => weigh(b) - weigh(a) || (a < b ? -1 : 1))) {
    const lane = lanes.reduce((best, l) => (l.load < best.load ? l : best));
    lane.ids.push(id);
    lane.load += weigh(id);
  }
  return lanes.filter((l) => l.ids.length);
};

/** Each verdict line mutants.cjs prints, as [id, seconds]: `caught      shape-x  CLASS  12s`. */
const timesIn = (out) => [...out.matchAll(/^\S+\s+(\S+)\s+\S*\s+(\d+)s\b/gm)].filter((m) => !m[1].startsWith('(')).map((m) => [m[1], Number(m[2])]);

async function main(argv) {
  const flag = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
  const base = flag('--changed');
  const n = Number(flag('--lanes'));
  if (!base || !(n >= 1)) { console.error('usage: mutant-lanes.cjs --changed <base> --lanes <n> [--green <report>[,<report>]]'); process.exit(2); }
  const chosen = touchedSince(base, readMutants());
  console.log(`${chosen.length} mutants stand on what changed since ${base.slice(0, 8)}`);
  if (!chosen.length) return 0;
  const commit = git(ROOT, 'rev-parse', 'HEAD').trim();
  const seconds = existsSync(TIMES) ? JSON.parse(readFileSync(TIMES, 'utf8')) : {};
  const lanes = deal(chosen.map((m) => m.id), Math.min(n, chosen.length), seconds);
  const dirs = lanes.map((_, i) => laneAt(i + 1, commit));
  const green = flag('--green');
  const runs = lanes.map((lane, i) => new Promise((done) => {
    const args = [join(dirs[i], 'mobile', 'scripts', 'mutants.cjs'), '--ids', lane.ids.join(','), ...(green ? ['--green', green] : [])];
    const child = spawn(process.execPath, args, { cwd: join(dirs[i], 'mobile'), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      console.log(`── lane ${i + 1} (${relative(ROOT, dirs[i]) || dirs[i]}), ${lane.ids.length} mutants, exit ${code}\n${out.trimEnd()}`);
      done({ code, out });
    });
  }));
  const ended = await Promise.all(runs);
  for (const { out } of ended) for (const [id, s] of timesIn(out)) seconds[id] = s;
  writeFileSync(TIMES, `${JSON.stringify(seconds)}\n`);
  const failed = ended.filter((e) => e.code !== 0).length;
  console.log(`${lanes.length} lanes, ${failed ? `${failed} with a mutant not caught or not run` : 'every mutant caught'}`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(1); });
}

module.exports = { deal, LANES, timesIn };
