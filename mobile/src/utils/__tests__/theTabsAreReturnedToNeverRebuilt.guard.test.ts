/**
 * theTabsAreReturnedToNeverRebuilt.guard.test.ts — review round 4 (navigation)
 * ─────────────────────────────────────────────────────────────────────────────
 * Filing a take, a ballot or an essay ended with `router.replace('/(tabs)/dispatch')`. The
 * filing sheet is a route on the root stack, over the tab app, so the replace put a NEW tab app
 * where the sheet was: two tab apps, each with its own bar, Concierge and listeners, and
 * Android's back walked through the old one before the app closed. Every filing added another.
 * Leaving a salon, the sign-in, reset and link screens' way home, the page for a path that leads
 * nowhere, and the app's own crash net did the same.
 *
 * A screen goes home by closing back to the tab app already there (`nav.dismissTo`), which
 * makes one only when none is beneath. A replace into the tabs is left only where nothing is
 * beneath to keep: the app router's own fallback for a screen opened cold, and the crash
 * screen's (both behind `canGoBack()`).
 */
import { readCode } from '@/test-utils/readCode';
import { files as universe, rel } from '@/test-utils/universe';

/** A replace whose target is a literal path into the tabs, by any router. */
const INTO_THE_TABS = /\breplace\b[\s\S]{0,60}?\(\s*['"`]\/\(tabs\)/g;

/** Where nothing is beneath: each replace into the tabs runs only when the stack cannot go back. */
const NOTHING_BENEATH = ['src/utils/typedRouter.ts', 'src/components/RouteErrorBoundary.tsx'];

const sweep = () => universe('appCode').map(rel)
  .filter((f) => !f.includes('__tests__'))
  .flatMap((file) => [...readCode(file).matchAll(INTO_THE_TABS)].map(() => file));

describe('a screen goes home to the tab app already there', () => {
  it('no screen replaces itself with the tabs (where a tab app may be beneath)', () => {
    expect(sweep().filter((f) => !NOTHING_BENEATH.includes(f))).toEqual([]);
  });

  it('the two that may do so are still found, so the sweep reads what it means to', () => {
    expect([...new Set(sweep())].sort()).toEqual([...NOTHING_BENEATH].sort());
  });

  it('would catch the replaces that were there, by either router', () => {
    for (const line of [
      "router.replace('/(tabs)/dispatch');",
      "InteractionManager.runAfterInteractions(() => nav.replace('/(tabs)/lounge'));",
      "(router.replace as (h: string) => void)('/(tabs)');",
    ]) expect(line.match(INTO_THE_TABS)).toHaveLength(1);
    expect("nav.dismissTo('/(tabs)/dispatch');".match(INTO_THE_TABS)).toBeNull();
  });
});

describe('a replace into the tabs held in a variable (review round 5)', () => {
  // The sign-in's way home was `nav.replace(landing)`, landing '/(tabs)': a literal sweep cannot
  // read a variable, so nav.replace itself returns to the tab app beneath.
  const loadNav = () => {
    jest.resetModules();
    const router = { replace: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) };
    jest.doMock('expo-router', () => ({ router }));
    const { nav } = require('@/src/utils/typedRouter') as typeof import('@/src/utils/typedRouter');
    return { nav, router };
  };

  it('goes back to the tab app already there, never building another', () => {
    const { nav, router } = loadNav();
    const landing: string = '/(tabs)';
    nav.replace(landing);
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('carries its params as the address does, and leaves every other replace a replace', () => {
    const { nav, router } = loadNav();
    nav.replace('/(tabs)/dispatch', { section: 'wire & takes' });
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/dispatch?section=wire%20%26%20takes');
    nav.replace('/login');
    expect(router.replace).toHaveBeenCalledWith('/login');
  });
});
