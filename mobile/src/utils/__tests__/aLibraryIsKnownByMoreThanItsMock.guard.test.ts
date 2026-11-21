/**
 * aLibraryIsKnownByMoreThanItsMock.guard.test.ts — no library known only by its stand-in.
 * ─────────────────────────────────────────────────────────────────────────────
 * Three serious findings of review rounds 9 to 14 were one mechanism: a library mocked in every
 * test, so its real behaviour was never met. realtime-js handed a salon its channel on the way out
 * (the room deaf); auth-js resent a confirmation without its challenge (the link dead); TMDB, the
 * list recycler and the push registration each behaved otherwise than their stand-ins. Each was
 * fixed where found; the next mocked package was still known only by its mock.
 *
 * So test-utils/libraries.json names every package a test mocks or the app imports, and where its
 * real behaviour is met: jest runs it (never stood in by the shared setup), a named test runs the
 * real package, a flow of the sealed E2E meets it on the emulator, or a judged reason no answer of
 * it is read. This holds the file to the code, both ways: a package newly mocked or imported fails
 * until it is named; a test named must exist by its title, run the package and not stand it in; a
 * flow named must exist; a row nothing mocks or imports is refused.
 */
import { existsSync, readFileSync } from 'fs';
import { builtinModules } from 'module';
import * as path from 'path';
import ts from 'typescript';
import { files as universe } from '@/test-utils/universe';

const MOBILE = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(MOBILE, f).split(path.sep).join('/');

type Way =
  | { how: 'runs' }
  | { how: 'test'; file: string; title: string; package?: string }
  | { how: 'phone'; flow: string; meets: string }
  | { how: 'judged'; why: string };
const LIBRARIES = JSON.parse(readFileSync(path.join(MOBILE, 'test-utils', 'libraries.json'), 'utf8')) as { packages: Record<string, Way[]>; modules: Record<string, Way[]> };

const builtins = new Set(builtinModules);
/** A package by its root: `@scope/name` or `name`. */
const rootOf = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0] ?? spec);
const isPackage = (spec: string) => !spec.startsWith('.') && !spec.startsWith('@/') && !spec.startsWith('node:') && !builtins.has(rootOf(spec));

