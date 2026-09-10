/**
 * aDraftSurvivesThePhone.test.tsx — the backup, and the question it asks.
 * ─────────────────────────────────────────────────────────────────────────────
 * Four thousand words used to live in exactly one place: MMKV on one handset. A
 * lost phone, a cracked screen or a reinstall took every one of them. This is
 * not about writing on two devices — it is that a member's unpublished work had
 * NO BACKUP.
 *
 * Two things decide whether this is an improvement or a new way to lose work:
 *
 *   IT ASKS, IT NEVER MERGES. A merge rule for prose is a rule for silently
 *   producing text nobody wrote. Nothing is overwritten until the member
 *   chooses — which is also what makes every branch testable on ONE device, by
 *   seeding a remote row with a newer stamp.
 *
 *   IT DOES NOT TRACK KEYSTROKES. The first sketch pushed on a ten-second
 *   debounce. Against the real ceiling — 25,000 characters — that is about nine
 *   megabytes an hour of somebody's mobile data for a file that only matters if
 *   their phone dies.
 */
import { whichCopy, SYNC_EVERY_MS, SYNC_CEILING } from '@/src/utils/draftSync';

describe('which copy the room opens with', () => {
  const older = '2026-09-08T21:40:00.000Z';
  const newer = '2026-09-10T09:12:00.000Z';

  it('the local one, when the house is holding nothing', () => {
    expect(whichCopy(older, null)).toBe('local');
    expect(whichCopy(older, undefined)).toBe('local');
  });

  it('THE POINT OF ALL THIS: the remote one, when this phone has nothing', () => {
    // A new handset, or an install that has never held this essay. There is
    // nothing here to lose, so it is taken without asking.
    expect(whichCopy(null, newer)).toBe('remote');
  });

  it('the local one, when the house is holding something older', () => {
    expect(whichCopy(newer, older)).toBe('local');
  });

  it('the local one on a TIE, because a tie is not a newer version', () => {
    expect(whichCopy(older, older)).toBe('local');
  });

  it('and it ASKS when the house is holding something newer', () => {
    expect(whichCopy(older, newer)).toBe('ask');
  });

  it('never overwrites on an unreadable stamp', () => {
    // A corrupt timestamp on either side is not a reason to replace somebody's
    // writing. The one in front of them wins and nothing is thrown away.
    expect(whichCopy('not a date', newer)).toBe('local');
    expect(whichCopy(older, 'not a date')).toBe('local');
  });

  it('decides on the MEMBER’s clock, not the server’s', () => {
    /**
     * The question is "which of these did the writer touch most recently", not
     * "which reached the server first". A push from a phone that was offline for
     * an hour arrives late and is still the older piece of writing — which is
     * why `saved_at` comes from the client and `updated_at` is never consulted.
     */
    const draftSync = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', '..', 'utils', 'draftSync.ts'), 'utf8',
    );
    expect(draftSync).toContain('saved_at: savedAt');
    expect(draftSync).not.toMatch(/updated_at.*whichCopy|whichCopy.*updated_at/);
  });
});

describe('the rhythm is a backup, not a keystroke', () => {
  it('is two minutes, not ten seconds', () => {
    expect(SYNC_EVERY_MS).toBe(120_000);
    // Anything under a minute is a keystroke debounce wearing a backup's name.
    expect(SYNC_EVERY_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('refuses to send what the database would refuse', () => {
    // The essay is 25,000 plus a title, a film and a series with JSON around
    // them. A push the CHECK would bounce should never leave the phone, or it
    // goes out again every two minutes for the life of the draft.
    expect(SYNC_CEILING).toBe(30_000);
  });

  it('the room backs up on an interval, on background, AND on the way out', () => {
    const room = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', '..', '..', 'app', 'dispatch', 'compose.tsx'),
      'utf8',
    );
    expect(room).toContain('setInterval(backUp, SYNC_EVERY_MS)');
    expect(room).toMatch(/AppState\.addEventListener\('change', \(s\) => \{ if \(s !== 'active'\) backUp\(\); \}\)/);
    // The cleanup runs one last time — closing the room is the moment most
    // likely to be followed by the app being killed.
    expect(room).toMatch(/clearInterval\(every\); sub\.remove\(\); backUp\(\);/);
  });
});

describe('the backup goes when the house has the words', () => {
  const room = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', '..', '..', 'app', 'dispatch', 'compose.tsx'),
    'utf8',
  );

  it('on filing, on amending, on discarding and on START CLEAN', () => {
    // Four exits, and a backup left behind at any one of them is an essay that
    // reappears on the next phone after the member threw it away.
    const drops = room.match(/dropDraft\(user\?\.id/g) ?? [];
    expect(drops.length).toBeGreaterThanOrEqual(6);   // two kinds at three of the four
  });

  it('and never before — the local clear is what proves the order', () => {
    // `if (filed)` guards both: nothing is thrown away until there is a row to
    // throw it away for.
    expect(room).toMatch(/if \(filed\) \{ clearDraft\(user\?\.id, 'dossier'\); void dropDraft/);
  });
});
