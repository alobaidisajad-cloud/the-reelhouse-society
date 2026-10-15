/**
 * everyMainScreenTracesItsScroll.guard.test.ts — each main screen's list
 * reports its scrolls to Sentry (useScrollTrace), so a stutter there is
 * measured on members' phones.
 *
 * Each route in MAIN_ROUTES names the file that draws its scroll; that file
 * scrolls through CinematicScrollView or CinematicFlashList (which trace every
 * scroll themselves) or calls useScrollTrace / useScrollTraceOf. A main screen
 * added to MAIN_ROUTES with no file here fails, and so does a file that stops
 * tracing.
 */
import { readCode } from '@/test-utils/readCode';
import { MAIN_ROUTES } from '@/src/lib/sentry';

/** Where each main screen's scroll is drawn. */
const SCROLLS: Record<string, string[]> = {
  index: ['app/(tabs)/index.tsx'],
  reels: ['src/components/reels/ReelsFeedList.tsx', 'src/components/reels/ReelsStackList.tsx'],
  dispatch: ['app/(tabs)/dispatch.tsx'],
  darkroom: ['app/(tabs)/darkroom.tsx'],
  lounge: ['app/(tabs)/lounge.tsx'],
  profile: ['app/user/[username].tsx'],
  'lounge/[id]': ['app/lounge/[id].tsx'],
  'film/[id]': ['src/components/film/FilmDetailLayout.tsx'],
  'user/[username]': ['app/user/[username].tsx'],
  'stacks/[id]': ['app/stacks/[id].tsx'],
  'log/[id]': ['app/log/[id].tsx'],
  'dispatch/[id]': ['app/dispatch/[id].tsx'],
};

const TRACED = /<Cinematic(ScrollView|FlashList)\b|\buseScrollTrace(Of)?\(/;

it('names the scroll of every main screen, and only of those', () => {
  expect(Object.keys(SCROLLS).sort()).toEqual([...MAIN_ROUTES].sort());
});

it.each(Object.entries(SCROLLS))('%s traces its scroll', (_route, files) => {
  for (const f of files) expect([f, TRACED.test(readCode(f))]).toEqual([f, true]);
});

it('the shared scrolls trace every scroll they draw', () => {
  for (const f of ['src/components/layout/CinematicScrollView.tsx', 'src/components/layout/CinematicFlashList.tsx']) {
    expect(readCode(f)).toMatch(/useScrollTraceOf\(activeIsScrolling\)/);
  }
});

it('can fail: a file that scrolls without tracing', () => {
  expect(TRACED.test('<FlashList data={x} />')).toBe(false);
  expect(TRACED.test('<ScrollView>{x}</ScrollView>')).toBe(false);
});
