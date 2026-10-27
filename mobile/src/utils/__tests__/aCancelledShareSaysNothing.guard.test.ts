/**
 * A cancelled share never says "shared" (P4.43).
 *
 * Sharing.shareAsync cannot tell a share from a cancel, and Share.share on Android answers
 * `sharedAction` even when the member backs out (react-native's Share.d.ts). Three sites played
 * a success haptic after the sheet closed (the film's card, both archive exports, one of them
 * after saying sharing was unavailable): a cancel was thanked as a share. The sheet is its own
 * answer. A finder over the syntax tree lists every function that opens a share sheet and fails
 * on one that also claims success: TactileEngine.success, reelToast.success, or a plain toast.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

const ROOT = join(__dirname, '..', '..', '..');
const SHARE = /^(Share\.share|Sharing\.shareAsync)$/;
const CLAIM = /^(TactileEngine\.success|reelToast\.success|reelToast)$/;

type Site = { at: string; claims: string[] };

/** Each function that opens a share sheet, and the claims of success made in it (its own body, not nested functions). */
export function shareSites(file: string, text: string): Site[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Site[] = [];
  const isFn = (n: ts.Node) => ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n);
  const callsIn = (fn: ts.Node) => {
    const calls: string[] = [];
    const walk = (n: ts.Node) => {
      if (n !== fn && isFn(n)) return;
      if (ts.isCallExpression(n)) calls.push(n.expression.getText(sf));
      ts.forEachChild(n, walk);
    };
    walk(fn);
    return calls;
  };
  const visit = (n: ts.Node) => {
    if (isFn(n)) {
      const calls = callsIn(n);
      if (calls.some((c) => SHARE.test(c))) {
        out.push({ at: `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`, claims: calls.filter((c) => CLAIM.test(c)) });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const sites = files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)
  .flatMap((f) => {
    const text = readFileSync(join(ROOT, f), 'utf8');
    return /Share\.share\(|Sharing\.shareAsync\(/.test(text) ? shareSites(f, text) : [];
  });

describe('a share sheet', () => {
  it('is found wherever one opens (the scan has not gone blind)', () => {
    const filesWithSites = [...new Set(sites.map((s) => s.at.replace(/:\d+$/, '')))].sort();
    expect(filesWithSites).toEqual([
      'app/dispatch/[id].tsx',
      'app/log/[id].tsx',
      'src/components/film/ShareCardModal.tsx',
      'src/components/profile/ProjectorRoom.tsx',
      'src/components/profile/TasteDNA.tsx',
      'src/features/settings/DataVault.tsx',
    ]);
  });

  it('is never followed by a claim of success, in the function that opened it', () => {
    expect(sites.filter((s) => s.claims.length > 0)).toEqual([]);
  });

  it('says NO to a share thanked, and nothing of a failure told', () => {
    const probe = (body: string) => shareSites('probe.ts', `async function share() { ${body} }`)[0]?.claims;
    expect(probe('await Sharing.shareAsync(uri); TactileEngine.success();')).toEqual(['TactileEngine.success']);
    expect(probe("await Share.share({ message }); reelToast('Shared.');")).toEqual(['reelToast']);
    expect(probe("try { await Share.share({ message }); } catch { reelToast.error('Not shared.'); }")).toEqual([]);
  });
});
