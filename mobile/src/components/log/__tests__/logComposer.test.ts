/**
 * logComposer.test.ts — what only the composer's SOURCE, or its style values,
 * can promise.
 *
 * Everything a member can do or see on this page is tested by MOUNTING it —
 * theComposerKeepsItsWord.test.tsx: every control by name, what is chosen,
 * the entries that open themselves, the Vault that never previews, the ropes
 * and where they return to, the seal that says why, the verdict, the film
 * behind the record, reduced motion, the type scale.
 *
 * Everything that is a matter of LAYOUT is measured on the drawn page —
 * zz-composer.gen through mockups/tools/layout.cjs and yoga-parity.cjs at every
 * width and text size: each chip against its neighbour, every line box at the
 * largest type, every verdict word at 320pt, the seal over the last row.
 *
 * Dates: the no-Intl lint rule, app-wide (eslint.config.js).
 *
 * What is left here cannot be seen by either, and each says why.
 */
import { StyleSheet, type ViewStyle } from 'react-native';
import { readCode } from '@/test-utils/readCode';
import { st } from '@/src/components/log/LogModalStyles';
import { EDGE_LIT } from '@/src/theme/light';

const FORM = 'src/components/log/LogForm.tsx';
const STYLES = 'src/components/log/LogModalStyles.ts';
const DESK = 'src/components/log/EditorialDesk.tsx';
const SCREEN = 'app/(modals)/log-modal.tsx';
const SEAL = 'src/components/log/LogSealBar.tsx';

/** Brace-matched, so a one-line style cannot swallow the next block. */
function style(src: string, name: string): string {
  const at = src.search(new RegExp(`\\b${name}\\s*[:=]\\s*\\{`));
  if (at === -1) return '';
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return '';
}
const num = (body: string, prop: string) => {
  const m = body.match(new RegExp(`(?<![\\w.])${prop}\\s*:\\s*(-?[\\d.]+)`));
  return m ? Number(m[1]) : undefined;
};

