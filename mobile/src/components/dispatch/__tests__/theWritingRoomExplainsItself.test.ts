/**
 * theWritingRoomExplainsItself.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The room's tools worked. Nothing said what they were.
 *
 * Six lucide icons sat on the rail: `Bold` and `Italic` read on sight, and
 * `Type`, `Quote`, `Minus` and `Link2` do not say heading, block quote, section
 * break, link. The placeholder's answer was "Use Markdown for formatting" — a
 * wall to anyone who does not already know what markdown is, and redundant to
 * anyone who does. Press HEADING and `##` appears in your sentence with no
 * explanation offered anywhere.
 *
 * This holds the three things that fixed it, and the one that a dossier can now
 * SAY about itself.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const COMPOSE = readFileSync(join(ROOT, 'app', 'dispatch', 'compose.tsx'), 'utf8');

const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const CODE = strip(COMPOSE);

/** Every tool the rail offers, and the word that must sit under it. */
const TOOLS = ['BOLD', 'ITALIC', 'HEADING', 'QUOTE', 'BREAK', 'LINK'];

describe('the writing room explains itself', () => {
  it('every tool on the rail carries its name', () => {
    const missing = TOOLS.filter((w) => !CODE.includes(`>${w}</Text>`));
    expect(missing).toEqual([]);
  });

  it('and the placeholder invites writing rather than naming a technology', () => {
    expect(CODE).not.toMatch(/Use Markdown/i);
    expect(CODE).toMatch(/placeholder="Begin\. The house is listening\."/);
  });

  it('a dossier can say what it is about', () => {
    // The reader has always drawn a film credit and a series line; the store has
    // always accepted them. Only this screen never set them, so an Auteur could
    // write the long form with no way to say which film it was about.
    expect(CODE).toMatch(/<FilmPicker/);
    expect(CODE).toMatch(/<SeriesPicker/);
    expect(CODE).toMatch(/seriesId:/);
    expect(CODE).toMatch(/seriesTitle:/);
    expect(CODE).toMatch(/partNumber:/);
    expect(CODE).toMatch(/\bfilm,/);
  });

  it('and the three parts of a series always travel together', () => {
    // `series_whole` refuses a half-set series at the database. Reading all
    // three from ONE piece of state is what makes that constraint unreachable
    // rather than something to be caught.
    expect(CODE).toMatch(/seriesId:\s*series\?\.id\s*\?\?\s*null/);
    expect(CODE).toMatch(/seriesTitle:\s*series\?\.title\s*\?\?\s*null/);
    expect(CODE).toMatch(/partNumber:\s*series\?\.part\s*\?\?\s*null/);
  });

  it('and no cover control, because a cover has nowhere to live', () => {
    // `EssayHead` draws one from `film.backdropPath`, but `dispatch_posts` has a
    // single image column and `toFilm` maps it to the POSTER. A cover picker
    // here would be a button that saves nothing — the exact "designed, not
    // wired" failure this work exists to remove. It needs a column first.
    expect(CODE).not.toMatch(/setCover|coverOpen|CoverPicker/);
  });

  it('the detector reads the file it thinks it does', () => {
    // Two of the assertions above are ABSENCES, and a wrong path satisfies both.
    expect(COMPOSE.length).toBeGreaterThan(5000);
    expect(CODE).toMatch(/ComposeDossierScreen/);
    expect(CODE).toMatch(/insertFormatting/);
  });

  it('and strips prose before asserting an absence', () => {
    // The file explains in comments why there is no cover and why the markdown
    // wall is gone. Matching raw source would test the explanation.
    expect(strip('// Use Markdown for formatting\nconst a = 1;')).not.toMatch(/Use Markdown/);
    expect(strip('{/* CoverPicker */}\nconst b = 2;')).not.toMatch(/CoverPicker/);
  });
});
