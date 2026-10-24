/**
 * everyDrawingIsMeasured.guard.test.ts — every screen a generator draws lands
 * where CI measures it.
 *
 * The Dispatch's plates were written to a folder of their own, drawn on every CI
 * run and measured by none: a salon card whose halo took the next card's taps,
 * a stamp whose shadow iOS never drew, and two share-card shapes with words over
 * words all stood there unseen. A drawing of the app goes through writeScreen,
 * which writes into the folder the drawing job measures; a generator may write a
 * page of its own only when it is a design exploration, listed with its reason.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { files, rel } from '@/test-utils/universe';
import { readCode, MOBILE } from '@/test-utils/readCode';

/** Generators that draw options side by side into their own folder: not the app, not measured. */
const EXPLORATIONS: Record<string, string> = {
  'mockups/paper/__tests__/zz-badge.gen.test.tsx': 'the Auteur badge, four ways',
  'mockups/paper/__tests__/zz-choices.gen.test.tsx': 'two choices, drawn for the owner',
  'mockups/paper/__tests__/zz-final.gen.test.tsx': 'the rank mark and the writing room, as designed before they shipped',
  'mockups/paper/__tests__/zz-proposals.gen.test.tsx': 'five decisions, as proposed',
  'mockups/paper/__tests__/zz-rank.gen.test.tsx': 'the Auteur read as higher: the options',
};

/** The calls in a source that write an html page by hand, not through writeScreen. */
export function pagesWrittenAside(code: string): string[] {
  return [...code.matchAll(/writeFileSync\(([^;]*?)\.html/g)].map((m) => m[0]);
}

describe('every drawing is measured', () => {
  const generators = files('tests').map(rel).filter((f) => /\.gen\.test\.tsx?$/.test(f));

  it('finds the generators at all, so an empty search cannot pass', () => {
    expect(generators.length).toBeGreaterThan(20);
  });

  it('writes every screen of the app through writeScreen, or is an exploration, listed with its reason', () => {
    const aside = generators.filter((f) => pagesWrittenAside(readCode(f)).length && !EXPLORATIONS[f]);
    expect(aside).toEqual([]);
    for (const f of Object.keys(EXPLORATIONS)) expect(pagesWrittenAside(readCode(f)).length).toBeGreaterThan(0);
  });

  it('draws into the folder the drawing job measures', () => {
    const ci = readFileSync(join(MOBILE, '..', '.github', 'workflows', 'god_tier_ci.yml'), 'utf8');
    expect(ci).toMatch(/MOCKUPS_OUT: mockups\/out\/ci\b/);
    expect(ci).toMatch(/yoga-parity\.cjs --src mockups\/out\/ci\b/);
    expect(ci).toMatch(/layout\.cjs --src mockups\/out\/ci\b/);
  });

  it('says NO to a plate written to a folder of its own, and leaves a manifest alone', () => {
    expect(pagesWrittenAside("writeFileSync(join(OUT, `${name}.html`), toHtml(r.toJSON()), 'utf8');")).toHaveLength(1);
    expect(pagesWrittenAside("writeFileSync(join(OUT, 'w1-the-writing-room.html'), html, 'utf8');")).toHaveLength(1);
    expect(pagesWrittenAside("writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest), 'utf8');")).toEqual([]);
    expect(pagesWrittenAside("writeScreen('w1-the-writing-room', html);")).toEqual([]);
  });
});
