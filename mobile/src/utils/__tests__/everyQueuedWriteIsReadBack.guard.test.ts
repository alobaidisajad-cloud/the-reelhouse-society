/**
 * everyQueuedWriteIsReadBack.guard.test.ts — a write the queue still holds is read back by what draws it.
 * ─────────────────────────────────────────────────────────────────────────────
 * A write made offline waits in the queue. The screen showed it at once, but a page drawn again (a
 * change of department, sort or tab, a pull, a relaunch) is drawn from the house, which does not
 * have it yet: unless that page reads the queue, the write vanishes though it still waits, and the
 * member makes it twice. Round 5 found it at the Dispatch's filings and a stack's later films; each
 * was fixed at its one page.
 *
 * So every type of write this build queues (a `type:` handed to the queue, in any app file) must be
 * read back somewhere outside the queue's own machinery: a `.type === '…'`, a `case '…':`, a
 * `useUnsent('…')`, a `stillQueued('…')`, or a list of types the queue is filtered by. A type no page
 * draws is judged here, with its reason.
 */
import * as path from 'path';
import ts from 'typescript';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const AW = require('@/test-utils/afterAwait') as typeof import('@/test-utils/afterAwait');
const MOBILE = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');
const APP = universe('appCode', { ext: ['.ts', '.tsx'] }).map((f) => ({ file: rel(f), text: readCode(f) }));

/** The queue's own machinery: it stores, sends, retries and dedupes writes, and draws none. */
const MACHINERY = new Set([
  'src/utils/offlineQueue.ts', 'src/utils/mutationExecutor.ts', 'src/types/mutations.ts',
  'src/utils/queueOwnership.ts', 'src/utils/oneWritePerThing.ts', 'src/stores/offlineQueueStore.ts',
]);

