/**
 * e2eRuntime.test.ts — the E2E build writes the phone's runtime once a launch,
 * every built-in the list reads, in lines the run can join; no other build
 * writes anything.
 */
import runtime from '../runtimeLacks.json';

const load = (extra: Record<string, unknown>) => {
  jest.resetModules();
  jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra } } }));
  return require('../e2eRuntime') as typeof import('../e2eRuntime');
};

let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); jest.dontMock('expo-constants'); });

it('is silent in a member\'s build', () => {
  load({}).traceRuntimeOnce();
  expect(warn).not.toHaveBeenCalled();
});

it('in the E2E build, writes every built-in the list reads, once a launch, in lines the run can join', () => {
  const m = load({ e2e: true });
  m.traceRuntimeOnce();
  m.traceRuntimeOnce();
  const lines = warn.mock.calls.map(([l]) => String(l));
  expect(lines.length).toBeGreaterThanOrEqual(runtime.reads.length);
  expect(lines.every((l) => l.startsWith('[e2e] runtime {'))).toBe(true);
  const parts = lines.map((l) => JSON.parse(l.slice('[e2e] runtime '.length)));
  expect([...new Set(parts.map((p) => p.of))]).toEqual(runtime.reads);
  // Joined, each built-in's names are what the engine has.
  const joined = (of: string) => parts.filter((p) => p.of === of).flatMap((p) => p.names);
  expect(joined('AbortSignal')).toEqual(m.runtimeNames(['AbortSignal']).AbortSignal);
});

it('a built-in the engine has not got is written as absent, not as empty', () => {
  const m = load({ e2e: true });
  expect(m.runtimeNames(['NoSuchThing', 'NoSuchThing.prototype'])).toEqual({ NoSuchThing: null, 'NoSuchThing.prototype': null });
  expect(m.runtimeLines('NoSuchThing', null)).toEqual([{ of: 'NoSuchThing', part: 1, parts: 1, names: null }]);
});
