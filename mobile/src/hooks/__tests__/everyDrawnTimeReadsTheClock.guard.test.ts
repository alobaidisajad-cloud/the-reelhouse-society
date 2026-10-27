/**
 * EVERY DRAWN TIME READS THE CLOCK — the finder, as a test (P4.7).
 *
 * A label worked out from the time as its screen drew ("MOMENTS AGO", "CLOSES IN 1 HR.",
 * "TODAY", the year) stayed as it was while the screen stood: a read that brings back the same
 * rows draws nothing again. The shared clock (useClock) reads the time again on return and as
 * time passes, and draws a screen again only when its words change. So:
 *
 *   - timeAgo and timeUntil are called from useClock alone; a screen reads useTimeAgo,
 *     useTimesAgo, useTimeUntil or useHasPassed;
 *   - the time is never read where a screen is drawn (`Date.now()`, `new Date()` with nothing
 *     in it, `localCalendarDate()` given no instant) except through the clock. A read inside an act (a press, an effect, a timer, a
 *     promise's answer) is its own moment, not a drawing, and is let be; every other read is
 *     named in the register below with why it is not drawn, or why it keeps its own time.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

const ROOT = join(__dirname, '..', '..', '..');
const CLOCK = 'src/hooks/useClock.ts';
const WORDS = 'src/utils/timeAgo.ts';

/** Reads of the time where a screen draws that are not a drawn time, each with its reason. */
const REGISTER: Record<string, { reads: number; why: string }> = {
  'app/stacks/[id].tsx': { reads: 1, why: 'a stack made on this phone has no date from the house yet: it is stamped as the read asks for its stand-in' },
  'src/components/ErrorBoundary.tsx': { reads: 1, why: 'the crash’s id, stamped at the moment of the crash' },
  'src/components/StandingNotice.tsx': { reads: 2, why: 'keeps its own time: it wakes at the very instant a suspension ends' },
  'src/components/lobby/Masthead.tsx': { reads: 1, why: 'the wall’s own clock, read on the hour and on every return (useWallClock)' },
  'src/components/profile/WatchlistRoulette.tsx': { reads: 1, why: 'the verdict is written as the wheel stops, a press’s own moment' },
  'src/hooks/useInitiation.ts': { reads: 1, why: 'a new member’s welcome, decided once inside an effect (shouldInitiate)' },
  'src/hooks/useLogFlow.ts': { reads: 3, why: 'the day a log is filed under, set as the composer opens or is cleared: the member’s choice, never moved under them' },
};

/** A function passed to one of these is run later, at a moment of its own. */
const LATER = new Set([
  'useEffect', 'useLayoutEffect', 'useCallback', 'useEffectEvent', 'useFocusEffect', 'setTimeout', 'setInterval',
  'requestAnimationFrame', 'addEventListener', 'addListener', 'then', 'catch', 'finally', 'subscribe', 'runOnJS',
  'mutate', 'mutateAsync', 'onPress', 'runAfterInteractions', 'forEach',
]);

type Site = { line: number; text: string };

