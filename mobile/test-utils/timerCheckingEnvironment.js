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
 * event loop is let pass (work an unmount queued finishes in it) and whatever
 * is still waiting fails the file, by where it was started. Each is then
 * cleared, so a failing run still ends.
 */
const ReactNativeEnvironment = require('react-native/jest/react-native-env');

/**
 * The timers the running file has started and not yet seen end (null between
 * files), kept on the worker's global: the wrappers below are made once per
 * worker, and must write where every load of this module reads.
 */
const shared = (globalThis[Symbol.for('reelhouse.timerLedger')] ??= { running: null, test: null, realImmediate: globalThis.setImmediate });

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
    ledger.set(timer, { set, delay: set === 'setImmediate' ? undefined : rest[0], during: shared.test, stack: new Error().stack });
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

class TimerCheckingEnvironment extends ReactNativeEnvironment {
  constructor(config, context) {
    super(config, context);
    this.timers = new Map();
    shared.running = this.timers;
  }

  async handleTestEvent(event, state) {
    // A timer started in a test's afterEach (cleanup's unmount) is that test's.
    if (event.name === 'test_start') shared.test = nameOf(event.test);
    if (event.name === 'test_done') shared.test = null;
    if (event.name !== 'run_finish') return;
    // The real one: the wait is the environment's, not the file's.
    await new Promise((resolve) => shared.realImmediate(resolve));

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
