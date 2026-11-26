/**
 * aRecordIsFoundPastItsPages.guard.test.ts — a record is looked for past the pages the phone holds.
 * ─────────────────────────────────────────────────────────────────────────────
 * The house sends a member's records, stacks, filings and notices in pages (records fifty at a
 * time, stacks twenty, notices thirty, the Dispatch a page of filings). An editor that took its
 * record from those pages alone opened an older one on a blank form and sealed the blanks over it,
 * and a delete of one closed the sheet and deleted nothing (DATA-edit-sealed-over-an-unread-record).
 * Each was fixed where it was found; nothing asked it of the next place that looked a record up.
 *
 * So every look-up of one row in a held list the house pages (`.find(`, `.findIndex(`, `.findLast(`
 * over `logs`, `lists`, `filings` or `notifications`), anywhere in the app, is named in SITES by its
 * file and the function it sits in, with how a row past the pages is reached: the pieces of code it
 * falls to (the index of films logged, the filings opened by address, a read by id; each piece
 * must still be in the file), or why no row past the pages can be asked for there (the row was
 * drawn from that same list; the write goes by id whether or not it is held; the copy only puts a
 * card back). A look-up named nowhere fails, so the next one is judged the day it is written; a
 * name whose look-up has gone fails too.
 */
import * as path from 'path';
import ts from 'typescript';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const MOBILE = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');

/** The held lists the house sends in pages. */
const PAGED = new Set(['logs', 'lists', 'filings', 'notifications']);
const LOOKUPS = new Set(['find', 'findIndex', 'findLast']);

/** How a look-up reaches a row past the pages: the code it falls to, or why none is asked for. */
type Site =
  | { falls: string[]; why: string }
  | { judged: 'drawn' | 'by-id' | 'put-back'; why: string };

const SITES: Record<string, Site> = {
  'app/(modals)/list-modal.tsx#ListModal': { falls: ["'stack-to-amend'"], why: 'a stack to amend held in no page is read by its id, for its own curator' },
  'app/dispatch/[id].tsx#filing': { falls: ['opened[id]', 'hydrate(id)'], why: 'the filing page seeds from the page or the filings opened, and reads the filing by its id' },
  'app/dispatch/[id].tsx#FilingReader': { falls: ['opened[id]', 'hydrate(id)'], why: 'the marks drawn from the store\'s copies, the filing itself read by its id' },
  'app/stacks/[id].tsx#queryFn': { falls: ['getStackFullPayload(id)'], why: 'the stack is read by its id; the held copy is only the offline fallback when that read fails' },
  'app/stacks/[id].tsx#placeholderData': { falls: ['getStackFullPayload(id)'], why: 'the held copy is drawn only while the read by id is on its way' },
  'src/components/dispatch/ComposeDesks.tsx#held': { falls: ['hydrate(editId)', 'isMineToAmend'], why: 'an amend held in no page and no filing opened is read by its id; the desk is shut until it is in hand' },
  'src/hooks/useLogFlow.ts#toggleList': { judged: 'drawn', why: 'the stacks the sheet offers are this same list: a stack tapped is one held' },
  'src/stores/dispatch.ts#heldFiling': { falls: ['st.opened[id]'], why: 'every read of a filing by its id fills opened' },
  'src/stores/dispatch.ts#save': { judged: 'put-back', why: 'the save is written by id; the held copy only puts the card back on the saved page if the house refuses' },
  'src/stores/domain/listSlice.ts#updateList': { judged: 'by-id', why: 'the change is written by id; the held copy gives only the time it was read, which the caller passes when it read the stack itself' },
  'src/stores/domain/listSlice.ts#deleteList': { judged: 'by-id', why: 'the house deletes the stack by id whether or not it is held; the held copy is only put back on a refusal' },
  'src/stores/domain/listSlice.ts#addFilmToList': { judged: 'drawn', why: 'called only from the sheet offering this same list (useLogFlow toggleList)' },
  'src/stores/domain/listSlice.ts#removeFilmFromList': { judged: 'drawn', why: 'called only from the sheet offering this same list (useLogFlow toggleList)' },
  'src/stores/domain/logSlice/helpers/logOperations.ts#heldLog': { falls: ['Object.values(state._loggedIndex).find((l) => l?.id === id && !l.light)'], why: 'a record past the pages is found in the index of films logged (never its light copy); its editor reads one held in neither by its id' },
  'src/stores/films.ts#findRecordsFilmBy': { falls: ['Object.values(_loggedIndex).find((l) => l?.id === logId)'], why: 'a record past the pages names its film in the index of films logged, whose light copy is enough' },
  'src/stores/notificationStore.ts#getNotice': { falls: [".eq('id', id)"], why: 'a notice past the pages is read alone by its id' },
  'src/utils/letTheRecordGo.ts#letTheRecordGo': { falls: ['Object.values(_loggedIndex).find((l) => l?.id === id)'], why: 'a record gone is taken off the pages and the index of films logged both' },
};

