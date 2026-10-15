/**
 * everyPictureStatesItsCache.guard.test.ts — every expo-image picture in the app
 * says how it is cached.
 *
 * A picture with no `cachePolicy` takes expo-image's default, `'disk'`, which never
 * keeps the decoded picture in memory: each time a screen is opened again, every such
 * picture is decoded again. So each one states its cache, and the house's is
 * `'memory-disk'`; a picture left on another policy is listed below with its reason.
 * Read with TypeScript's parser, so a picture under another name, through a namespace
 * or with a spread is still found, and a word in a comment is not.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import ts from 'typescript';
import { MOBILE } from '@/test-utils/readCode';

/** A file whose pictures keep another policy: which, how many, and why. Empty today. */
const OTHER_POLICY: Record<string, { policy: string; sites: number; why: string }> = {};

/** expo-image's components that draw a picture and take a `cachePolicy`. */
const PICTURES = new Set(['Image', 'ImageBackground']);

/** What a picture's policy is when the source does not say it in words. */
const NOT_STATED = '(not stated)';
const AFTER_A_SPREAD = '(a spread the guard cannot read comes last)';
const NOT_WRITTEN = '(not a written value)';

const SKIP = new Set(['__tests__', 'node_modules']);

function codeFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) codeFiles(full, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name)) out.push(full);
  }
  return out;
}

/** The words of a literal string, or null for anything decided at run time. */
function written(e: ts.Expression | undefined): string | null {
  return e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : null;
}

/** Through brackets, `as` and `satisfies`, to the expression itself. */
function bare(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
}

/**
 * The policy a picture is drawn with, read in the order React reads its props: the
 * last to set it wins. A spread of an object written in place is read key by key;
 * any other spread may carry a `cachePolicy` of its own, even an empty one, so after
 * it nothing is stated until a later prop states it again.
 */
function policyOf(attributes: ts.JsxAttributes): string {
  let policy = NOT_STATED;
  for (const a of attributes.properties) {
    if (ts.isJsxAttribute(a)) {
      if (a.name.getText() !== 'cachePolicy') continue;
      const v = a.initializer;
      const words = v && ts.isStringLiteral(v) ? v.text : v && ts.isJsxExpression(v) ? written(v.expression) : null;
      policy = words ?? NOT_WRITTEN;
      continue;
    }
    const spread = bare(a.expression);
    if (!ts.isObjectLiteralExpression(spread)) { policy = AFTER_A_SPREAD; continue; }
    for (const p of spread.properties) {
      if (ts.isSpreadAssignment(p)) { policy = AFTER_A_SPREAD; continue; }
      if (!p.name || (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : '') !== 'cachePolicy') continue;
      policy = ts.isPropertyAssignment(p) ? written(p.initializer) ?? NOT_WRITTEN : NOT_WRITTEN;
    }
  }
  return policy;
}

/**
 * Every expo-image picture drawn in the files, as `file:line` with its policy; and every
 * place expo-image's picture is used other than as a tag (handed to a function, kept in a
 * variable, re-exported, required), which would draw pictures this walk never sees.
 */
