/**
 * aSheetRisesWithItsAct.test.tsx — a Modal's sheet rises with the keyboard, and its act rises with it.
 *
 * A React Native <Modal> is a window neither platform resizes for the keyboard: its sheet makes room
 * itself, padded by the keyboard's height (useModalKeyboardPadding). The new-salon sheet set that
 * padding on its container, and its sheet is absolute at bottom 0: Yoga places such a box from its
 * parent's edge, whatever the parent's padding (AbsoluteLayout.cpp), so the sheet never moved and
 * ESTABLISH stayed under the keys (the save-in-reach sweep, 2026-11-13). Each sheet that rises so is
 * drawn here with a 300pt keyboard up: the box that took the 300 must hold the act the member types
 * toward, with no box between them pinned to a bottom of its own. Every file that pads by the
 * keyboard is in the list, or named with why it is not.
 */
import React, { act } from 'react';
import { readFileSync } from 'fs';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { files as universe, rel } from '@/test-utils/universe';
import { CreateLoungeSheet } from '@/src/components/lounge/CreateLoungeSheet';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import FollowRequestsPanel from '@/src/components/profile/FollowRequestsPanel';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';

const KEYBOARD = 300;
let mockKeyboard = 0;
// The keyboard's height as useModalKeyboardHeight would hold it once said (its own test follows the
// events: aSheetFollowsTheKeyboardsHeight); here the sheet is drawn with it already up.
jest.mock('@/src/hooks/useModalKeyboardPadding', () => ({
  useModalKeyboardHeight: () => ({ value: mockKeyboard }),
  useModalKeyboardPadding: (base = 0) => ({ paddingBottom: base + mockKeyboard }),
}));
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
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => mockReact.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
jest.mock('@/src/stores/auth', () => {
  const state = {
    isAuthenticated: true,
    user: { id: '00000012-0000-4000-8000-000000000012', username: 'kane', role: 'archivist', tier: 'auteur', preferences: {}, created_at: '2024-01-01T00:00:00Z' },
  };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(state) : state);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useAuthStore };
});
// One petition at the door: the search is drawn once there is one.
jest.mock('@/src/hooks/useFollowRequests', () => ({
  useFollowRequests: () => ({
    items: [{ requesterId: 'u2', username: 'morpho', avatarUrl: null }], loading: false, loadingMore: false, hasMore: false,
    search: '', busyId: null, failed: false, moreFailed: false,
    setSearch: jest.fn(), loadMore: jest.fn(), retry: jest.fn(), accept: jest.fn(), decline: jest.fn(), declineAll: jest.fn(),
  }),
}));
jest.mock('@/src/hooks/useClearance', () => ({
  useClearance: () => ({ held: true, standing: 'held', open: jest.fn(), loading: false }),
}));

const ROOM = {
  id: '00000011-0000-4000-8000-000000000011', name: 'The Back Row', description: '', is_private: false,
  creator_id: '00000012-0000-4000-8000-000000000012', created_at: '2026-01-01T00:00:00Z', member_count: 3,
};

/** Each sheet that rises by the keyboard, and the control the member types toward: by its spoken label, or its words. */
const RISERS: { file: string; name: string; act: string; draw: () => React.ReactElement; arrange?: () => void }[] = [
  { file: 'src/components/lounge/CreateLoungeSheet.tsx', name: 'a new salon', act: 'Establish salon',
    draw: () => <CreateLoungeSheet visible onClose={jest.fn()} /> },
  { file: 'src/components/moderation/ReportSheet.tsx', name: 'a report', act: 'File report',
    draw: () => <ReportSheet visible contentType="profile" contentId="u2" targetUserId="u2" targetUsername="morpho" onDismiss={jest.fn()} /> },
  // Its search filters as it is typed: the field itself is what must stay in reach.
  { file: 'src/components/profile/FollowRequestsPanel.tsx', name: 'the follow requests', act: 'Search follow requests',
    draw: () => <FollowRequestsPanel visible onClose={jest.fn()} /> },
  { file: 'src/components/ShareToLoungeModal.tsx', name: 'Share to Lounge', act: 'SHARE TO LOUNGE',
    arrange: () => { require('@/src/stores/lounge').useLoungeStore.setState({
      lounges: [{ ...ROOM, membership_status: 'approved' }], loungesRead: true, loungesLoading: false, fetchLounges: jest.fn(),
    }); },
    draw: () => <ShareToLoungeModal visible onClose={jest.fn()} filmTitle="Chungking Express" filmId={11104} /> },
];

