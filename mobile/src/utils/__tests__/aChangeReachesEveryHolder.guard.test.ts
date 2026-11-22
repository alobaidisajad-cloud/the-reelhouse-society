/**
 * aChangeReachesEveryHolder.guard.test.ts — a change to a row reaches every copy of it the phone holds.
 * ─────────────────────────────────────────────────────────────────────────────
 * Twenty-one findings of review rounds 8 to 14 were one mechanism: the same row is held in many
 * places (a screen's own list, a store, a query's cache, another member's phone), and a change made
 * by the member, by the queue, by another member or by the house reached only the copies its writer
 * happened to tell. A filing withdrawn in the reader stayed on the room it was opened from; a queued
 * edit, once sent, left the page drawing the phone's guess; a case judged stayed on the docket.
 *
 * So the whole app, and the house as production will hold it, is read for three shapes:
 *   1. every list a screen or hook keeps of its own (a useState of an array, a reducer's state) is
 *      named in HOLDERS with how it follows a change: the code it follows by (each named piece must be
 *      in its file), the query whose answer it mirrors, or why it holds no row the house changes (a
 *      draft, a sheet read as it opens, the film catalogue, a figure worked out from another list);
 *   2. every write the queue sends does, once the house has it, what its online twin does once
 *      answered: each change signal the online act calls after its wait (wallMayHaveChanged and its
 *      kin) and each query it reads again or lays the answer in, the executor calls too, for that
 *      type, or the difference is named in QUEUED_DIFFERS with why;
 *   3. every table whose rows the house or the app ends (deletes, withholds, withdraws, empties) is
 *      named in ENDED with how another phone holding a row of it learns: the realtime channel (the
 *      table published, and the app listening for that event), the read again that finds it gone
 *      (named in its file), or why only its own member, or the house, ever holds a row of it.
 * Each rule is shown failing on planted code first.
 */
