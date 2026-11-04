/**
 * Every value that reaches a place that acts on it passes its check first (P4.2).
 *
 * The trailer player wrote TMDB's key into its page as it came. A finder over the syntax tree
 * reads every place a value is acted on: the phone opening an address (Linking.openURL), the
 * in-app browser (openBrowserAsync, openAuthSessionAsync), and a `source` handed a page (`html`)
 * or an address (`uri`). Each value there must be:
 *   · written in the code (a word, or one of the house's own constants: STORE_LISTING.app);
 *   · asked of before, in the same function, by one of the yes-or-no CHECKS, whose answer
 *     decides (an if, a && or a ?: : `if (isSafeDeepLinkUrl(data.url))`);
 *   · made by one of the CLEANERS (`const key = youtubeKey(videoId)`: the key, never the
 *     videoId, is what it vouches for) or of the MAKERS (the house's own address); a page built
 *     by a call is judged by what it is built from;
 *   · or the parameter of one of FUNNELS, whose every caller then passes a value that is.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

const ROOT = join(__dirname, '..', '..', '..');

/** The checks, each by its kind (src/utils/outsideValues.ts, and a link's beside its schemes): yes or no, */
const CHECKS = new Set(['isSafeDeepLinkUrl', 'isAuthenticatorKey']);
/** and those that give back the value itself, or nothing. */
const CLEANERS = new Set(['normalizeSocialUrl', 'youtubeKey', 'pictureUri']);
/** Addresses the house makes of its own: a letter to its desk (SUPPORT_EMAIL, the app's facts). */
const MAKERS = new Set(['frontDeskLetter']);
/** A function that hands its parameter on to be acted on: each of its callers is judged instead. */
const FUNNELS: Record<string, string> = { openHousePage: 'src/utils/housePages.ts' };

const SINK_CALLS = /^(Linking\.openURL|(WebBrowser\.)?open(Browser|AuthSession)Async)$/;
const HOUSE_CONSTANT = /^[A-Z][A-Z0-9_]*(\.[A-Za-z]\w*)*$/;

const callee = (n: ts.CallExpression, sf: ts.SourceFile) => n.expression.getText(sf);
/** Does this call's answer decide something: an if's or a ?:'s condition, or the left of a &&? */
const decides = (n: ts.Node): boolean => {
  let at: ts.Node = n;
  while (at.parent && (ts.isPrefixUnaryExpression(at.parent) || ts.isParenthesizedExpression(at.parent))) at = at.parent;
  const p = at.parent;
  return !!p && ((ts.isIfStatement(p) && p.expression === at) || (ts.isConditionalExpression(p) && p.condition === at)
    || (ts.isBinaryExpression(p) && p.left === at && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken));
};
const enclosing = (n: ts.Node): ts.Node[] => {
  const out: ts.Node[] = [];
  for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) out.push(p);
  return out;
};

