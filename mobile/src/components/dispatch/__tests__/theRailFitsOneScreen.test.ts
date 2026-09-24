/**
 * theRailFitsOneScreen.test.ts — the six tools, and the budget that sized them.
 * ─────────────────────────────────────────────────────────────────────────────
 * The writing room's format rail carries six tools, each an icon with its NAME
 * under it, because six unlabelled icons meant a member had to already know what
 * markdown was to use a rail that exists so they would not have to.
 *
 * The names used to be 6.5pt. That was not a typographic choice — it was
 * arithmetic. At 10pt padding, a 52pt minimum and 8pt gaps, six buttons cost
 * 388pt of a 390pt phone, and 6.5 was the largest size at which all six still
 * fit one screen. The rail bought "no scrolling" with a label a member with
 * ordinary eyesight cannot read and could not enlarge, because it also wore
 * `decorativeTextProps` — the prop for stamps and watermarks.
 *
 * The chrome paid for the type instead: padding 8, minimum 48, 6pt gaps, and
 * `scaledTextProps` so the names grow with the member's setting. The names went
 * to the house's 8.5pt label size first (365pt, 25 spare), then to the 10pt type
 * floor (theTypeFloor.test.ts), with their tracking tightened from 1.2 to 0.9 so
 * they grew taller rather than wider. Measured against the real rendered rail:
 * 379pt. All six still fit a 390pt phone, with 11pt spare instead of 2.
 *
 * (The first 10pt measurement read 358pt a button: the renderer drew a
 * horizontal ScrollView's content as a column. It lays it in a row now, as the
 * phone does, and the widths below are the row's.)
 *
 * ── WHY THIS TEST IS NOT JUST AGREEING WITH ITSELF ──────────────────────────
 * Jest has no layout engine, so the widths are MODELLED from the style
 * constants. A model is only worth something if it reproduces reality, so the
 * first thing below checks it against widths measured in a browser from the
 * real rendered plate. If the model drifts from those, the test says so before
 * it says anything about the budget.
 */
/** The six, and their names — the same list `theWritingRoomExplainsItself` pins. */
const TOOLS = ['BOLD', 'ITALIC', 'HEADING', 'QUOTE', 'BREAK', 'LINK'];

/**
 * Widths measured in a browser against the real rendered rail (a capture of the
 * writing room's own screen test — mockups/capture.ts) at 10pt names with 0.9
 * tracking, 8pt padding and a 48pt minimum — button boxes, in points.
 */
const MEASURED: Record<string, number> = {
  BOLD: 48, ITALIC: 54.3, HEADING: 64.3, QUOTE: 51.2, BREAK: 50.6, LINK: 48,
};
const MEASURED_TOTAL = 379; // 346.5 of buttons and gaps, and the rail's 32pt padding

/**
 * The advance width of one character in the sub face, as a fraction of the font
 * size. Solved from the measurement: HEADING is 7 characters and rendered a
 * 64.3pt box at 10pt with 0.9 letter-spacing and 8pt padding a side, so
 *   (64.3 - 16) / 7 = 6.9 = 10k + 0.9  ->  k = 0.6
 * which is the advance ratio of a typewriter face, and a sane answer.
 */
const ADVANCE = 0.6;

const labelWidth = (word: string, fontSize: number, letterSpacing: number) =>
  word.length * (fontSize * ADVANCE + letterSpacing);

