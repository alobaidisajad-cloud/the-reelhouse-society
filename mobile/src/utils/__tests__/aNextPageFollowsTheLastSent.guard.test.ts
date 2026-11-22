/**
 * aNextPageFollowsTheLastSent.guard.test.ts — a next page is asked from where the last one ended,
 * judged by what the house sent, and says when it could not be read.
 * ─────────────────────────────────────────────────────────────────────────────
 * Three kinds of mistake of the review rounds, each found at its one list and fixed there:
 *   1. a page number stepped back (the Darkroom's batch that failed set its page to the one before,
 *      so asking again read a batch already drawn, until page 1 laid the kept prints over the sheet);
 *   2. a page judged by the rows the phone kept, not those the house sent (a full Reel page with one
 *      row dropped as malformed read as short, the last, and the Reel said "The End" over logs still
 *      to come);
 *   3. a later page that failed said nothing (a film's Archive ended as though whole, and every
 *      scroll asked again).
 * So the whole app is read, with TypeScript's parser, for each shape. Each rule is shown failing on
 * planted code first, and on the instance it was found at, put back.
 */
import * as path from 'path';
import ts from 'typescript';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const AW = require('@/test-utils/afterAwait') as typeof import('@/test-utils/afterAwait');
const MOBILE = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');
const APP = universe('appCode', { ext: ['.ts', '.tsx'] }).map((f) => ({ file: rel(f), text: readCode(f) }));

/** A page's number, by name: `page`, `nextPage`, `pageRef`, `setPage`. */
const PAGE_NAME = /page/i;
/** A page's size, by name: `PAGE_SIZE`, `FEED_PAGE`, `fetchLimit`, `pageSize`, `ITEM_PAGE`. */
const PAGE_SIZE = /^(?:\w*_)?(?:PAGE|LIMIT|BATCH)(?:_\w*)?$|^(?:page|fetch|batch)(?:Size|Limit)$|^limit$/;
/** A list made by dropping some of what was sent: a filter, a parse, a flatMap. */
const DROPS_ROWS = /\.(?:filter|flatMap)\(|\b(?:safeParse|parse\w*)\(/;

/** Rule 1: each place a page number is moved back. */
export function pagesSteppedBack(file: string, text: string): string[] {
  const sf = AW.parse(file, text);
  const out: string[] = [];
  const subtracts = (e: ts.Node): boolean => {
    let found = false;
    const visit = (n: ts.Node) => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.MinusToken && PAGE_NAME.test(n.left.getText(sf))) found = true;
      ts.forEachChild(n, visit);
    };
    visit(e);
    return found;
  };
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && /^set\w*Page$/i.test(n.expression.getText(sf).replace(/^.*\./, '')) && n.arguments.some(subtracts)) out.push(`${file}:${AW.lineOf(sf, n)}`);
    if (ts.isBinaryExpression(n) && PAGE_NAME.test(n.left.getText(sf))
      && (n.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken || (n.operatorToken.kind === ts.SyntaxKind.EqualsToken && subtracts(n.right)))) out.push(`${file}:${AW.lineOf(sf, n)}`);
    if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && n.operator === ts.SyntaxKind.MinusMinusToken && PAGE_NAME.test(n.operand.getText(sf))) out.push(`${file}:${AW.lineOf(sf, n)}`);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Rule 2: each page judged full or short by a list the phone made by dropping rows. */
