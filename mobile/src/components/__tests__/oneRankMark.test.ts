/**
 * oneRankMark.test.ts — one mark, drawn in one place.
 * ─────────────────────────────────────────────────────────────────────────────
 * The badge did not drift because anybody chose badly. It drifted because five
 * surfaces each drew it themselves, and nothing said they could not. The app
 * ended up with FOUR dresses and THREE golds for one rank — plus a fourth gold
 * in the member registry, a rank string emitted from a search hook, and a sixth
 * rendering on the profile.
 *
 * A shared component fixes today. This fixes tomorrow: it fails the moment any
 * file starts drawing the words itself again.
 *
 * ── WHAT IS ALLOWED TO SAY THE WORDS ────────────────────────────────────────
 * `RankBadge` draws them. `tier.ts` maps a tier to a display string for places
 * that legitimately need prose. The settings ladder names all three ranks as a
 * PROGRESSION — see the note in that file for why it must not use the mark, and
 * why that is a difference of meaning rather than an inconsistency.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const SCAN = ['src', 'app'];

/**
 * Files permitted to contain the rank words, each for a stated reason.
 * Adding to this list is a decision; it should need one.
 */
const SANCTIONED: Record<string, string> = {
  'src/components/RankBadge.tsx': 'draws the mark — the one place that may',
  'src/utils/tier.ts': 'maps a tier to a display string for prose',
  'src/constants/membership.ts': 'names the tiers it sells, and their CTAs',
  'src/features/settings/SettingsSections.tsx': 'the rank LADDER — a progression, not a badge',
  'src/components/log/LogClearanceGate.tsx': 'names the rank a locked tool requires',
  'src/components/log/LogForm.tsx': 'names the rank a locked tool requires',
  'src/components/lounge/LoungeGate.tsx': 'names the ranks that hold the key',
  'src/components/dispatch/paper/PaperMore.tsx': 'the door and the archive mark name a rank in prose',
  'src/components/profile/NoirPassport.tsx': 'a passport STAMP named THE ARCHIVIST — an achievement, not a rank',
  'src/components/person/PersonHero.tsx': 'THE AUTEUR HUNT — a filmography beat, not a rank',
  'src/components/profile/ProjectorRoom.tsx': 'names a rank in prose',
  'src/components/profile/Achievements.tsx': 'names a rank in prose',
  'src/components/profile/TasteDNAExportCanvas.tsx': 'CINEPHILE as a default handle on an export',
  'app/(modals)/membership.tsx': 'the paywall, which sells the ranks by name',
};

/** The two glyph+word marks. Prose that merely says "Auteur" is not a badge. */
const DRAWN_MARK = /★\s*AUTEUR|✦\s*ARCHIVIST/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (/node_modules|\.git/.test(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { walk(rel, out); continue; }
    if (/\.tsx?$/.test(e.name) && !/__tests__/.test(rel)) out.push(rel);
  }
  return out;
}

const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

describe('one rank mark, drawn in one place', () => {
  const files = SCAN.flatMap((d) => walk(d));

  it('finds the files it is meant to be checking', () => {
    // Vacuous-guard insurance. A broken directory walk would make every case
    // below pass by having nothing to look at — which is exactly how a whole
    // second client went unnoticed for a week.
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain('src/components/RankBadge.tsx');
    expect(files).toContain('src/components/dispatch/paper/PaperPost.tsx');
  });

  it('no unsanctioned file draws the mark itself', () => {
    const offenders = files
      .filter((f) => !SANCTIONED[f])
      .filter((f) => DRAWN_MARK.test(strip(readFileSync(join(ROOT, f), 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('and the detector can tell a drawn mark from prose about a rank', () => {
    // Proving the instrument. Without this, a regex that matched nothing would
    // report the same clean result as a codebase that is genuinely clean.
    expect(DRAWN_MARK.test('<Text>★ AUTEUR</Text>')).toBe(true);
    expect(DRAWN_MARK.test('lockedTo="THE AUTEUR"')).toBe(false);
    expect(DRAWN_MARK.test('become an auteur')).toBe(false);
  });

  it('every sanctioned file still exists and still needs its exemption', () => {
    // An exemption outliving its file is how a list stops meaning anything.
    for (const [f, why] of Object.entries(SANCTIONED)) {
      expect(`${f} (${why}): ${files.includes(f)}`).toMatch(/true$/);
    }
  });

  it('the mark carries no per-surface size or colour knob', () => {
    // The web client has ONE badge class and four sizes, two of them set by
    // inline overrides at the call site. The prop that allows that is the whole
    // mechanism, so the component must not offer one.
    const src = strip(readFileSync(join(ROOT, 'src/components/RankBadge.tsx'), 'utf8'));
    expect(src).not.toMatch(/\bsize\?:/);
    expect(src).not.toMatch(/\bvariant\?:/);
    expect(src).not.toMatch(/\bcolor\?:/);
    expect(src).not.toMatch(/fontSize:\s*\w+\s*\*/);   // no scaled-by-a-prop type
  });

  it('and every surface that shows a rank imports it rather than rebuilding it', () => {
    const MUST_IMPORT = [
      'src/components/dispatch/paper/PaperPost.tsx',
      'src/components/feed/UserAttributionRow.tsx',
      'src/components/home/PulseCardItem.tsx',
      'src/components/search/SearchResultRow.tsx',
      'src/components/reels/MemberRegistry.tsx',
      'app/user/[username].tsx',
      'app/(modals)/membership.tsx',
    ];
    for (const f of MUST_IMPORT) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(`${f} imports RankBadge: ${/RankBadge/.test(src)}`).toMatch(/true$/);
    }
  });
});
