/**
 * aLaunchReadIsOneTrip.guard.test.ts — no read at launch walks the house a page at a time.
 *
 * A loop that awaits a read of the house each time round waits one round trip per page: the
 * follow list read at launch a thousand at a time took five trips for a member who follows 5,000,
 * and past 10,000 it never held the list. A finder over the syntax tree of every app file lists
 * each loop whose body awaits a read of the house (a select or an rpc, or a call to a function that
 * makes one), and whether launch reaches it: from the bootstrapper, the root layout, the answer to
 * an auth event, and the store's sign-in and restore, by the functions each calls in its own file
 * and in the files it imports. A walk launch reaches fails, unless judged as no page walk at all; a
 * walk away from launch is judged with what opens it.
 */
import { readFileSync } from 'fs';
import { dirname, posix } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

type Unit = { file: string; name: string; calls: Set<string>; reads: boolean };
type Loop = { file: string; unit: string; line: number; reads: string[] };
type Parsed = { units: Unit[]; loops: Loop[]; imports: string[] };

/** The launch: every function of these files, and of auth.ts the sign-in, the sign-up and the restore. */
const LAUNCH_FILES = ['src/providers/AppBootstrapper.tsx', 'app/_layout.tsx', 'src/stores/authEvents.ts'];
const LAUNCH_UNITS: Record<string, string[]> = { 'src/stores/auth.ts': ['hydrateFromCache', 'restoreSession', 'login', 'signup', 'adoptSession'] };

const isFn = (n: ts.Node) => ts.isFunctionLike(n);
const isLoop = (n: ts.Node): n is ts.IterationStatement =>
  ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isWhileStatement(n) || ts.isDoStatement(n);

/** The name a call is made by: `f()` is f, `a.b.f()` is f. */
const calledName = (call: ts.CallExpression): string | null => {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
};
const WRITES = new Set(['insert', 'upsert', 'update', 'delete']);
/** The methods a chain calls before this one: `a.from(t).delete().select()` is from, delete. */
const chainBefore = (e: ts.Expression): string[] => {
  const out: string[] = [];
  let at: ts.Expression = e;
  while (ts.isCallExpression(at) || ts.isPropertyAccessExpression(at)) {
    if (ts.isPropertyAccessExpression(at)) out.push(at.name.text);
    at = at.expression;
  }
  return out;
};
/**
 * A read of the house made here: `.rpc(`, or `.select(` on a chain that writes nothing (a write's
 * `.select()` hands back the rows it wrote; Platform.select picks a value).
 */
const readsHouse = (call: ts.CallExpression): boolean => {
  const e = call.expression;
  if (!ts.isPropertyAccessExpression(e) || e.expression.getText() === 'Platform') return false;
  if (e.name.text === 'rpc') return true;
  return e.name.text === 'select' && !chainBefore(e.expression).some((m) => WRITES.has(m));
};

/** A function's name, as its file and its callers know it. */
const unitName = (n: ts.Node): string | null => {
  if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) return n.name.getText();
  if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parent) {
    const p = n.parent;
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isPropertyAssignment(p)) return p.name.getText();
  }
  return null;
};

/** The files a file imports, as paths from mobile/: `./x` from its folder, `@/x` from mobile/. */
export function importsOf(file: string, sf: ts.SourceFile, known: Set<string>): string[] {
  const out: string[] = [];
  const add = (spec: string) => {
    const base = spec.startsWith('@/') ? spec.slice(2) : spec.startsWith('.') ? posix.join(posix.dirname(file), spec) : null;
    if (base === null) return;
    for (const tail of ['', '.ts', '.tsx', '.js', '.jsx', '.native.ts', '.native.tsx', '/index.ts', '/index.tsx', '/index.js']) {
      if (known.has(base + tail)) { out.push(base + tail); return; }
    }
  };
  sf.forEachChild((n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) add(n.moduleSpecifier.text);
  });
  // require('…') and import('…') anywhere in the file.
  const walk = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.arguments.length === 1 && ts.isStringLiteral(n.arguments[0])
      && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) add(n.arguments[0].text);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

