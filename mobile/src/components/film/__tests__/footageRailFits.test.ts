/**
 * THE FOOTAGE rail is a FIXED height and cannot grow to fit its contents.
 *
 * The caption went from one line to two — one was being cut mid-word, which
 * tells a member less than no caption at all — and a fixed rail has to be paid
 * for when you do that, or the captions run into the section beneath. This
 * re-derives the height from the parts rather than asserting the number I
 * happened to write, so raising the caption again fails HERE rather than on a
 * device nobody can build to.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '..', 'FilmMediaCarousel.tsx'), 'utf8');

const num = (re: RegExp): number => {
  const m = re.exec(src);
  if (!m) throw new Error(`could not read ${re} — the guard is measuring nothing`);
  return Number(m[1]);
};

/** The app's own ceiling on Dynamic Type. */
const MAX_SCALE = 1.35;
/** React Native's default line height for a font with none set. */
const LINE = 1.27;

describe('the rail reserves what it draws', () => {
  const railHeight = num(/videoListContainer: \{ height: (\d+) \}/);
  const thumbHeight = num(/videoImg: \{ width: \d+, height: (\d+)/);
  const labelTop = num(/videoLabelWrap: \{ marginTop: (\d+) \}/);
  const typeSize = num(/videoType: \{[^}]*fontSize: (\d+)/);
  const typeGap = num(/videoType: \{[^}]*marginBottom: (\d+)/);
  const nameSize = num(/videoName: \{[^}]*fontSize: (\d+)/);
  const nameLines = num(/style=\{sub\.videoName\} numberOfLines=\{(\d+)\}/);

  it('reads real numbers out of the component', () => {
    // If any of these came back zero the assertions below would pass on air.
    for (const n of [railHeight, thumbHeight, labelTop, typeSize, nameSize, nameLines]) {
      expect(n).toBeGreaterThan(0);
    }
  });

  const needed = (scale: number) =>
    thumbHeight + labelTop
    + Math.ceil(typeSize * scale * LINE) + typeGap
    + Math.ceil(nameSize * scale * LINE) * nameLines;

  it('fits at ordinary type', () => {
    expect(needed(1)).toBeLessThanOrEqual(railHeight);
  });

  it('still fits at the largest type the app allows', () => {
    expect(needed(MAX_SCALE)).toBeLessThanOrEqual(railHeight);
  });

  /**
   * The cap is what makes the line above provable. Without it React Native
   * scales this text with the system setting and does NOT stop — an 11pt
   * caption becomes 30-odd, and a rail that cannot grow spills into the
   * section beneath it.
   */
  it('caps the caption, because an uncapped one has no worst case to test', () => {
    expect(src).toMatch(/\{\.\.\.scaledTextProps\}\s+style=\{sub\.videoName\}/);
    expect(src).toMatch(/\{\.\.\.scaledTextProps\}\s+style=\{sub\.videoType\}/);
  });

  it('would fail if the caption grew again without the rail growing', () => {
    // Proving the instrument: a third line must not fit in the height a
    // two-line caption was paid for.
    const withThreeLines = thumbHeight + labelTop
      + Math.ceil(typeSize * MAX_SCALE * LINE) + typeGap
      + Math.ceil(nameSize * MAX_SCALE * LINE) * 3;
    expect(withThreeLines).toBeGreaterThan(railHeight);
  });
});