/** The time read where nothing marks it as an act's own moment. */
export function drawnReadsOf(file: string, text: string): Site[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Site[] = [];
  const isClockRead = (n: ts.Node) =>
    (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.expression.getText(sf) === 'Date'
      && n.expression.name.text === 'now' && n.arguments.length === 0)
    || (ts.isNewExpression(n) && n.expression.getText(sf) === 'Date' && (n.arguments?.length ?? 0) === 0)
    || (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['localCalendarDate', 'getLocalDateString'].includes(n.expression.text) && n.arguments.length < 2);
  const calleeName = (c: ts.CallExpression) =>
    ts.isIdentifier(c.expression) ? c.expression.text
      : ts.isPropertyAccessExpression(c.expression) ? c.expression.name.text : '';
  const inAnAct = (n: ts.Node): boolean => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
      if (!ts.isArrowFunction(p) && !ts.isFunctionExpression(p) && !ts.isFunctionDeclaration(p) && !ts.isMethodDeclaration(p)) continue;
      if (p.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) return true;
      const fnName = ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p) ? p.name?.getText(sf) ?? ''
        : ts.isVariableDeclaration(p.parent) ? p.parent.name.getText(sf)
          : ts.isPropertyAssignment(p.parent) ? p.parent.name.getText(sf) : '';
      if (/^(handle|on)[A-Z]/.test(fnName)) return true;
      const holder = p.parent;
      if (ts.isCallExpression(holder) && holder.arguments.includes(p as ts.Expression) && LATER.has(calleeName(holder))) return true;
      if (ts.isJsxExpression(holder) && ts.isJsxAttribute(holder.parent) && /^on[A-Z]/.test(holder.parent.name.getText(sf))) return true;
    }
    return false;
  };
  const visit = (n: ts.Node) => {
    if (isClockRead(n) && !inAnAct(n)) {
      out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text: n.getText(sf) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Calls of the words-from-a-time helpers, which only the clock may make. */
function wordsCallsOf(file: string, text: string): number {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let n = 0;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['timeAgo', 'timeUntil'].includes(node.expression.text)) n += 1;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

/** Where a screen is drawn: every component, and every hook a component calls. */
const drawn = files('appCode', { ext: ['.tsx', '.ts'] }).map(rel)
  .filter((f) => f.endsWith('.tsx') || f.startsWith('src/hooks/'))
  .filter((f) => f !== CLOCK);

const census: Record<string, Site[]> = {};
for (const f of drawn) {
  const sites = drawnReadsOf(f, readFileSync(join(ROOT, f), 'utf8'));
  if (sites.length) census[f] = sites;
}

describe('every drawn time reads the clock', () => {
  it('finds the time read at all (the scan has not gone blind)', () => {
    expect(drawn.length).toBeGreaterThan(250);
    expect(drawn).toContain('src/components/feed/ActivityCard.tsx');
  });

  it('reads the time where a screen is drawn only where the register says, as many times as it says', () => {
    const found = Object.fromEntries(Object.entries(census).map(([f, s]) => [f, s.length]));
    const want = Object.fromEntries(Object.entries(REGISTER).map(([f, { reads }]) => [f, reads]));
    expect(found).toEqual(want);
  });

  it('tells a drawn read from an act’s own moment', () => {
    const one = (src: string) => drawnReadsOf('probe.tsx', src).length;
    expect(one('function A() { const t = Date.now(); return <T>{t}</T>; }')).toBe(1);
    expect(one('function A() { return <T>{new Date().getFullYear()}</T>; }')).toBe(1);
    expect(one('function A() { const d = useMemo(() => localCalendarDate(), []); return d; }')).toBe(1);
    expect(one('function A() { const d = useMemo(() => getLocalDateString(-1), []); return d; }')).toBe(1);
    expect(one('function A() { const d = localCalendarDate(0, now); return d; }')).toBe(0);
    expect(one('function A() { useEffect(() => { stamp(Date.now()); }, []); }')).toBe(0);
    expect(one('function A() { return <P onPress={() => send(new Date())} />; }')).toBe(0);
    expect(one('function A() { const handleSave = () => save(Date.now()); }')).toBe(0);
    expect(one('function A() { const go = async () => save(Date.now()); }')).toBe(0);
    expect(one('function A() { const t = new Date(at); }')).toBe(0);
  });

  it('gives every registered read its reason', () => {
    for (const [file, { why }] of Object.entries(REGISTER)) expect([file, why.trim().length >= 20]).toEqual([file, true]);
  });

  it('timeAgo and timeUntil are called from the clock alone', () => {
    const callers = files('appCode', { ext: ['.tsx', '.ts'] }).map(rel)
      .filter((f) => f !== CLOCK && f !== WORDS)
      .filter((f) => wordsCallsOf(f, readFileSync(join(ROOT, f), 'utf8')) > 0);
    expect(callers).toEqual([]);
  });
});