export function pagesJudgedByRowsKept(file: string, text: string): string[] {
  const sf = AW.parse(file, text);
  // Every name the file takes into a const or let, with what it was made from.
  const made = new Map<string, string>();
  const scan = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) made.set(n.name.text, n.initializer.getText(sf));
    ts.forEachChild(n, scan);
  };
  scan(sf);
  const COMPARES = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.LessThanToken,
    ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken]);
  const lengthOf = (e: ts.Expression) => (ts.isPropertyAccessExpression(e) && e.name.text === 'length' ? e.expression : null);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isBinaryExpression(n) && COMPARES.has(n.operatorToken.kind)) {
      for (const [a, b] of [[n.left, n.right], [n.right, n.left]] as const) {
        const list = lengthOf(a);
        if (!list || !PAGE_SIZE.test(b.getText(sf).replace(/^.*\./, ''))) continue;
        const from = ts.isIdentifier(list) ? made.get(list.text) ?? '' : list.getText(sf);
        if (DROPS_ROWS.test(from)) out.push(`${file}:${AW.lineOf(sf, n)}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** What says a later page could not be read: a failure state of the list's own, or the query's. */
const SAYS_A_LATER_PAGE_FAILED = /\b(?:\w*MoreFailed|moreFailed\w*|isFetchNextPageError|\w*NextFailed)\b/;

/** Rule 3: each list that asks its next page as it is scrolled, and draws nothing when it fails. */
export function laterPagesUnsaid(file: string, text: string): string[] {
  return /\bonEndReached=/.test(text) && !SAYS_A_LATER_PAGE_FAILED.test(text) ? [file] : [];
}

/** A list handed its foot by the screen that says the failure: the list → the screen. */
const SAID_BY: Record<string, string> = {
  'src/components/reels/ReelsFeedList.tsx': 'app/(tabs)/reels.tsx',
  'src/components/reels/ReelsStackList.tsx': 'app/(tabs)/reels.tsx',
};

/** Found by this sweep and not yet fixed. The list only shrinks, and is empty. */
const STILL_TO_FIX: string[] = [];

describe('each rule says no to its planted shape', () => {
  it('1: a page number stepped back, by a setter, an assignment or a decrement', () => {
    expect(pagesSteppedBack('app/planted.tsx', `function f(page) {
      useDiscoverStore.getState().setPage(page - 1);
      pageRef.current = pageRef.current - 1;
      nextPage--;
      setPage((p) => p + 1); page = page + 1;
    }`)).toEqual(['app/planted.tsx:2', 'app/planted.tsx:3', 'app/planted.tsx:4']);
  });

  it('2: a page judged by rows kept after a filter or a parse; never by the rows sent', () => {
    expect(pagesJudgedByRowsKept('src/services/planted.ts', `async function page() {
      const { data } = await ask();
      const items = parseLogRows(data);
      const kept = data.filter(ok);
      const a = items.length === PAGE_SIZE;
      const b = kept.length < fetchLimit;
      const c = data.length === PAGE_SIZE;
      const d = items.length > MIN_GROUP_SIZE;
    }`)).toEqual(['src/services/planted.ts:5', 'src/services/planted.ts:6']);
  });

  it('3: a list that asks its next page as it scrolls, with no failure said', () => {
    expect(laterPagesUnsaid('app/planted.tsx', '<FlashList onEndReached={more} />')).toEqual(['app/planted.tsx']);
    expect(laterPagesUnsaid('app/planted.tsx', '<FlashList onEndReached={more} ListFooterComponent={moreFailed ? <MoreFailed /> : null} />')).toEqual([]);
  });

  it('finds the instances it was made for, put back', () => {
    expect(pagesSteppedBack('app/(tabs)/darkroom.tsx', 'if (active && reqId === fetchRequestId.current && page > 1) { useDiscoverStore.getState().setPage(page - 1); }'))
      .toEqual(['app/(tabs)/darkroom.tsx:1']);
    expect(pagesJudgedByRowsKept('src/services/FeedService.ts', 'const items = rows.flatMap(parseRow); return { items, hasMore: items.length === FEED_PAGE };'))
      .toEqual(['src/services/FeedService.ts:1']);
    // A stack's films past its first page: a failed page was logged alone.
    expect(laterPagesUnsaid('app/stacks/[id].tsx', `try { await StackService.getStackItemsPage(id, last); } catch (e) { logger.warn('[stacks] reading more films failed', e); }
      <CinematicFlashList onEndReached={() => { void readMoreFilms(); }} />`)).toEqual(['app/stacks/[id].tsx']);
  });
});

describe('the whole app', () => {
  it('reads the app, not an empty sweep', () => {
    expect(APP.length).toBeGreaterThan(400);
    expect(APP.filter((f) => /\bonEndReached=/.test(f.text)).length).toBeGreaterThan(10);
  });

  it('1: no page number steps back', () => {
    expect(APP.flatMap((f) => pagesSteppedBack(f.file, f.text))).toEqual([]);
  });

  it('2: every page is judged by the rows the house sent', () => {
    expect(APP.flatMap((f) => pagesJudgedByRowsKept(f.file, f.text))).toEqual([]);
  });

  it('3: every list that asks its next page says when it could not be read', () => {
    const hits = APP.flatMap((f) => laterPagesUnsaid(f.file, f.text));
    expect(hits.filter((h) => !(h in SAID_BY) && !STILL_TO_FIX.includes(h))).toEqual([]);
    for (const k of STILL_TO_FIX) expect([k, hits.includes(k)]).toEqual([k, true]);
    // Each list named is still one that asks, and the screen named says it.
    for (const [list, screen] of Object.entries(SAID_BY)) {
      expect([list, hits.includes(list)]).toEqual([list, true]);
      expect([screen, SAYS_A_LATER_PAGE_FAILED.test(APP.find((f) => f.file === screen)?.text ?? '')]).toEqual([screen, true]);
    }
  });
});
