/**
 * Every modal route, bottom sheet and bottom overlay ends above its foot.
 *
 * A modal reaches the foot of the screen on both platforms, and so does a
 * sheet: each drew its foot from its own sum on the inset (floors of 12, 24,
 * 28 and 40; gaps of 8, 14, 16 and 20), and one, the Share to Lounge sheet,
 * none at all. Each is drawn here at three bottom insets (an SE's 0, an older
 * notch phone's 21, a home-indicator iPhone's 34), and each foot must be its
 * navMetrics helper's value at the same place every time: a scroll's end
 * (useContentBottom), a docked bar on the edge and the scroll above it, a
 * sheet's foot (useSheetBottom), or an overlay's place above the tab bar
 * (useOverlayBottom). The modals are the page-top test's own
 * (everyModalAndOverlayStartsAtItsTop), drawn the same way.
 */
import React, { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { placesHoldingFoot } from '@/test-utils/bottomEdge';
import {
  DOCKED_BAR_GAP, SCROLL_END_GAP, aboveDockedBar, bottomEdge, contentBottom, sheetBottom, tabBarHeight,
} from '@/src/components/layout/navMetrics';
import { CURATE_BAR_HEIGHT } from '@/app/(modals)/list-modal';
import { DOCK, DOCK_REACH } from '@/src/components/society/PurchaseDock';
import OfflineBanner from '@/src/components/OfflineBanner';
import StandingNotice from '@/src/components/StandingNotice';
import NoteSheet from '@/src/components/log/NoteSheet';
import LogSealBar from '@/src/components/log/LogSealBar';
import { ActionSheet } from '@/src/components/lounge/ActionSheet';
import { CreateLoungeSheet } from '@/src/components/lounge/CreateLoungeSheet';
import { AtTheDoorPanel } from '@/src/components/lounge/AtTheDoorPanel';
import { LoungeSettingsPanel } from '@/src/components/lounge/LoungeSettingsPanel';
import { ContentActionSheet } from '@/src/components/moderation/ContentActionSheet';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import AvatarCropSheet from '@/src/components/profile/AvatarCropSheet';
import FollowRequestsPanel from '@/src/components/profile/FollowRequestsPanel';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
import { EmailConfirmationScreen } from '@/src/components/auth/EmailConfirmationScreen';
import { PaperKeyWell } from '@/src/components/dispatch/paper/PaperKeyWell';
import { ProfileService } from '@/src/services/ProfileWriteService';
import { ESSAY_FOOT, ESSAY_FOOT_GAP } from '@/app/dispatch/compose';

// The sheets' drag, drawn flat (as theNoteSheetOffersOnlyWhatIsReal draws it): no gestures here.
jest.mock('react-native-gesture-handler', () => {
  const mockReact = require('react');
  const RN = require('react-native');
  const chain: Record<string, unknown> = new Proxy({}, { get: () => () => chain });
  return {
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => mockReact.createElement(RN.View, null, children),
    GestureDetector: ({ children }: { children: React.ReactNode }) => mockReact.createElement(RN.View, null, children),
    Gesture: new Proxy({}, { get: () => () => chain }),
    ScrollView: RN.ScrollView,
    FlatList: RN.FlatList,
  };
});
/** One film found, for any search typed: the results list is drawn only then. */
jest.mock('@/src/hooks/useUniversalSearch', () => ({
  ...jest.requireActual('@/src/hooks/useUniversalSearch'),
  useUniversalSearch: (q: string) => ({
    data: q ? { films: [{ id: 'f843', type: 'film', title: 'In the Mood for Love', subtitle: '2000', image: null, _nav: '/film/843' }] } : undefined,
    isFetching: false, isError: false, refetch: jest.fn(),
  }),
}));

// Each case draws a whole screen at three bottom insets: seconds when busy.
jest.setTimeout(60_000);

let mockInsetBottom = 34;
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => mockReact.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: mockInsetBottom, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
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
    default: ({ ListHeaderComponent, ListFooterComponent, ListEmptyComponent, contentContainerStyle }: Record<string, unknown>) =>
      mockReact.createElement(View, { style: contentContainerStyle },
        draw(ListHeaderComponent), draw(ListEmptyComponent), draw(ListFooterComponent)),
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
    open: mockDoorOpen, loading: false, films: 2, filmsNeeded: 5, days: 1, daysNeeded: 2, refresh: jest.fn(),
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
  { file: 'app/(modals)/cover-picker.tsx', name: 'a salon cover', params: { loungeId: 'room' }, draw: route('app/(modals)/cover-picker.tsx') },
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

/** Where each modal's feet are, in the state it is drawn in, as navMetrics says. */
const MODAL_FOOT: Record<string, ((b: number) => number)[]> = {
  'app/(modals)/search-modal.tsx (search)': [contentBottom],
  'app/(modals)/log-modal.tsx (log a film)': [contentBottom],
  'app/(modals)/notifications-modal.tsx (notices)': [contentBottom],
  // The act docked on the edge, and the list above it.
  'app/(modals)/list-modal.tsx (a new stack)': [
    (b) => aboveDockedBar(b, CURATE_BAR_HEIGHT), (b) => bottomEdge(b) + DOCKED_BAR_GAP,
  ],
  'app/(modals)/cover-picker.tsx (a salon cover)': [contentBottom],
  // The form scrolls inside a page that stops at the edge.
  'app/(modals)/login.tsx (sign in)': [bottomEdge],
  'app/(modals)/social-modal.tsx (followers)': [contentBottom],
  'app/(modals)/membership.tsx (the Society)': [contentBottom],
  // FILE THE ESSAY: its own 40, and never on the edge.
  'app/dispatch/compose.tsx (an essay)': [(b) => Math.max(ESSAY_FOOT, bottomEdge(b) + ESSAY_FOOT_GAP)],
  'app/dispatch/compose.tsx (the door, shut)': [contentBottom],
};
/** Drawn inside another modal, whose foot is that modal's: each says whose. */
const NO_FOOT: Record<string, string> = {
  'src/components/auth/EmailConfirmationScreen.tsx (the confirmation letter)': 'the sign-in sheet’s, measured above',
  'app/dispatch/compose.tsx (a take)': 'its rail stands on the keyboard’s well (PaperKeyWell), measured below',
  'app/dispatch/compose.tsx (a ballot)': 'its rail stands on the keyboard’s well (PaperKeyWell), measured below',
};

/** What a modal needs beyond the page-top test's drawing for its foot to be drawn. */
const ARRIVED: Record<string, {
  arrange?: () => void;
  then?: (r: ReturnType<typeof render>) => Promise<void>;
}> = {
  // A search typed, and its answer back: the results list is drawn only then.
  'app/(modals)/search-modal.tsx (search)': {
    then: async (r) => {
      await act(async () => { await fireEvent.changeText(r.getByPlaceholderText('Search the archives...'), 'ozu'); });
      await act(async () => { await new Promise((res) => setTimeout(res, 450)); });
    },
  },
  // A member's followers, read.
  'app/(modals)/social-modal.tsx (followers)': {
    arrange: () => {
      jest.spyOn(ProfileService, 'getSocialConnections').mockResolvedValue({
        profiles: [{ id: 'u2', username: 'morpho', avatar_url: null, role: 'user' }], hasMore: false,
      });
    },
  },
};

const drawModal = (d: Drawn, key = '') => async (insetBottom: number) => {
  mockInsetBottom = insetBottom;
  d.arrange?.();
  ARRIVED[key]?.arrange?.();
  useLocalSearchParams.mockReturnValue(d.params ?? {});
  let r!: ReturnType<typeof render>;
  await act(async () => {
    r = render(<QueryClientProvider client={testQueryClient({ queries: { enabled: false } })}>{d.draw()}</QueryClientProvider>);
  });
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  await ARRIVED[key]?.then?.(r);
  return { tree: r.toJSON(), done: () => r.unmount() };
};

afterEach(() => {
  mockDoorOpen = true;
  useLocalSearchParams.mockReturnValue({});
});

const footed = MODALS.map((m) => [`${m.file} (${m.name})`, m] as const).filter(([key]) => !NO_FOOT[key]);
describe.each(footed)('%s', (key, modal) => {
  it('ends above its foot at every bottom inset, at the same place', async () => {
    const missing: string[] = [];
    for (const want of MODAL_FOOT[key]) missing.push(...await placesHoldingFoot(drawModal(modal, key), want));
    expect(missing).toEqual([]);
  });
});

it('names a foot, or whose foot it is, for every modal the page-top test draws', () => {
  const drawn = MODALS.map((m) => `${m.file} (${m.name})`);
  expect([...Object.keys(MODAL_FOOT), ...Object.keys(NO_FOOT)].sort()).toEqual([...drawn].sort());
});

// ── the sheets and the overlays ───────────────────────────────────────────────

const MSG = {
  id: 'm1', lounge_id: 'room', user_id: 'u2', username: 'morpho', content: 'The rain in that film.',
  type: 'text', created_at: '2026-08-01T00:00:00Z',
};
const ROOM = {
  id: 'room', name: 'The Back Row', description: '', is_private: false,
  creator_id: 'me', created_at: '2026-01-01T00:00:00Z', member_count: 3,
};

/** Each sheet and overlay, how it is drawn, and where its foot is. */
const SHEETS: { name: string; draw: () => React.ReactElement; want: (b: number) => number; arrange?: () => void; after?: () => void }[] = [
  { name: 'the offline plate', draw: () => <OfflineBanner />,
    arrange: () => { (useNetInfo as jest.Mock).mockReturnValue({ isConnected: false }); },
    after: () => { (useNetInfo as jest.Mock).mockReturnValue({ isConnected: true, isInternetReachable: true, type: 'wifi' }); },
    want: (b) => tabBarHeight(b) + SCROLL_END_GAP },
  { name: 'a silenced member’s notice', draw: () => <StandingNotice />,
    arrange: () => { (jest.requireMock('@/src/stores/auth').useAuthStore.getState().user as Record<string, unknown>).is_banned = true; },
    after: () => { (jest.requireMock('@/src/stores/auth').useAuthStore.getState().user as Record<string, unknown>).is_banned = false; },
    want: (b) => tabBarHeight(b) + SCROLL_END_GAP + 44 },
  { name: 'a viewing’s note', want: sheetBottom,
    draw: () => <NoteSheet visible note="Saw it twice." viewingLabel="THE FIRST VIEWING" canEdit onClose={jest.fn()} onRemove={jest.fn()} /> },
  { name: 'a salon message’s acts', want: sheetBottom,
    draw: () => <ActionSheet visible msg={MSG as never} isSelf={false} onClose={jest.fn()} onReply={jest.fn()} onDelete={jest.fn()} /> },
  { name: 'a new salon', want: sheetBottom, draw: () => <CreateLoungeSheet visible onClose={jest.fn()} /> },
  { name: 'the salon’s door', want: sheetBottom,
    draw: () => <AtTheDoorPanel visible loungeId="room" pending={[]} onClose={jest.fn()} onResolved={jest.fn()} /> },
  { name: 'the salon’s settings', want: sheetBottom,
    draw: () => <LoungeSettingsPanel lounge={ROOM as never} members={[]} visible onClose={jest.fn()} isCreator /> },
  { name: 'a member’s acts', want: sheetBottom,
    draw: () => (
      <ContentActionSheet visible targetUserId="u2" targetUsername="morpho" contentType="profile" contentId="u2"
        onClose={jest.fn()} onReport={jest.fn()} onBlock={jest.fn()} />
    ) },
  { name: 'a report', want: sheetBottom,
    draw: () => <ReportSheet visible contentType="profile" contentId="u2" targetUserId="u2" targetUsername="morpho" onDismiss={jest.fn()} /> },
  { name: 'the portrait’s crop', want: sheetBottom, draw: () => <AvatarCropSheet onClose={jest.fn()} onSuccess={jest.fn()} /> },
  { name: 'the follow requests', want: sheetBottom, draw: () => <FollowRequestsPanel visible onClose={jest.fn()} /> },
  { name: 'Share to Lounge', want: sheetBottom,
    draw: () => <ShareToLoungeModal visible onClose={jest.fn()} filmTitle="Chungking Express" filmId={11104} /> },
  { name: 'the seal, docked', want: (b) => bottomEdge(b) + DOCKED_BAR_GAP,
    draw: () => (
      <LogSealBar status="watched" rating={4} review="" abandonedReason="" date="2026-08-01" watchedWith=""
        physicalMedia="" submitting={false} sealed={false} isEditing={false} onSeal={jest.fn()} />
    ) },
];

describe.each(SHEETS.map((s) => [s.name, s] as const))('%s', (_name, sheet) => {
  afterEach(() => sheet.after?.());

  it('ends above its foot at every bottom inset, at the same place', async () => {
    sheet.arrange?.();
    const missing = await placesHoldingFoot(drawModal({ file: '', name: sheet.name, draw: sheet.draw }), sheet.want);
    expect(missing).toEqual([]);
  });
});

it('the Society’s window stands on the edge, and its page ends above the window and its fade', () => {
  for (const b of [0, 21, 34]) {
    expect(aboveDockedBar(b, DOCK_REACH)).toBeGreaterThan(bottomEdge(b) + DOCK_REACH);
    expect(bottomEdge(b) + DOCK.padBottom).toBeGreaterThan(b);
  }
});

it('a desk’s keyboard well keeps the home indicator’s edge while the keyboard is down', async () => {
  const { StyleSheet } = jest.requireActual('react-native');
  const heights: number[] = [];
  for (const b of [0, 21, 34]) {
    mockInsetBottom = b;
    const r = render(<PaperKeyWell />);
    heights.push(StyleSheet.flatten((r.toJSON() as unknown as { props: { style: unknown } }).props.style).height);
    r.unmount();
  }
  expect(heights).toEqual([0, 21, 34].map(bottomEdge));
});