const parse = (file: string, text: string) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** A test file's `it`/`test` titles, from its syntax tree. */
function titlesIn(file: string, text: string): string[] {
  const sf = parse(file, text);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && /^(it|test)(\.(only|skip|each\(.*\)))?$/s.test(n.expression.getText(sf))) {
      const [title] = n.arguments;
      if (title && ts.isStringLiteralLike(title)) out.push(title.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
const hasTitle = (file: string, text: string, title: string) => titlesIn(file, text).includes(title);

/** Each package a file stands in for with jest.mock (or doMock), by root. */
export function mocksIn(file: string, text: string): string[] {
  const sf = parse(file, text);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && /^jest\.(mock|doMock|unstable_mockModule)$/.test(n.expression.getText(sf))) {
      const [spec] = n.arguments;
      if (spec && ts.isStringLiteralLike(spec) && isPackage(spec.text)) out.push(rootOf(spec.text));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Each package a file imports or requires, by root. */
export function importsIn(text: string): string[] {
  return ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName).filter(isPackage).map(rootOf);
}

/** What is wrong with the file against the code ([] when nothing). */
export function faultsOf(libraries: Record<string, Way[]>, mocked: Map<string, string[]>, imported: Set<string>,
  setupMocks: Set<string>, read: (file: string) => string | null, flowExists: (flow: string) => boolean): string[] {
  const faults: string[] = [];
  for (const p of new Set([...mocked.keys(), ...imported])) {
    if (!libraries[p]?.length) faults.push(`${p}: ${mocked.has(p) ? `mocked in ${mocked.get(p)!.length} file(s)` : 'imported by the app'}, and named nowhere`);
  }
  for (const [p, ways] of Object.entries(libraries)) {
    if (!mocked.has(p) && !imported.has(p)) faults.push(`${p}: named, though nothing mocks or imports it`);
    for (const w of ways) {
      if (w.how === 'runs' && setupMocks.has(p)) faults.push(`${p}: said to run, but the shared setup stands it in for every test`);
      if (w.how === 'test') {
        const text = read(w.file);
        const real = w.package ?? p;
        if (text === null) faults.push(`${p}: its test ${w.file} is not there`);
        else {
          if (!hasTitle(w.file, text, w.title)) faults.push(`${p}: no test titled "${w.title}" in ${w.file}`);
          if (mocksIn(w.file, text).includes(rootOf(real))) faults.push(`${p}: ${w.file} stands ${real} in, so it never runs it`);
          const takesTheReal = text.includes(`requireActual('${real}')`);
          if (!takesTheReal && !importsIn(text).includes(rootOf(real))) faults.push(`${p}: ${w.file} never reaches ${real}`);
          if (setupMocks.has(rootOf(real)) && !takesTheReal) faults.push(`${p}: the shared setup stands ${real} in, and ${w.file} never takes the real one`);
        }
      }
      if (w.how === 'phone' && (!w.meets?.trim() || !flowExists(w.flow))) faults.push(`${p}: its flow ${w.flow} is not there, or says not what it meets`);
      if (w.how === 'judged' && !w.why?.trim()) faults.push(`${p}: judged with no reason`);
      if (!['runs', 'test', 'phone', 'judged'].includes(w.how)) faults.push(`${p}: a way no rule knows (${(w as { how: string }).how})`);
    }
  }
  return faults;
}

/** Each module of the app the shared setup stands in for every test: a jest.mock at its top level. */
export function setupModuleMocks(file: string, text: string): string[] {
  const sf = parse(file, text);
  return sf.statements.flatMap((s) => {
    const call = ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) ? s.expression : null;
    const spec = call && call.expression.getText(sf) === 'jest.mock' ? call.arguments[0] : undefined;
    return spec && ts.isStringLiteralLike(spec) && /^(\.\/src\/|@\/src\/)/.test(spec.text) ? [spec.text.replace(/^@\//, './')] : [];
  });
}

/** What is wrong with the modules' rows: each stood-in module named, and each test takes its real self. */
export function moduleFaults(modules: Record<string, Way[]>, stoodIn: Set<string>, read: (file: string) => string | null, flowExists: (flow: string) => boolean): string[] {
  const faults: string[] = [];
  for (const m of stoodIn) if (!modules[m]?.some((w) => w.how === 'test')) faults.push(`${m}: stood in for every test, and no test named that runs its real self`);
  for (const [m, ways] of Object.entries(modules)) {
    if (!stoodIn.has(m)) faults.push(`${m}: named, though the shared setup no longer stands it in`);
    const base = path.posix.basename(m);
    for (const w of ways) {
      if (w.how === 'test') {
        const text = read(w.file);
        if (text === null) faults.push(`${m}: its test ${w.file} is not there`);
        else {
          if (!hasTitle(w.file, text, w.title)) faults.push(`${m}: no test titled "${w.title}" in ${w.file}`);
          if (!new RegExp(`(requireActual|unmock)\\(['"][^'"]*/${base}['"]\\)`).test(text)) faults.push(`${m}: ${w.file} never takes its real self (requireActual or unmock)`);
        }
      }
      if (w.how === 'phone' && (!w.meets?.trim() || !flowExists(w.flow))) faults.push(`${m}: its flow ${w.flow} is not there, or says not what it meets`);
    }
  }
  return faults;
}

const SETUP = ['jest.setup.ts', 'jest.afterEnv.ts'].map((f) => path.join(MOBILE, f));
const MOCKERS = [...universe(['tests', 'testSupport']), ...SETUP].filter((f) => /\.[cm]?[jt]sx?$/.test(f));

function theApp() {
  const mocked = new Map<string, string[]>();
  for (const f of MOCKERS) for (const p of mocksIn(f, readFileSync(f, 'utf8'))) mocked.set(p, [...(mocked.get(p) ?? []), rel(f)]);
  const imported = new Set(universe('appCode').flatMap((f) => importsIn(readFileSync(f, 'utf8'))));
  const setupMocks = new Set(SETUP.flatMap((f) => mocksIn(f, readFileSync(f, 'utf8'))));
  return { mocked, imported, setupMocks };
}
const readMobile = (file: string) => (existsSync(path.join(MOBILE, file)) ? readFileSync(path.join(MOBILE, file), 'utf8') : null);
const flowThere = (flow: string) => /^\.maestro\//.test(flow) && existsSync(path.join(MOBILE, flow));

describe('the rules say no', () => {
  const none = new Map<string, string[]>();
  const read = (file: string) => (file === 'real.test.ts' ? "const { C } = jest.requireActual('lib-a');\nit('meets it', () => {});" : file === 'mocks.test.ts' ? "jest.mock('lib-a');\nit('meets it', () => {});" : null);

  it('to a package mocked or imported and named nowhere, and to a row nothing needs', () => {
    expect(faultsOf({}, new Map([['lib-a', ['x.test.ts']]]), new Set(['lib-b']), new Set(), read, () => true))
      .toEqual(['lib-a: mocked in 1 file(s), and named nowhere', 'lib-b: imported by the app, and named nowhere']);
    expect(faultsOf({ 'lib-c': [{ how: 'runs' }] }, none, new Set(), new Set(), read, () => true)).toEqual(['lib-c: named, though nothing mocks or imports it']);
  });

  it('to a test that is missing, misnamed, or stands the package in', () => {
    const lib = (file: string, title = 'meets it') => ({ 'lib-a': [{ how: 'test' as const, file, title }] });
    const app = new Set(['lib-a']);
    expect(faultsOf(lib('gone.test.ts'), none, app, new Set(), read, () => true)).toEqual(['lib-a: its test gone.test.ts is not there']);
    expect(faultsOf(lib('real.test.ts', 'other'), none, app, new Set(), read, () => true)).toEqual(['lib-a: no test titled "other" in real.test.ts']);
    expect(faultsOf(lib('mocks.test.ts'), none, app, new Set(['lib-a']), read, () => true)).toEqual([
      'lib-a: mocks.test.ts stands lib-a in, so it never runs it',
      'lib-a: mocks.test.ts never reaches lib-a',
      'lib-a: the shared setup stands lib-a in, and mocks.test.ts never takes the real one',
    ]);
    expect(faultsOf(lib('real.test.ts'), none, app, new Set(['lib-a']), read, () => true)).toEqual([]);
  });

  it('to "runs" for a package the shared setup stands in, to a flow not there, and to a judgement with no reason', () => {
    const app = new Set(['lib-a']);
    expect(faultsOf({ 'lib-a': [{ how: 'runs' }] }, none, app, new Set(['lib-a']), read, () => true))
      .toEqual(['lib-a: said to run, but the shared setup stands it in for every test']);
    expect(faultsOf({ 'lib-a': [{ how: 'phone', flow: '.maestro/x.yaml', meets: 'it' }] }, none, app, new Set(), read, () => false))
      .toEqual(['lib-a: its flow .maestro/x.yaml is not there, or says not what it meets']);
    expect(faultsOf({ 'lib-a': [{ how: 'judged', why: ' ' }] }, none, app, new Set(), read, () => true)).toEqual(['lib-a: judged with no reason']);
  });

  it('to a module the setup stands in with no test of its real self, and to a test that never takes it', () => {
    const stood = setupModuleMocks('jest.setup.ts', "jest.mock('./src/lib/x', () => ({}));\nif (a) { jest.mock('@/src/lib/y'); }");
    expect(stood).toEqual(['./src/lib/x']);
    const read = (file: string) => (file === 'x.test.ts' ? "jest.unmock('../x');\nit('meets x', () => {});" : "it('meets x', () => {});");
    expect(moduleFaults({}, new Set(stood), read, () => true)).toEqual(['./src/lib/x: stood in for every test, and no test named that runs its real self']);
    expect(moduleFaults({ './src/lib/x': [{ how: 'test', file: 'y.test.ts', title: 'meets x' }] }, new Set(stood), read, () => true))
      .toEqual(['./src/lib/x: y.test.ts never takes its real self (requireActual or unmock)']);
    expect(moduleFaults({ './src/lib/x': [{ how: 'test', file: 'x.test.ts', title: 'meets x' }] }, new Set(stood), read, () => true)).toEqual([]);
  });

  it('finds a mock written with doMock, and none in a comment or a relative path', () => {
    expect(mocksIn('a.test.ts', "jest.doMock('expo-haptics', () => ({}));\njest.mock('./x');\njest.mock('@/src/y');\n// jest.mock('zod')"))
      .toEqual(['expo-haptics']);
  });
});

describe('the whole app', () => {
  const app = theApp();

  it('reads every test and the app, not an empty sweep', () => {
    expect(app.mocked.size).toBeGreaterThan(30);
    expect(app.imported.size).toBeGreaterThan(30);
    expect(app.setupMocks.has('@supabase/supabase-js')).toBe(true);
  });

  it('every package a test mocks or the app imports is named with where its real behaviour is met, and every row is true', () => {
    expect(faultsOf(LIBRARIES.packages, app.mocked, app.imported, app.setupMocks, readMobile, flowThere)).toEqual([]);
  });

  it('every module of the app the shared setup stands in is named with a test that runs its real self', () => {
    const stoodIn = new Set(SETUP.flatMap((f) => setupModuleMocks(f, readFileSync(f, 'utf8'))));
    expect(stoodIn.size).toBeGreaterThan(0);
    expect(moduleFaults(LIBRARIES.modules, stoodIn, readMobile, flowThere)).toEqual([]);
  });
});
