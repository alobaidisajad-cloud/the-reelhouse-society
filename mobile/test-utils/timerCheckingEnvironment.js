/**
 * timerCheckingEnvironment.js — React Native's test environment, in which a
 * test file may not end with a timer still waiting.
 *
 * A timer left behind does not fail anything where it is made. In a normal run
 * each file runs in a worker that is killed at the end, so the timer dies
 * unseen. Under `--runInBand` or `--detectOpenHandles` the file runs in jest's
 * own process, and a React Query cache timer (five minutes) or the app's
 * client (thirty) holds that process open. A shorter one fires inside the NEXT
 * file the worker runs, against a torn-down environment, and fails a test that
 * has nothing to do with it. `--detectOpenHandles` does not name these: it
 * reports only a handle made with the test's own code on the stack, and a
 * timer made during unmount has none.
 *
 * So every real timer a file starts is counted, and when the file has run —
 * after its last afterAll, while its modules are still loaded — one turn of the
 * event loop is let pass (work an unmount queued finishes in it), then one zero
 * wait (a timer of no delay queued in that turn, as React Query's notices from
 * an unmount are, runs in it: useFeeds ended on one when the nightly's random
 * order made its last test the one that unmounts a feed), and whatever is still
 * waiting fails the file, by where it was started. Each is then
 * cleared, so a failing run still ends.
 */
const ReactNativeEnvironment = require('@react-native/jest-preset/jest/react-native-env');

/**
 * The timers the running file has started and not yet seen end (null between
 * files), kept on the worker's global: the wrappers below are made once per
 * worker, and must write where every load of this module reads.
 */
const shared = (globalThis[Symbol.for('reelhouse.timerLedger')] ??= { running: null, test: null, realImmediate: globalThis.setImmediate, realTimeout: globalThis.setTimeout });

const KINDS = [
  ['setTimeout', 'clearTimeout'],
  ['setInterval', 'clearInterval'],
  ['setImmediate', 'clearImmediate'],
];

/** Function own properties that belong to the function itself, not to what it carries. */
const OWN = new Set(['length', 'name', 'prototype', 'arguments', 'caller']);

/**
 * Wrapped once per worker, in the worker's own realm. The environment's global
 * reads each timer function from here when first asked (jest-environment-node's
 * lazy globals), and fake timers hand back what they found, so a file that
 * fakes timers and then restores them is still counted.
 */
for (const [set, clear] of KINDS) {
  const realSet = globalThis[set];
  const realClear = globalThis[clear];
  if (realSet.counted) continue;

  const counted = function (callback, ...rest) {
    const ledger = shared.running;
    if (!ledger || typeof callback !== 'function') return realSet.call(this, callback, ...rest);
    let timer;
    const run = function (...args) {
      if (set !== 'setInterval') ledger.delete(timer);
      return callback.apply(this, args);
    };
    timer = realSet.call(this, run, ...rest);
    const stack = new Error().stack;
    if (!startedByNode(stack)) ledger.set(timer, { set, delay: set === 'setImmediate' ? undefined : rest[0], during: shared.test, stack });
    return timer;
  };
  // util.promisify(setTimeout) reads a symbol the real function carries.
  for (const key of Reflect.ownKeys(realSet)) {
    if (!OWN.has(key)) Object.defineProperty(counted, key, Object.getOwnPropertyDescriptor(realSet, key));
  }
  counted.counted = true;
  globalThis[set] = counted;

  globalThis[clear] = function (timer) {
    if (shared.running) forget(shared.running, timer);
    return realClear.call(this, timer);
  };
}

/** A timer may be cleared by the number it converts to; find that one. */
/**
 * Whether Node itself started a timer: the frame that called setTimeout is in
 * Node's own internals (its fetch keeps a 499 ms tick and a socket's keep-alive,
 * as the contract tests met in db-integration run 38829278284). Not the code's
 * to clear, and it holds no process open. A timer the app or a test starts has
 * its own frame there instead, however deep Node sits below it.
 */
