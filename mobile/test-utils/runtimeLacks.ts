/**
 * runtimeLacks — finds, in the app's source, every use of a JavaScript API the
 * phone's runtime does not have.
 *
 * jest runs on Node, which has APIs Hermes lacks; a call to one passes every
 * test and throws on the phone, but jest only sees the lines a test runs. This
 * reads every line instead, with TypeScript's parser. The APIs are named in
 * src/utils/runtimeLacks.json, in three shapes:
 *
 *   Name.member             a static: `AbortSignal.timeout(…)`, `AbortSignal['any']`,
 *                           `const { timeout } = AbortSignal`
 *   Name.prototype.member   a method of every value of that kind; with a program
 *                           to check types, only where the value IS of that kind
 *   globalThis.Name         a global, read as a free name or through globalThis
 */
import { readFileSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import ts from 'typescript';
import { MOBILE } from './readCode';
import { files as universe } from './universe';

export type Shape = 'static' | 'prototype' | 'global';
export interface Api { api: string; owner: string; member: string; shape: Shape }
export interface Use { api: string; file: string; line: number; code: string }
export interface Source { file: string; text: string }
export interface Lack { api: string; read: string }
export interface RuntimeList { reads: string[]; lacks: Lack[] }

export const LIST_FILE = 'src/utils/runtimeLacks.json';
export const readList = (): RuntimeList => JSON.parse(readFileSync(join(MOBILE, LIST_FILE), 'utf8'));

/** `AbortSignal.timeout`, `String.prototype.isWellFormed`, `globalThis.structuredClone`. */
export function parseApi(api: string): Api {
  const parts = api.split('.');
  if (parts.length === 2 && parts[0] === 'globalThis') return { api, owner: 'globalThis', member: parts[1], shape: 'global' };
  if (parts.length === 2) return { api, owner: parts[0], member: parts[1], shape: 'static' };
  if (parts.length === 3 && parts[1] === 'prototype') return { api, owner: parts[0], member: parts[2], shape: 'prototype' };
  throw new Error(`${api}: not Name.member, Name.prototype.member or globalThis.Name`);
}

/**
 * The app's own code (appCode in universe.js), never a test, a mock or a test
 * helper: its TypeScript, which the program below can type.
 */
export function appSources(): Source[] {
  return universe('appCode', { ext: ['.ts', '.tsx'] })
    .map((full) => ({ file: relative(MOBILE, full).split(sep).join('/'), text: readFileSync(full, 'utf8') }));
}

const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'window', 'self']);

const unwrap = (e: ts.Expression): ts.Expression => {
  let x = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x)
    || ts.isTypeAssertionExpression(x) || ts.isSatisfiesExpression(x)) x = x.expression;
  return x;
};

/** `AbortSignal`, or `globalThis.AbortSignal`: the global it names, else null. */
const globalNamed = (e: ts.Expression): string | null => {
  const x = unwrap(e);
  if (ts.isIdentifier(x)) return x.text;
  if (ts.isPropertyAccessExpression(x) && ts.isIdentifier(unwrap(x.expression))
    && GLOBAL_OBJECTS.has((unwrap(x.expression) as ts.Identifier).text)) return x.name.text;
  return null;
};

/** The member a property access or `x['name']` reads, and the object it reads it from. */
const memberRead = (n: ts.Node): { object: ts.Expression; name: string } | null => {
  if (ts.isPropertyAccessExpression(n)) return { object: n.expression, name: n.name.text };
  if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression)) {
    return { object: n.expression, name: n.argumentExpression.text };
  }
  return null;
};

/** Every name a file declares, so its own `URL` or `Buffer` is not the global one. */
const declaredIn = (sf: ts.SourceFile): Set<string> => {
  const names = new Set<string>();
  const visit = (n: ts.Node): void => {
    const name = (n as { name?: ts.Node }).name;
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)
      || ts.isImportSpecifier(n) || ts.isImportClause(n) || ts.isNamespaceImport(n) || ts.isBindingElement(n)
      || ts.isEnumDeclaration(n)) && name && ts.isIdentifier(name)) names.add(name.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
};

/** Is this identifier read as a value, rather than written as a key, a declaration or a type? */
const readAsValue = (id: ts.Identifier): boolean => {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p)
    || ts.isMethodDeclaration(p) || ts.isMethodSignature(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p)
    || ts.isEnumMember(p) || ts.isJsxAttribute(p)) && p.name === id) return false;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p)
    || ts.isBindingElement(p) || ts.isLabeledStatement(p)) && (p as { name?: ts.Node }).name === id) return false;
  if (ts.isBindingElement(p) && p.propertyName === id) return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return false;
  // `declare global { … }` names a scope for types, and runs nothing.
  if (ts.isModuleDeclaration(p) && p.name === id) return false;
  if (ts.isJsxOpeningElement(p) || ts.isJsxClosingElement(p) || ts.isJsxSelfClosingElement(p)) return false;
  return true;
};