describe('the writing room rail fits one screen', () => {
  // The screen's stylesheet is not exported, so the numbers are written here and
  // pinned against the source in the last two cases below — which is what makes
  // a change to any one of them fail this rather than slip past it.
  const TOOL_WORD = { fontSize: 10, letterSpacing: 0.9 };
  const TOOL_BTN = { paddingHorizontal: 8, minWidth: 48 };
  const RAIL = { gap: 6, paddingHorizontal: 16 };
  const PHONE = 390;

  const boxFor = (word: string) =>
    Math.max(TOOL_BTN.minWidth, labelWidth(word, TOOL_WORD.fontSize, TOOL_WORD.letterSpacing) + TOOL_BTN.paddingHorizontal * 2);

  it('the model reproduces the widths measured from the real rail', () => {
    for (const word of TOOLS) {
      const modelled = boxFor(word);
      const real = MEASURED[word];
      // Within 6%: the model charges letter-spacing after the last character
      // and the engine does not, so it runs slightly wide — which is the right
      // direction for a budget.
      const off = Math.abs(modelled - real) / real;
      expect(`${word}: modelled ${modelled.toFixed(1)} vs measured ${real} (${(off * 100).toFixed(1)}% off)`)
        .toMatch(/\((?:[0-5]\.\d|0)%/);
    }
  });

  it('the six tools and their five gaps fit a 390pt phone', () => {
    const content = TOOLS.reduce((sum, w) => sum + boxFor(w), 0)
      + (TOOLS.length - 1) * RAIL.gap
      + RAIL.paddingHorizontal * 2;
    expect(`${Math.round(content)}pt of ${PHONE}pt`).toBe(`381pt of ${PHONE}pt`);
    expect(content).toBeLessThan(PHONE);
  });

  it('the measured total agrees, and leaves real room — not two points of it', () => {
    expect(MEASURED_TOTAL).toBeLessThan(PHONE);
    // 11pt: the type floor spent 14 of the 25 the chrome bought, on names a
    // member can read. Ten is the least this rail may keep before the next
    // change to it has to be measured again.
    expect(PHONE - MEASURED_TOTAL).toBeGreaterThanOrEqual(10);
  });

  it('the old numbers would NOT fit — the budget is the reason they changed', () => {
    const old = { fontSize: 6.5, letterSpacing: 1.2, pad: 10, min: 52, gap: 8 };
    const oldContent = TOOLS.reduce(
      (sum, w) => sum + Math.max(old.min, labelWidth(w, old.fontSize, old.letterSpacing) + old.pad * 2), 0,
    ) + (TOOLS.length - 1) * old.gap + RAIL.paddingHorizontal * 2;
    // 388 measured, and the model lands beside it: the old rail spent its whole
    // width to keep a label nobody could read.
    expect(Math.round(oldContent)).toBeGreaterThan(380);
    // And at 8.5pt WITHOUT the chrome change it overflows, which is the trade
    // this test exists to record.
    const naive = TOOLS.reduce(
      (sum, w) => sum + Math.max(old.min, labelWidth(w, 8.5, 1.2) + old.pad * 2), 0,
    ) + (TOOLS.length - 1) * old.gap + RAIL.paddingHorizontal * 2;
    expect(naive).toBeGreaterThan(PHONE);
  });

  it('the source still carries the numbers this budget was computed from', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '..', 'app', 'dispatch', 'compose.tsx'), 'utf8',
    );
    // `[^}]*?` and not `[\s\S]*?`: a lazy match over ANY character does not stop
    // at the end of the style object, so when `toolWord` was mutated to 6.5 the
    // pattern simply ran on and found a different `fontSize: 8.5` further down
    // the file and passed. That mutant survived until this line was narrowed.
    expect(src).toMatch(/toolWord:\s*\{[^}]*?fontSize:\s*10\b[^}]*?letterSpacing:\s*0\.9\b/);
    expect(src).toMatch(/toolBtn:\s*\{[^}]*?paddingHorizontal:\s*8\b/);
    expect(src).toMatch(/toolBtn:\s*\{[^}]*?minWidth:\s*48\b/);
    expect(src).toMatch(/toolsScroll:\s*\{[^}]*?gap:\s*6\b/);
    // The names must SCALE. A frozen label is what made 6.5pt unfixable from
    // the member's own settings.
    expect(src).toMatch(/style=\{styles\.toolWord\} \{\.\.\.scaledTextProps\}/);
    expect(src).not.toMatch(/style=\{styles\.toolWord\} \{\.\.\.decorativeTextProps\}/);
  });

  it('every tool this budget counts is really on the rail', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '..', 'app', 'dispatch', 'compose.tsx'), 'utf8',
    );
    for (const word of TOOLS) expect(`${word}: ${src.includes(`>${word}</Text>`)}`).toBe(`${word}: true`);
    // Nothing beyond the six — a seventh tool changes the arithmetic.
    const onRail = (src.match(/style=\{styles\.toolWord\}/g) ?? []).length;
    expect(onRail).toBe(TOOLS.length);
  });
});
