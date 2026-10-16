/**
 * everyEventIsAwaited.guard.test.ts — TST-08: in every test, each fireEvent,
 * act and renderHook is waited for (Testing Library 14 makes all three async).
 * Unwaited, what a test checks next can be the screen from before the event,
 * and a negative check then passes on a stale tree. 308 were found and waited
 * for (scripts/await-events.cjs --fix, one helper by hand); none may come back.
 */
import { readFileSync } from 'fs';

const finder = require('../../../scripts/await-events.cjs') as {
  sitesIn: (file: string, text: string) => { line: number; fn: unknown }[];
  fixed: (text: string, sites: { line: number; fn: unknown }[]) => string;
  testFiles: () => string[];
};

describe('every event in every test is waited for', () => {
  it('finds none unwaited, in any test file', () => {
    const files = finder.testFiles();
    expect(files.length).toBeGreaterThan(400);
    const left = files.flatMap((f) => finder.sitesIn(f, readFileSync(f, 'utf8')).map((s) => `${f}:${s.line}`));
    expect(left).toEqual([]);
  });

  it('can say NO: each unwaited shape is found, and each waited one is not', () => {
    const found = (code: string) => finder.sitesIn('x.test.tsx', code).length;
    expect(found("it('a', () => { fireEvent.press(b); expect(1).toBe(1); });")).toBe(1);
    expect(found("it('a', () => { fireEvent(b, 'onScroll'); });")).toBe(1);
    expect(found("it('a', () => { act(() => { jest.runAllTimers(); }); });")).toBe(1);
    expect(found("it('a', () => { renderHook(() => useX()); });")).toBe(1);
    expect(found("const go = () => { fireEvent.press(b); };")).toBe(1);
    expect(found("it('a', async () => { await fireEvent.press(b); });")).toBe(0);
    expect(found("it('a', () => fireEvent.press(b));")).toBe(0);
    expect(found("it('a', async () => { const r = await renderHook(() => useX()); });")).toBe(0);
    expect(found("it('a', () => { void act(() => {}); });")).toBe(0);
  });

  it('waits for one in a test by making the test async, and leaves a helper\'s to a hand', () => {
    const code = "it('a', () => {\n  fireEvent.press(b);\n});\nconst go = () => { fireEvent.press(b); };\n";
    const sites = finder.sitesIn('x.test.tsx', code);
    expect(sites.map((s) => s.fn !== null)).toEqual([true, false]);
    expect(finder.fixed(code, sites)).toBe("it('a', async () => {\n  await fireEvent.press(b);\n});\nconst go = () => { fireEvent.press(b); };\n");
  });
});
