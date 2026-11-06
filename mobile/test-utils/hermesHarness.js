/**
 * hermesHarness.js — jest's describe and it, run by the phone's own runtime (WORKLIST P4.52).
 * ─────────────────────────────────────────────────────────────────────────────
 * scripts/hermes-suites.cjs bundles a suite after this with the app's Metro, compiles
 * it with the app's hermesc, and runs it on a Hermes built from the commit React
 * Native pins. The matchers are jest's (`expect`), the tables jest's (`jest-each`),
 * the spies jest's (`jest-mock`), the clock jest's (`@jest/fake-timers`): only the
 * order of the calls is written here. A test that asserts nothing fails, as
 * jest.afterEnv.ts fails it under jest.
 */
/**
 * The phone's timers are React Native's, kept by a native module; the Hermes CLI's
 * setTimeout runs each task as soon as nothing else is waiting, in the order given,
 * whatever its delay, and it has no setInterval. So, where the CLI's are the only
 * ones, these keep each timer's delay as the phone does: the earliest due runs
 * first, once its time has truly passed (the clock is the real one), each after
 * the promises before it have settled. They are made before jest's fake timers,
 * which take them as the real ones.
 */
if (typeof setInterval !== 'function') {
  const runSoon = globalThis.setTimeout;
  const pending = new Map();
  let nextId = 1;
  let armed = false;
  const arm = () => {
    if (armed || !pending.size) return;
    armed = true;
    runSoon(fire);
  };
  function fire() {
    armed = false;
    let next = null;
    for (const t of pending.values()) if (!next || t.due < next.due) next = t;
    if (!next) return;
    while (Date.now() < next.due) { /* the delay passes, as on the phone */ }
    if (next.every === null) pending.delete(next.id);
    else next.due = Date.now() + next.every;
    arm();
    next.fn(...next.args);
  }
  const add = (fn, ms, args, repeat) => {
    const delay = Math.max(0, Number(ms) || 0);
    const id = nextId++;
    pending.set(id, { id, fn, args, due: Date.now() + delay, every: repeat ? delay : null });
    arm();
    return id;
  };
  globalThis.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  globalThis.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  globalThis.clearTimeout = (id) => { pending.delete(id); };
  globalThis.clearInterval = (id) => { pending.delete(id); };
  /** A finished suite leaves no timer waiting, as jest's teardown leaves none. */
  globalThis.__hermesTimersDone = () => pending.clear();
}

const { expect } = require('expect');
const { bind } = require('jest-each');
const { ModuleMocker } = require('jest-mock');
const { ModernFakeTimers } = require('@jest/fake-timers');
const fc = require('fast-check');

const say = (line) => print(line);

const block = (name, mode, parent) => ({ name, mode, parent, children: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] });
const root = block('', 'run', null);
let current = root;

const addBlock = (mode) => (name, body) => {
  const b = block(String(name), mode, current);
  current.children.push(b);
  current = b;
  try { body(); } finally { current = b.parent; }
};
const addTest = (mode) => (name, fn) => { current.children.push({ name: String(name), fn, mode, parent: current, test: true }); };
const withModes = (make) => {
  const run = make('run');
  run.skip = make('skip');
  run.only = make('only');
  for (const kind of [run, run.skip, run.only]) kind.each = bind(kind);
  return run;
};
const describe = withModes(addBlock);
const it = withModes(addTest);
it.todo = (name) => addTest('skip')(name, () => {});

/** fast-check's assert counts as an assertion, as jest.afterEnv.ts counts it (wrapped once by each harness). */
let propertyChecks = 0;
const COUNTED = Symbol('counted by this harness');
for (const host of [fc, fc.default]) {
  if (!host || typeof host.assert !== 'function' || host.assert[COUNTED]) continue;
  const real = host.assert;
  host.assert = Object.assign((...args) => { propertyChecks += 1; return real(...args); }, { [COUNTED]: true });
}

/**
 * jest.mock's factories, registered before the suite loads (scripts/hermes-suites.cjs writes
 * each into a file required ahead of it, as jest's babel plugin lifts them); each mocked
 * module's file is a one-line proxy that asks for its mock, made once, when first required,
 * as jest makes it. The suite's own jest.mock calls, run after its imports, change nothing.
 */
const factories = new Map();
const made = new Map();
const actuals = new Map();
globalThis.__hermesMocked = (spec) => {
  if (!factories.has(spec)) throw new Error(`no factory registered for jest.mock('${spec}')`);
  if (!made.has(spec)) made.set(spec, factories.get(spec)());
  return made.get(spec);
};
globalThis.__hermesActualOf = (spec, load) => { actuals.set(spec, load); };