function picturesIn(files: string[]) {
  const pictures: { file: string; site: string; policy: string }[] = [];
  const escapes: string[] = [];
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    const file = relative(MOBILE, path).split(sep).join('/');
    const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const at = (n: ts.Node) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
    const named = new Set<string>();
    const spaces = new Set<string>();
    for (const s of sf.statements) {
      if (ts.isExportDeclaration(s) && s.moduleSpecifier && written(s.moduleSpecifier) === 'expo-image') escapes.push(at(s));
      if (!ts.isImportDeclaration(s) || written(s.moduleSpecifier) !== 'expo-image' || !s.importClause) continue;
      const b = s.importClause.namedBindings;
      if (b && ts.isNamespaceImport(b)) spaces.add(b.name.text);
      if (b && ts.isNamedImports(b)) {
        for (const e of b.elements) if (PICTURES.has((e.propertyName ?? e.name).text)) named.add(e.name.text);
      }
    }
    /** `Image`, `Picture` (imported under that name) or `ExpoImage.Image`. */
    const isPicture = (e: ts.Node): boolean =>
      ts.isIdentifier(e) ? named.has(e.text)
        : ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)
          && spaces.has(e.expression.text) && PICTURES.has(e.name.text);
    const visit = (n: ts.Node) => {
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && isPicture(n.tagName)) {
        pictures.push({ file, site: at(n), policy: policyOf(n.attributes) });
        ts.forEachChild(n.attributes, visit);
        return;
      }
      if (ts.isJsxClosingElement(n) || ts.isImportDeclaration(n) || ts.isTypeQueryNode(n)) return;
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'require'
        && written(n.arguments[0]) === 'expo-image') escapes.push(at(n));
      const p = n.parent;
      // A key or member that is only spelled the same, as `Animated.Image` or `{ Image: … }`.
      const aName = (ts.isPropertyAccessExpression(p) || ts.isPropertyAssignment(p) || ts.isJsxAttribute(p)) && p.name === n;
      const used = !aName && (isPicture(n) || (ts.isIdentifier(n) && spaces.has(n.text)));
      // `Image.prefetch(…)` and `ExpoImage.Image.prefetch(…)` call the module, and draw nothing.
      const calledOn = ts.isPropertyAccessExpression(p) && p.expression === n;
      if (used && !calledOn) { escapes.push(at(n)); return; }
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(sf, visit);
  }
  return { pictures, escapes };
}

/** Each picture not on the house's policy, unless its file is listed with that policy. */
function unlisted(pictures: { file: string; site: string; policy: string }[], listed: typeof OTHER_POLICY) {
  return pictures
    .filter((p) => p.policy !== 'memory-disk' && listed[p.file]?.policy !== p.policy)
    .map((p) => `${p.site} ${p.policy}`);
}

describe('every expo-image picture in app/ and src/', () => {
  const files = [...codeFiles(join(MOBILE, 'app')), ...codeFiles(join(MOBILE, 'src'))];
  const { pictures, escapes } = picturesIn(files);

  it('was found: a walk that read nothing would pass every check below', () => {
    expect(files.length).toBeGreaterThanOrEqual(440);
    expect(pictures.length).toBeGreaterThanOrEqual(90);
  });

  it('states its cache as memory-disk, or its file is listed with the policy it keeps and why', () => {
    expect(unlisted(pictures, OTHER_POLICY)).toEqual([]);
  });

  it('is counted in the list as many times as it keeps another policy, and the list names no file that has none', () => {
    const kept = Object.fromEntries(Object.entries(OTHER_POLICY).map(([file, { policy }]) =>
      [file, pictures.filter((p) => p.file === file && p.policy === policy).length]));
    expect(kept).toEqual(Object.fromEntries(Object.entries(OTHER_POLICY).map(([file, { sites }]) => [file, sites])));
  });

  it('is drawn as a tag, where this walk can read it, and nowhere else', () => {
    expect(escapes).toEqual([]);
  });
});

it('says NO to each shape of a picture with no house policy, and passes the ones that state it', () => {
  const fixture = join(__dirname, 'fixtures', 'imageCache.fixture.tsx');
  const { pictures, escapes } = picturesIn([fixture]);
  const at = (line: number) => `src/utils/__tests__/fixtures/imageCache.fixture.tsx:${line}`;
  expect(unlisted(pictures, {})).toEqual([
    `${at(18)} ${NOT_STATED}`,
    `${at(20)} ${NOT_STATED}`,
    `${at(22)} ${NOT_STATED}`,
    `${at(24)} ${NOT_STATED}`,
    `${at(26)} ${AFTER_A_SPREAD}`,
    `${at(28)} ${AFTER_A_SPREAD}`,
    `${at(30)} ${NOT_WRITTEN}`,
    `${at(32)} disk`,
  ]);
  // A listed file keeps its policy; the same picture elsewhere is still refused.
  expect(unlisted(pictures, { 'src/utils/__tests__/fixtures/imageCache.fixture.tsx': { policy: 'disk', sites: 1, why: '' } }))
    .not.toContain(`${at(32)} disk`);
  expect(pictures).toHaveLength(12);
  expect(escapes).toEqual([at(12)]);
});