function startedByNode(stack) {
  const caller = String(stack).split('\n').slice(1).map((l) => l.trim())
    .find((l) => !l.includes('timerCheckingEnvironment'));
  return /^at (?:.*\()?node:internal\//.test(caller ?? '');
}

function forget(ledger, timer) {
  if (ledger.delete(timer) || timer == null || typeof timer === 'object') return;
  for (const known of ledger.keys()) {
    if (typeof known[Symbol.toPrimitive] === 'function' && known[Symbol.toPrimitive]() === timer) {
      ledger.delete(known);
      return;
    }
  }
}

/** Node marks a timer that ran or was cleared (or closed) as destroyed. */
const waiting = (timer) => !timer._destroyed;

/**
 * Where a timer was started: the first line of the app's or a test's own code
 * (none, when a library started it inside the testing library's cleanup), and
 * the first library frames, which name what made it (`Query.scheduleGc`).
 */
function startedAt(stack) {
  const frames = stack.split('\n').slice(1).map((l) => l.trim().replace(/^at /, ''))
    .filter((l) => !l.includes('timerCheckingEnvironment') && /[\\/]/.test(l));
  // The path up to node_modules (or the app's own folder) is cut; the rest names the place.
  const short = (l) => l.replace(/[^(\s]*[\\/](?:node_modules|mobile)[\\/]/, '');
  const own = frames.find((l) => !l.includes('node_modules'));
  const lib = frames.filter((l) => l.includes('node_modules')).slice(0, 3).map(short);
  return [own && `at ${short(own)}`, lib.length && `from ${lib.join(' < ')}`].filter(Boolean).join('\n      ');
}

/** The test's full name, as the report prints it. */
function nameOf(test) {
  const parts = [];
  for (let t = test; t && t.parent; t = t.parent) parts.unshift(t.name);
  return parts.join(' › ');
}

/**
 * A block's tests and blocks, last to first, as jest-circus runs them once their block starts
 * (it reads the list after run_describe_start). A test that leaves something behind (a mock's
 * answer, a store's state, a kept draft) passed only because the test it broke ran first; the
 * nightly's random order found seven such files, eleven nights after the first landed (2026-11-13
 * to -24). The suite runs forwards in UTC and backwards in every other zone (god_tier_ci.yml), so
 * every two tests of a file run in both orders on every push.
 */
function backwards(describeBlock) {
  describeBlock.children.reverse();
}

/**
 * Each test's time beside its limit, one JSON line each, appended where RH_TEST_TIMES names (the
 * nightly's run, and a builder's own): { file, test, ms, limit }. The limit is the test's own (its
 * third argument), else the file's (jest.setTimeout), else the config's. scripts/slow-tests.cjs reads
 * them: a test over half its limit times out once the machine is loaded.
 */
function recordTime(into, file, test, state) {
  const line = { file, test: nameOf(test), ms: test.duration ?? null, limit: test.timeout ?? state.testTimeout ?? null, waits: test[WAITS] ?? null };
  require('fs').appendFileSync(into, `${JSON.stringify(line)}\n`);
}

/**
 * Whether a test waits: it takes a done callback, or hands back a promise. Only a test that waits can
 * run out of its limit; one that returns at once ends whatever it took. Told by wrapping its function as
 * it starts (its length kept: jest reads a done callback from it), and only while times are written.
 */
const WAITS = Symbol.for('reelhouse.testWaits');
function watchWaiting(test) {
  const fn = test.fn;
  if (typeof fn !== 'function' || fn.length > 0) { test[WAITS] = typeof fn === 'function'; return; }
  const wrapped = function (...args) {
    const r = fn.apply(this, args);
    test[WAITS] = !!r && typeof r.then === 'function';
    return r;
  };
  Object.defineProperty(wrapped, 'length', { value: 0 });
  test.fn = wrapped;
}

class TimerCheckingEnvironment extends ReactNativeEnvironment {
  constructor(config, context) {
    super(config, context);
    // Node's own fetch, for the contracts that ask a real server (contractEnv's houseFetch): the
    // file's global fetch is Expo's from its setup on, whose native module jest-expo stubs, so it
    // answers every request, even one to a closed port, with no status.
    this.global[Symbol.for('reelhouse.nodeFetch')] = globalThis.fetch;
    this.timers = new Map();
    shared.running = this.timers;
    this.testPath = context.testPath;
  }

  async handleTestEvent(event, state) {
    // JEST_BACKWARDS=1: each block's tests and blocks run last to first (backwards below).
    if (event.name === 'run_describe_start' && process.env.JEST_BACKWARDS === '1') backwards(event.describeBlock);
    // A timer started in a test's afterEach (cleanup's unmount) is that test's.
    if (event.name === 'test_start') shared.test = nameOf(event.test);
    if (event.name === 'test_done') shared.test = null;
    if (event.name === 'test_start' && process.env.RH_TEST_TIMES) watchWaiting(event.test);
    if (event.name === 'test_done' && process.env.RH_TEST_TIMES) recordTime(process.env.RH_TEST_TIMES, this.testPath, event.test, state);
    if (event.name !== 'run_finish') return;
    // The real one: the wait is the environment's, not the file's.
    await new Promise((resolve) => shared.realImmediate(resolve));
    await new Promise((resolve) => shared.realTimeout(resolve, 0));

    const left = [...this.timers].filter(([timer]) => waiting(timer));
    this.timers.clear();
    for (const [timer, about] of left) {
      if (about.set === 'setImmediate') clearImmediate(timer);
      else clearTimeout(timer);
    }
    if (left.length === 0) return;

    const lines = left.map(([, about]) =>
      `  ${about.set}(…${about.delay === undefined ? '' : `, ${about.delay}`}), started ` +
      `${about.during ? `in "${about.during}"` : 'outside any test'}\n      ${startedAt(about.stack)}`);
    const message =
      `This file ended with ${left.length} timer${left.length === 1 ? '' : 's'} still waiting:\n` +
      `${lines.join('\n')}\n\n` +
      'A timer that outlives its file holds an in-band run open or fires inside the next file. ' +
      'Clear it where it is made (on unmount, or when the race it was racing is decided); a React Query ' +
      'client in a test comes from testQueryClient() (test-utils/testQueryClient.ts), which keeps no ' +
      'collection timer; a timer the code means to keep, the test runs out (jest.useFakeTimers) and asserts.';
    state.unhandledErrors.push(Object.assign(new Error(message), { stack: message }));
  }

  async teardown() {
    shared.running = null;
    await super.teardown();
  }
}

module.exports = TimerCheckingEnvironment;
module.exports.startedByNode = startedByNode;
module.exports.backwards = backwards;
