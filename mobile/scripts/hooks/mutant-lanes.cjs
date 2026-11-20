#!/usr/bin/env node
/**
 * mutant-lanes.cjs — the mutants a push stands on, run side by side, each lane a checkout of its own.
 *
 *   node scripts/hooks/mutant-lanes.cjs --changed <base> --lanes <n> [--rehearsals only|none] [--green <report>[,<report>]] [--types-from <file>]
 *   node scripts/hooks/mutant-lanes.cjs --changed <base> --lanes <n> --types-out <file>
 *
 * --rehearsals only takes the mutants a flow runner's rehearsal proves (in lanes named r1, r2...), none
 * every other: the push runs the first in one lane once its rehearsals have ended, so no two whole
 * rehearsals run at once, and the rest beside them.
 *
 * A mutant writes its mistake into the files it names, so two can never share a checkout, and none
 * can share the one the push's jest run reads. Each lane is a git worktree of this repository at the
 * pushed commit, kept between pushes under the system's temp folder (made once, then moved to the
 * commit by `git checkout --detach --force`), and holds every node_modules this checkout holds (the
 * app's, and the root's with Playwright's browser in it), each a junction to this checkout's: a lane
 * without one is refused before any mutant runs, never left to skip a proof. Nothing here removes a
 * lane: `git worktree remove --force` follows such a junction and deletes the real node_modules
 * (unlink the junction first, by hand).
 *
 * The mutants mutants.cjs --changed picks are dealt to the lanes heaviest first by their last measured
 * seconds. Before any lane writes a mutant, the proofs no --green report already holds passing run once,
 * together, in lane 1 as committed (jest-run.cjs --titles), and that report is handed to every lane as
 * one more --green: a mutant's first run is a run of its very test on the very commit. Each lane then
 * runs mutants.cjs --ids on its own share, and every verdict is printed under its lane. Exits 1 when any
 * lane does, as mutants.cjs does for a mutant not caught.
 *
 * --types-out runs the warm checker (mutants.cjs --types-out) in lane 0, a lane no mutant is written
 * into, over the same mutants in the order the lanes reach them; the lanes read it by --types-from.
 * The checker's first line is this process's pid, so a lane waits only while it lives. The commit's
 * own type errors are this run's verdict: it fails on any, and when the checker never read them.
 */
const { execFileSync, spawn } = require('child_process');
const { createHash } = require('crypto');
const { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join, relative } = require('path');
const { readMutants, touchedSince, withLock } = require('../mutants.cjs');

const ROOT = join(__dirname, '..', '..', '..');
/** This checkout's lanes: one folder per checkout, so two checkouts never share a lane. */
const LANES = join(tmpdir(), 'rh-mutant-lanes', createHash('sha256').update(ROOT.toLowerCase()).digest('hex').slice(0, 10));
const TIMES = join(LANES, 'seconds.json');
/** Every folder of this repository that holds a package.json, whose node_modules a lane must hold too. */
const PACKAGES = ['', 'mobile'];

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'pipe'] });

/** The node_modules folders a lane needs: each package's that this checkout holds, as [folder from the root]. */
const modulesOf = (root = ROOT) => PACKAGES.map((p) => join(p, 'node_modules')).filter((m) => existsSync(join(root, m)));

/** What a lane lacks of the node_modules this checkout holds: [] when it holds every one. */
const missingIn = (dir, root = ROOT) => modulesOf(root).filter((m) => !existsSync(join(dir, m)));

/** Lane i at the commit, made if it is not there, holding this checkout's node_modules: its folder. */
const laneAt = (i, commit) => withLock(join(tmpdir(), 'rh-mutant-lanes.lock'), () => {
  const dir = join(LANES, String(i));
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(LANES, { recursive: true });
    git(ROOT, 'worktree', 'add', '--detach', '--force', dir, commit);
  } else {
    git(dir, 'checkout', '--detach', '--force', commit);
  }
  for (const m of modulesOf()) if (!existsSync(join(dir, m))) symlinkSync(join(ROOT, m), join(dir, m), 'junction');
  const lacks = missingIn(dir);
  if (lacks.length) throw new Error(`lane ${i} lacks ${lacks.join(', ')}: its proofs would skip`);
  return dir;
}, 300_000);

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

