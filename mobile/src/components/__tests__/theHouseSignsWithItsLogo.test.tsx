/**
 * theHouseSignsWithItsLogo.test.tsx — where the house signs, it draws its own
 * logo (MasterLogo), never a stand-in eye.
 *
 * The Take Your Rank banner drew ReelEyeIcon, the tab bar's simplified eye, and
 * the Lounge's gate drew lucide's Eye. Each now draws MasterLogo, and the Lobby
 * tab wears the logo's own small cut; the drawn eye is gone. The finder reads
 * every file's imports: ReelEyeIcon, or Eye from lucide-react-native, is kept
 * only where an icon is meant, each place listed with its reason (Buster's own
 * Eye is his, and is never read as lucide's).
 */
import React from 'react';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';
import * as ts from 'typescript';
import { files as universe } from '@/test-utils/universe';
import { render } from '@testing-library/react-native';
import { RankBill } from '../lobby/RankBill';
import { planWall } from '../lobby/measure';
import { MOBILE, readCode } from '@/test-utils/readCode';

jest.mock('expo-router', () => ({ ...require('@/test-utils/expoRouterMock').expoRouterMock(), useRouter: () => ({ push: jest.fn() }) }));
// Each drawn as a marked stand-in, so the banner's render can be counted.
jest.mock('../MasterLogo', () => ({ MasterLogo: () => require('react').createElement(require('react-native').View, { testID: 'master-logo' }) }));

describe('the Take Your Rank banner', () => {
  const plan = planWall({ width: 390, visible: 844, scale: 1, lineScale: 1 });

  it.each([null, 'archivist'] as const)('draws the house\'s logo (viewer %s)', (viewer) => {
    const r = render(<RankBill plan={plan} viewer={viewer} />);
    expect(r.queryAllByTestId('master-logo', { includeHiddenElements: true })).toHaveLength(1);
  });
});

/** The alpha of every pixel of a PNG, read by the repo's own reader in a Node of its own (jest cannot load an ES module here). */
function alphaOf(file: string): { width: number; height: number; alpha: number[] } {
  const code = `const m = await import(${JSON.stringify(pathToFileURL(join(MOBILE, 'e2e/png.mjs')).href)});`
    + `const p = m.decodePng(require('fs').readFileSync(${JSON.stringify(file)}));`
    + 'console.log(JSON.stringify({ width: p.width, height: p.height, alpha: [...p.pixels].filter((_, i) => i % 4 === 3) }));';
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import { createRequire } from 'module'; const require = createRequire(import.meta.url); ${code}`], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

describe('the Lobby tab', () => {
  it('wears the house\'s eye, tinted as the other tabs are', () => {
    const src = readCode('app/(tabs)/_layout.tsx');
    expect(src).toContain("require('../../assets/images/reelhouse-eye.png')");
    expect(src).toMatch(/<AssetImage source=\{HOUSE_EYE\}[^>]*tintColor=\{iconColor\}/);
  });

  // The logo's small cut on a clear ground: the tab tints whatever is not clear,
  // so a ground left in would light as a solid block, and a mark keyed away would
  // light as nothing.
  it('is the mark on a clear ground', () => {
    const { width, height, alpha } = alphaOf(join(MOBILE, 'assets/images/reelhouse-eye.png'));
    const at = (x: number, y: number) => alpha[y * width + x];
    expect([at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)]).toEqual([0, 0, 0, 0]);
    // A third of it is inked (more than half opaque): an eye drawn in line, its reel's holes clear.
    const ink = alpha.filter((a) => a > 127).length / alpha.length;
    expect(ink).toBeGreaterThan(0.2);
    expect(ink).toBeLessThan(0.5);
  });
});

/** Where a stand-in eye is meant, and why. */
const KEPT: Record<string, string> = {
  'src/components/log/LogForm.tsx': 'the log form\'s "watched" status icon',
  'src/features/settings/SettingsSections.tsx': 'the PRIVACY section\'s head icon',
};

/** The stand-in eyes a file imports. */
export function standInEyes(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const found: string[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const from = st.moduleSpecifier.text;
    const names = st.importClause?.namedBindings;
    if (!names || !ts.isNamedImports(names)) continue;
    for (const el of names.elements) {
      const imported = (el.propertyName ?? el.name).text;
      if (imported === 'ReelEyeIcon') found.push('ReelEyeIcon');
      if (imported === 'Eye' && from === 'lucide-react-native') found.push("lucide's Eye");
    }
  }
  return found;
}

describe('no stand-in eye where the house signs', () => {
  const files = universe('appCode').map((f) => relative(MOBILE, f).split('\\').join('/'));
  const found = files.flatMap((f) => standInEyes(f, readFileSync(join(MOBILE, f), 'utf8')).map((what) => `${f}: ${what}`));

  it('imports one only where the list keeps it, and every kept place still does', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(found.filter((f) => !Object.keys(KEPT).some((k) => f.startsWith(`${k}:`)))).toEqual([]);
    for (const kept of Object.keys(KEPT)) expect(found.some((f) => f.startsWith(`${kept}:`))).toBe(true);
  });

  it('says NO to the banner and the gate as they were, and leaves Buster\'s own eye alone', () => {
    expect(standInEyes('RankBill.tsx', "import { ReelEyeIcon } from '@/src/components/ReelEyeIcon';")).toEqual(['ReelEyeIcon']);
    expect(standInEyes('LoungeGate.tsx', "import { Eye, Sparkles } from 'lucide-react-native';")).toEqual(["lucide's Eye"]);
    expect(standInEyes('x.tsx', "import { Eye as Look } from 'lucide-react-native';")).toEqual(["lucide's Eye"]);
    expect(standInEyes('Buster.tsx', 'const Eye = memo(function Eye() { return null; });')).toEqual([]);
  });
});
