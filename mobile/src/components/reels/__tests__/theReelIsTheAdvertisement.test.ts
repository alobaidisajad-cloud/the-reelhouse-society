/**
 * theReelIsTheAdvertisement.test.ts — the door in front of an open window.
 * ─────────────────────────────────────────────────────────────────────────────
 * The Reel used to answer a signed-out visitor with a full-screen wall:
 * "Admit One Required · Join the Society to access The Reel."
 *
 * It protected nothing. Asked of production directly, the `anon` role already
 * reads every byte behind it — 316 logs, 33 members, 15 stacks — through
 * deliberate COLUMN grants that hand a stranger the film, the rating, the
 * writing, the poster, the handle and the portrait while withholding email,
 * streaks, badges and everything about suspensions. Somebody designed precisely
 * what a stranger may see; the app then refused to show them any of it. The
 * same writing is on the public web at this moment, at /feed, /user/:username
 * and /log/:id, with no account at all.
 *
 * So the wall did not keep anything private. It only meant the single best
 * argument for joining — members' actual writing about actual films — was the
 * one thing nobody could look at before deciding whether to join.
 *
 * ── AND THE LOUNGE KEEPS ITS WALL, WHICH IS THE POINT ───────────────────────
 * The two decisions look contradictory and are not, so both are pinned here. A
 * stranger reads 0 lounges and 0 messages at the database — the roster is not
 * for the street, and the schema says so too. A later sweep "making the
 * signed-out experience consistent" would be wrong in one direction or the
 * other, and this is what tells it which.
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
    // Every assertion below is a `not.toMatch` or a count. Against an empty
    // string all of them pass, and the suite would report the wall removed on a
    // file it never opened.
    expect(reel.length).toBeGreaterThan(10000);
    expect(corridor.length).toBeGreaterThan(4000);
  });

  describe('the wall', () => {
    it('is gone — a stranger is not turned away at the door', () => {
      expect(reel).not.toMatch(/Admit One Required/);
      expect(reel).not.toMatch(/if\s*\(\s*!isAuthenticated\s*\)\s*\{\s*return\s*\(/);
    });

    it('took its furniture with it', () => {
      // Six styles dressed that wall. Left behind they would send the next
      // reader looking for a screen that no longer exists.
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
      // A bare '/login', matching every other act gate in the app. The two
      // places that promised MEMBERSHIP rather than a sign-in were outliers,
      // and one of them was this screen's wall.
      expect(reel).toMatch(/askForAName = useCallback\(\(\) => \{[\s\S]{0,160}?'\/login'/);
    });

    it('EVERY act that writes asks first — the class, not the three I remembered', () => {
      /**
       * Enumerated from the source rather than listed by hand: find every
       * onPress that opens a composing modal, and require the ask inside it. A
       * fourth button added later is covered by this without anybody
       * remembering to come back here.
       */
      const handlers = [...reel.matchAll(/onPress=\{\(\)\s*=>\s*\{([\s\S]*?)\}\}/g)].map((m) => m[1]);
      expect(handlers.length).toBeGreaterThan(3);

      const writes = handlers.filter((h) => /'\/(log|list)-modal'/.test(h));
      // The tripwire that matters: if the regex above ever stops matching the
      // real handlers, `writes` is empty and every check below is vacuous.
      expect(writes.length).toBeGreaterThanOrEqual(3);

      for (const h of writes) {
        expect(h).toMatch(/if \(!isAuthenticated\) return askForAName\(\);/);
      }
    });

    it('FOLLOWING is roped, not hidden — a stranger still learns an orbit exists', () => {
      // Removing the chip would remove the only place the app says so. It
      // stays, and the tap is the invitation.
      expect(reel).toMatch(/label="FOLLOWING"/);
      const gated = [...reel.matchAll(/if \(f === 'following' && !isAuthenticated\) return askForAName\(\);/g)];
      // Both switchers — logs and stacks. One of the two is the easy miss.
      expect(gated).toHaveLength(2);
    });

    it('and switching BACK to everything is never gated', () => {
      // The empty states offer GLOBAL REEL and GLOBAL STACKS. Gating the
      // switcher wholesale would have trapped a member inside a filter with a
      // button that bounced them to a login they did not need.
      expect(reel).not.toMatch(/if \(!isAuthenticated\) return askForAName\(\);\s*if \(f === (feedFilter|stackFilter)\)/);
      expect(reel).toMatch(/f === 'following' && !isAuthenticated/);
    });

    it('the member registry cannot be reached by someone who cannot follow', () => {
      // It carries a FOLLOW button and lives only in the empty FOLLOWING feed,
      // which a stranger is now redirected away from before reaching.
      expect(reel).toMatch(/<MemberRegistry visible=\{feedFilter === 'following'\}/);
    });
  });

  describe('the Lounge is a different answer on purpose', () => {
    it('still asks for a name at its door', () => {
      // Not an oversight and not an inconsistency to tidy up: anon reads zero
      // lounges and zero messages at the database. The fiction and the schema
      // agree, and opening this door would show a stranger an empty room.
      expect(corridor).toMatch(/if\s*\(\s*!isAuthenticated\s*\)\s*\{\s*return <LoungeGate \/>;/);
    });

    it('and says why, where the next reader will look', () => {
      expect(readFileSync(join(ROOT, 'app/(tabs)/lounge.tsx'), 'utf8'))
        .toMatch(/a salon roster is not for the street/i);
    });
  });
});