/** The lanes' ids in the order they reach them: each lane's first, then each one's second, and on. */
const reachOrder = (lanes) => {
  const order = [];
  for (let k = 0; lanes.some((l) => k < l.ids.length); k++) for (const l of lanes) if (k < l.ids.length) order.push(l.ids[k]);
  return order;
};

/** Each verdict line mutants.cjs prints, as [id, seconds]: `caught      shape-x  CLASS  12s`. */
const timesIn = (out) => [...out.matchAll(/^\S+\s+(\S+)\s+\S*\s+(\d+)s\b/gm)].filter((m) => !m[1].startsWith('(')).map((m) => [m[1], Number(m[2])]);

/**
 * The proofs these reports do not already hold passing: { files, titles } for one run of them all. A
 * rehearsal's is left to its own mutant, which runs it at normal priority as the rehearsals run.
 */
const unproven = (mutants, reports, greenIn, rehearsal) => {
  const left = mutants.filter((m) => m.proof && !rehearsal.test(m.proof.file) && !greenIn(reports, m.proof));
  return { files: [...new Set(left.map((m) => m.proof.file))].sort(), titles: [...new Set(left.map((m) => m.proof.test))].sort() };
};

/** A child node process: its exit code and everything it said, once it ends. */
const run = (args, cwd) => new Promise((done) => {
  const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('error', (e) => { out += `could not start: ${e.message}\n`; });
  child.on('close', (code) => done({ code, out }));
});