const kindFor = (file: string) => (file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** A program over the given files, with the app's own compiler settings, for its type checker. */
export function programFor(files: string[]): ts.Program {
  const config = ts.readConfigFile(join(MOBILE, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, MOBILE);
  return ts.createProgram(files.map((f) => join(MOBILE, f)), { ...parsed.options, noEmit: true });
}

/** A read-only array has the same methods as an array. */
const SAME_KIND: Record<string, string> = { ReadonlyArray: 'Array' };

/** The kind of value an expression holds, as the name of its type (`String`, `Array`, `URL`). */
const kindOf = (checker: ts.TypeChecker, e: ts.Expression): string | null => {
  const t = checker.getApparentType(checker.getTypeAtLocation(e));
  const name = (t.getSymbol() ?? t.aliasSymbol)?.getName() ?? null;
  return name && (SAME_KIND[name] ?? name);
};

/**
 * Every use of `apis` in `sources`. A prototype API is matched by its member's
 * name; when `program` is given (built over files on disk), a match stands only
 * where the value it is read from is of the API's kind.
 */
export function findUses(sources: Source[], apis: string[], program?: (files: string[]) => ts.Program): Use[] {
  const wanted = apis.map(parseApi);
  const uses: Use[] = [];
  const candidates: { use: Use; object: ts.Expression; owner: string; sf: ts.SourceFile }[] = [];
  for (const { file, text } of sources) {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindFor(file));
    const own = declaredIn(sf);
    const at = (n: ts.Node, api: string): Use => ({
      api, file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
      code: text.split(/\r?\n/)[sf.getLineAndCharacterOfPosition(n.getStart(sf)).line].trim(),
    });
    const visit = (n: ts.Node): void => {
      // A type is never run: `signal: AbortSignal` is no use of the global.
      if (ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return;
      const read = memberRead(n);
      for (const w of wanted) {
        if (w.shape === 'static' && read && read.name === w.member && globalNamed(read.object) === w.owner && !own.has(w.owner)) {
          uses.push(at(n, w.api));
        }
        if (w.shape === 'static' && ts.isVariableDeclaration(n) && n.initializer && ts.isObjectBindingPattern(n.name)
          && globalNamed(n.initializer) === w.owner && !own.has(w.owner)
          && n.name.elements.some((el) => (el.propertyName ?? el.name).getText(sf) === w.member)) {
          uses.push(at(n, w.api));
        }
        if (w.shape === 'prototype' && read && read.name === w.member) {
          const o = unwrap(read.object);
          const direct = ts.isPropertyAccessExpression(o) && o.name.text === 'prototype' && globalNamed(o.expression) === w.owner;
          if (direct) uses.push(at(n, w.api));
          else candidates.push({ use: at(n, w.api), object: read.object, owner: w.owner, sf });
        }
        if (w.shape === 'global') {
          if (read && read.name === w.member && ts.isIdentifier(unwrap(read.object))
            && GLOBAL_OBJECTS.has((unwrap(read.object) as ts.Identifier).text)) uses.push(at(n, w.api));
          else if (ts.isIdentifier(n) && n.text === w.member && !own.has(w.member) && readAsValue(n)) uses.push(at(n, w.api));
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  if (candidates.length && program) {
    const p = program([...new Set(candidates.map((c) => c.use.file))]);
    const tc = p.getTypeChecker();
    for (const c of candidates) {
      // The program's own tree of the file: the positions are the same, the nodes are not.
      const sf = p.getSourceFile(join(MOBILE, c.use.file));
      const node = sf && findAt(sf, c.object.getStart(c.sf), c.object.getEnd());
      if (node && kindOf(tc, node as ts.Expression) === c.owner) uses.push(c.use);
    }
  } else {
    uses.push(...candidates.map((c) => c.use));
  }
  return uses.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** The node spanning exactly [start, end) in a tree. */
function findAt(sf: ts.SourceFile, start: number, end: number): ts.Node | null {
  let found: ts.Node | null = null;
  const visit = (n: ts.Node): void => {
    if (found || n.getEnd() < start || n.getStart(sf) > start) return;
    if (n.getStart(sf) === start && n.getEnd() === end) { found = n; return; }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** What `runtimeNames` (src/utils/e2eRuntime.ts) reads on Node, in a module of its own. */
export function namesOnNode(source: string, reads: string[]): Record<string, string[] | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spawnSync } = require('child_process') as typeof import('child_process');
  // A module, so no CommonJS `require` or `module` stands on the global object.
  const script = `const runtimeNames = ${source};\nprocess.stdout.write(JSON.stringify(runtimeNames(${JSON.stringify(reads)})));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', cwd: dirname(MOBILE) });
  if (r.status !== 0) throw new Error(`Node could not read its own runtime: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** What Metro passes each module's wrapper: the app has it, whatever the global object holds. */
export const BUNDLER_GIVES = new Set(['global']);

/** A dump's target → the shape of API its names are (`Name.member`, prototype, global). */
export const apiFor = (target: string, name: string): string =>
  (target === 'globalThis' ? `globalThis.${name}` : `${target}.${name}`);

/**
 * The names Node has and the phone lacks that the app's source uses, and that
 * the list does not name: each would pass in jest and throw on the phone.
 */
export function unlisted(node: Record<string, string[] | null>, phone: Record<string, string[] | null>,
  lacks: Lack[], sources: Source[], program?: (files: string[]) => ts.Program): Use[] {
  const listed = new Set(lacks.map((l) => l.api));
  const missing: string[] = [];
  for (const [target, names] of Object.entries(node)) {
    const there = new Set(phone[target] ?? []);
    for (const name of names ?? []) {
      // Only names an app can write as Name.member: not symbols' keys, not `constructor`.
      if (!/^[A-Za-z_$][\w$]*$/.test(name) || name === 'constructor' || name === 'prototype') continue;
      if (target === 'globalThis' && BUNDLER_GIVES.has(name)) continue;
      if (!there.has(name)) missing.push(apiFor(target, name));
    }
  }
  return findUses(sources, missing.filter((a) => !listed.has(a)), program);
}
