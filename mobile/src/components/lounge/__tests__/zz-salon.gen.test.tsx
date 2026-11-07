/**
 * A GENERATOR, not a test. A salon's room, read by a seated member, with the words members
 * really send it (WORKLIST P4.31): an ordinary exchange, marks piled on every letter between two
 * ordinary lines (the house's Text keeps four a letter, and none may reach another row: layout's
 * INK), the vowels and tones of Vietnamese, Thai and Arabic set whole, and a line of emoji alone.
 * Each at every layout CI measures.
 *
 * Run: MOCKUPS=1 npx jest zz-salon.gen  (see mockups/README.md)
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { toHtml } from '@/src/components/profile/__tests__/zz-render.lib';
import { LAYOUTS, atLayout, whenRendering, writeScreen } from '@/mockups/paths';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...require('@/mockups/paths').PHONE, scale: 3, fontScale: require('@/mockups/paths').textSize.scale }),
}));
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children, style }: any) => mockReact.createElement(View, { style: [{ flex: 1 }, style] }, children),
    SafeAreaView: ({ children, ...props }: any) => mockReact.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, ...require('@/mockups/paths').PHONE }),
  };
});
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());

const ROOM_ID = '00000011-0000-4000-8000-000000000011';
/** The room the house answers for (its read happens at render, after this is set). */
const mockRoom = {
  id: ROOM_ID, name: 'The Back Row', description: 'Whatever is on after the late news.', is_private: false,
  creator_id: 'host', created_at: '2026-01-01T00:00:00Z', member_count: 3,
};
jest.mock('@/src/stores/lounge', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  const noop = () => {};
  const useLoungeStore = mockCreate(() => ({
    lounges: [], currentMessages: [], currentLoungeId: '00000011-0000-4000-8000-000000000011', messagesLoading: false, messagesFailed: false, loungesLoading: false, sending: false,
    presentCount: 0, typingUsers: [],
    fetchMessages: noop, sendMessage: noop, subscribeToLounge: () => noop, markRead: noop,
    withdrawMessage: noop, retryMessage: noop, toggleReaction: noop,
    requestMembership: async () => 'ok', joinPublicLounge: async () => true,
    fetchMembers: async () => [{ user_id: 'me', status: 'approved' }],
    broadcastTyping: noop, fetchLounges: noop, loadMoreMessages: noop, purgeHiddenMessages: noop,
  }));
  return { useLoungeStore };
});
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self; chain.eq = self;
      chain.single = () => Promise.resolve({ data: mockRoom, error: null });
      chain.maybeSingle = chain.single;
      return chain;
    },
  },
}));
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist' }, isAuthenticated: true };
  return {
    useAuthStore: Object.assign(
      (sel?: (s: unknown) => unknown) => (typeof sel === 'function' ? sel(state) : state),
      { getState: () => state, subscribe: () => () => {} },
    ),
  };
});
jest.mock('@/src/hooks/useOfflineAware', () => ({ useOfflineAware: () => ({ isOffline: false }) }));
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, open: () => {} }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

// eslint-disable-next-line import/first
import LoungeRoomScreen from '@/app/lounge/[id]';

const { useLoungeStore } = jest.requireMock('@/src/stores/lounge') as { useLoungeStore: { setState: (s: object) => void } };
const { useLocalSearchParams, useRouter } = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock; useRouter: jest.Mock };

/** Twelve marks on every letter, six above and six below: more than any script needs. */
const piled = (words: string) => [...words].map((c) => (c === ' ' ? c : c + '̖̗̘̙̜̝̀́̂̃̄̆')).join('');
let minute = 0;
const said = (user: 'ana' | 'bo' | 'kane', content: string) => ({
  id: `m${++minute}`, lounge_id: ROOM_ID, user_id: user === 'kane' ? 'me' : `u-${user}`, username: user,
  avatar_url: null, content, type: 'text', metadata: null,
  created_at: new Date(Date.UTC(2026, 9, 29, 20, minute)).toISOString(), deleted_at: null, reactions: [], status: 'sent',
});

const STATES: [string, ReturnType<typeof said>[]][] = [
  ['salon-room', [
    said('ana', 'The projector in the second house runs a frame slow. You can hear it in the dialogue.'),
    said('bo', 'That is the print, not the projector.'),
    said('kane', 'Either way it is the best way to see it.'),
  ]],
  ['salon-piled-marks', [
    said('ana', 'Did anyone else stay for the last reel?'),
    said('bo', piled('It comes for every frame, and then it comes for the next one.')),
    said('kane', 'I stayed. The clocks were running backwards.'),
  ]],
  ['salon-scripts', [
    said('ana', 'Tiếng Việt: bộ phim này đẹp quá, nhưng kết thúc buồn.'),
    said('bo', 'ภาษาไทย: หนังเรื่องนี้ดีมาก ดูซ้ำได้หลายครั้ง'),
    said('kane', 'العربية: شَاهَدْتُ الفِيلْمَ مَرَّتَيْنِ، وَفِي كُلِّ مَرَّةٍ أَرَى شَيْئًا جَدِيدًا.'),
  ]],
  ['salon-emoji', [
    said('ana', '🎞️'),
    said('bo', '👩‍👩‍👧‍👦🇯🇵👋🏽👩🏽‍🎤👨🏿‍🚀👩🏻‍🔬🧑🏾‍🎨👨🏼‍🍳'),
    said('kane', 'Both of those, yes.'),
  ]],
];

const RUNS = STATES.flatMap(([name, messages]) => LAYOUTS.map((l) => [`${name}${l.suffix}`, messages, l] as const));

whenRendering('salon room generator', () => {
  it.each(RUNS)('writes %s', async (name, messages, layout) => {
    useRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() });
    useLocalSearchParams.mockReturnValue({ id: ROOM_ID });
    useLoungeStore.setState({ currentMessages: messages, lounges: [mockRoom] });
    const html = await atLayout(layout, async () => {
      let r!: ReturnType<typeof render>;
      await act(async () => { r = render(<LoungeRoomScreen />); await new Promise((res) => setTimeout(res, 0)); });
      const out = toHtml(r.toJSON());
      r.unmount();
      return out;
    });
    writeScreen(name, html);
    console.log(`WROTE ${name}: ${html.length} bytes`);
    // Every line was drawn: a room that drew no message proves nothing of the words in it.
    for (const m of messages) expect(html.includes(m.content.slice(0, 1))).toBe(true);
    expect(html.length).toBeGreaterThan(3000);
  });
});