async function main(argv) {
  const flag = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
  const base = flag('--changed');
  const n = Number(flag('--lanes'));
  if (!base || !(n >= 1)) { console.error('usage: mutant-lanes.cjs --changed <base> --lanes <n> [--rehearsals only|none] [--green <report>[,<report>]] [--types-from <file> | --types-out <file>]'); process.exit(2); }
  const typesOut = flag('--types-out');
  // The first line a lane reads: whose life it waits on.
  if (typesOut) writeFileSync(typesOut, `${JSON.stringify({ pid: process.pid })}\n`);
  const all = readMutants();
  const { REHEARSAL } = require('../mutants.cjs');
  const which = flag('--rehearsals');
  if (which && !['only', 'none'].includes(which)) { console.error('--rehearsals takes only or none'); process.exit(2); }
  // --rehearsals only: the mutants a rehearsal proves, in lanes of their own (r1, r2...); none: every other.
  const chosen = touchedSince(base, all).filter((m) => !which || (which === 'only') === REHEARSAL.test(m.proof?.file ?? ''));
  const laneName = (i) => (which === 'only' ? `r${i}` : String(i));
  console.log(`${chosen.length} mutants${which === 'only' ? ' a rehearsal proves' : which === 'none' ? ' no rehearsal proves' : ''} stand on what changed since ${base.slice(0, 8)}`);
  // The warm checker runs even for none: the commit's types are its verdict too.
  if (!chosen.length && !typesOut) return 0;
  const commit = git(ROOT, 'rev-parse', 'HEAD').trim();
  const seconds = existsSync(TIMES) ? JSON.parse(readFileSync(TIMES, 'utf8')) : {};
  const lanes = deal(chosen.map((m) => m.id), Math.min(n, chosen.length), seconds);

  if (typesOut) {
    const dir = laneAt(0, commit);
    const ids = join(LANES, 'types.ids');
    writeFileSync(ids, `${reachOrder(lanes).join('\n')}\n`);
    const t0 = Date.now();
    const { code, out } = await run(['--max-old-space-size=3584', join(dir, 'mobile', 'scripts', 'mutants.cjs'), '--ids', `@${ids}`, '--types-out', typesOut], join(dir, 'mobile'));
    console.log(out.trimEnd());
    const lines = readFileSync(typesOut, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
    const said = lines.filter((l) => l.id).length;
    const atCommit = lines.find((l) => Array.isArray(l.atCommit))?.atCommit;
    writeFileSync(typesOut, `${JSON.stringify({ done: true })}\n`, { flag: 'a' });
    // The commit's types are this check's own verdict: never passed unread.
    if (!atCommit) { console.log(`the warm checker never read the commit's types (exit ${code}): the types were not checked`); return 1; }
    if (atCommit.length) { console.log(`the commit's types: ${atCommit.length} errors\n${atCommit.join('\n')}`); return 1; }
    // A checker that ended early answers no more; the lanes ask tsc for the rest, so no check is lost.
    if (code !== 0) console.log(`the commit's types: no error; the warm checker ended early (exit ${code}) after ${said} answers, and the lanes ask tsc for the rest`);
    else console.log(`the commit's types: no error; the warm checker answered ${said} type checks in ${Math.round((Date.now() - t0) / 1000)} s`);
    return 0;
  }

  const dirs = lanes.map((_, i) => laneAt(laneName(i + 1), commit));
  const { greenIn } = require('../mutants.cjs');
  // A report a check never wrote (it ended early) holds nothing green.
  const greenFiles = (flag('--green') ?? '').split(',').filter((f) => f && existsSync(f));
  const reports = greenFiles.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const left = unproven(chosen, reports, greenIn, REHEARSAL);
  if (left.files.length) {
    // The proofs not yet seen green, once, together, on the commit as it stands, before any mutant is written.
    const out = join(LANES, `proofs-${laneName(1)}.json`);
    const lists = { paths: join(LANES, `proofs-${laneName(1)}.paths`), titles: join(LANES, `proofs-${laneName(1)}.titles`) };
    writeFileSync(lists.paths, `${left.files.join('\n')}\n`);
    writeFileSync(lists.titles, `${left.titles.join('\n')}\n`);
    const t0 = Date.now();
    const r = await run([join(dirs[0], 'mobile', 'scripts', 'hooks', 'jest-run.cjs'), '--workers', String(lanes.length), '--out', out, '--paths', lists.paths, '--titles', lists.titles], join(dirs[0], 'mobile'));
    console.log(`── the ${left.titles.length} proofs not yet seen green, in ${left.files.length} files, run once together: exit ${r.code}, ${Math.round((Date.now() - t0) / 1000)} s\n${r.out.split('\n').filter((l) => /^(PASS|FAIL|Tests:|Test Suites:)/.test(l.trim())).slice(-6).join('\n')}`);
    if (existsSync(out)) greenFiles.push(out);
  }
  const typesFrom = flag('--types-from');
  const runs = lanes.map((lane, i) => {
    const ids = join(LANES, `lane-${laneName(i + 1)}.ids`);
    writeFileSync(ids, `${lane.ids.join('\n')}\n`);
    const args = [join(dirs[i], 'mobile', 'scripts', 'mutants.cjs'), '--ids', `@${ids}`,
      ...(greenFiles.length ? ['--green', greenFiles.join(',')] : []), ...(typesFrom ? ['--types-from', typesFrom] : [])];
    return run(args, join(dirs[i], 'mobile')).then(({ code, out }) => {
      console.log(`── lane ${i + 1} (${relative(ROOT, dirs[i]) || dirs[i]}), ${lane.ids.length} mutants, exit ${code}\n${out.trimEnd()}`);
      return { code, out };
    });
  });
  const ended = await Promise.all(runs);
  // Two runs of lanes end side by side (the rehearsals' and the rest): each adds its own seconds to what is there.
  withLock(`${TIMES}.lock`, () => {
    const now = existsSync(TIMES) ? JSON.parse(readFileSync(TIMES, 'utf8')) : {};
    for (const { out } of ended) for (const [id, s] of timesIn(out)) now[id] = s;
    writeFileSync(TIMES, `${JSON.stringify(now)}\n`);
  });
  const failed = ended.filter((e) => e.code !== 0).length;
  console.log(`${lanes.length} lanes, ${failed ? `${failed} with a mutant not caught or not run` : 'every mutant caught'}`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(1); });
}

module.exports = { deal, LANES, missingIn, modulesOf, PACKAGES, reachOrder, timesIn, unproven };