/** A file's functions (each with the names it calls and whether it reads the house itself), its loops that await, and its imports. */
export function parse(file: string, text: string, known: Set<string> = new Set()): Parsed {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const units: Unit[] = [];
  const loops: Loop[] = [];
  const top: Unit = { file, name: '<module>', calls: new Set(), reads: false };
  units.push(top);
  const visit = (n: ts.Node, here: Unit) => {
    const name = isFn(n) ? unitName(n) : null;
    const unit = name ? { file, name, calls: new Set<string>(), reads: false } : here;
    if (name) units.push(unit);
    if (ts.isCallExpression(n)) {
      const c = calledName(n);
      if (c) unit.calls.add(c);
      if (readsHouse(n)) unit.reads = true;
    }
    // A function handed on as a value (a callback, a store's action passed by name) is called too.
    if (ts.isIdentifier(n) && n.parent && !(ts.isCallExpression(n.parent) && n.parent.expression === n)) unit.calls.add(n.text);
    if (isLoop(n)) {
      let awaits = ts.isForOfStatement(n) && !!n.awaitModifier;
      const reads: string[] = [];
      const inBody = (x: ts.Node) => {
        if (isFn(x)) return;
        if (ts.isAwaitExpression(x)) awaits = true;
        if (ts.isCallExpression(x)) {
          if (readsHouse(x)) reads.push(x.expression.getText().replace(/\s+/g, ''));
          else { const c = calledName(x); if (c) reads.push(`call:${c}`); }
        }
        ts.forEachChild(x, inBody);
      };
      inBody(n.statement);
      if (awaits) loops.push({ file, unit: unit.name, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, reads });
    }
    ts.forEachChild(n, (c) => visit(c, unit));
  };
  sf.forEachChild((c) => visit(c, top));
  return { units, loops, imports: importsOf(file, sf, known) };
}

/**
 * Every loop that awaits a read of the house each time round, as file#function with the reads it
 * makes, and whether launch reaches its function.
 */
export function walks(parsed: Parsed[], launch: { files: string[]; units: Record<string, string[]> } = { files: LAUNCH_FILES, units: LAUNCH_UNITS }) {
  const byFile = new Map(parsed.map((p) => [p.units[0]?.file ?? '', p]));
  /** The functions a name can mean from a file: its own of that name, or one in a file it imports. */
  const meant = (file: string, name: string): Unit[] => {
    const p = byFile.get(file);
    if (!p) return [];
    const own = p.units.filter((u) => u.name === name);
    if (own.length) return own;
    return p.imports.flatMap((f) => (byFile.get(f)?.units ?? []).filter((u) => u.name === name));
  };
  const key = (u: Unit) => `${u.file}#${u.name}`;
  const reached = new Set<string>();
  const queue: Unit[] = [];
  for (const p of parsed) for (const u of p.units) {
    if (launch.files.includes(u.file) || (launch.units[u.file] ?? []).includes(u.name)) { reached.add(key(u)); queue.push(u); }
  }
  while (queue.length) {
    const u = queue.shift() as Unit;
    for (const c of u.calls) for (const v of meant(u.file, c)) if (!reached.has(key(v))) { reached.add(key(v)); queue.push(v); }
  }
  return parsed.flatMap((p) => p.loops).flatMap((l) => {
    const reads = [...new Set(l.reads.flatMap((r) => {
      if (!r.startsWith('call:')) return [r];
      return meant(l.file, r.slice(5)).some((u) => u.reads) ? [r.slice(5)] : [];
    }))];
    return reads.length ? [{ at: `${l.file}#${l.unit}`, line: l.line, reads, launch: reached.has(`${l.file}#${l.unit}`) }] : [];
  });
}

/** A walk launch reaches, judged: a loop that is no page walk (it reads once, or once more only when told). */
const AT_LAUNCH_JUDGED: Record<string, string> = {
  'src/stores/domain/marksLedger.ts#readMarks': 'no page walk: the whole ledger is one read (get_marks_ledger), read once more only when a write of the member landed while it was read',
  'src/utils/offlineQueue.ts#flushOfflineQueue': "no page walk: one pass sends what the queue holds (sendOnce, which reads the member's standing once), and runs once more only when another send was asked while it ran",
};

/** A walk away from launch, judged with what opens it and why its pages are right where they are. */
const AWAY_FROM_LAUNCH_JUDGED: Record<string, string> = {
  'app/(modals)/membership.tsx#watchForRank': 'no page walk: after a purchase the member is waiting on, the profile is read again every 2.5 s, five times at most, until the rank lands',
  'app/(modals)/list-modal.tsx#ListModal':"editing a stack opened from a link before the member's own stacks are read: the rest of its films are read once, a page each, to make the sheet whole before a film may be moved",
  'src/features/archive/archiveImport.ts#fetchAllListItems': "an import the member started: each stack's films are read before its new films are written, so none is written twice",
  'src/features/archive/archiveImport.ts#importLists': 'an import the member started: one stack after another, each found and its films read before they are written, at the house\'s pace',
  'src/features/archive/archiveImport.ts#runJSONImport': 'an import the member started: one stack after another, each found and its films read before they are written, at the house\'s pace',
  'src/features/settings/readAllRows.ts#readAllRows': 'an export the member asked for: every row they own, a thousand at a time, the whole of it or a failure',
  'src/services/YearInCinemaService.ts#fetchYearLogs': "a member's Year in Cinema, opened by them: every viewing of the year, a thousand a page, so a year an import filled is counted whole",
};

