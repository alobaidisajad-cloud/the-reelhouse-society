/**
 * THE PLAYERS is a fixed-height rail, and it just gained a line.
 *
 * One line in a 100pt card turned Anne Hathaway into "Anne Hatha…" on the one
 * section of the page whose entire job is naming people. Shrink-to-fit did not
 * rescue it: at 0.75 of 14pt the name still did not clear the card, so it
 * shrank AND clipped — the worst of both.
 *
 * A fixed rail cannot grow to fit what you put in it, so the second line has
 * to be paid for. This re-derives the height from the card's own parts, so
 * adding a third line fails HERE and not on a device nobody can build to.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '..', 'CastCarousel.tsx'), 'utf8');

const num = (re: RegExp): number => {
  const m = re.exec(src);
  if (!m) throw new Error(`could not read ${re} — this guard is measuring nothing`);
  return Number(m[1]);
};

/** React Native's default line height for a font with none set. */
const LINE = 1.27;
/**
 * Both name and role carry `adjustsFontSizeToFit` with a 0.75 floor, so the
 * worst case for HEIGHT is the unshrunk size — shrinking only ever helps.
 */
const railHeight = num(/<View style=\{\{ height: (\d+) \}\}>/);
const photoHeight = num(/castPhotoWrap: \{ width: \d+, height: (\d+)/);
const photoGap = num(/castPhotoWrap: \{[^}]*marginBottom: (\d+)/);
const nameSize = num(/castName: \{[^}]*fontSize: (\d+)/);
const nameGap = num(/castName: \{[^}]*marginBottom: (\d+)/);
const roleSize = num(/castRole: \{[^}]*fontSize: (\d+)/);
const nameLines = num(/style=\{s\.castName\} numberOfLines=\{(\d+)\}/);

const needed = (lines: number) =>
  photoHeight + photoGap
  + Math.ceil(nameSize * LINE) * lines + nameGap
  + Math.ceil(roleSize * LINE);

describe('the rail reserves what it draws', () => {
  it('reads real numbers out of the component', () => {
    for (const n of [railHeight, photoHeight, nameSize, roleSize, nameLines]) {
      expect(n).toBeGreaterThan(0);
    }
  });

  it('gives a billed actor two lines for their name', () => {
    expect(nameLines).toBe(2);
  });

  it('fits the two lines it now draws', () => {
    expect(needed(nameLines)).toBeLessThanOrEqual(railHeight);
  });

  it('would fail if the name grew again without the rail growing', () => {
    // Proving the instrument rather than trusting a pass.
    expect(needed(nameLines + 1)).toBeGreaterThan(railHeight);
  });

  it('has not left slack that would look like a gap under the rail', () => {
    expect(railHeight - needed(nameLines)).toBeLessThan(Math.ceil(nameSize * LINE));
  });
});
