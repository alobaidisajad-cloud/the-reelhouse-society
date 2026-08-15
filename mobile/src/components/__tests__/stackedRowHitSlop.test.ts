/**
 * stackedRowHitSlop.test.ts — adjacent rows must not steal each other's edges.
 * ─────────────────────────────────────────────────────────────
 * PressableScale defaults to 15pt of hitSlop on every side (it does this to
 * guarantee a 44pt target for small icons). On a LIST of rows stacked a
 * hairline apart, that default is actively harmful: each row's target grows
 * 15pt into its neighbours, the two overlap by 30pt, and React Native gives
 * the touch to whichever sibling comes later in the JSX.
 *
 * The concrete damage found on 2026-08-14: in the Lounge's message sheet,
 * BLOCK @user sits directly beneath REPORT MESSAGE. The bottom ~15pt of
 * "report" fired "block" — a destructive action stolen by a benign one.
 *
 * So: any PressableScale whose style is one of the known stacked-row styles
 * must pass `hitSlop={null}`. Those rows are ~50pt tall already and need no
 * help. This does NOT sweep the whole app — see the note at the bottom.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

/** file → the style names that mark a row in a hairline-separated stack. */
const STACKED_ROWS: Record<string, string[]> = {
  'src/components/lounge/ActionSheet.tsx': ['actionBtn'],
  'src/components/moderation/ContentActionSheet.tsx': ['optionRow'],
  'src/components/layout/ConciergeButton.tsx': ['actionRow'],
};

describe('stacked rows do not steal each other’s touch targets', () => {
  for (const [file, styleNames] of Object.entries(STACKED_ROWS)) {
    it(`${file} passes hitSlop={null} on every stacked row`, () => {
      const src = readFileSync(join(ROOT, file), 'utf8');
      // Comments are stripped first: this guard exists because a previous one
      // matched its own explanatory prose and asserted nothing.
      const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

      const offenders: string[] = [];
      for (const tag of code.matchAll(/<PressableScale\b([\s\S]*?)>/g)) {
        const attrs = tag[1];
        const usesRowStyle = styleNames.some((n) =>
          new RegExp(`style=\\{\\[?[\\w.]*\\b${n}\\b`).test(attrs)
        );
        if (!usesRowStyle) continue;
        if (!/hitSlop=\{null\}/.test(attrs)) {
          offenders.push(attrs.replace(/\s+/g, ' ').trim().slice(0, 90));
        }
      }
      expect(offenders).toEqual([]);
    });

    it(`${file} still HAS rows for this guard to check`, () => {
      // Without this, deleting or renaming the rows would make the guard above
      // pass vacuously — green because it found nothing to inspect.
      const src = readFileSync(join(ROOT, file), 'utf8');
      const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const found = [...code.matchAll(/<PressableScale\b([\s\S]*?)>/g)].filter((t) =>
        styleNames.some((n) => new RegExp(`style=\\{\\[?[\\w.]*\\b${n}\\b`).test(t[1]))
      );
      expect(found.length).toBeGreaterThan(0);
    });
  }
});

// NOT SWEPT. A loose scan (2+ PressableScale in a file that also draws a
// divider) turned up ~30 more candidates — settings sections, the tribunal,
// notification and vault modals, profile tabs. Most are probably not
// edge-to-edge stacks, but some will be, and each needs its row geometry read
// rather than guessed. That is its own task, deliberately not smuggled into
// this one.