/** Files that pad by the keyboard and are drawn elsewhere, with why. */
const ELSEWHERE: Record<string, string> = {
  // Its sheets stand in a flex-end overlay (not absolute), drawn only once a frame is picked; the
  // overlay takes the padding and the sheet stands on it.
  'src/components/profile/ProfileTriptych.tsx': 'a flex-end overlay; its sheet is no absolute box',
  // The hook itself.
  'src/hooks/useModalKeyboardPadding.ts': 'the hook',
};

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

/** The chain of boxes from the root down to the node spoken as `label`, or holding it as its words, or null. */
function pathTo(tree: unknown, label: string): Node[] | null {
  const walk = (n: Node | string | null, path: Node[]): Node[] | null => {
    if (!n || typeof n === 'string') return null;
    const here = [...path, n];
    if (n.props.accessibilityLabel === label || (n.children ?? []).includes(label)) return here;
    for (const c of n.children ?? []) { const found = walk(c, here); if (found) return found; }
    return null;
  };
  for (const n of Array.isArray(tree) ? tree : [tree]) { const found = walk(n as Node, []); if (found) return found; }
  return null;
}

const styleOf = (n: Node) => (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>;

/** Whether the act stands in the box that rose, and nothing between pins itself to a bottom. */
export function risesWithItsAct(tree: unknown, label: string): string {
  const path = pathTo(tree, label);
  if (!path) return `no "${label}" drawn`;
  const risen = path.map((n, i) => ({ i, pad: styleOf(n).paddingBottom })).filter((r) => typeof r.pad === 'number' && r.pad >= KEYBOARD).pop();
  if (!risen) return `"${label}" is in no box that rose by the keyboard`;
  const pinned = path.slice(risen.i + 1).find((n) => { const st = styleOf(n); return st.position === 'absolute' && typeof st.bottom === 'number'; });
  return pinned ? `"${label}" is in a box pinned to bottom ${String(styleOf(pinned).bottom)} inside the box that rose: it stays under the keys` : 'rises';
}

describe.each(RISERS.map((r) => [r.name, r] as const))('%s', (_name, sheet) => {
  afterEach(() => { mockKeyboard = 0; });

  it('rises with the keyboard, its act inside the box that rose', async () => {
    sheet.arrange?.();
    mockKeyboard = KEYBOARD;
    let r!: ReturnType<typeof render>;
    await act(async () => {
      r = render(<QueryClientProvider client={testQueryClient({ queries: { enabled: false } })}>{sheet.draw()}</QueryClientProvider>);
    });
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    expect(risesWithItsAct(r.toJSON(), sheet.act)).toBe('rises');
    r.unmount();
  });
});

it('says no to an act inside a sheet pinned to the bottom of a container that took the padding', () => {
  const tree = {
    type: 'View', props: { style: { flex: 1, paddingBottom: 354 } }, children: [
      { type: 'View', props: { style: { position: 'absolute', bottom: 0, left: 0, right: 0 } }, children: [
        { type: 'View', props: { accessibilityLabel: 'Establish salon' }, children: null },
      ] },
    ],
  };
  expect(risesWithItsAct(tree, 'Establish salon')).toMatch(/pinned to bottom 0/);
  expect(risesWithItsAct({ type: 'View', props: { style: { paddingBottom: 54 } }, children: [tree.children[0]] }, 'Establish salon'))
    .toMatch(/in no box that rose/);
});

it('draws every file that pads by the keyboard, or names why it is drawn elsewhere', () => {
  const padding = universe('appCode').map(rel).filter((f) => readFileSync(f, 'utf8').includes('useModalKeyboardPadding('));
  expect(padding.length).toBeGreaterThan(3);
  const listed = new Set([...RISERS.map((r) => r.file), ...Object.keys(ELSEWHERE)]);
  expect(padding.filter((f) => !listed.has(f))).toEqual([]);
  expect([...listed].filter((f) => !padding.includes(f))).toEqual([]);
});
