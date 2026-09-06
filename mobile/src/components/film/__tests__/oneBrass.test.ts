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
 * ── THE EXEMPTION, CLOSED ───────────────────────────────────────────────────
 * This block used to assert that `feed/UserAttributionRow` STILL drew the
 * ★ AUTEUR badge as a flat `colors.marqueeGold` pill. It was written as a
 * failing tripwire rather than a comment: the conversion was "a four-surface
 * change and a decision for whoever owns those", so the guard held the debt
 * visible and promised to fail the moment somebody paid it.
 *
 * It has been paid. The badge is one shared component now — `RankBadge` — and
 * the Auteur's plate is the ramp, so the old assertion would fail for the right
 * reason. What replaces it is the assertion that matters from here: the badge
 * is drawn ONCE, and the one place that draws it uses the ramp.
 *
 * The other half of that debt was three golds for one rank — #DCA63A here,
 * #DAA520 on the home pulse, #D4A520 in search. A shared component cannot drift
 * that way, which is the real reason it is shared.
 */
describe('the AUTEUR badge is one brass, in one place', () => {
  const badge = readFileSync(
    join(__dirname, '..', '..', 'RankBadge.tsx'), 'utf8');

  it('draws its plate with the ramp, not a flat fill', () => {
    expect(flatPlates(strip(badge))).toEqual([]);
    expect(badge).toMatch(/from '@\/src\/theme\/brass'/);
    expect(strip(badge)).toMatch(/colors=\{BRASS\}/);
  });

  it('and no surface keeps a hand-mixed gold for it', () => {
    // The three that existed. A regex over the four files rather than a memory
    // of having fixed them: this is the class, and the class is what must stay
    // closed.
    for (const rel of [
      ['..', '..', 'feed', 'UserAttributionRow.tsx'],
      ['..', '..', 'home', 'PulseCardItem.tsx'],
      ['..', '..', 'search', 'SearchResultRow.tsx'],
      ['..', '..', 'RankBadge.tsx'],
    ]) {
      const src = strip(readFileSync(join(__dirname, ...rel), 'utf8'));
      expect(`${rel[rel.length - 1]}: ${src.match(/#D[A4]A?[0-9A-F]{3,4}/gi) ?? []}`)
        .toMatch(/: $/);
    }
  });

  it('and every surface that shows a rank imports the one badge', () => {
    for (const rel of [
      ['..', '..', 'feed', 'UserAttributionRow.tsx'],
      ['..', '..', 'home', 'PulseCardItem.tsx'],
      ['..', '..', 'search', 'SearchResultRow.tsx'],
      ['..', '..', 'dispatch', 'paper', 'PaperPost.tsx'],
    ]) {
      const src = readFileSync(join(__dirname, ...rel), 'utf8');
      expect(`${rel[rel.length - 1]} imports RankBadge: ${/RankBadge/.test(src)}`)
        .toMatch(/true$/);
      // And does not keep drawing its own.
      expect(`${rel[rel.length - 1]} draws its own: ${/★ AUTEUR|✦ ARCHIVIST/.test(strip(src))}`)
        .toMatch(/false$/);
    }
  });
});
