/**
 * EVERY READING OF THE PHONE'S CLOCK IS JUDGED (P4.32).
 *
 * The phone's clock can be a day wrong. A time weighed against one the house wrote, or against
 * another device (which draft copy is newer, a row's place among the house's rows, "… AGO", a
 * suspension's end, what day it is), reads the house clock (src/lib/houseClock.ts). The phone's
 * own clock is right only for what never leaves the phone: how long something took, a throttle,
 * an id, a stamp read back on the same phone, and the session's dates, which supabase-js weighs
 * against the phone's clock itself. This file counts each app file's readings of the phone's
 * clock (`Date.now()`, `new Date()`), read from its code, and fails on a file whose count is not
 * the one judged here, so a new reading is judged before it lands.
 */
import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';

/** A reading of the phone's clock, as the app's code spells one. */
const PHONE_CLOCK = /\bDate\.now\(\)|\bnew Date\(\)/g;

/** Each file that reads the phone's clock, how many times, and why the phone's clock is the right one there. */
const JUDGED: Record<string, { readings: number; why: string }> = {
  'src/lib/houseClock.ts': { readings: 1, why: 'the house clock is the phone\'s clock and how far the house found it off' },
  'src/lib/authSessionStorage.ts': { readings: 2, why: 'a session is dated by the clock supabase-js weighs it against: the phone\'s' },
  'src/lib/supabase.ts': { readings: 3, why: 'how long a request took, and when it was asked and heard, for the house clock' },
  'src/lib/queryClient.ts': { readings: 5, why: 'how long the cache took to keep and to read, and its age, stamped and read on this phone' },
  'src/lib/tmdb.ts': { readings: 5, why: 'a cached answer\'s age and a search\'s time budget' },
  'src/lib/pushPrimer.ts': { readings: 1, why: 'when this phone last asked, read back on this phone' },
  'src/providers/AppBootstrapper.tsx': { readings: 5, why: 'how long the app was away, and how long since the rank was read' },
  'src/services/FeedService.ts': { readings: 3, why: 'when a read was asked, weighed against the taps stamped on this phone (markCounts)' },
  'src/services/ProfileWriteService.ts': { readings: 1, why: 'a picture\'s file name, only for it to be new' },
  'src/stores/auth.ts': { readings: 2, why: 'how long since the rank was read' },
  'src/stores/blockStore.ts': { readings: 1, why: 'when this phone last kept the lists, read back on this phone' },
  'src/stores/dispatch.ts': { readings: 2, why: 'how long a read took to parse' },
  'src/stores/domain/archiveSlice.ts': { readings: 1, why: 'a row\'s id until the house gives it one' },
  'src/stores/domain/socialSlice.ts': { readings: 6, why: 'a throttle, and a cached profile\'s age' },
  'src/stores/lounge.ts': { readings: 6, why: 'a cached profile\'s age, a message\'s id until the house gives it one, and the send, create and typing throttles' },
  'src/stores/markCounts.ts': { readings: 2, why: 'when a tap was made, weighed against when a read was asked, both on this phone' },
  'src/hooks/useAuthThrottle.ts': { readings: 3, why: 'how long a member waits between tries' },
  'src/hooks/useProfileData.ts': { readings: 4, why: 'how long since the profile was read' },
  'src/hooks/useScreenReady.tsx': { readings: 3, why: 'how long a screen took to be ready' },
  'src/components/ErrorBoundary.tsx': { readings: 1, why: 'an error\'s reference, only for it to be new' },
  'src/components/OfflineBanner.tsx': { readings: 2, why: 'how long the phone has been offline' },
  'src/components/PressableScale.tsx': { readings: 1, why: 'a double tap\'s throttle' },
  'src/features/settings/DataVault.tsx': { readings: 1, why: 'how often an import\'s progress is drawn' },
  'src/utils/TactileEngine.ts': { readings: 1, why: 'a haptic\'s throttle, so quick taps never stack their buzz' },
  'src/utils/handleNotice.ts': { readings: 2, why: 'a requested handle\'s age, stamped and read on this phone' },
  'src/utils/lastRoom.ts': { readings: 3, why: 'when a room was last open, stamped and read on this phone' },
  'src/utils/lastTab.ts': { readings: 4, why: 'when a tab was last open, stamped and read on this phone' },
  'src/utils/requestReview.ts': { readings: 2, why: 'when the review was last asked for, stamped and read on this phone' },
  'app/(modals)/membership.tsx': { readings: 3, why: 'a checkout\'s throttle' },
  'app/film-reviews/[id].tsx': { readings: 1, why: 'when a read was asked, weighed against the taps stamped on this phone (markCounts)' },
  'app/log/[id].tsx': { readings: 1, why: 'when a read was asked, weighed against the taps stamped on this phone (markCounts)' },
  'app/stacks/[id].tsx': { readings: 1, why: 'when a read was asked, weighed against the taps stamped on this phone (markCounts)' },
};

const found: Record<string, number> = {};
for (const f of files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)) {
  const n = (readCode(f).match(PHONE_CLOCK) ?? []).length;
  if (n) found[f] = n;
}

describe("the phone's clock", () => {
  it('is found where the app reads it: the house clock itself among them', () => {
    expect(found['src/lib/houseClock.ts']).toBe(1);
  });

  it('is read only where it is judged, as often as it is judged', () => {
    const unjudged = Object.entries(found)
      .filter(([f, n]) => JUDGED[f]?.readings !== n)
      .map(([f, n]) => `${f}: ${n} reading(s), judged ${JUDGED[f]?.readings ?? 0}`);
    expect(unjudged).toEqual([]);
  });

  it('judges no file that no longer reads it, and says why for each', () => {
    expect(Object.keys(JUDGED).filter((f) => !found[f])).toEqual([]);
    for (const [f, { why }] of Object.entries(JUDGED)) expect(`${f}: ${why.length >= 20}`).toBe(`${f}: true`);
  });
});