import * as path from 'path';
import ts from 'typescript';
import { readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';
import { codeOf, houseFunctions } from '@/test-utils/houseFunctions';
import { PENDING_SQL, SNAPSHOT_SQL } from '@/test-utils/schema';

const MOBILE = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');
const APP = universe('appCode', { ext: ['.ts', '.tsx'] }).map((f) => ({ file: rel(f), code: readCode(f) }));
const sourceOf = (file: string, code: string) =>
  ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

// ── 1. THE LISTS A SCREEN KEEPS ───────────────────────────────────────────────────────────────

/** How a kept list follows a change: by the code named, as a mirror of a query's answer, or judged. */
type Holder =
  | { follows: string[]; why: string }
  | { mirrors: string; why: string }
  | { judged: 'draft' | 'sheet' | 'catalogue' | 'derived' | 'search'; why: string };

const HOLDERS: Record<string, Holder> = {
  'app/(admin)/tribunal.tsx#priorityItems': { mirrors: 'priorityData', why: 'the priority docket\'s first page, laid again by every read of its query, which every verdict, dismissal, hearing and lift reads again' },
  'app/(admin)/tribunal.tsx#pendingItems': { mirrors: 'pendingPage.rows', why: 'the pending docket\'s first page, laid again by every read of its query' },
  'app/(admin)/tribunal.tsx#recordPages': { judged: 'derived', why: 'pages of member ids, the keys of the record queries; the records themselves are those queries\', read again by rereadRecord' },
  'app/(modals)/list-modal.tsx#films': { judged: 'draft', why: 'the films of a stack being written, the member\'s draft until it is saved' },
  'app/(modals)/social-modal.tsx#profiles': { judged: 'sheet', why: 'a circle, read as the sheet opens; nothing in the sheet changes a circle, and it is dismissed before any room it opens' },
  'app/(modals)/social-modal.tsx#lounges': { judged: 'sheet', why: 'the member\'s salons to share to, read as the sheet opens; it is dismissed before any room it opens' },
  'app/dispatch/series/[id].tsx#asRead': { follows: ['useAsTheHouseNowHolds', 'givenAgain'], why: 'a series\' parts, drawn through the member\'s acts and the filings found gone on this phone' },
  'app/film-reviews/[id].tsx#logs': { follows: ['hearRecordsChanged', 'useFocusEffect'], why: 'a film\'s records: one withdrawn leaves at once, one filed or amended is read again on return' },
  'app/lounge/[id].tsx#members': { follows: ['rereadRoom', 'AppState', 'useReadAgainWhenToldHere'], why: 'a salon\'s roster, read again with the room on return to the app, on a notice about it, and after a refused act' },
  'src/components/admin/AppealsDocket.tsx#items': { mirrors: 'firstPage', why: 'the appeals\' first page, laid again by every read of its query' },
  'src/components/admin/SanctionsList.tsx#items': { mirrors: 'firstPage', why: 'the sanctions\' first page, laid again by every read of its query' },
  'src/components/darkroom/DarkroomHeader.tsx#suggestions': { judged: 'catalogue', why: 'films from the catalogue (TMDB), no row of the house' },
  'src/components/dispatch/ComposeDesks.tsx#slots': { judged: 'draft', why: 'the films of a filing being written, the member\'s draft' },
  'src/components/dispatch/SeriesPicker.tsx#begun': { judged: 'sheet', why: 'the member\'s own series begun, read as the compose desk opens it; nothing else files while the desk is open' },
  'src/components/moderation/VerdictRecord.tsx#items': { mirrors: 'firstPage', why: 'the member\'s verdicts\' first page, laid again by every read of its query' },
  'src/components/profile/profileComputed.ts#heldFormats': { judged: 'derived', why: 'the formats of the shelf page last read whole, kept while a format narrows it' },
  'src/components/profile/profileComputed.ts#heldDecades': { judged: 'derived', why: 'the decades of the watchlist page last read whole, kept while a decade narrows it' },
  'src/hooks/useDispatchArchive.ts#matches': { judged: 'search', why: 'films matching the words typed, asked again with every term' },
  'src/hooks/useDispatchArchive.ts#filings': { follows: ['useAsTheHouseNowHolds', 'givenAgain', 'critiquedAtFetch'], why: 'a film\'s filings, drawn through the member\'s acts, critiques and the filings found gone on this phone' },
  'src/hooks/useFollowRequests.ts#items': { judged: 'sheet', why: 'the requests at the door, read every time the panel opens, answered only inside it' },
  'src/hooks/useLogFlow.ts#availablePosters': { judged: 'catalogue', why: 'a film\'s posters from the catalogue (TMDB)' },
  'src/hooks/useLogFlow.ts#availableBackdrops': { judged: 'catalogue', why: 'a film\'s stills from the catalogue (TMDB)' },
  'src/hooks/useMemberRoom.ts#filings': { follows: ['useAsTheHouseNowHolds', 'givenAgain', 'critiquedAtFetch'], why: 'a member\'s filings, drawn through the member\'s acts, critiques and the filings found gone on this phone' },
  'src/hooks/useProfileData.ts#state': { follows: ['hearRecordsChanged'], why: 'a file\'s lists: the member\'s own hears every change to their records, the queue\'s deliveries too; another member\'s is read as it opens and on a pull' },
};

/** Whether a type is an array (T[], Array<T>, readonly T[]) or a union holding one. */
const isArrayType = (t: ts.TypeNode): boolean =>
  ts.isArrayTypeNode(t)
  || (ts.isTypeReferenceNode(t) && /^(Readonly)?Array$/.test(t.typeName.getText()))
  || (ts.isTypeOperatorNode(t) && isArrayType(t.type))
  || (ts.isParenthesizedTypeNode(t) && isArrayType(t.type));

/** Whether a first value is a list: `[]`, `[…]`, or a function returning one. */
const isArrayValue = (e: ts.Expression | undefined): boolean =>
  !!e && (ts.isArrayLiteralExpression(e) || (ts.isArrowFunction(e) && ts.isArrayLiteralExpression(e.body)));

/** Each kept list of a file: `file#name`, and the setter its writes go through. */
export function keptLists(file: string, code: string): { key: string; setter: string }[] {
  const out: { key: string; setter: string }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isArrayBindingPattern(n.name) && n.initializer && ts.isCallExpression(n.initializer)) {
      const call = n.initializer;
      const callee = call.expression.getText();
      const [first, second] = n.name.elements.map((e) => (ts.isBindingElement(e) ? e.name.getText() : ''));
      const typed = call.typeArguments?.[0];
      const list = callee === 'useState' && ((typed && isArrayType(typed)) || isArrayValue(call.arguments[0]));
      // A reducer's state: kept like a list unless it starts as a plain number, a count to redraw by.
      const reduced = callee === 'useReducer' && call.arguments[1] !== undefined && !ts.isNumericLiteral(call.arguments[1]);
      if ((list || reduced) && first) out.push({ key: `${file}#${first}`, setter: second ?? '' });
    }
    ts.forEachChild(n, visit);
  };
  visit(sourceOf(file, code));
  return out;
}

