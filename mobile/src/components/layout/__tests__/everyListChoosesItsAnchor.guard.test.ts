/**
 * everyListChoosesItsAnchor.guard.test.ts — every vertical list says whether it
 * keeps its place when content changes above it.
 *
 * FlashList anchors its first item unless told not to. On a page whose header is
 * measured after its items, that scrolled the page down past its own top (run
 * 36566533738: the Darkroom opened below its search). CinematicFlashList chooses
 * for its pages (NOT_ANCHORED); every other vertical FlashList must choose here,
 * in its own tag: NOT_ANCHORED, or ANCHORED_BELOW_THE_TOP for a list that adds
 * items above what is shown. Horizontal lists are never anchored by FlashList.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ts = require('typescript');

const MOBILE = join(__dirname, '..', '..', '..', '..');
const rel = (f: string) => relative(MOBILE, f).replace(/\\/g, '/');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(full, out); }
    else if (e.name.endsWith('.tsx')) out.push(full);
  }
  return out;
};
const FILES = [...walk(join(MOBILE, 'app')), ...walk(join(MOBILE, 'src'))];
const OWN = 'src/components/layout/CinematicFlashList.tsx';

export function unanchoredLists(name: string, src: string): string[] {
  const sf = ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bad: string[] = [];
  const visit = (n: any) => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n))
      && /^(FlashList|AnimatedFlashList)$/.test(n.tagName.getText())) {
      const names = n.attributes.properties.filter(ts.isJsxAttribute).map((a: any) => a.name.getText());
      if (!names.includes('horizontal') && !names.includes('maintainVisibleContentPosition')) {
        bad.push(`${name}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} <${n.tagName.getText()}>`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return bad;
}

describe('every vertical list chooses its anchor', () => {
  it('no FlashList is left to the library’s default', () => {
    const bad = FILES.filter((f) => rel(f) !== OWN).flatMap((f) => unanchoredLists(rel(f), readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('the scan finds the lists', () => {
    const lists = FILES.map((f) => readFileSync(f, 'utf8')).join('\n').match(/<(Animated)?FlashList\b/g) ?? [];
    expect(lists.length).toBeGreaterThanOrEqual(15);
  });

  it('CinematicFlashList chooses for its own pages', () => {
    expect(readFileSync(join(MOBILE, OWN), 'utf8')).toMatch(/maintainVisibleContentPosition=\{NOT_ANCHORED\}\s*\{\.\.\.rest\}/);
  });

  it('the detector can say NO', () => {
    expect(unanchoredLists('a.tsx', 'export const A = () => <FlashList data={d} />;')).toHaveLength(1);
    expect(unanchoredLists('a.tsx', 'export const A = () => <FlashList horizontal data={d} />;')).toEqual([]);
    expect(unanchoredLists('a.tsx', 'export const A = () => <FlashList data={d} maintainVisibleContentPosition={NOT_ANCHORED} />;')).toEqual([]);
  });
});
