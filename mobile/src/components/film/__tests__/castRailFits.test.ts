/**
 * THE PLAYERS is a fixed-height rail, and it reserves room for its text.
 *
 * One line in a 100pt card turned Anne Hathaway into "Anne Hatha…" on the one
 * section of the page whose entire job is naming people. Shrink-to-fit did not
 * rescue it: at 0.75 of 14pt the name still did not clear the card, so it
 * shrank AND clipped — the worst of both. So the name has two lines, and a
 * fixed rail cannot grow to fit them: the room has to be paid for.
 *
 * It was paid for at the DEFAULT text size only. At the largest size the app
 * allows, a two-line name overran the rail by 7pt, and roles in one row sat at
 * two heights. The rail and the name's reserve are now computed from the text
 * size (`castCardMetrics`), and this checks that computation against the
 * card's own parts at every size the app can draw.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  castCardMetrics, PHOTO_H, PHOTO_GAP, NAME_SIZE, NAME_LINES, NAME_GAP, ROLE_SIZE, RAIL_HEM,
} from '../CastCarousel';
import { scaledTextProps } from '@/src/constants/textScaling';

// The component module imports native pieces this test never renders (hoisted
// above the imports by jest).
jest.mock('@shopify/flash-list', () => ({ FlashList: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));

const src = readFileSync(join(__dirname, '..', 'CastCarousel.tsx'), 'utf8');

/** React Native's default line height for a face with none set. */
const LINE = 1.27;
const CAP = scaledTextProps.maxFontSizeMultiplier;
/** Every size worth checking: the default, the steps between, and the cap. */
const SCALES = [1, 1.1, 1.2, 1.3, CAP];

/**
 * Both name and role carry `adjustsFontSizeToFit` with a 0.75 floor, so the
 * worst case for HEIGHT is the unshrunk size — shrinking only ever helps.
 * Worked out here independently of the component, line by line.
 */
const drawn = (k: number) =>
  PHOTO_H + PHOTO_GAP
  + Math.ceil(NAME_SIZE * k * LINE) * NAME_LINES + NAME_GAP
  + Math.ceil(ROLE_SIZE * k * LINE);

describe('the rail reserves what it draws', () => {
  it('is wired: the rail and the name block really use the computation', () => {
    expect(src).toMatch(/<View style=\{\{ height: rail \}\}>/);
    expect(src).toMatch(/minHeight: nameBlock/);
    expect(src).toMatch(/numberOfLines=\{NAME_LINES\}/);
    expect(src).toMatch(/castCardMetrics\(useTextScale\(\)\)/);
    // The parts the arithmetic reads are the parts the styles draw.
    expect(src).toMatch(/height: PHOTO_H,[^}]*marginBottom: PHOTO_GAP/);
    expect(src).toMatch(/castName: \{[^}]*fontSize: NAME_SIZE[^}]*marginBottom: NAME_GAP/);
    expect(src).toMatch(/castRole: \{[^}]*fontSize: ROLE_SIZE/);
  });

  it('gives a billed actor two lines for their name', () => {
    expect(NAME_LINES).toBe(2);
  });

  it('is unchanged at the default size: 214 and 36', () => {
    expect(castCardMetrics(1)).toEqual({ rail: 214, nameBlock: 36 });
  });

  it.each(SCALES)('fits what it draws at text size %s', (k) => {
    expect(castCardMetrics(k).rail).toBe(drawn(k) + RAIL_HEM);
  });

  /**
   * A one-line name and a two-line name in the same row put their roles on
   * different baselines unless the name's block is reserved at its full two
   * lines — at the size being drawn, not at the default.
   */
  it.each(SCALES)('reserves two full name lines at text size %s', (k) => {
    expect(castCardMetrics(k).nameBlock).toBe(Math.ceil(NAME_SIZE * k * LINE) * NAME_LINES);
  });

  it('grows with the text, so the largest size is not drawn in the default rail', () => {
    expect(castCardMetrics(CAP).rail).toBeGreaterThan(castCardMetrics(1).rail);
  });

  it('has not left slack that would look like a gap under the rail', () => {
    for (const k of SCALES) {
      expect(castCardMetrics(k).rail - drawn(k)).toBeLessThan(Math.ceil(NAME_SIZE * k * LINE));
    }
  });
});