/** What is wrong with the kept lists of these files, against these holders. */
export function holderFaults(sources: { file: string; code: string }[], holders: Record<string, Holder>): string[] {
  const faults: string[] = [];
  const seen = new Set<string>();
  for (const { file, code } of sources) {
    for (const { key, setter } of keptLists(file, code)) {
      seen.add(key);
      const h = holders[key];
      if (!h) { faults.push(`${key}: a kept list named nowhere: say how it follows a change, or why it holds no row the house changes`); continue; }
      if ('follows' in h) for (const piece of h.follows) if (!code.includes(piece)) faults.push(`${key}: follows by ${piece}, which ${file} no longer holds`);
      if ('mirrors' in h && !code.includes(`${setter}(${h.mirrors}`)) faults.push(`${key}: mirrors ${h.mirrors}, but ${setter} is never handed it`);
    }
  }
  for (const key of Object.keys(holders)) if (!seen.has(key)) faults.push(`${key}: named, but no such kept list`);
  return faults;
}

// ── 2. A QUEUED WRITE AND ITS ONLINE TWIN ────────────────────────────────────────────────────

/** The signals that tell what holds a thing that it changed. */
const SIGNALS = new Set(['wallMayHaveChanged', 'reelMayHaveChanged', 'recordsMayHaveChanged', 'forgetGoneStack', 'letGoOfGoneStack']);
/** forgetGoneStack and the executor's letGoOfGoneStack are one act on two sides. */
const SAME: Record<string, string> = { letGoOfGoneStack: 'forgetGoneStack' };
const CACHE = new Set(['invalidateQueries', 'refetchQueries', 'resetQueries', 'setQueryData', 'setQueriesData']);

