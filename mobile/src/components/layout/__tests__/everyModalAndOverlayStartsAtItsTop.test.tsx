/**
 * Every modal route and every overlay starts at its own helper's top.
 *
 * A route presented as a modal is a sheet on iOS, whose top is below the
 * status bar, and the whole screen on Android, under it: one sum on the inset
 * was wrong on one platform or the other (a 59pt gap at the top of the iOS
 * sheet, or a drag handle under Android's clock). Each modal is drawn here at
 * three top insets on each platform, and must start at useModalTop's value,
 * at the same place on both; each overlay at useOverlayTop's. The modal list
 * is the root layout's own: a route made a modal there fails here until it is
 * measured.
 */
import React, { act } from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { readCode } from '@/test-utils/readCode';
import { INSETS, placesAt, topValues } from '@/test-utils/topEdge';
import { InIosSheet, OVERLAY_GAP, modalTop, overlayTop } from '@/src/components/layout/navMetrics';
import reelToast from '@/src/utils/reelToast';
import { ToastHost } from '@/src/components/ToastHost';
import { TrailerModal } from '@/src/components/film/TrailerModal';
import { CinemaDNACard } from '@/src/components/profile/CinemaDNACard';
import { EmailConfirmationScreen } from '@/src/components/auth/EmailConfirmationScreen';
import { RouteErrorBoundary } from '@/src/components/RouteErrorBoundary';

// Each case draws a whole screen six times (three insets, two platforms): seconds when busy.
jest.setTimeout(60_000);

