#!/usr/bin/env node
/**
 * gate-lock.cjs — the push gate's hold on the machine: while a push gate runs, no other heavy run starts.
 *
 * The gate measures the processors and memory free when it starts and fills them (pre-push.cjs, capOf).
 * A mutant run, a wide jest run or a second gate started beside it starves it: on 2026-11-25 three
 * builders' runs took 11 of 11 processors and 6.8 of 6.8 GB, and the gate's tests ran out of their time
 * and its mutants died unrun, for faults the pushed code did not have.
 *
 *   node mobile/scripts/gate-lock.cjs hold --who <words> -- <command> [<argument>...]
 *       takes the lock (refused while another holder lives), runs the command with RH_PUSH_GATE set to
 *       the lock's token, so the gate's own children pass, and lets the lock go when the command ends,
 *       whatever its exit; exits as the command did. push-head.ps1 runs `git push` so.
 *   node mobile/scripts/gate-lock.cjs check
 *       exits 0 when no gate holds the machine (or this process is the gate's own child), else 1 and
 *       says who holds it and since when. A builder waits on it with a Monitor until-loop.
 *
 * The lock is a file (LOCK): { who, since, pid, token }. One whose holder no longer runs (a closed window
 * ends the holder with no signal) is stale: it is removed, and said so, by the next look. One written by
 * hand, with no holder, stands until it is removed by hand. RH_GATE_LOCK names another file (the tests').
 */
const { randomBytes } = require('crypto');
const { spawn } = require('child_process');
const { mkdirSync, readFileSync, rmSync, writeFileSync } = require('fs');
const os = require('os');
const { dirname, join } = require('path');

/** Where the lock is: the folder every builder and the push wrapper share on this machine. */
const LOCK = process.env.RH_GATE_LOCK || (process.platform === 'win32' ? 'C:/tmp/push-gate.lock' : join(os.tmpdir(), 'push-gate.lock'));
/** The variable the holder sets for its own children: the lock's token. */
const CHILD = 'RH_PUSH_GATE';

/** Whether a process runs: signal 0 asks without touching it. */
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/**
 * The lock as it stands: null when there is none, or when its holder no longer runs (then removed, and
 * `said` told so). A lock written by hand (not JSON) is its own words, with no holder and no token.
 */
const lockNow = (file = LOCK, said = (s) => console.error(s), running = alive) => {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { return null; }
  let lock;
  try { lock = JSON.parse(text); } catch { return { who: text.trim(), since: null, pid: null, token: null }; }
  if (typeof lock.pid === 'number' && !running(lock.pid)) {
    said(`a stale push-gate lock (${lock.who}, since ${lock.since}): its holder, process ${lock.pid}, no longer runs; removed`);
    rmSync(file, { force: true });
    return null;
  }
  return lock;
};

/**
 * Why `what` may not start now, or null: a gate holds the machine and this process is not one of its
 * children (RH_PUSH_GATE is not the lock's token; a lock written by hand has none, and any token passes).
 */
const refusal = (what, { file = LOCK, env = process.env, running = alive, said } = {}) => {
  const lock = lockNow(file, said, running);
  if (!lock) return null;
  const mine = env[CHILD] && (lock.token === null || env[CHILD] === lock.token);
  if (mine) return null;
  return `${what} refused: a push gate holds this machine (${file}: ${lock.who}${lock.since ? `, since ${lock.since}` : ''}). `
    + 'Run beside it, it starves the gate (2026-11-25: 11 of 11 processors and 6.8 of 6.8 GB taken, its tests out of time). '
    + `Wait until the lock is gone, with a Monitor until-loop: until node mobile/scripts/gate-lock.cjs check; do sleep 60; done`;
};

/** Stops this process with the refusal when `what` may not start now. */
const refuseWhileGate = (what, opts) => {
  const why = refusal(what, opts);
  if (why) { console.error(why); process.exit(3); }
};

/**
 * Runs `cmd args` holding the lock: refused (exit 3) while another holder lives; the lock written with
 * this process's pid and a fresh token, the command run with RH_PUSH_GATE set to it, and the lock let go
 * when the command ends, fails or is stopped. Resolves to the command's exit code.
 */
const hold = (who, cmd, args, { file = LOCK, stdio = 'inherit' } = {}) => new Promise((done) => {
  const held = lockNow(file);
  if (held) {
    console.error(`the push gate is not started: ${file} is held (${held.who}${held.since ? `, since ${held.since}` : ''}). `
      + 'One gate at a time; a lock written by hand is removed by hand.');
    done(3);
    return;
  }
  const token = randomBytes(12).toString('hex');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ who, since: new Date().toISOString(), pid: process.pid, token })}\n`, { flag: 'wx' });
  let gone = false;
  const letGo = () => {
    if (gone) return;
    gone = true;
    // Only this holder's own lock: never one another took after it.
    try { if (JSON.parse(readFileSync(file, 'utf8')).token === token) rmSync(file, { force: true }); } catch { /* already gone */ }
  };
  process.on('exit', letGo);
  const child = spawn(cmd, args, { stdio, env: { ...process.env, [CHILD]: token } });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    try { process.on(signal, () => { try { child.kill(signal); } catch { /* ended */ } }); } catch { /* not on this system */ }
  }
  child.on('error', (e) => { console.error(`${cmd} could not start: ${e.message}`); letGo(); done(1); });
  child.on('close', (code) => { letGo(); done(code ?? 1); });
});

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv[0] === 'check' && argv.length === 1) {
    const why = refusal('a heavy run');
    if (why) { console.error(why); process.exit(1); }
    console.log('no push gate holds this machine');
    process.exit(0);
  }
  const at = argv.indexOf('--');
  const w = argv.indexOf('--who');
  if (argv[0] !== 'hold' || at < 0 || w < 0 || w > at || !argv[w + 1] || at === argv.length - 1) {
    console.error('usage: gate-lock.cjs hold --who <words> -- <command> [<argument>...] | gate-lock.cjs check');
    process.exit(2);
  }
  hold(argv[w + 1], argv[at + 1], argv.slice(at + 2)).then((code) => process.exit(code));
}

module.exports = { CHILD, LOCK, alive, hold, lockNow, refusal, refuseWhileGate };
