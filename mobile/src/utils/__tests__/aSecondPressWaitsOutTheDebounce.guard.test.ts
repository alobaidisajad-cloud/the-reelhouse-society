/**
 * aSecondPressWaitsOutTheDebounce.guard.test.ts — TST-14: a test that presses
 * the same control twice lets 400 ms pass first (PressableScale's debounce,
 * read from Date.now, which jest's clock and a test's real one both keep
 * inside it), or the second press never reaches the screen, and a check that
 * nothing happened passes for that alone. Two did (the reader's order, the
 * stack's critiques); each now waits, shows each press landed, and fails with
 * the refusal it guards taken out.
 */
import { readFileSync } from 'fs';
import { relative, join } from 'path';

const finder = require('../../../scripts/press-again.cjs') as {
  sitesIn: (file: string, text: string) => { target: string; line: number; first: number }[];
  testFiles: () => string[];
};
const MOBILE = join(__dirname, '..', '..', '..');

/** A second press with no time passed that reaches its control all the same, and why. */
const JUDGED: Record<string, string> = {
  "src/components/__tests__/SectionErrorBoundary.test.tsx :: getByLabelText('Retry loading the reels')":
    'a plain Pressable, with no debounce; the check after each press shows it landed',
};

describe('a second press of a control waits out its debounce', () => {
  const found = finder.testFiles().flatMap((f) => finder.sitesIn(f, readFileSync(f, 'utf8'))
    .map((s) => `${relative(MOBILE, f).split('\\').join('/')} :: ${s.target}`));

  it('finds none in any test, but those judged to reach their control', () => {
    expect(finder.testFiles().length).toBeGreaterThan(400);
    expect(found.filter((k) => !(k in JUDGED))).toEqual([]);
  });

  it('judges nothing that is no longer there', () => {
    expect(Object.keys(JUDGED).filter((k) => !found.includes(k))).toEqual([]);
  });

  it('can say NO: a second press with no time between is found; one after a wait or a timer is not', () => {
    const sites = (code: string) => finder.sitesIn('x.test.tsx', code).length;
    expect(sites("it('a', async () => { await fireEvent.press(b()); await fireEvent.press(b()); });")).toBe(1);
    expect(sites("it('a', async () => { await fireEvent.press(b()); jest.advanceTimersByTime(500); await fireEvent.press(b()); });")).toBe(0);
    expect(sites("it('a', async () => { await fireEvent.press(b()); await act(() => new Promise((r) => setTimeout(r, 450))); await fireEvent.press(b()); });")).toBe(0);
    expect(sites("const wait = () => new Promise((r) => setTimeout(r, 450));\nit('a', async () => { await fireEvent.press(b()); await wait(); await fireEvent.press(b()); });")).toBe(0);
    expect(sites("it('a', async () => { await fireEvent.press(b()); await fireEvent.press(c()); });")).toBe(0);
  });
});
