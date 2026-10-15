/**
 * theHouseSignsWithItsLogo.test.tsx — where the house signs, it draws its own
 * logo (MasterLogo), never a stand-in eye.
 *
 * The Take Your Rank banner drew ReelEyeIcon, the tab bar's simplified eye, and
 * the Lounge's gate drew lucide's Eye. Each now draws MasterLogo. The finder
 * reads every file's imports: ReelEyeIcon, or Eye from lucide-react-native, is
 * kept only where an icon is meant, each place listed with its reason (Buster's
 * own Eye is his, and is never read as lucide's).
 */
import React from 'react';
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { files as universe } from '@/test-utils/universe';
import { render } from '@testing-library/react-native';
import { RankBill } from '../lobby/RankBill';
import { planWall } from '../lobby/measure';
import { MOBILE } from '@/test-utils/readCode';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// Each drawn as a marked stand-in, so the banner's render can be counted.
jest.mock('../MasterLogo', () => ({ MasterLogo: () => require('react').createElement(require('react-native').View, { testID: 'master-logo' }) }));
jest.mock('../ReelEyeIcon', () => ({ ReelEyeIcon: () => require('react').createElement(require('react-native').View, { testID: 'reel-eye' }) }));

describe('the Take Your Rank banner', () => {
  const plan = planWall({ width: 390, visible: 844, scale: 1, lineScale: 1 });

  it.each([null, 'archivist'] as const)('draws the house\'s logo and no stand-in eye (viewer %s)', (viewer) => {
    const r = render(<RankBill plan={plan} viewer={viewer} />);
    expect(r.queryAllByTestId('master-logo', { includeHiddenElements: true })).toHaveLength(1);
    expect(r.queryAllByTestId('reel-eye', { includeHiddenElements: true })).toHaveLength(0);
  });
});

/** Where a stand-in eye is meant, and why. */
const KEPT: Record<string, string> = {
  'app/(tabs)/_layout.tsx': 'the Lobby tab\'s icon: 26 points, recoloured when chosen',
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
