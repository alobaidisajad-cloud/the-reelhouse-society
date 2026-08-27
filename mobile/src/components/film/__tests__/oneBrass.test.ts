/**
 * ONE BRASS, EVERYWHERE.
 *
 * Brass is a RAMP — four golds on a diagonal, lit from the top left. A flat
 * `colors.sepia` fill reads as yellow plastic beside the real thing, and the
 * film page puts them within an inch of each other: the stub, the tray's
 * primary act and the hero's logged stamp are all brass plates in the same
 * eyeline.
 *
 * The stamp was the last flat one, and it survived three audits because
 * "one brass" was a rule I remembered rather than one the code enforced. This
 * is the enforcement: any FILLED brass surface must use the ramp.
 *
 * `colors.sepia` as a border, a rule, a glyph tint or an icon colour is fine
 * and common — the rule is about FILLS, which is what reads as a plate.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const FILM = join(__dirname, '..');
const BRASS_FILE = join(__dirname, '..', '..', '..', 'theme', 'brass.ts');

const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

describe('the ramp is stated once', () => {
  const brass = readFileSync(BRASS_FILE, 'utf8');

  it('lives in the theme, not in a component', () => {
    expect(brass).toMatch(/colors\.marqueeGold, colors\.champagne, colors\.sepia, colors\.tarnish/);
    expect(brass).toMatch(/\[0, 0\.34, 0\.62, 1\]/);
  });

  it('and the Concierge disc reads it from there', () => {
    // The disc is where the ramp came from. If it ever forks back to its own
    // copy, the app has two brasses that agree until one is touched.
    const concierge = readFileSync(
      join(__dirname, '..', '..', 'layout', 'ConciergeButton.tsx'), 'utf8');
    expect(concierge).toMatch(/from '@\/src\/theme\/brass'/);
    expect(strip(concierge)).not.toMatch(/const BRASS = \[/);
  });
});

/**
 * The rule is about PLATES — a brass surface with area, which is what reads as
 * machined metal or as plastic. Two things are deliberately not plates:
 *
 *   · a HAIRLINE. `creditRule` is 96x1 under the director's name. A rule is a
 *     line of brass, not a face of it, and there is nothing for a ramp to do
 *     across one pixel.
 *
 *   · the SHARE CARD. LogShareCard and ShareCardModal compose an image a
 *     member posts elsewhere. It is its own artifact with its own design, not
 *     this page's chrome, and its brass is somebody else's decision to make.
 *     Named here so the exemption is a choice on the record rather than a gap.
 */
const NOT_THIS_PAGES_CHROME = ['LogShareCard.tsx', 'ShareCardModal.tsx'];

/**
 * EVERY gold in the ramp, not just `sepia`.
 *
 * The first version of this guard looked for `colors.sepia` alone and passed
 * while the AUTEUR badge was a flat `colors.marqueeGold` pill — a guard that
 * checks one member of a class and reports on the class.
 */
const BRASS_TOKENS = 'sepia|marqueeGold|champagne|tarnish';

/** A fill with area: the style block also sets padding or a real height. */
function flatPlates(src: string): string[] {
  return [...src.matchAll(
    new RegExp(`(\\w+): \\{([^}]*backgroundColor: colors\\.(?:${BRASS_TOKENS})\\b[^}]*)\\}`, 'g'),
  )]
    .filter(([, , body]) => {
      if (/padding/.test(body)) return true;
      const h = /height: (\d+)/.exec(body);
      return h ? Number(h[1]) > 4 : false;
    })
    .map(([, name]) => name);
}

describe('no brass plate is painted flat', () => {
  const files = readdirSync(FILM)
    .filter((f) => /\.tsx$/.test(f))
    .filter((f) => !NOT_THIS_PAGES_CHROME.includes(f));

  it.each(files)('%s uses the ramp for any brass plate', (file) => {
    const src = strip(readFileSync(join(FILM, file), 'utf8'));
    const plates = flatPlates(src);
    if (plates.length === 0) return;
    // A file that fills a plate with sepia must also be drawing the ramp — the
    // fill is then a base underneath it, not the surface a member sees.
    expect(`${file}: ${plates.join(', ')} — ${/BRASS/.test(src)}`).toMatch(/true$/);
  });

  it('the plate detector can tell a plate from a hairline', () => {
    // Proving the instrument: the director's brass rule must NOT be flagged,
    // and a padded pill must be.
    expect(flatPlates('  creditRule: { width: 96, height: 1, backgroundColor: colors.sepia },')).toEqual([]);
    expect(flatPlates('  pill: { paddingVertical: 5, backgroundColor: colors.sepia },')).toEqual(['pill']);
  });

  it('catches every gold in the ramp, not just sepia', () => {
    // The AUTEUR badge is a flat `marqueeGold` pill. A guard that checks one
    // member of a class and reports on the class is worse than no guard.
    expect(flatPlates('  b: { paddingHorizontal: 6, backgroundColor: colors.marqueeGold },')).toEqual(['b']);
    expect(flatPlates('  c: { padding: 4, backgroundColor: colors.champagne },')).toEqual(['c']);
  });

  it('finds the files it is meant to be checking', () => {
    // Vacuous-guard insurance: if the directory listing broke, every case
    // above would pass by having nothing to test.
    expect(files.length).toBeGreaterThan(8);
    expect(files).toContain('FilmHero.tsx');
    expect(files).toContain('FilmStub.tsx');
  });
});

/**
 * ── KNOWN FLAT BRASS OUTSIDE THIS PAGE'S REACH ──────────────────────────────
 * `feed/UserAttributionRow` draws the ★ AUTEUR role badge as a flat
 * `colors.marqueeGold` pill, and it appears on the film page inside every
 * critique card. It is genuinely flat brass and it genuinely sits beside the
 * ramp.
 *
 * It is NOT changed here because that component is shared with the feed, the
 * home pulse and the log form: converting it is a four-surface change and a
 * decision for whoever owns those, not a detail of the film page.
 *
 * Recorded as a test rather than a comment so it stays visible, and so that if
 * somebody does convert it, this fails and points at the exemption to remove.
 */
describe('the one flat brass this page can see but must not fix', () => {
  it('is still the AUTEUR badge in a shared component', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', 'feed', 'UserAttributionRow.tsx'), 'utf8');
    expect(flatPlates(strip(src)).length).toBeGreaterThan(0);
  });
});