/** The effects a piece of code calls: each signal by name, each query touched by its key's first word. */
function effectsIn(node: ts.Node, scope: string): Set<string> {
  const out = new Set<string>();
  const keyOf = (arg: ts.Expression | undefined): string | null => {
    if (!arg) return null;
    let e: ts.Expression | undefined = arg;
    if (ts.isObjectLiteralExpression(e)) {
      const p = e.properties.find((x) => ts.isPropertyAssignment(x) && x.name.getText() === 'queryKey');
      e = p && ts.isPropertyAssignment(p) ? p.initializer : undefined;
    }
    if (!e) return null;
    let text = e.getText();
    // A key held in a name: the array that name is made from in the same act.
    if (ts.isIdentifier(e)) text = scope.match(new RegExp(`\\b${e.text}\\s*=\\s*(\\[[^\\]]*\\])`))?.[1] ?? text;
    return text.match(/^\[\s*'([A-Za-z_]+)'/)?.[1] ?? null;
  };
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
      if (SIGNALS.has(name)) out.add(SAME[name] ?? name);
      if (CACHE.has(name)) { const k = keyOf(n.arguments[0]); if (k) out.add(`query ${k}`); }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

/** What an online act does once the house answered: the effects after its first wait, outside every catch. */
function answeredEffects(fn: ts.FunctionLikeDeclaration): Set<string> {
  let first = -1;
  const findWait = (n: ts.Node) => {
    if (first >= 0) return;
    if (ts.isAwaitExpression(n)) first = n.getStart();
    else if (!(ts.isFunctionLike(n) && n !== fn)) ts.forEachChild(n, findWait);
  };
  ts.forEachChild(fn, findWait);
  const out = new Set<string>();
  if (first < 0) return out;
  const scope = fn.getText();
  const visit = (n: ts.Node) => {
    if (ts.isCatchClause(n)) return;
    if (ts.isCallExpression(n) && n.getStart() > first) for (const e of effectsIn(n, scope)) out.add(e);
    else ts.forEachChild(n, visit);
  };
  ts.forEachChild(fn, visit);
  return out;
}

const isAsync = (n: ts.Node) => (ts.canHaveModifiers(n) ? ts.getModifiers(n) ?? [] : []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
const functionOf = (n: ts.Node): ts.FunctionLikeDeclaration | undefined => {
  let p = n.parent;
  while (p && !ts.isFunctionLike(p)) p = p.parent;
  return p as ts.FunctionLikeDeclaration | undefined;
};

/** The queue's own list of types. */
const QUEUE_TYPES = (() => {
  const queue = readCode('src/utils/offlineQueue.ts');
  const start = queue.indexOf('type:');
  return new Set([...queue.slice(start, queue.indexOf(';', start)).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!));
})();

/** Each place a write is queued: its types, and what the act it sits in does once the house answered. */
export function onlineTwins(sources: { file: string; code: string }[]): { where: string; type: string; effects: Set<string> }[] {
  const out: { where: string; type: string; effects: Set<string> }[] = [];
  for (const { file, code } of sources) {
    if (!code.includes('enqueueMutation(') || /offlineQueue\.ts$|mutationExecutor\.ts$/.test(file)) continue;
    const sf = sourceOf(file, code);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'enqueueMutation') {
        // The act: the nearest function that waits for the house, past the callbacks inside it.
        let fn = functionOf(n);
        while (fn && !isAsync(fn)) fn = functionOf(fn);
        const types = [...new Set([...n.arguments.map((a) => a.getText()).join(',').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!))].filter((t) => QUEUE_TYPES.has(t));
        const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
        const effects = fn ? answeredEffects(fn) : new Set<string>();
        for (const type of types) out.push({ where: `${file}:${line}`, type, effects });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

/** What the executor does once the house has each type: its handler's own effects, and its tables'. */
export function queuedEffects(code: string): Map<string, Set<string>> {
  const sf = sourceOf('mutationExecutor.ts', code);
  const tables = new Map<string, Map<string, string[]>>();
  const out = new Map<string, Set<string>>();
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const name = n.name.getText();
      const init = n.initializer;
      if (name === 'handlers' && ts.isObjectLiteralExpression(init)) {
        for (const p of init.properties) {
          if (ts.isPropertyAssignment(p)) out.set(p.name.getText(), effectsIn(p.initializer, code));
        }
      }
      // A set of types (CHANGES_THE_WALL): what every member of it calls in executeMutation.
      if (ts.isNewExpression(init) && /Set$/.test(init.expression.getText())) {
        const types = [...(init.arguments?.[0]?.getText() ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
        tables.set(name, new Map(types.map((t) => [t, []])));
      }
      // A table of types to the query each reads again (READ_AGAIN_ONCE_SENT).
      if (ts.isObjectLiteralExpression(init) && name !== 'handlers') {
        const each = new Map<string, string[]>();
        for (const p of init.properties) {
          const key = p.getText().match(/\[\s*'([A-Za-z_]+)'/)?.[1];
          if (ts.isPropertyAssignment(p) && key) each.set(p.name.getText(), [`query ${key}`]);
        }
        if (each.size) tables.set(name, each);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // How executeMutation uses each table: the effects named in the statement that asks it.
  const run = code.slice(code.indexOf('export async function executeMutation'));
  for (const [name, members] of tables) {
    const at = run.indexOf(name);
    if (at < 0) continue;
    const use = run.slice(at, run.indexOf('\n', run.indexOf(';', at)) + 1) + run.slice(run.indexOf(';', at), run.indexOf(';', run.indexOf(';', at) + 1));
    const effects = [...SIGNALS].filter((s) => use.includes(`${s}(`));
    if (/invalidateQueries\(\{ queryKey: \['film'/.test(use)) effects.push('query film');
    for (const [type, own] of members) {
      const set = out.get(type) ?? new Set<string>();
      for (const e of [...effects, ...own]) set.add(SAME[e] ?? e);
      out.set(type, set);
    }
  }
  return out;
}

/** An online act's effect the queued send does not repeat, named with why it need not. */
const QUEUED_DIFFERS: Record<string, string> = {};

export function twinFaults(
  twins: { where: string; type: string; effects: Set<string> }[],
  queued: Map<string, Set<string>>,
  differs: Record<string, string>,
): string[] {
  const faults: string[] = [];
  const used = new Set<string>();
  for (const t of twins) {
    const sent = queued.get(t.type);
    if (!sent) { faults.push(`${t.where}: queues ${t.type}, which the executor has no handler for`); continue; }
    for (const e of t.effects) {
      if (sent.has(e)) continue;
      const k = `${t.type}: ${e}`;
      if (differs[k]) { used.add(k); continue; }
      faults.push(`${t.where}: ${t.type} online does "${e}" once answered; the queued send does not`);
    }
  }
  for (const k of Object.keys(differs)) if (!used.has(k)) faults.push(`${k}: named as a difference no online act holds`);
  return faults;
}

// ── 3. THE ROWS THE HOUSE ENDS ────────────────────────────────────────────────────────────────

/** How another phone holding a row learns it ended. */
type Ended =
  | { channel: 'UPDATE' | 'DELETE' | 'INSERT' | '*'; in: string; why: string }
  | { reread: string; in: string; why: string }
  | { own: string };

const ENDED: Record<string, Ended> = {
  lounge_messages: { channel: 'UPDATE', in: 'src/stores/lounge.ts', why: 'a withdrawal or a removal is heard live in the open room, and a kept room reads its words again on return' },
  lounge_members: { reread: 'rereadRoom', in: 'app/lounge/[id].tsx', why: 'a seat taken away or declined is read with the room on return to the app, on a notice, and after a refused act' },
  lounges: { reread: 'rereadRoom', in: 'app/lounge/[id].tsx', why: 'a salon dissolved draws its Signal Lost page once its room is read again' },
  notifications: { channel: '*', in: 'src/stores/notificationStore.ts', why: 'a notice taken back is told on the member\'s own topic, and the board hears its table' },
  dispatch_posts: { reread: 'gone: { ...st.gone', in: 'src/stores/dispatch.ts', why: 'the reader reads each filing as it opens; one the house no longer gives leaves the paper and every list holding it (asTheHouseNowHolds)' },
  dispatch_dossiers: { reread: 'gone: { ...st.gone', in: 'src/stores/dispatch.ts', why: 'the old name of the filings\' table, read as dispatch_posts' },
  dispatch_comments: { reread: 'readCritiquePage', in: 'src/stores/dispatch.ts', why: 'a filing\'s critiques are read with it each time the reader opens it' },
  dossier_comments: { reread: 'readCritiquePage', in: 'src/stores/dispatch.ts', why: 'the old name of the critiques\' table' },
  dossier_comments_legacy: { own: 'kept by the house alone, never read by a phone' },
  logs: { reread: 'queryKey: [\'log\', id]', in: 'app/log/[id].tsx', why: 'a record\'s page reads it as it opens, and the Reel and a film\'s records read again on return' },
  log_comments: { reread: 'queryKey: [\'log\', id]', in: 'app/log/[id].tsx', why: 'a record\'s critiques are read with its page' },
  lounge_message_reactions: { channel: '*', in: 'src/stores/lounge.ts', why: 'a reaction taken back is heard live in the open room by its id, and read with the room on return' },
  member_drafts: { own: 'the member\'s own drafts, kept for their other phones and read as a desk opens' },
  lists: { reread: 'queryKey: [\'stack\', id]', in: 'app/stacks/[id].tsx', why: 'a stack\'s page reads it as it opens; one gone is said gone and let go (forgetGoneStack)' },
  list_items: { reread: 'queryKey: [\'stack\', id]', in: 'app/stacks/[id].tsx', why: 'a stack\'s films are read with its page' },
  list_comments: { reread: 'queryKey: [\'stackComments\', id]', in: 'app/stacks/[id].tsx', why: 'a stack\'s critiques are read with its page' },
  interactions: { reread: 'refreshFollowRequestCount', in: 'src/hooks/useFollowRequests.ts', why: 'a follow or a request ended is read again with the door, the circle sheet and the file, each as it opens' },
  profiles: { reread: 'getUser', in: 'src/stores/auth.ts', why: 'a closed account signs its own phone out at launch and on return; another member\'s file reads it as it opens, Member Not Found' },
  watchlists: { own: 'the member\'s own Watchlist, held on their phone; another member\'s file reads it as it opens' },
  physical_archive: { own: 'the member\'s own shelf, held on their phone' },
  viewings: { own: 'a record\'s rewatches, read with the record' },
  user_blocks: { own: 'the member\'s own blocks' },
  dispatch_certifications: { own: 'the member\'s own marks; others see only the count the house keeps' },
  dispatch_saves: { own: 'the member\'s own saved filings' },
  push_tokens: { own: 'the phone\'s own registration, read by the house alone' },
  log_private_notes: { own: 'a member\'s private notes, read by them alone' },
  viewing_notes_removed: { own: 'the house\'s record of notes taken back, read by the house alone' },
  warnings: { own: 'a member\'s own warnings, read by them and the Tribunal as it opens' },
  lounge_sanctions: { own: 'a salon\'s sanctions, read with the room' },
  rank_grants: { own: 'the house\'s record of ranks given' },
  withheld_pieces: { own: 'the Tribunal\'s record of pieces withheld, read as it opens' },
  lobby_editions: { own: 'the house\'s editions of the wall; the wall is read again on return' },
  lobby_withheld: { own: 'the house\'s record of pieces taken off the wall' },
  gate_counted: { own: 'the house\'s counts of gates met' },
  gate_day: { own: 'the house\'s counts of gates met' },
  interaction_churn: { own: 'the house\'s pace record' },
  sign_in_doors: { own: 'the house\'s sign-in pace record' },
  sign_in_devices: { own: 'the house\'s sign-in pace record' },
  storage: { own: 'files the house keeps, read through the rows that name them' },
  auth: { own: 'the sign-in service\'s own tables' },
};

/** The columns whose setting ends a row for its readers. */
const ENDING = /\b(withheld_at|ended_at|deleted_at|dissolved_at|removed_at|withdrawn_at|is_deleted|is_withdrawn)\s*=|\bcontent\s*=\s*(NULL|''|'\[)/i;

/** Every table a house function ends a row of. */
export function tablesEndedBySql(bodies: string[]): Set<string> {
  const out = new Set<string>();
  for (const body of bodies) {
    for (const m of body.matchAll(/DELETE\s+FROM\s+(?:public\.|storage\.|auth\.)?(\w+)/gi)) {
      out.add(/storage\./i.test(m[0]) ? 'storage' : /auth\./i.test(m[0]) ? 'auth' : m[1]!.toLowerCase());
    }
    for (const m of body.matchAll(/UPDATE\s+(?:public\.)?(\w+)(?:\s+(?:AS\s+)?\w+)?\s+SET\s+([\s\S]*?)(?:\bWHERE\b|;|\bRETURNING\b)/gi)) {
      if (ENDING.test(m[2]!)) out.add(m[1]!.toLowerCase());
    }
  }
  return out;
}

/** Every table the app deletes rows of, or ends by a column. */
export function tablesEndedByApp(sources: { code: string }[]): Set<string> {
  const out = new Set<string>();
  for (const { code } of sources) {
    for (const m of code.matchAll(/\.from\(\s*'(\w+)'\s*\)\s*\.(delete|update)\(([^)]*)/g)) {
      if (m[2] === 'delete' || /\b(withheld_at|ended_at|deleted_at|withdrawn_at)\s*:/.test(m[3]!)) out.add(m[1]!);
    }
  }
  return out;
}

/** The tables production publishes to realtime. */
const PUBLISHED = (() => {
  const live = readCode('supabase/schema/live-outside-public.sql') + PENDING_SQL();
  return new Set([...live.matchAll(/ALTER\s+PUBLICATION\s+supabase_realtime\s+ADD\s+TABLE\s+(?:public\.)?(\w+)/gi)].map((m) => m[1]!));
})();

export function endedFaults(tables: Set<string>, ended: Record<string, Ended>, codeOfFile: (file: string) => string | null, published: Set<string>): string[] {
  const faults: string[] = [];
  for (const t of [...tables].sort()) {
    const e = ended[t];
    if (!e) { faults.push(`${t}: its rows are ended, and how another phone holding one learns is named nowhere`); continue; }
    if ('own' in e) continue;
    const code = codeOfFile(e.in);
    if (code === null) { faults.push(`${t}: names ${e.in}, which is not there`); continue; }
    if ('channel' in e) {
      if (!published.has(t)) faults.push(`${t}: heard by its channel, but the house does not publish it`);
      const listens = new RegExp(`table:\\s*'${t}'`).test(code) && (e.channel === '*' || new RegExp(`event:\\s*'(\\*|${e.channel})'`).test(code));
      if (!listens) faults.push(`${t}: heard by its channel, but ${e.in} does not listen for ${e.channel} on it`);
    } else if (!code.includes(e.reread)) faults.push(`${t}: read again by ${e.reread}, which ${e.in} no longer holds`);
  }
  for (const t of Object.keys(ended)) if (!tables.has(t)) faults.push(`${t}: named, but nothing ends its rows`);
  return faults;
}

// ── THE SWEEP ──────────────────────────────────────────────────────────────────────────────────

describe('a change reaches every holder', () => {
  it('1: every list a screen or hook keeps follows a change, or holds no row the house changes', () => {
    expect(APP.flatMap((s) => keptLists(s.file, s.code)).length).toBeGreaterThan(20);
    expect(holderFaults(APP, HOLDERS)).toEqual([]);
  });

  it('2: every queued write does, once sent, what its online twin does once answered', () => {
    const twins = onlineTwins(APP);
    expect(twins.length).toBeGreaterThan(35);
    expect(twins.filter((t) => t.effects.size > 0).length).toBeGreaterThan(8);
    expect(twinFaults(twins, queuedEffects(readCode('src/utils/mutationExecutor.ts')), QUEUED_DIFFERS)).toEqual([]);
  });

  it('3: every table whose rows are ended is named with how another phone holding one learns', () => {
    const sql = houseFunctions().map((f) => codeOf(f.body));
    const tables = new Set([...tablesEndedBySql(sql), ...tablesEndedByApp(APP)]);
    expect(tables.size).toBeGreaterThan(20);
    const byFile = new Map(APP.map((s) => [s.file, s.code]));
    expect(endedFaults(tables, ENDED, (f) => byFile.get(f) ?? null, PUBLISHED)).toEqual([]);
    expect(SNAPSHOT_SQL().length).toBeGreaterThan(0);
  });
});

// ── THE RULES SAY NO ───────────────────────────────────────────────────────────────────────────

describe('the rules say NO', () => {
  it('1: to a kept list of the house named nowhere, one whose way of following has gone, and one named but gone', () => {
    const screen = [
      "import { useState } from 'react';",
      'export function Room() {',
      '  const [rows, setRows] = useState<Row[]>([]);',
      '  const [seen, setSeen] = useState(() => []);',
      '  const [n, redraw] = useReducer((x: number) => x + 1, 0);',
      '  const [page, dispatch] = useReducer(reduce, start);',
      '  useEffect(() => { void read().then(setRows); }, []);',
      '  return null;',
      '}',
    ].join('\n');
    expect(keptLists('app/x.tsx', screen).map((l) => l.key)).toEqual(['app/x.tsx#rows', 'app/x.tsx#seen', 'app/x.tsx#page']);
    expect(holderFaults([{ file: 'app/x.tsx', code: screen }], {})).toEqual([
      'app/x.tsx#rows: a kept list named nowhere: say how it follows a change, or why it holds no row the house changes',
      'app/x.tsx#seen: a kept list named nowhere: say how it follows a change, or why it holds no row the house changes',
      'app/x.tsx#page: a kept list named nowhere: say how it follows a change, or why it holds no row the house changes',
    ]);
    const named: Record<string, Holder> = {
      'app/x.tsx#rows': { follows: ['useFocusEffect'], why: 'w' },
      'app/x.tsx#seen': { mirrors: 'firstPage', why: 'w' },
      'app/x.tsx#page': { judged: 'derived', why: 'w' },
      'app/x.tsx#gone': { judged: 'draft', why: 'w' },
    };
    expect(holderFaults([{ file: 'app/x.tsx', code: screen }], named)).toEqual([
      'app/x.tsx#rows: follows by useFocusEffect, which app/x.tsx no longer holds',
      'app/x.tsx#seen: mirrors firstPage, but setSeen is never handed it',
      'app/x.tsx#gone: named, but no such kept list',
    ]);
    const mended = screen.replace('useEffect(() => {', 'useFocusEffect(() => { setSeen(firstPage);');
    expect(holderFaults([{ file: 'app/x.tsx', code: mended }], { ...named, 'app/x.tsx#gone': undefined as never })
      .filter((f) => !f.startsWith('app/x.tsx#gone'))).toEqual([]);
  });

  it('2: to a queued write that, once sent, skips what its online twin does once answered', () => {
    const store = [
      'export const act = async (id: string) => {',
      "  queryClient.setQueryData(['stack', id], guess);",
      '  try {',
      '    await save(id);',
      '    wallMayHaveChanged();',
      "    const key = ['stack', id];",
      '    void queryClient.invalidateQueries({ queryKey: key });',
      '  } catch (e) {',
      "    if (enqueueMutation({ type: 'update_list', payload: { list_id: id } })) { reelMayHaveChanged(); return; }",
      '  }',
      '};',
    ].join('\n');
    const twins = onlineTwins([{ file: 'src/stores/x.ts', code: store }]);
    // Before the wait, and in the catch, are not what the house's answer does.
    expect(twins.map((t) => [t.type, [...t.effects].sort()])).toEqual([['update_list', ['query stack', 'wallMayHaveChanged']]]);
    const bare = [
      'const handlers = { update_list: async (p) => { await rpc(p); return {}; } };',
      "const CHANGES_THE_WALL = new Set(['update_list']);",
      'export async function executeMutation(m) {',
      '    if (CHANGES_THE_WALL.has(m.type)) wallMayHaveChanged();',
      '}',
    ].join('\n');
    expect(twinFaults(twins, queuedEffects(bare), {})).toEqual([
      'src/stores/x.ts:9: update_list online does "query stack" once answered; the queued send does not',
    ]);
    const told = bare.replace('const handlers', "const READ_AGAIN_ONCE_SENT = { update_list: (p) => ['stack', p.list_id] };\nconst handlers")
      .replace('wallMayHaveChanged();\n}', "wallMayHaveChanged();\n    const page = READ_AGAIN_ONCE_SENT[m.type];\n}");
    expect(twinFaults(twins, queuedEffects(told), {})).toEqual([]);
    expect(twinFaults(twins, queuedEffects(bare), { 'update_list: query stack': 'why' })).toEqual([]);
    expect(twinFaults(twins, queuedEffects(told), { 'update_list: query stack': 'why' })).toEqual(['update_list: query stack: named as a difference no online act holds']);
  });

  it('3: to an ended table named nowhere, a channel the house does not publish or the app does not hear, and a read again gone', () => {
    const sql = [
      "UPDATE public.dispatch_posts p SET withheld_at = now() WHERE id = $1;",
      'DELETE FROM public.lounges WHERE id = $1;',
      "UPDATE public.logs SET rating = 3 WHERE id = $1;",
    ];
    const tables = tablesEndedBySql(sql);
    expect([...tables].sort()).toEqual(['dispatch_posts', 'lounges']);
    expect([...tablesEndedByApp([{ code: "await supabase.from('lists').delete().eq('id', id); supabase.from('logs').update({ rating: 1 });" }])]).toEqual(['lists']);
    const files: Record<string, string> = { 'a.ts': "channel.on('postgres_changes', { event: 'UPDATE', table: 'dispatch_posts' })", 'b.ts': 'rereadRoom()' };
    const read = (f: string) => files[f] ?? null;
    expect(endedFaults(tables, {}, read, new Set())).toEqual([
      'dispatch_posts: its rows are ended, and how another phone holding one learns is named nowhere',
      'lounges: its rows are ended, and how another phone holding one learns is named nowhere',
    ]);
    const ended: Record<string, Ended> = {
      dispatch_posts: { channel: 'DELETE', in: 'a.ts', why: 'w' },
      lounges: { reread: 'readRoomAgain', in: 'b.ts', why: 'w' },
      logs: { own: 'w' },
    };
    expect(endedFaults(tables, ended, read, new Set())).toEqual([
      'dispatch_posts: heard by its channel, but the house does not publish it',
      'dispatch_posts: heard by its channel, but a.ts does not listen for DELETE on it',
      'lounges: read again by readRoomAgain, which b.ts no longer holds',
      'logs: named, but nothing ends its rows',
    ]);
    const mended: Record<string, Ended> = { dispatch_posts: { channel: 'UPDATE', in: 'a.ts', why: 'w' }, lounges: { reread: 'rereadRoom', in: 'b.ts', why: 'w' } };
    expect(endedFaults(tables, mended, read, new Set(['dispatch_posts']))).toEqual([]);
  });
});
