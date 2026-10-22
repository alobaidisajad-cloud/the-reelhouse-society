/**
 * expoRouterMock — expo-router as every test meets it, the one base for every mock of it.
 *
 * jest.setup.ts mocks expo-router with this. A test's own jest.mock('expo-router', ...) REPLACES
 * that mock whole, so a test that wrote its own from scratch lacked whatever a screen came to call
 * later: useFocusEffect, which a screen's ready mark (useScreenReady) waits on, threw in the stack
 * page's tests and in its generator, after the stack gained its mark. So every test's own mock
 * spreads this base first and changes only what it means to (theRouterMockHasOneBase.guard.test.ts).
 */
import React from 'react';
import { Text } from '@/src/components/text';

export function expoRouterMock(): Record<string, unknown> {
  return {
    // canGoBack/canDismiss as the real router has them: nav.back() and
    // nav.dismiss() ask before they go (a raw back with no history does nothing).
    router: {
      push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(),
      canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => true), dismiss: jest.fn(), dismissAll: jest.fn(),
    },
    useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() })),
    useLocalSearchParams: jest.fn(() => ({})),
    useGlobalSearchParams: jest.fn(() => ({})),
    useSegments: jest.fn(() => []),
    usePathname: jest.fn(() => '/'),
    useNavigation: jest.fn(() => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() })),
    Link: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement(Text, props, children),
    Redirect: ({ href }: { href: string }) => React.createElement(Text, { testID: 'redirect' }, `Redirect:${href}`),
    Stack: { Screen: ({ children }: { children?: React.ReactNode }) => children ?? null },
    Tabs: { Screen: ({ children }: { children?: React.ReactNode }) => children ?? null },
    Slot: () => null,
    // An effect WITH its cleanup, as the real hook is; a memoised callback runs once.
    useFocusEffect: (cb: React.EffectCallback) => React.useEffect(cb, [cb]),
  };
}