const mocker = new ModuleMocker(globalThis);
const timers = new ModernFakeTimers({ global: globalThis, config: { fakeTimers: {}, rootDir: '' } });
const jest = {
  fn: (impl) => mocker.fn(impl),
  spyOn: (object, method, kind) => mocker.spyOn(object, method, kind),
  isMockFunction: (fn) => mocker.isMockFunction(fn),
  clearAllMocks: () => { mocker.clearAllMocks(); return jest; },
  resetAllMocks: () => { mocker.resetAllMocks(); return jest; },
  restoreAllMocks: () => { mocker.restoreAllMocks(); return jest; },
  mock: (spec, factory) => {
    if (!factories.has(spec)) factories.set(spec, factory);
    return jest;
  },
  requireMock: (spec) => globalThis.__hermesMocked(spec),
  requireActual: (spec) => {
    if (!actuals.has(spec)) throw new Error(`jest.requireActual('${spec}') was not bundled`);
    return actuals.get(spec)();
  },
  useFakeTimers: (config) => { timers.useFakeTimers(config); return jest; },
  useRealTimers: () => { timers.useRealTimers(); return jest; },
  setSystemTime: (now) => timers.setSystemTime(now),
  getRealSystemTime: () => timers.getRealSystemTime(),
  now: () => timers.now(),
  getTimerCount: () => timers.getTimerCount(),
  clearAllTimers: () => timers.clearAllTimers(),
  runAllTimers: () => timers.runAllTimers(),
  runAllTimersAsync: () => timers.runAllTimersAsync(),
  runOnlyPendingTimers: () => timers.runOnlyPendingTimers(),
  runOnlyPendingTimersAsync: () => timers.runOnlyPendingTimersAsync(),
  runAllTicks: () => timers.runAllTicks(),
  advanceTimersByTime: (ms) => timers.advanceTimersByTime(ms),
  advanceTimersByTimeAsync: (ms) => timers.advanceTimersByTimeAsync(ms),
  advanceTimersToNextTimer: (steps) => timers.advanceTimersToNextTimer(steps),
  advanceTimersToNextTimerAsync: (steps) => timers.advanceTimersToNextTimerAsync(steps),
};

Object.assign(globalThis, {
  describe, it, test: it, expect, jest,
  xdescribe: describe.skip, fdescribe: describe.only, xit: it.skip, xtest: it.skip, fit: it.only,
  beforeAll: (fn) => current.beforeAll.push(fn),
  afterAll: (fn) => current.afterAll.push(fn),
  beforeEach: (fn) => current.beforeEach.push(fn),
  afterEach: (fn) => current.afterEach.push(fn),
});

/** A hook or test that takes `done` finishes when it calls it, as under jest. */
const call = (fn) => (fn.length > 0
  ? new Promise((resolve, reject) => fn((error) => (error ? reject(error) : resolve())))
  : Promise.resolve().then(() => fn()));

const blocksOf = (node) => {
  const out = [];
  for (let b = node.parent; b; b = b.parent) out.unshift(b);
  return out;
};
const titleOf = (node) => blocksOf(node).map((b) => b.name).concat(node.name).filter(Boolean).join(' > ');
const holdsOnly = (node) => node.mode === 'only' || (node.children ?? []).some(holdsOnly);
const told = (error) => (error && typeof error === 'object' && 'message' in error
  ? `${error.name || 'Error'}: ${error.message}`
  : String(error));

/** The reason a test that threw nothing still fails, as jest-circus and jest.afterEnv.ts give it. */
const unmet = (state) => {
  if (state.suppressedErrors.length) return state.suppressedErrors[0];
  if (state.expectedAssertionsNumber !== null && state.assertionCalls !== state.expectedAssertionsNumber) {
    return new Error(`expected ${state.expectedAssertionsNumber} assertions, made ${state.assertionCalls}`);
  }
  if (state.isExpectingAssertions && state.assertionCalls === 0) return new Error('expected at least one assertion, made none');
  if (state.assertionCalls === 0 && propertyChecks === 0) return new Error('this test asserted nothing: no expect() and no fast-check property ran');
  return null;
};

/** The suite's last line, which scripts/hermes-suites.cjs reads; then no timer is left to wait for. */
const done = (suite, counts) => {
  say(`SUITE ${suite} passed=${counts.passed} failed=${counts.failed} skipped=${counts.skipped}`);
  globalThis.__hermesTimersDone?.();
};

async function runSuite(suite) {
  const onlyMarked = holdsOnly(root);
  const counts = { passed: 0, failed: 0, skipped: 0 };
  const runTest = async (test) => {
    const path = blocksOf(test).concat(test);
    if (path.some((n) => n.mode === 'skip') || (onlyMarked && !path.some((n) => n.mode === 'only'))) {
      counts.skipped += 1;
      return;
    }
    expect.setState({ assertionCalls: 0, expectedAssertionsNumber: null, isExpectingAssertions: false, suppressedErrors: [], currentTestName: titleOf(test) });
    propertyChecks = 0;
    let failure = null;
    try {
      for (const b of blocksOf(test)) for (const fn of b.beforeEach) await call(fn);
      await call(test.fn);
    } catch (error) { failure = error; }
    for (const b of blocksOf(test).reverse()) {
      for (const fn of b.afterEach) {
        try { await call(fn); } catch (error) { failure = failure ?? error; }
      }
    }
    failure = failure ?? unmet(expect.getState());
    if (failure) { counts.failed += 1; say(`FAIL ${suite} :: ${titleOf(test)} :: ${told(failure)}`); }
    else { counts.passed += 1; say(`PASS ${suite} :: ${titleOf(test)}`); }
  };
  const visit = async (b) => {
    for (const fn of b.beforeAll) await call(fn);
    for (const child of b.children) await (child.test ? runTest(child) : visit(child));
    for (const fn of b.afterAll) await call(fn);
  };
  try { await visit(root); } catch (error) {
    counts.failed += 1;
    say(`FAIL ${suite} :: (a beforeAll or afterAll) :: ${told(error)}`);
  }
  done(suite, counts);
}

/** Called by the bundle's last line; a suite that could not load is told by name and failed. */
globalThis.__runSuite = (suite, loadError) => {
  if (loadError) {
    say(`FAIL ${suite} :: (loading the suite) :: ${told(loadError)}`);
    done(suite, { passed: 0, failed: 1, skipped: 0 });
    return;
  }
  runSuite(suite).catch((error) => {
    say(`FAIL ${suite} :: (the runner) :: ${told(error)}`);
    done(suite, { passed: 0, failed: 1, skipped: 0 });
  });
};
