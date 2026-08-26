/**
 * holdingsFit.test.ts — the six doors, and the words under them.
 *
 * Each card's bottom line is `gloss + gap + count`. Both used to carry
 * `flexShrink: 0`, so neither would yield: a gloss too long for its column did
 * not ellipsis, it pushed out of the card and over its neighbour. Nothing
 * measured it, so the ceiling was invisible — and it is low. Two columns inside
 * a 40pt inset with a 14pt gutter leaves 133pt per card on a 320pt phone, and
 * at maximum Dynamic Type a five-digit count eats most of it.
 *
 * This is what stopped "rated & written" (15 characters) from being the answer.
 *
 * Advances are deliberately pessimistic — Courier Prime is monospace so 0.6em
 * is exact; Rye is budgeted at 0.68, above its true average.
 */
import { COLLECTION_CARD_GLOSSES } from '../profileComputed';
import { s } from '../profileStyles';

const COURIER = 0.6;
const RYE = 0.68;

/** holdWrap: paddingHorizontal 20 each side, gap 14 between two columns. */
const INSET = 20;
const GUTTER = 14;
const columnWidth = (screen: number) => (screen - INSET * 2 - GUTTER) / 2;

/** holdBase: gap 6. holdSub 9.5 Courier. holdCount 14 Rye. */
const GLOSS_PT = 9.5;
const COUNT_PT = 14;
const BASE_GAP = 6;

const WIDTHS = [320, 360, 375, 390, 402, 414, 430];
/**
 * 1 is what almost everyone sees. 1.15 is a common bump. 1.35 is the ceiling
 * `scaledTextProps` allows, and is deliberately NOT in the must-fit set — see
 * the second block.
 */
const COMFORTABLE = [1, 1.15];

/** A heavy member's five-digit tally — the widest a count realistically gets. */
const WORST_COUNT = '12,345';

const demand = (gloss: string, scale: number) =>
  gloss.length * GLOSS_PT * scale * COURIER +
  BASE_GAP +
  WORST_COUNT.length * COUNT_PT * scale * RYE;

describe('every room gloss sits whole beside its count', () => {
  for (const scale of COMFORTABLE) {
    for (const screen of WIDTHS) {
      it.each(COLLECTION_CARD_GLOSSES)(
        `"%s" at ${screen}pt, text ${scale}x`,
        (gloss: string) => {
          expect(demand(gloss, scale)).toBeLessThanOrEqual(columnWidth(screen));
        },
      );
    }
  }
});

/**
 * ── THE EXTREME, AND WHY IT IS NOT A FAILURE ────────────────────────────────
 * At the ceiling of Dynamic Type, on the narrowest phone this app supports,
 * beside a five-digit tally, the line does not fit — and it did not fit BEFORE
 * this change either. "WATCHED" needs 137pt of 133. That triple extreme has
 * always overflowed; nothing measured it, so nobody knew.
 *
 * What matters is HOW it fails. `holdSub` used to carry `flexShrink: 0` beside
 * a count that also cannot shrink, so neither yielded and the pair pushed out
 * of the card and over its neighbour. Now the gloss yields first and takes an
 * ellipsis: the count is a number and must stay whole, the gloss is a word and
 * can lose its tail.
 *
 * These pin that arrangement, because the arrangement is the actual fix.
 */
describe('at the extreme it truncates rather than overlapping', () => {
  const HOLD_SUB = s.holdSub as Record<string, unknown>;
  const HOLD_COUNT = s.holdCount as Record<string, unknown>;

  it('the gloss is allowed to give way', () => {
    expect(HOLD_SUB.flexShrink).toBe(1);
    // Without this a shrinking flex child still refuses to go below its content
    // width, which is the whole overflow in one property.
    expect(HOLD_SUB.minWidth).toBe(0);
  });

  it('the count never gives way, because half a number is a wrong number', () => {
    expect(HOLD_COUNT.flexShrink).toBe(0);
  });

  it('the case that needs it is real, and is not new', () => {
    const narrow = columnWidth(320);
    // The word this pass introduced…
    expect(demand('OPINIONS', 1.35)).toBeGreaterThan(narrow);
    // …and the one that was already there, failing the same way.
    expect(demand('WATCHED', 1.35)).toBeGreaterThan(narrow);
  });

  it('and the roomiest phone is comfortable even at the ceiling', () => {
    expect(demand('OPINIONS', 1.35)).toBeLessThanOrEqual(columnWidth(430));
  });
});

describe('the gloss set itself', () => {
  it('is the six rooms and nothing else', () => {
    expect(COLLECTION_CARD_GLOSSES).toHaveLength(6);
  });

  it('no longer calls the Ledger a diary', () => {
    // On Letterboxd a diary is films by DATE WATCHED — this app's Archive,
    // which sits directly above the Ledger in the same column.
    expect(COLLECTION_CARD_GLOSSES).not.toContain('DIARY');
  });

  it('says what the Ledger actually holds', () => {
    // Rated OR written. Not "written" — that would be false for every row the
    // member marked and never wrote about.
    expect(COLLECTION_CARD_GLOSSES).toContain('OPINIONS');
  });

  it('keeps every gloss inside the eight-character ceiling', () => {
    // The measured budget at 320pt / 1.35x beside a five-digit count. Written
    // out so the next person adding a room sees the limit before the layout
    // finds it for them.
    const overlong = COLLECTION_CARD_GLOSSES.filter((g) => g.length > 9);
    expect(overlong).toEqual([]);
  });
});