export function faultsIn(file: string, text: string): { faults: string[]; funnelled: { name: string; at: string; arg: string; ok: boolean }[] } {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const faults: string[] = [];
  const funnelled: { name: string; at: string; arg: string; ok: boolean }[] = [];
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const calls: ts.CallExpression[] = [];
  const decls: ts.VariableDeclaration[] = [];
  const collect = (n: ts.Node) => {
    if (ts.isCallExpression(n)) calls.push(n);
    if (ts.isVariableDeclaration(n)) decls.push(n);
    ts.forEachChild(n, collect);
  };
  collect(sf);

  /** Is `v`, acted on at `site`, a value the rules allow? */
  const checked = (v: ts.Expression, site: ts.Node): boolean => {
    while (ts.isParenthesizedExpression(v) || ts.isAsExpression(v) || ts.isNonNullExpression(v)) v = v.expression;
    if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) return true;
    const said = v.getText(sf);
    if (HOUSE_CONSTANT.test(said)) return true;
    if (ts.isCallExpression(v)) {
      const name = callee(v, sf);
      if (CLEANERS.has(name) || MAKERS.has(name)) return true;
      // A page or address built by a call: judged by what it is built from.
      return v.arguments.length > 0 && v.arguments.every((a) => checked(a, site));
    }
    const scopes = new Set<ts.Node>([...enclosing(site), sf]);
    // Asked of before, in a function the value is acted on in, and the answer decides.
    const before = calls.some((c) => c.getStart(sf) < site.getStart(sf) && CHECKS.has(callee(c, sf)) && decides(c)
      && c.arguments[0]?.getText(sf) === said && enclosing(c).some((f) => scopes.has(f)));
    if (before) return true;
    // Made by a cleaner or a maker, where it is seen.
    if (ts.isIdentifier(v)) {
      const made = decls.some((d) => d.name.getText(sf) === said && d.initializer
        && (() => { let i = d.initializer!; while (ts.isAwaitExpression(i)) i = i.expression; return ts.isCallExpression(i) && (CLEANERS.has(callee(i, sf)) || MAKERS.has(callee(i, sf))); })()
        && [...enclosing(d), sf].some((f) => scopes.has(f)));
      if (made) return true;
      // The parameter of a funnel, in its own file.
      const fn = enclosing(site).find((f) => ts.isFunctionDeclaration(f) && f.name && Object.hasOwn(FUNNELS, f.name.text) && FUNNELS[f.name.text] === file);
      if (fn && (fn as ts.FunctionDeclaration).parameters.some((p) => p.name.getText(sf) === said)) return true;
    }
    return false;
  };

  for (const c of calls) {
    const name = callee(c, sf);
    if (SINK_CALLS.test(name)) {
      const arg = c.arguments[0];
      if (!arg || !checked(arg, c)) faults.push(`${file}:${line(c)} ${name}(${arg?.getText(sf) ?? ''}) is not checked`);
    }
    if (Object.hasOwn(FUNNELS, name)) {
      const arg = c.arguments[0];
      funnelled.push({ name, at: `${file}:${line(c)}`, arg: arg?.getText(sf) ?? '', ok: !!arg && checked(arg, c) });
    }
  }

  const visit = (n: ts.Node) => {
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'source' && n.initializer && ts.isJsxExpression(n.initializer)
      && n.initializer.expression && ts.isObjectLiteralExpression(n.initializer.expression)) {
      for (const p of n.initializer.expression.properties) {
        const key = p.name?.getText(sf);
        if (key !== 'html' && key !== 'uri') continue;
        const value = ts.isShorthandPropertyAssignment(p) ? p.name : ts.isPropertyAssignment(p) ? p.initializer : undefined;
        if (!value || !checked(value, n)) faults.push(`${file}:${line(n)} source ${key} (${value?.getText(sf) ?? p.getText(sf)}) is not checked`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { faults, funnelled };
}

const scanned = files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)
  .map((f) => ({ f, text: readFileSync(join(ROOT, f), 'utf8') }))
  .filter(({ text }) => /openURL|open(Browser|AuthSession)Async|source=\{\{|openHousePage/.test(text));
const read = scanned.map(({ f, text }) => faultsIn(f, text));

describe('every value acted on', () => {
  it('is read (the scan has not gone blind)', () => {
    const sinks = scanned.filter(({ text }) => /Linking\.openURL|open(Browser|AuthSession)Async|source=\{\{/.test(text)).map(({ f }) => f);
    expect(sinks).toEqual(expect.arrayContaining(['src/components/film/TrailerModal.tsx', 'src/components/Picture.tsx',
      'src/utils/linking.ts', 'src/utils/housePages.ts', 'src/providers/AppBootstrapper.tsx', 'src/components/admin/SecondKeyDoor.tsx']));
  });

  it('passes its check first', () => {
    expect(read.flatMap((r) => r.faults)).toEqual([]);
  });

  it('through a funnel, is checked by every caller', () => {
    const calls = read.flatMap((r) => r.funnelled);
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(calls.filter((c) => !c.ok)).toEqual([]);
  });

  it('says NO to each way an outside value could slip through', () => {
    const faults = (src: string) => faultsIn('probe.tsx', src).faults.map((f) => f.replace(/^probe\.tsx:\d+ /, ''));
    // The trailer player with its key check removed: the finder's mutant.
    expect(faults('function P({ videoId }) { return <WebView source={{ html: buildEmbedHtml(videoId), baseUrl: B }} />; }'))
      .toEqual(['source html (buildEmbedHtml(videoId)) is not checked']);
    expect(faults('function P({ videoId }) { const key = youtubeKey(videoId); return <WebView source={{ html: buildEmbedHtml(key) }} />; }')).toEqual([]);
    // A cleaner vouches for what it gives back, never for what it was given.
    expect(faults('function P({ videoId }) { const key = youtubeKey(videoId); if (!key) return null; return <WebView source={{ html: buildEmbedHtml(videoId) }} />; }'))
      .toEqual(['source html (buildEmbedHtml(videoId)) is not checked']);
    expect(faults('function I({ uri }) { return <Image source={{ uri }} />; }')).toEqual(['source uri (uri) is not checked']);
    expect(faults('function I({ given }) { const uri = pictureUri(given); return <Image source={{ uri }} />; }')).toEqual([]);
    expect(faults('function O(data) { Linking.openURL(data.url); }')).toEqual(['Linking.openURL(data.url) is not checked']);
    expect(faults('function O(data) { if (isSafeDeepLinkUrl(data.url)) Linking.openURL(data.url); }')).toEqual([]);
    // A check after the act, or of another value, is no check.
    expect(faults('function O(data) { Linking.openURL(data.url); isSafeDeepLinkUrl(data.url); }')).toEqual(['Linking.openURL(data.url) is not checked']);
    expect(faults('function O(data) { if (isSafeDeepLinkUrl(data.link)) Linking.openURL(data.url); }')).toEqual(['Linking.openURL(data.url) is not checked']);
    // An answer no one reads decides nothing; one read by an early return, or by a &&, does.
    expect(faults('function O(u) { isSafeDeepLinkUrl(u); Linking.openURL(u); }')).toEqual(['Linking.openURL(u) is not checked']);
    expect(faults('function O(u) { const ok = isSafeDeepLinkUrl(u); Linking.openURL(u); }')).toEqual(['Linking.openURL(u) is not checked']);
    expect(faults('function O(u) { if (!isSafeDeepLinkUrl(u)) return; Linking.openURL(u); }')).toEqual([]);
    expect(faults('async function O(k) { return isAuthenticatorKey(k.uri) && await Linking.openURL(k.uri); }')).toEqual([]);
    // A check in another function does not reach this one.
    expect(faults('function A(u) { isSafeDeepLinkUrl(u); } function O(u) { WebBrowser.openBrowserAsync(u); }')).toEqual(['WebBrowser.openBrowserAsync(u) is not checked']);
    expect(faults('const u = makeLink(x); Linking.openURL(u);')).toEqual(['Linking.openURL(u) is not checked']);
    expect(faults("Linking.openURL('https://www.thereelhousesociety.com'); Linking.openURL(STORE_LISTING.app);")).toEqual([]);
  });

  it('through a funnel, says NO to a caller that passes what it was given', () => {
    const calls = faultsIn('probe.tsx', 'function S({ link }) { void openHousePage(link); void openHousePage(TERMS_URL); }').funnelled;
    expect(calls.map((c) => [c.arg, c.ok])).toEqual([['link', false], ['TERMS_URL', true]]);
  });
});