const known = new Set(files('appCode').map((f) => rel(f)));
const parsed = [...known].filter((f) => /\.[jt]sx?$/.test(f)).map((f) => parse(f, readFileSync(`${dirname(require.resolve('@/package.json'))}/${f}`, 'utf8'), known));

it('walks no read of the house page by page at launch, and every walk away from it is judged', () => {
  expect(parsed.length).toBeGreaterThan(300);
  const found = walks(parsed);
  // A walk launch reaches is judged only as no page walk; one judged as away from launch that launch reaches is not away.
  expect(found.filter((w) => w.launch && !AT_LAUNCH_JUDGED[w.at]).map((w) => `${w.at}:${w.line} ${w.reads.join(', ')}`)).toEqual([]);
  expect(found.filter((w) => !w.launch && !AWAY_FROM_LAUNCH_JUDGED[w.at]).map((w) => `${w.at}:${w.line} ${w.reads.join(', ')}`)).toEqual([]);
  // A judgement no walk holds any longer is let go.
  expect(Object.keys({ ...AT_LAUNCH_JUDGED, ...AWAY_FROM_LAUNCH_JUDGED }).filter((k) => !found.some((w) => w.at === k))).toEqual([]);
});

describe('the finder, on planted text', () => {
  const one = (text: string, file = 'src/a.ts') => walks([parse(file, text)], { files: [], units: {} });

  it('says NO to a loop that awaits a read of the house, built in place or held and awaited', () => {
    expect(one('async function f() { for (;;) { const { data } = await supabase.from("t").select("id").limit(9); if (!data) break; } }'))
      .toEqual([{ at: 'src/a.ts#f', line: 1, reads: ['supabase.from("t").select'], launch: false }]);
    expect(one('async function f() {\n  let more = true;\n  while (more) {\n    let q = supabase.from("t").select("id");\n    const r = await q;\n    more = !!r;\n  }\n}'))
      .toEqual([{ at: 'src/a.ts#f', line: 3, reads: ['supabase.from("t").select'], launch: false }]);
    expect(one('const g = async () => { do { await supabase.rpc("page"); } while (x); };').map((w) => w.at)).toEqual(['src/a.ts#g']);
  });

  it('says NO to a loop that awaits a function that reads the house, in its own file or one it imports', () => {
    expect(one('async function page() { return supabase.from("t").select("id"); }\nasync function f() { for (const p of ps) await page(p); }').map((w) => w.at)).toEqual(['src/a.ts#f']);
    const service = parse('src/s.ts', 'export class S { static async getPage(n) { return supabase.from("t").select("id").range(n, n + 9); } }');
    const screen = parse('app/x.tsx', 'import { S } from "@/src/s";\nasync function all() { while (more) { await S.getPage(n); } }', new Set(['src/s.ts']));
    expect(walks([service, screen], { files: [], units: {} }).map((w) => [w.at, w.reads])).toEqual([['app/x.tsx#all', ['getPage']]]);
  });

  it('says nothing of a loop that waits on nothing, writes alone, or picks a value', () => {
    expect(one('async function f() { const all = []; for (const id of ids) all.push(supabase.from("t").select("id").eq("id", id)); await Promise.all(all); }')).toEqual([]);
    expect(one('async function f() { for (const b of batches) await supabase.from("t").upsert(b); }')).toEqual([]);
    expect(one('async function f() { for (const b of batches) await supabase.from("t").delete().in("id", b).select("id"); }')).toEqual([]);
    expect(one('async function f() { for (const b of bs) { await sleep(Platform.select({ ios: 1, android: 2 })); } }')).toEqual([]);
  });

  it('knows a walk launch reaches through the functions it calls, and one only a screen opens', () => {
    const slice = parse('src/slice.ts', 'async function walk() { for (;;) { await supabase.rpc("p"); } }\nexport function hydrate() { return walk(); }\nasync function other() { for (;;) { await supabase.rpc("q"); } }\nexport const screenRead = () => other();');
    const boot = parse('src/boot.tsx', 'import { hydrate } from "./slice";\nexport function Boot() { useEffect(() => { void hydrate(); }, []); }', new Set(['src/slice.ts']));
    expect(walks([slice, boot], { files: ['src/boot.tsx'], units: {} }).map((w) => [w.at, w.launch]))
      .toEqual([['src/slice.ts#walk', true], ['src/slice.ts#other', false]]);
    // A name the launch's file neither holds nor imports is not reached.
    const elsewhere = parse('src/boot.tsx', 'export function Boot() { void hydrate(); }');
    expect(walks([slice, elsewhere], { files: ['src/boot.tsx'], units: {} }).map((w) => w.launch)).toEqual([false, false]);
  });
});