/** Every type the queue can carry, from the union it is declared by. */
export function queueTypes(text: string): string[] {
  const sf = AW.parse('src/utils/offlineQueue.ts', text);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === 'QueuedMutation') {
      for (const m of n.members) {
        if (!ts.isPropertySignature(m) || m.name.getText(sf) !== 'type' || !m.type) continue;
        const lits = (t: ts.TypeNode): void => {
          if (ts.isUnionTypeNode(t)) t.types.forEach(lits);
          else if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) out.push(t.literal.text);
        };
        lits(m.type);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Calls that hand a write to the queue or let a sent one go: naming a type there is not reading it. */
const SENDS = /^(?:enqueueMutation|letSentGo)$/;
/** Calls where a name is something else (a report's context, a function or table of the house). */
const REPORTS = /^(?:captureError|addBreadcrumb|rpc|from|invoke)$/;
const callee = (c: ts.CallExpression, sf: ts.SourceFile) => c.expression.getText(sf).replace(/^.*\./, '');

/** Where a string literal naming a queue type stands: a write made (its `type:`), a report, or a read. */
function standing(lit: ts.StringLiteral, sf: ts.SourceFile): 'sent' | 'report' | 'read' {
  for (let a: ts.Node = lit.parent; a && !ts.isSourceFile(a); a = a.parent) {
    if (ts.isCallExpression(a) && REPORTS.test(callee(a, sf))) return 'report';
  }
  let n: ts.Node = lit;
  // Up through a choice between types (`text ? 'set_x' : 'remove_x'`) and brackets.
  while (ts.isConditionalExpression(n.parent) || ts.isParenthesizedExpression(n.parent)) {
    if (ts.isConditionalExpression(n.parent) && n.parent.condition === n) return 'read';
    n = n.parent;
  }
  const p = n.parent;
  if (ts.isPropertyAssignment(p) && p.initializer === n && p.name.getText(sf) === 'type') return 'sent';
  if (ts.isCallExpression(p) && SENDS.test(callee(p, sf))) return 'sent';
  return 'read';
}

/** Each queue type a file hands to the queue, and each it reads back, with the line. */
export function queueNames(file: string, text: string, types: Set<string>): { sent: Map<string, number>; read: Map<string, number> } {
  const sf = AW.parse(file, text);
  const sent = new Map<string, number>();
  const read = new Map<string, number>();
  const visit = (n: ts.Node) => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && types.has(n.text)) {
      const where = ts.isStringLiteral(n) ? standing(n, sf) : 'read';
      const into = where === 'sent' ? sent : where === 'read' ? read : null;
      if (into && !into.has(n.text)) into.set(n.text, AW.lineOf(sf, n));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { sent, read };
}

/**
 * The shared acts ledger (markCounts) reads a queued write as the mark it moves. For a mark (a
 * certification, a save, a vote, a note) that is what the page draws, and for an amendment, an end or
 * an answer the filing's mark keeps the filing as the member left it over an older read. For a write
 * that adds or takes away a row of its own (a critique), the mark is only the count of the filing's
 * or the log's critiques, and the row itself is drawn by nothing there.
 */
const LEDGER = 'src/stores/markCounts.ts';
const COUNT_KINDS = new Set(['filing', 'critique']);
const ADDS_OR_TAKES_A_ROW = /^(?:add|remove)_/;

/** The types the ledger reads only as a count of rows: an add or a removal whose mark is a count. */
export function countedOnly(text: string): Set<string> {
  const sf = AW.parse(LEDGER, text);
  const out = new Set<string>();
  const kindIn = (n: ts.Node): string | null => {
    let kind: string | null = null;
    const visit = (m: ts.Node) => {
      if (kind) return;
      if (ts.isCallExpression(m) && m.expression.getText(sf) === 'at' && m.arguments[0] && ts.isStringLiteral(m.arguments[0])) kind = m.arguments[0].text;
      else if (ts.isArrayLiteralExpression(m) && m.elements[0] && ts.isStringLiteral(m.elements[0])) kind = m.elements[0].text;
      else ts.forEachChild(m, visit);
    };
    visit(n);
    return kind;
  };
  const visit = (n: ts.Node) => {
    if (ts.isCaseBlock(n)) {
      let labels: string[] = [];
      for (const c of n.clauses) {
        if (ts.isCaseClause(c) && ts.isStringLiteral(c.expression) && ADDS_OR_TAKES_A_ROW.test(c.expression.text)) labels.push(c.expression.text);
        if (!c.statements.length) continue;
        const kind = kindIn(c);
        if (kind && COUNT_KINDS.has(kind)) labels.forEach((l) => out.add(l));
        labels = [];
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Each type the app queues that nothing outside the machinery reads back: `type (file:line of a send)`. */
export function unreadQueuedWrites(app: { file: string; text: string }[], types: string[]): string[] {
  const all = new Set(types);
  const sentAt = new Map<string, string>();
  const readBy = new Set<string>();
  const counted = countedOnly(app.find((f) => f.file === LEDGER)?.text ?? '');
  for (const { file, text } of app) {
    const { sent, read } = queueNames(file, text, all);
    for (const [t, line] of sent) if (!sentAt.has(t)) sentAt.set(t, `${file}:${line}`);
    if (MACHINERY.has(file)) continue;
    for (const t of read.keys()) if (!(file === LEDGER && counted.has(t))) readBy.add(t);
  }
  return [...sentAt].filter(([t]) => !readBy.has(t)).map(([t, at]) => `${t} (${at})`).sort();
}

const TYPES = queueTypes(APP.find((f) => f.file === 'src/utils/offlineQueue.ts')?.text ?? '');

/** A type the app queues that no page draws, so nothing reads it back: the type → why. */
const JUDGED: Record<string, string> = {
  // The rank the store sold is drawn from the store's own word (the tier hint laid at the purchase,
  // the store read again at each launch), never from this write, which only asks the house to read
  // the store, server to server.
  sync_entitlement: 'the rank is drawn from the store, not from the write that tells the house',
  // No page lists a member's reports. The one trace on the phone is the run's own list of what was
  // reported (a second report of it is answered as already made), and the house holds one pending
  // report per member per thing, so a second one kept after a relaunch is answered so when sent.
  submit_report: 'no page draws a report; the house holds one per member per thing',
};

describe('the finder', () => {
  it('reads every type from the queue’s own union', () => {
    expect(queueTypes(`export interface QueuedMutation { id: string; type: 'a_b' | 'c_d'
      | 'e_f'; payload: unknown }`)).toEqual(['a_b', 'c_d', 'e_f']);
  });

  it('says no to a type queued that nothing reads back, and yes to each way of reading one', () => {
    const types = ['add_x', 'set_y', 'remove_y', 'add_z', 'add_w', 'add_v', 'add_u'];
    const app = [
      { file: 'src/stores/planted.ts', text: `enqueueMutation({ type: 'add_x', payload: {} });
        enqueueMutation({ type: text ? 'set_y' : 'remove_y', payload: {} });
        const q = { type: 'add_z', payload: {} }; enqueueMutation(q);
        enqueueMutation({ type: 'add_w', payload: {} }); letSentGo('add_w', id);
        enqueueMutation({ type: 'add_v', payload: {} });
        captureError(e, { context: 'add_u' });` },
      { file: 'src/stores/reads.ts', text: `queue.filter((m) => m.type === 'set_y');
        switch (m.type) { case 'remove_y': break; }
        const waiting = useUnsent('add_z');
        captureError(e, { context: 'add_x' }); await supabase.rpc('add_v', {});` },
      // Read only by the machinery: not read back by any page.
      { file: 'src/utils/offlineQueue.ts', text: `if (m.type === 'add_v') return;` },
    ];
    expect(unreadQueuedWrites(app, types)).toEqual(['add_v (src/stores/planted.ts:5)', 'add_w (src/stores/planted.ts:4)', 'add_x (src/stores/planted.ts:1)']);
  });

  it('reads the acts ledger’s count of a row as no reader of the row, and its marks as readers', () => {
    expect([...countedOnly(`function markOf(m) { switch (m.type) {
      case 'certify_filing': return at('filingCertify', p.post_id);
      case 'update_filing':
      case 'add_critique':
      case 'remove_critique': return at('filing', p.post_id);
      case 'add_log_comment': return ['critique', p.log_id];
      case 'set_viewing_note': return at('note', p.viewing_id);
    } }`)].sort()).toEqual(['add_critique', 'add_log_comment', 'remove_critique']);
  });

  it('finds the instances it found, put back: a filing’s queued critique, a shelf entry, a salon withdrawal', () => {
    const typesUnread = (file: string, read: string) => unreadQueuedWrites(
      APP.map((f) => (f.file === file ? { ...f, text: f.text.split(read).join(`'x'`) } : f)), TYPES,
    ).map((h) => h.split(' ')[0]);
    expect(typesUnread('src/stores/dispatch.ts', `m.type === 'add_critique'`)).toContain('add_critique');
    expect(typesUnread('src/stores/domain/archiveSlice.ts', `q.type === 'add_archive'`)).toContain('add_archive');
    expect(typesUnread('src/stores/lounge.ts', `q.type === 'withdraw_lounge_message'`)).toContain('withdraw_lounge_message');
  });

  it('finds the instance it was made for, put back: the Dispatch’s queued filings read by nothing', () => {
    const putBack = APP.map((f) => ({ ...f, text: f.text.split(`'add_filing'`).join(f.file === 'src/stores/dispatch.ts' && f.text.includes(`type: 'add_filing'`) ? `'add_filing'` : `'x'`) }))
      .map((f) => (f.file === 'src/stores/dispatch.ts' ? { ...f, text: f.text.split(`m.type === 'add_filing'`).join(`m.type === 'x'`) } : f));
    expect(unreadQueuedWrites(putBack, TYPES).filter((h) => h.startsWith('add_filing '))).toHaveLength(1);
  });
});

describe('the whole app', () => {
  it('reads the app and the queue’s union, not an empty sweep', () => {
    expect(APP.length).toBeGreaterThan(400);
    expect(TYPES.length).toBeGreaterThan(40);
    expect(TYPES).toEqual(expect.arrayContaining(['add_filing', 'add_log', 'send_lounge_message']));
  });

  it('every write the app queues is read back by what draws it, or judged', () => {
    const hits = unreadQueuedWrites(APP, TYPES);
    expect(hits.filter((h) => !(h.slice(0, h.indexOf(' ')) in JUDGED))).toEqual([]);
    // Each judged type is still one the app queues and nothing reads back.
    for (const t of Object.keys(JUDGED)) expect([t, hits.some((h) => h.startsWith(`${t} `))]).toEqual([t, true]);
  });
});
