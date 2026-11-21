/**
 * A refusal is never told as the connection: words that blame the connection ("check your
 * connection", "try again", "could not be reached") are said of a failure only where the code has
 * asked whether the failure was the network's.
 *
 * The house refuses on purpose (a member's standing, the owner's rule, a pace, a page gone), and a
 * catch that said every failure one way told a refusal as a lost signal: a pace refusal said "Failed"
 * (review round 13), a follow refused for standing "try again" (round 10), a right code checked
 * offline "invalid or expired" (round 11), a busy catalogue "check your connection" (round 13).
 *
 * This finder reads every file of the app (the universe's appCode) as a syntax tree. A site is a
 * string that blames the connection, inside a catch, or under a condition on an answer's error. It
 * must stand under a condition that asked the network (isNetworkError, isOffline, an offline flag),
 * or be listed below with why.
 */
import { readFileSync } from 'fs';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

/** Words that blame the connection. */
const BLAMES_THE_CONNECTION = /check your connection|your connection|no connection|could not be reached|couldn.t be reached|connection (?:failed|lost)|try again/i;

/** A condition that asked whether the failure was the network's. */
const ASKED_THE_NETWORK = /isNetworkError|isTransientError|isOffline|offline|Offline|networkError|NetworkError|isNetwork|unreachable|Unreachable|TimeoutError|timedOut/;

type Site = { file: string; line: number; text: string; why: 'in a catch' | 'under an answer’s error'; guards: string[] };

/** The sites in one file. */
export function connectionSites(file: string, text: string): Site[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Site[] = [];
  const visit = (n: ts.Node): void => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) && BLAMES_THE_CONNECTION.test(n.text)) {
      const guards: string[] = [];
      let why: Site['why'] | null = null;
      let child: ts.Node = n;
      for (let p: ts.Node | undefined = n.parent; p; child = p, p = p.parent) {
        if (ts.isCatchClause(p)) { why ??= 'in a catch'; }
        if (ts.isIfStatement(p) && child !== p.expression) {
          guards.push(p.expression.getText(sf));
          if (/\berror\b|\.error\b|\berr\b/.test(p.expression.getText(sf))) why ??= 'under an answer’s error';
        }
        if (ts.isConditionalExpression(p) && child !== p.condition) guards.push(p.condition.getText(sf));
        if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && child === p.right) guards.push(p.left.getText(sf));
        if (ts.isBlock(p)) {
          for (const st of p.statements) {
            if (st === child) break;
            if (ts.isIfStatement(st) && /\breturn\b|\bthrow\b/.test(st.thenStatement.getText(sf))) guards.push(st.expression.getText(sf));
          }
        }
        if (ts.isFunctionLike(p) && !ts.isArrowFunction(p) && why) break;
      }
      if (why) out.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text: n.getText(sf).replace(/\s+/g, ' ').slice(0, 90), why, guards });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Whether a site stands under a condition that asked the network. */
export const askedTheNetwork = (s: Site) => s.guards.some((g) => ASKED_THE_NETWORK.test(g));

/** Sites where the words are true whatever the cause, as `file  words`, each with why. */
const STORE = "a purchase or restore the phone's store refused or could not finish: the store's own failure, never the house's refusal, which the store's words name (purchaseStop) where it gives them";
const SHARE = "the phone's own share sheet or picture capture failed: nothing was asked of the house, so no refusal can stand behind it, and trying again is what mends it";
const JUDGED: Record<string, string> = {
  "app/(modals)/membership.tsx  'Memberships are being set up. Please try again shortly.'": STORE,
  "app/(modals)/membership.tsx  'Restore failed. Please try again.'": STORE,
  "app/log/[id].tsx  'The log could not be shared. Try again.'": SHARE,
  "src/components/film/ShareCardModal.tsx  'The file could not be shared. Try again.'": SHARE,
};

const keyOf = (s: Site) => `${s.file}  ${s.text}`;

describe('a refusal is never told as the connection', () => {
  const sites = files('appCode', { ext: ['.ts', '.tsx'] }).flatMap((p) => connectionSites(rel(p).replace(/^mobile\//, ''), readFileSync(p, 'utf8')));

  it('reads every file of the app, and finds where the connection is blamed', () => {
    expect(sites.length).toBeGreaterThan(5);
  });

  it('blames the connection only where the network was asked, but where judged', () => {
    expect(sites.filter((s) => !askedTheNetwork(s) && !JUDGED[keyOf(s)]).map((s) => `${s.file}:${s.line}  ${s.why}  ${s.text}  [${s.guards.join(' | ').slice(0, 160)}]`)).toEqual([]);
    const held = new Set(sites.filter((s) => !askedTheNetwork(s)).map(keyOf));
    expect(Object.keys(JUDGED).filter((k) => !held.has(k))).toEqual([]);
  });

  it('finds each planted shape, and passes the network asked and words with no blame', () => {
    const planted = [
      "async function a() { try { await f(); } catch { reelToast.error('Failed to block user. Try again.'); } }",
      "async function b() { const { error } = await f(); if (error) { reelToast.error('Could not create lounge. Check your connection and try again.'); } }",
      "async function c() { try { await f(); } catch (e) { reelToast.error(isNetworkError(e) ? 'The note could not be removed. Try again.' : 'The note could not be removed.'); } }",
      "async function d() { try { await f(); } catch (e) { if (isNetworkError(e)) { reelToast.error('No signal. Try again.'); return; } reelToast.error(saidOfAFailure(e, 'Failed.')); } }",
      "async function e() { try { await f(); } catch (e) { reelToast.error(`Could not keep it off — check your connection.`); } }",
      "function g() { return 'Try again later' }",
    ].join('\n');
    expect(connectionSites('planted.ts', planted).filter((s) => !askedTheNetwork(s)).map((s) => s.line)).toEqual([1, 2, 5]);
  });
});
