/**
 * navigationMock — expo-router/react-navigation as every test meets it, the one base for every mock of it.
 *
 * The real module, with a screen's focus answered outside a navigator too: a test that mounts a
 * screen with no navigator around it gets "focused", which is what a mounted screen is (Buster
 * pauses when his screen is not focused). jest.setup.ts mocks the module with this. A test's own
 * jest.mock('expo-router/react-navigation', ...) REPLACES that mock whole: written from scratch, it held
 * only what its screen called the day it was written, and threw when the room's light came to read
 * NavigationContext (useScreenSeen). So every test's own mock spreads this base first and changes
 * only what it means to (theNavigationMockHasOneBase.guard.test.ts).
 */
export function navigationMock(): Record<string, unknown> {
  const actual = jest.requireActual('expo-router/react-navigation');
  return {
    ...actual,
    useIsFocused: () => {
      try { return actual.useIsFocused(); } catch { return true; }
    },
  };
}