describe('the seal rides the keyboard', () => {
  // Why source: jest has no keyboard. Following the keyboard's frame and
  // listening for its events render identically here, and differ on a phone —
  // keyboardDismissMode is "interactive", so the keyboard's height changes
  // CONTINUOUSLY under a dragging finger, and a bar that waits for an event
  // jumps at the end of the drag.
  it('follows the keyboard’s frame, and never listens for its events', () => {
    const seal = readCode(SEAL);
    expect(seal).toMatch(/\buseAnimatedKeyboard\s*\(/);
    expect(seal).not.toMatch(/keyboardDidShow|keyboardWillShow|Keyboard\.addListener/);
    expect(readCode(SCREEN)).toMatch(/keyboardDismissMode="interactive"/);
  });
});

/**
 * The docked seal reserves its own space twice over, from ONE hand-typed
 * number: the scroll ends at `insets.bottom + SEAL_BAR_HEIGHT + 16`, and the
 * bar slides away by `SEAL_BAR_HEIGHT + insets.bottom` when the keyboard opens.
 * The first is measured on the drawn page (the audit's UNDER: a last row the
 * bar covers even scrolled to the end). The second happens only when a
 * keyboard opens, which no drawing has — so the number is checked against the
 * bar it stands for, here.
 */
describe('the seal reserves enough room for itself', () => {
  const CAP = 1.35;   // scaledTextProps, the largest the line can be asked to grow

  it('SEAL_BAR_HEIGHT covers the bar it is standing in for', () => {
    const seal = readCode(SEAL);
    const declared = Number(seal.match(/SEAL_BAR_HEIGHT\s*=\s*(\d+)/)![1]);
    const bar = style(seal, 'bar');
    const line = style(seal, 'line');
    const press = style(seal, 'press');
    // Everything above the safe-area inset, which the caller adds separately.
    const lineBox = Math.ceil(num(line, 'fontSize')! * CAP * 1.3);
    const real = num(bar, 'paddingTop')! + lineBox + num(line, 'marginBottom')! + num(press, 'minHeight')!
      + 14;                                  // the bar's own paddingBottom, added in the component
    expect(real).toBeGreaterThan(0);         // a failed parse must not pass vacuously
    expect(declared).toBeGreaterThanOrEqual(real);
  });

  it('and both reservations read that same number', () => {
    expect(readCode(SCREEN)).toMatch(/paddingBottom:\s*insets\.bottom\s*\+\s*SEAL_BAR_HEIGHT/);
    expect(readCode(SEAL)).toMatch(/translateY:[\s\S]{0,80}SEAL_BAR_HEIGHT \+ insets\.bottom/);
  });
});

describe('the verdict’s slot never changes height', () => {
  // Why source: three states share one box so nothing moves under a finger at
  // the moment it touches a reel. The drawn page shows each state; nothing
  // compares their heights. The box is held by its minimum, which must be
  // taller than the tallest state (a 34pt word + a 9pt gap + a 10pt line, in
  // 18 + 4 of padding).
  it('is held open by a minimum the tallest state fits inside', () => {
    const slot = style(readCode('src/components/log/LogVerdict.tsx'), 'slot');
    expect(num(slot, 'minHeight')).toBeGreaterThanOrEqual(18 + 34 + 9 + 14 + 4);
  });
});

describe('the sheet is lit, not shadowed', () => {
  // A style VALUE, asked directly — not read out of the file.
  it('catches the booth light on its top edge, casts no black shadow, and never clips', () => {
    const sheet: ViewStyle = StyleSheet.flatten(st.sheet);
    expect(sheet).toEqual(expect.objectContaining(EDGE_LIT));
    // Black on the house's black is invisible; on the lit room it reads as soot.
    expect(sheet.shadowOpacity ?? 0).toBe(0);
    expect(sheet.shadowRadius ?? 0).toBe(0);
    // A view that clips cannot show anything outside itself — the bug fixed four
    // times on the record.
    expect(sheet.overflow).not.toBe('hidden');
    // Android draws elevation from the painted background's outline, so both
    // belong on the same view.
    expect(sheet.elevation).toBeGreaterThan(0);
    expect(sheet.backgroundColor).toBeTruthy();
  });
});

describe('a nested horizontal list cannot render nothing', () => {
  // Why source: jest's FlashList draws every row whatever its container. On a
  // phone a horizontal FlashList inside a vertical ScrollView has no bounded
  // height to measure against and draws NOTHING — the exact report on the
  // Editorial Desk. So the rows here must be a plain scroller.
  it.each([DESK, FORM])('%s uses a plain scroller', (file) => {
    const src = readCode(file);
    expect(src).not.toMatch(/<FlashList/);
    expect(src).toMatch(/<ScrollView\s+horizontal/);
  });
});

describe('no style is left behind by the restructure', () => {
  // Why source: a style nobody uses renders nothing, so no render can find it.
  // Twenty-seven were orphaned when the boxes went, and a dead style is a box
  // waiting to be reinstated by someone who finds it and assumes it means
  // something.
  it('every style in the composer’s sheet is used', () => {
    const names = [...readCode(STYLES).matchAll(/^\s{4}([A-Za-z0-9_]+):\s*\{/gm)].map((m) => m[1]);
    const users = [FORM, DESK, 'src/components/log/AuteurToolkit.tsx', SEAL, SCREEN,
      'src/components/log/LogIndexEntry.tsx',
      'src/components/log/LogClearanceGate.tsx',
      'src/components/log/LogFormBody.tsx',
      'src/components/log/LogSearchEngine.tsx',
      'app/(modals)/search-modal.tsx',
    ].map(readCode).join('');
    expect(names.length).toBeGreaterThan(20);
    const orphans = names.filter((n) => !new RegExp('st\\.' + n + '\\b').test(users) && !new RegExp('modalSt\\.' + n + '\\b').test(users));
    expect(orphans).toEqual([]);
  });
});
