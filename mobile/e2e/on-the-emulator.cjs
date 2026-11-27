#!/usr/bin/env node
/**
 * on-the-emulator.cjs — run a command on the emulator its step started, then stop that emulator and
 * see every process of it end before the step does.
 *
 *   node mobile/e2e/on-the-emulator.cjs <command> [args...]
 *
 * Every android-emulator-runner step's script goes through here (ciWorkflows.guard). The action
 * stops its emulator with one `adb emu kill` and then waits, with no limit of its own, for the
 * emulator's processes to let go of the step's output. Nightly 45951561421: the three-button walk
 * had judged every route and put its phone back when the emulator answered "OK: killing emulator,
 * bye bye" and then never stopped. Its own 20 s shutdown watch never began, and the step sat 41
 * minutes until its 50-minute limit ended the job, the steps after it unrun.
 *
 * So the command's exit code is kept, the emulator is asked to stop as the action asks, and its
 * processes are given ASKED_MS to end: its own graceful wait (20 s) and its kill after it. Any still
 * running are written down as they are (each thread's state and what the kernel holds it on), and
 * that record raised as a warning on the run page; then they are ended (TERM, then KILL). The step
 * ends with the command's own exit code: the flows' verdict, never the emulator's shutdown.
 */
const { spawnSync } = require('child_process');
const { existsSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

/** The emulator's own graceful wait (ANDROID_EMULATOR_WAIT_TIME_BEFORE_KILL, 20 s), its kill, and room after. */
const ASKED_MS = 40000;
/** How long each signal is given before the next. */
const SIGNAL_MS = 10000;
/** How often the processes are looked at while they are waited for. */
const LOOK_MS = 500;

/** The pids of `pids` still running, looked at every LOOK_MS until none is or `ms` has passed. */
function waitFor(io, pids, ms) {
  const until = io.now() + ms;
  let left = pids.filter((p) => io.alive(p));
  while (left.length && io.now() < until) {
    io.sleep(LOOK_MS);
    left = left.filter((p) => io.alive(p));
  }
  return left;
}

/**
 * Stops the emulator through `io` (its processes, the ask, signals, the clock, the record and the
 * note): asked first, then TERM and KILL for what is left after ASKED_MS, each written down first.
 * Returns how it stopped: 'none' (no emulator running), 'asked', 'ended' or 'never'.
 */
function stopTheEmulator(io) {
  const family = io.family();
  if (!family.length) return { stopped: 'none', left: [] };
  io.ask();
  let left = waitFor(io, family, ASKED_MS);
  if (!left.length) return { stopped: 'asked', left };
  const record = [
    `The emulator did not stop within ${ASKED_MS / 1000} s of adb emu kill. Its processes then:`,
    io.record(left),
  ];
  io.signal(left, 'SIGTERM');
  left = waitFor(io, left, SIGNAL_MS);
  if (left.length) {
    io.signal(left, 'SIGKILL');
    left = waitFor(io, left, SIGNAL_MS);
  }
  record.push(left.length
    ? `Still running after TERM and KILL: ${left.join(', ')}.`
    : 'Ended by signal; the step ends with the command\'s own exit code.');
  io.note('The emulator did not stop when asked', record.join('\n'));
  return { stopped: left.length ? 'never' : 'ended', left };
}

/** The Android SDK's emulator folder: every process of the emulator (qemu, netsimd, crashpad) runs from it. */
const emulatorFolder = (env) => env.E2E_EMULATOR_PATH
  || `${env.ANDROID_HOME || env.ANDROID_SDK_ROOT || '/usr/local/lib/android/sdk'}/emulator/`;

const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };

/** A process whose program, or the first word it was started by, is in `folder`. */
function fromFolder(pid, folder) {
  let program = '';
  try { program = readlinkSync(`/proc/${pid}/exe`); } catch { /* another user's, or gone */ }
  return program.startsWith(folder) || (read(`/proc/${pid}/cmdline`).split('\0')[0] ?? '').startsWith(folder);
}

/** One process as the kernel has it: its command, and each thread's name, state and wait. */
function processRecord(pid) {
  const lines = [`pid ${pid}: ${read(`/proc/${pid}/cmdline`).split('\0').join(' ').trim().slice(0, 160)}`];
  let tasks = [];
  try { tasks = readdirSync(`/proc/${pid}/task`); } catch { /* gone as it was read */ }
  for (const tid of tasks.slice(0, 60)) {
    const stat = read(`/proc/${pid}/task/${tid}/stat`);
    const state = /\) (?<s>\S)/.exec(stat)?.groups?.s ?? '?';
    lines.push(`  ${tid} ${read(`/proc/${pid}/task/${tid}/comm`).trim()} ${state} ${read(`/proc/${pid}/task/${tid}/wchan`).trim() || '-'}`);
  }
  if (tasks.length > 60) lines.push(`  … ${tasks.length - 60} threads more`);
  const stack = spawnSync('sudo', ['-n', 'cat', `/proc/${pid}/stack`], { encoding: 'utf8', timeout: 10000 });
  if (stack.status === 0 && stack.stdout.trim()) lines.push('  its kernel stack:', ...stack.stdout.trim().split('\n').map((l) => `    ${l}`));
  return lines.join('\n');
}

/** The io of a real runner: /proc, adb, signals and annotate.mjs. */
function runnerIo(env) {
  const folder = emulatorFolder(env);
  const serial = env.E2E_EMULATOR_SERIAL || 'emulator-5554';
  const pause = new Int32Array(new SharedArrayBuffer(4));
  return {
    family: () => {
      if (!existsSync('/proc')) return [];
      return readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number)
        .filter((pid) => pid !== process.pid && fromFolder(pid, folder));
    },
    ask: () => { spawnSync('adb', ['-s', serial, 'emu', 'kill'], { stdio: 'inherit', timeout: 20000 }); },
    alive: (pid) => {
      try { process.kill(pid, 0); } catch (e) { return e.code === 'EPERM'; }
      // A process ended but not yet reaped by its parent is gone: it holds nothing open.
      return !/\) Z/.test(read(`/proc/${pid}/stat`));
    },
    signal: (pids, sig) => { for (const pid of pids) { try { process.kill(pid, sig); } catch { /* ended between */ } } },
    now: () => Date.now(),
    sleep: (ms) => { Atomics.wait(pause, 0, 0, ms); },
    record: (pids) => pids.map(processRecord).join('\n'),
    note: (title, text) => {
      const file = join(mkdtempSync(join(tmpdir(), 'emulator-stop-')), 'record.txt');
      writeFileSync(file, `${text}\n`);
      spawnSync(process.execPath, [join(__dirname, 'annotate.mjs'), title, file, 'warning'], { stdio: 'inherit', timeout: 30000 });
    },
  };
}

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error('usage: node mobile/e2e/on-the-emulator.cjs <command> [args...]');
    process.exit(2);
  }
  const ran = spawnSync(command, args, { stdio: 'inherit' });
  if (ran.error) console.error(`on-the-emulator: ${command} could not run: ${ran.error.message}`);
  const status = typeof ran.status === 'number' ? ran.status : 1;
  stopTheEmulator(runnerIo(process.env));
  process.exit(status);
}

module.exports = { stopTheEmulator, emulatorFolder, ASKED_MS, SIGNAL_MS };