/** The name of the function a node sits in: its own name, its variable's, its property's, or its caller's. */
function enclosingName(n: ts.Node): string {
  for (let p = n.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) return p.name.getText();
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p)) {
      let q: ts.Node = p.parent;
      // useMemo(() => …), useState(() => …): named by the variable they fill.
      if (ts.isCallExpression(q) && /^use(Memo|Callback|State)$/.test(q.expression.getText())) q = q.parent;
      if (ts.isVariableDeclaration(q)) {
        const b = q.name;
        if (ts.isArrayBindingPattern(b)) { const first = b.elements[0]; if (first && ts.isBindingElement(first)) return first.name.getText(); }
        return b.getText();
      }
      if (ts.isPropertyAssignment(q)) return q.name.getText();
      if (ts.isCallExpression(q)) return q.expression.getText().replace(/^.*\./, '');
    }
  }
  return '(top)';
}

/** Every look-up of one row in a paged list in a file, by `file#function` (`#2` for a second). */
export function lookupsIn(file: string, code: string): string[] {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const seen = new Map<string, number>();
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && LOOKUPS.has(n.expression.name.text)) {
      let recv: ts.Expression = n.expression.expression;
      while (ts.isNonNullExpression(recv) || ts.isParenthesizedExpression(recv)) recv = recv.expression;
      const last = ts.isPropertyAccessExpression(recv) ? recv.name.text : ts.isIdentifier(recv) ? recv.text : null;
      if (last && PAGED.has(last)) {
        const k = `${file}#${enclosingName(n)}`;
        const c = (seen.get(k) ?? 0) + 1;
        seen.set(k, c);
        if (c === 1) out.push(k);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Each fault: a look-up named nowhere, a way past the pages its file no longer holds, a name gone. */
export function lookupFaults(found: { key: string; code: string }[], sites: Record<string, Site>): string[] {
  const faults: string[] = [];
  const keys = new Set(found.map((f) => f.key));
  for (const { key, code } of found) {
    const s = sites[key];
    if (!s) { faults.push(`${key}: looks up a row in a paged list, and no one has said how a row past the pages is reached`); continue; }
    if ('falls' in s) for (const piece of s.falls) if (!code.includes(piece)) faults.push(`${key}: falls to ${piece}, which its file no longer holds`);
  }
  for (const k of Object.keys(sites)) if (!keys.has(k)) faults.push(`${k}: named, but no such look-up is in the app`);
  return faults;
}

const APP = universe('appCode', { ext: ['.ts', '.tsx'] }).flatMap((f) => {
  const file = rel(f);
  const code = readCode(f);
  return /\.find(Index|Last)?\(/.test(code) ? lookupsIn(file, code).map((key) => ({ key, code })) : [];
});

describe('the rule says no to its planted shapes', () => {
  const unmark = 'export const unmarkOp = async (get) => { const l = get().logs.find((x) => x.filmId === filmId); if (!l) return; await get().removeLog(l.id); };';
  const edit = 'export function useDesk(id) { const held = useMemo(() => useDispatch.getState().filings.find((f) => f.id === id) ?? null, [id]); return held; }';

  it('to a look-up named nowhere, one whose way past the pages has gone, and a name gone', () => {
    const found = [
      ...lookupsIn('src/a.ts', unmark).map((key) => ({ key, code: unmark })),
      ...lookupsIn('src/b.tsx', edit).map((key) => ({ key, code: edit })),
    ];
    expect(found.map((f) => f.key)).toEqual(['src/a.ts#unmarkOp', 'src/b.tsx#held']);
    expect(lookupFaults(found, {
      'src/b.tsx#held': { falls: ['hydrate(id)'], why: 'read by id' },
      'src/gone.ts#heldLog': { falls: ['_loggedIndex'], why: 'the index' },
    })).toEqual([
      'src/a.ts#unmarkOp: looks up a row in a paged list, and no one has said how a row past the pages is reached',
      'src/b.tsx#held: falls to hydrate(id), which its file no longer holds',
      'src/gone.ts#heldLog: named, but no such look-up is in the app',
    ]);
  });

  it('and passes one that falls to a read by id, and one judged', () => {
    const reads = `${edit} void useDispatch.getState().hydrate(id);`;
    const found = [
      ...lookupsIn('src/a.ts', unmark).map((key) => ({ key, code: unmark })),
      ...lookupsIn('src/b.tsx', reads).map((key) => ({ key, code: reads })),
    ];
    expect(lookupFaults(found, {
      'src/a.ts#unmarkOp': { judged: 'drawn', why: 'planted' },
      'src/b.tsx#held': { falls: ['hydrate(id)'], why: 'read by id' },
    })).toEqual([]);
  });

  it('reads a look-up past a non-null mark, a findIndex, and a list named by itself', () => {
    const code = 'function a(s) { s.lists!.findIndex((l) => l.id === x); } function b(notifications) { return notifications.findLast((n) => n.id === y); }';
    expect(lookupsIn('src/c.ts', code)).toEqual(['src/c.ts#a', 'src/c.ts#b']);
  });
});

describe('every look-up of a row in a paged list, in the whole app', () => {
  it('is read', () => {
    expect(APP.length).toBeGreaterThan(10);
    expect(APP.some((f) => f.key === 'src/stores/domain/logSlice/helpers/logOperations.ts#heldLog')).toBe(true);
  });

  it('reaches a row past the pages, or says why none is asked for', () => {
    expect(lookupFaults(APP, SITES)).toEqual([]);
  });
});