let mockInsetTop = 59;
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => mockReact.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: mockInsetTop, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
jest.mock('expo-router/react-navigation', () => ({
  ...jest.requireActual('expo-router/react-navigation'),
  useScrollToTop: jest.fn(),
  useIsFocused: () => true,
  useNavigation: () => ({ addListener: () => () => {}, setOptions: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  usePreventRemove: jest.fn(),
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
// The stack's reorderable list, drawn flat (as list-modal.curate.test draws it): no gestures here.
jest.mock('react-native-draggable-flatlist', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  const draw = (c: unknown) => (typeof c === 'function' ? mockReact.createElement(c as never) : (c as React.ReactNode));
  return {
    __esModule: true,
    ScaleDecorator: ({ children }: { children: React.ReactNode }) => children,
    default: ({ ListHeaderComponent, ListFooterComponent, ListEmptyComponent }: Record<string, unknown>) =>
      mockReact.createElement(View, null, draw(ListHeaderComponent), draw(ListEmptyComponent), draw(ListFooterComponent)),
  };
});
jest.mock('@/src/stores/auth', () => {
  // One object, as a store keeps one: a new member each read reruns its effects.
  const state = {
    isAuthenticated: true,
    user: { id: 'me', username: 'kane', role: 'archivist', tier: 'auteur', preferences: {}, created_at: '2024-01-01T00:00:00Z' },
    restoreSession: () => Promise.resolve(),
    updateUser: () => Promise.resolve(),
  };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(state) : state);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useAuthStore };
});
jest.mock('@/src/hooks/useClearance', () => ({
  useClearance: () => ({ held: true, standing: 'held', open: jest.fn(), loading: false }),
}));
/** The compose door: open, or shut with what remains. */
let mockDoorOpen = true;
jest.mock('@/src/hooks/useDoor', () => ({
  useDoor: () => ({
    open: mockDoorOpen, loading: false, films: 2, filmsNeeded: 5, days: 1, daysNeeded: 2,
  }),
}));

type Drawn = {
  file: string;
  name: string;
  draw: () => React.ReactElement;
  params?: Record<string, string>;
  arrange?: () => void;
  /** Done once it is drawn: what makes the overlay appear. */
  after?: () => void;
};
const route = (file: string) => () => { const C = require(`@/${file.replace(/\.tsx$/, '')}`).default; return <C />; };

/** The nine routes the root layout presents as modals, compose in each of its forms. */
const MODALS: Drawn[] = [
  { file: 'app/(modals)/search-modal.tsx', name: 'search', draw: route('app/(modals)/search-modal.tsx') },
  { file: 'app/(modals)/log-modal.tsx', name: 'log a film', draw: route('app/(modals)/log-modal.tsx') },
  { file: 'app/(modals)/notifications-modal.tsx', name: 'notices', draw: route('app/(modals)/notifications-modal.tsx') },
  { file: 'app/(modals)/list-modal.tsx', name: 'a new stack', draw: route('app/(modals)/list-modal.tsx') },
  // The picker is the host's alone: the member hosts the salon it names.
  { file: 'app/(modals)/cover-picker.tsx', name: 'a salon cover', params: { loungeId: 'room' }, draw: route('app/(modals)/cover-picker.tsx'),
    arrange: () => { require('@/src/stores/lounge').useLoungeStore.setState({ lounges: [{ id: 'room', name: 'The Back Row', creator_id: 'me' }] }); } },
  { file: 'app/(modals)/login.tsx', name: 'sign in', draw: route('app/(modals)/login.tsx') },
  { file: 'app/(modals)/social-modal.tsx', name: 'followers', params: { userId: 'me', type: 'followers' }, draw: route('app/(modals)/social-modal.tsx') },
  { file: 'app/(modals)/membership.tsx', name: 'the Society', draw: route('app/(modals)/membership.tsx') },
  { file: 'app/dispatch/compose.tsx', name: 'an essay', params: { kind: 'dossier' }, draw: route('app/dispatch/compose.tsx') },
  { file: 'app/dispatch/compose.tsx', name: 'a take', params: { kind: 'take' }, draw: route('app/dispatch/compose.tsx') },
  { file: 'app/dispatch/compose.tsx', name: 'a ballot', params: { kind: 'ballot' }, draw: route('app/dispatch/compose.tsx') },
  { file: 'app/dispatch/compose.tsx', name: 'the door, shut', params: { kind: 'take' }, draw: route('app/dispatch/compose.tsx'),
    arrange: () => { mockDoorOpen = false; } },
  // Drawn only in the login sheet: its close button is the modal's top.
  { file: 'src/components/auth/EmailConfirmationScreen.tsx', name: 'the confirmation letter',
    draw: () => (
      <EmailConfirmationScreen confirmedEmail="kane@example.com" resending={false} onResend={jest.fn()}
        onClose={jest.fn()} onManualConfirm={jest.fn()} />
    ) },
];

const { useLocalSearchParams } = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock };

/** The places holding `want(inset)` at every inset, or what is missing. */
async function placesHolding(d: Drawn, want: (insetTop: number) => number) {
  const missing: string[] = [];
  let same = null as Set<string> | null;
  for (const insetTop of INSETS) {
    mockInsetTop = insetTop;
    d.arrange?.();
    useLocalSearchParams.mockReturnValue(d.params ?? {});
    let r!: ReturnType<typeof render>;
    await act(async () => {
      r = render(<QueryClientProvider client={testQueryClient({ queries: { enabled: false } })}>{d.draw()}</QueryClientProvider>);
    });
    // Settled: on the real clock, or (an overlay that keeps its own) on the fake one.
    if (d.after) await act(async () => { jest.advanceTimersByTime(0); });
    else await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    if (d.after) await act(async () => { d.after!(); });
    const at = placesAt(r.toJSON(), want(insetTop));
    if (at.size === 0) missing.push(`${Platform.OS} ${insetTop}pt: no top at ${want(insetTop)}, only ${topValues(r.toJSON())}`);
    same = same ? new Set([...same].filter((p) => at.has(p))) : at;
    r.unmount();
    // What it left waiting (a toast's clock) runs out before the next inset is drawn.
    if (d.after) await act(async () => { jest.runOnlyPendingTimers(); });
  }
  return { missing, same: same ?? new Set<string>() };
}

/** Drawn on one platform, the other put back after. */
async function on<T>(os: 'ios' | 'android', fn: () => Promise<T>): Promise<T> {
  const was = Platform.OS;
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
  try { return await fn(); } finally { Object.defineProperty(Platform, 'OS', { get: () => was, configurable: true }); }
}

afterEach(() => {
  mockDoorOpen = true;
  useLocalSearchParams.mockReturnValue({});
});

describe.each(MODALS.map((m) => [`${m.file} (${m.name})`, m] as const))('%s', (_name, modal) => {
  it('starts at the modal’s top: the sheet’s own on iOS, below the status bar on Android', async () => {
    const ios = await on('ios', () => placesHolding(modal, (t) => modalTop(t, 'ios')));
    const android = await on('android', () => placesHolding(modal, (t) => modalTop(t, 'android')));
    expect([...ios.missing, ...android.missing]).toEqual([]);
    // The same place on both platforms, at every inset: the one the helper places.
    expect([...ios.same].filter((p) => android.same.has(p))).not.toEqual([]);
  });
});

it('measures every route the root layout presents as a modal', () => {
  const presented = [...readCode('app/_layout.tsx').matchAll(/name="([^"]+)"\s+options=\{\{\s*presentation:\s*'modal'/g)]
    .map((m) => `app/${m[1]}.tsx`);
  expect(presented.length).toBe(9);
  expect(presented.filter((f) => !MODALS.some((m) => m.file === f))).toEqual([]);
});

// ── the overlays ──────────────────────────────────────────────────────────────

const OVERLAYS: Drawn[] = [
  { file: 'src/components/ToastHost.tsx', name: 'a toast over the app', draw: () => <ToastHost layer="root" />,
    after: () => { reelToast.success('Saved to the watchlist.'); } },
  { file: 'src/components/film/TrailerModal.tsx', name: 'a trailer',
    draw: () => <TrailerModal visible videoId="abc" label="Official Trailer" onClose={jest.fn()} /> },
  { file: 'src/components/profile/CinemaDNACard.tsx', name: 'the cinema DNA card',
    draw: () => <CinemaDNACard user={{ username: 'kane' } as never} analytics={null} onClose={jest.fn()} /> },
  { file: 'src/components/RouteErrorBoundary.tsx', name: 'a jammed route',
    draw: () => <RouteErrorBoundary error={new Error('jammed')} retry={jest.fn() as never} /> },
  { file: 'app/year-in-cinema.tsx', name: 'Year in Cinema’s close button', draw: route('app/year-in-cinema.tsx') },
];

describe.each(OVERLAYS.map((o) => [`${o.file} (${o.name})`, o] as const))('%s', (_name, overlay) => {
  // A toast keeps its own clock; it is run out on a fake one.
  beforeEach(() => { if (overlay.after) jest.useFakeTimers(); });
  afterEach(() => { if (overlay.after) jest.useRealTimers(); });

  it('starts at the overlay’s top, below the status bar, on both platforms', async () => {
    const ios = await on('ios', () => placesHolding(overlay, (t) => overlayTop(t)));
    const android = await on('android', () => placesHolding(overlay, (t) => overlayTop(t)));
    expect([...ios.missing, ...android.missing]).toEqual([]);
    expect([...ios.same].filter((p) => android.same.has(p))).not.toEqual([]);
  });
});

it('an overlay in an iOS sheet starts at the sheet’s own top', async () => {
  const inSheet: Drawn = {
    file: 'src/components/RouteErrorBoundary.tsx', name: 'a jammed modal route',
    draw: () => (
      <InIosSheet.Provider value>
        <RouteErrorBoundary error={new Error('jammed')} retry={jest.fn() as never} />
      </InIosSheet.Provider>
    ),
  };
  const ios = await on('ios', () => placesHolding(inSheet, () => OVERLAY_GAP));
  expect(ios.missing).toEqual([]);
  expect(ios.same.size).toBeGreaterThan(0);
});
