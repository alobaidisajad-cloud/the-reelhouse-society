/**
 * theCorridorIsOpen.test.ts — the wall came down; it must not go back up.
 * ─────────────────────────────────────────────────────────────────────────────
 * A Cinephile's Lounge was dark three layers deep, and each layer had to be
 * found separately:
 *
 *   1. the SCREEN returned a full-screen poster instead of the page
 *   2. the poster described salons in PROSE and showed not one real room
 *   3. the DATA LAYER had never asked for a salon — `fetchLounges` was behind
 *      the same `isArchivist` check, so even showing the list would have
 *      rendered nothing
 *
 * Only the third is invisible from the screen, and it is the one that would
 * have made "show the real rooms" ship as an empty page. The server was always
 * willing: `lounges` SELECT is `USING (true)` for authenticated, and public
 * salon messages are readable by any signed-in member — verified as a real free
 * member against production, 5 rooms and 6 messages.
 *
 * So this guards the SHAPE of the fix, at all three layers, because a
 * regression at any one of them looks like a working page from the other two.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

const corridor = strip(readFileSync(join(ROOT, 'app/(tabs)/lounge.tsx'), 'utf8'));
const room = strip(readFileSync(join(ROOT, 'app/lounge/[id].tsx'), 'utf8'));
const nav = strip(readFileSync(join(ROOT, 'src/components/layout/TopNavBar.tsx'), 'utf8'));

describe('the corridor is open', () => {
  describe('layer 1 — the screen', () => {
    it('does not put up a wall for a member who merely lacks the rank', () => {
      // The defect exactly: `!isAuthenticated || !isArchivist` returning a
      // full-screen gate instead of the page.
      expect(corridor).not.toMatch(/if\s*\(\s*!isAuthenticated\s*\|\|\s*!isArchivist\s*\)/);
    });

    it('still requires signing in — a salon roster is not for the street', () => {
      expect(corridor).toMatch(/if\s*\(\s*!isAuthenticated\s*\)\s*\{/);
    });
  });

  describe('layer 2 — what the page says', () => {
    it('does not tell a Cinephile the room is exclusive to somebody else', () => {
      // "ARCHIVIST EXCLUSIVE" was true when only an Archivist could reach the
      // tab. It is now the first thing a guest reads on a page full of rooms
      // they are welcome to walk into, so it is conditional on holding the rank.
      const line = /headerMetaLine[\s\S]{0,200}?isArchivist \?/;
      expect(corridor).toMatch(line);
    });
  });

  describe('layer 3 — the data layer, the one nobody can see', () => {
    it('fetches the salons for everyone signed in, not only for Archivists', () => {
      // This is the layer that would have made the whole fix ship as an empty
      // page: the screen renders a list, the list has nothing in it, and
      // nothing on screen says why.
      // Anchored on CODE, not on a comment. Anchoring on the comment
      // "AppState-aware" made indexOf return -1 against comment-stripped
      // source, so the slice was the empty string — the toMatch failed loudly
      // but the `not.toMatch` below passed VACUOUSLY, which is the half that
      // would have shipped a regression.
      const at = corridor.indexOf('fetchLounges();');
      expect(at).toBeGreaterThan(-1);
      const effect = corridor.slice(Math.max(0, at - 400), corridor.indexOf('const onRefresh'));
      expect(effect.length).toBeGreaterThan(200);

      expect(effect).toMatch(/if\s*\(\s*!isAuthenticated\s*\)\s*return;/);
      expect(effect).not.toMatch(/!isArchivist/);
    });
  });

  describe('the clearance moved to the acts that need it', () => {
    it('founding a salon asks the registry, not a bare tier check', () => {
      // Founding and sitting are separate rights and the database has always
      // enforced them separately — tr_tier_gate_lounges vs
      // tr_tier_gate_lounge_members. The client had them as one wall.
      expect(corridor).toMatch(/useClearance\('create-a-lounge'/);
    });

    it('taking a seat asks the registry too', () => {
      expect(room).toMatch(/useClearance\('the-lounge'/);
    });

    it('and the ESTABLISH button is still SHOWN to a member who cannot use it', () => {
      // The vanish is what this replaces: a member who cannot found a salon
      // still learns that founding one is possible.
      expect(corridor).toMatch(/ESTABLISH/);
      expect(corridor).toMatch(/foundRoom\.held \? setShowCreate\(true\) : foundRoom\.open\(\)/);
    });
  });

  describe('the nav', () => {
    it('shows one door to everyone, not a key for some', () => {
      // A key over the door of a room you may walk into and read is the wrong
      // promise. It said "you cannot come in"; the truth is "come in, listen,
      // and speak when you hold the rank".
      expect(nav).not.toMatch(/hasLoungeAccess\s*\?/);
      expect(nav).toMatch(/icon=\{MessageSquareText\}/);
    });
  });

  it('the scans can SEE these files — not passing on an empty read', () => {
    expect(corridor.length).toBeGreaterThan(4000);
    expect(room.length).toBeGreaterThan(4000);
    expect(nav.length).toBeGreaterThan(1000);
  });
});
