/**
 * theReelIsTheAdvertisement.test.ts — the door in front of an open window.
 * ─────────────────────────────────────────────────────────────────────────────
 * A wall in front of the Reel ("Admit One Required · Join the Society to
 * access The Reel.") protects nothing. The `anon` role reads every log, member
 * and stack behind it through deliberate COLUMN grants: the film, the rating,
 * the writing, the poster, the handle and the portrait, never email, streaks,
 * badges or anything about suspensions. The same writing is on the public web
 * at /feed, /user/:username and /log/:id with no account at all.
 *
 * So a wall keeps nothing private. It only hides the best argument for joining
 * — members' actual writing about actual films — from the one person deciding
 * whether to join. Reading needs no name; each act asks for one where it is.
 *
 * ── AND THE LOUNGE KEEPS ITS WALL, WHICH IS THE POINT ───────────────────────
 * The two decisions look contradictory and are not, so both are pinned here. A
 * stranger reads 0 lounges and 0 messages at the database — the roster is not
 * for the street, and the schema says so too. A sweep "making the signed-out
 * experience consistent" would be wrong in one direction or the other, and
 * this is what tells it which.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

const RAW_REEL = readFileSync(join(ROOT, 'app/(tabs)/reels.tsx'), 'utf8');
const reel = strip(RAW_REEL);
const corridor = strip(readFileSync(join(ROOT, 'app/(tabs)/lounge.tsx'), 'utf8'));

describe('the reel is the advertisement', () => {
  it('the scans can SEE these files — not passing on an empty read', () => {
    // Against an empty string every `not.toMatch` below passes.
    expect(reel.length).toBeGreaterThan(10000);
    expect(corridor.length).toBeGreaterThan(4000);
  });

  describe('the wall', () => {
    it('is gone — a stranger is not turned away at the door', () => {
      expect(reel).not.toMatch(/Admit One Required/);
      expect(reel).not.toMatch(/if\s*\(\s*!isAuthenticated\s*\)\s*\{\s*return\s*\(/);
    });

    it('took its furniture with it', () => {
      // Its styles, left behind, would send a reader looking for a screen that does not exist.
      for (const dead of ['gateContainer', 'gateSealWrap', 'gateTitle', 'gateSub', 'gateCta']) {
        expect(`${dead}: ${reel.includes(dead)}`).toBe(`${dead}: false`);
      }
      // And the seal it rendered is no longer imported.
      expect(reel).not.toMatch(/SocietySeal/);
    });

    it('and reading is asked for unconditionally, or the page opens empty', () => {
      // The layer nobody can see from the screen. If the feed hooks were
      // conditional on a member, removing the wall would ship a blank page and
      // nothing on it would say why.
      for (const hook of ['useCommunityFeed()', 'useStacksFeed(']) {
        expect(reel).toContain(hook);
      }
      expect(reel).not.toMatch(/isAuthenticated\s*&&\s*use(Community|Stacks)Feed/);
    });
  });

  describe('the acts still ask, where the act is', () => {
    it('there is one way to ask, not one per button', () => {
      expect(reel).toMatch(/const askForAName = useCallback\(/);
      // A bare '/login', as every other act gate in the app asks.
      expect(reel).toMatch(/askForAName = useCallback\(\(\) => \{[\s\S]{0,160}?'\/login'/);
    });

    it('EVERY act that writes asks first — the class, not the three I remembered', () => {
      // Every onPress that opens a composing modal, found in the source, so a new one is covered.
      const handlers = [...reel.matchAll(/onPress=\{\(\)\s*=>\s*\{([\s\S]*?)\}\}/g)].map((m) => m[1]);
      expect(handlers.length).toBeGreaterThan(3);

      const writes = handlers.filter((h) => /'\/(log|list)-modal'/.test(h));
      // If the pattern stops matching, `writes` is empty and the loop proves nothing.
      expect(writes.length).toBeGreaterThanOrEqual(3);

      for (const h of writes) {
        expect(h).toMatch(/if \(!isAuthenticated\) return askForAName\(\);/);
      }
    });

    it('FOLLOWING is roped, not hidden — a stranger still learns an orbit exists', () => {
      // The chip is the only place the app says so; the tap is the invitation.
      expect(reel).toMatch(/label="FOLLOWING"/);
      const gated = [...reel.matchAll(/if \(f === 'following' && !isAuthenticated\) return askForAName\(\);/g)];
      // Both switchers: logs and stacks.
      expect(gated).toHaveLength(2);
    });

    it('and switching BACK to everything is never gated', () => {
      // A wholesale gate would trap a stranger in a filter whose way out asks for a login.
      expect(reel).not.toMatch(/if \(!isAuthenticated\) return askForAName\(\);\s*if \(f === (feedFilter|stackFilter)\)/);
      expect(reel).toMatch(/f === 'following' && !isAuthenticated/);
    });

    it('the member registry cannot be reached by someone who cannot follow', () => {
      // It lives only in the FOLLOWING feed, which a stranger is asked for a name before entering.
      expect(reel).toMatch(/<MemberRegistry visible=\{feedFilter === 'following'\}/);
    });
  });

  describe('the Lounge is a different answer on purpose', () => {
    it('still asks for a name at its door', () => {
      // On purpose: anon reads zero lounges at the database, so an open door shows an empty room.
      expect(corridor).toMatch(/if\s*\(\s*!isAuthenticated\s*\)\s*\{\s*return [^;]*<LoungeGate[^>]*\/>[^;]*;/);
    });

    it('and says why, where the next reader will look', () => {
      expect(readFileSync(join(ROOT, 'app/(tabs)/lounge.tsx'), 'utf8'))
        .toMatch(/a salon roster is not for the street/i);
    });
  });
});
