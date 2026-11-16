/**
 * anAmendedStackAsksBeforeLeaving.test.tsx — review round 6
 * ──────────────────────────────────────────────────────────
 * A new stack keeps a draft; an amendment of one's own stack keeps none. CLOSE, a swipe or
 * Android's back let the amendments go without a word. Now every way out of an amended stack is
 * held and asked about ("Discard these amendments?"), as the Log sheet's are; an untouched amend,
 * a new stack (its draft is kept) and a saved amendment are never held.
 *
 * Every way out is a removal of the sheet, so they are observed where React Navigation holds them:
 * usePreventRemove's first argument (as theLogSheetGoesBackAStep observes the Log sheet's).
 */
import React, { act } from 'react';
import { Alert } from 'react-native';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

import ListModal from '../list-modal';

const STACK_ID = '22222222-2222-4222-8222-222222222222';

let mockParams: Record<string, string | undefined>;
let mockLists: unknown[];
let mockCachedStack: unknown;
const mockCreateList = jest.fn();
const mockUpdateList = jest.fn();

jest.mock('expo-router', () => ({ ...require('@/test-utils/expoRouterMock').expoRouterMock(), useLocalSearchParams: () => mockParams }));
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), usePreventRemove: jest.fn() }));
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@tanstack/react-query', () => ({
  QueryClient: class { defaultOptions = {}; getQueryCache = () => ({ subscribe: () => () => {} }); setQueryDefaults = () => {}; },
  onlineManager: { setEventListener: () => {} },
  focusManager: { setEventListener: () => {} },
  useQueryClient: () => ({
    getQueryData: (k: unknown[]) => (k[0] === 'stack' ? mockCachedStack : undefined),
    setQueryData: jest.fn(), removeQueries: jest.fn(), invalidateQueries: jest.fn(),
  }),
  // The stack an amend names, read from the house: never needed here (the member's stacks hold it).
  useQuery: () => ({ data: undefined, isPending: true, isError: false, refetch: jest.fn() }),
}));
jest.mock('@/src/stores/films', () => {
  const useListStore = (sel?: (s: unknown) => unknown) => {
    const state = { lists: mockLists, createList: mockCreateList, updateList: mockUpdateList };
    return sel ? sel(state) : state;
  };
  (useListStore as unknown as { getState: () => unknown }).getState = () => ({ lists: mockLists });
  return { useListStore };
});
jest.mock('@/src/hooks/useBanCheck', () => ({ useBanCheck: () => ({ checkBan: () => false }) }));
jest.mock('@/src/utils/reelToast', () => {
  const t = jest.fn() as jest.Mock & { error: jest.Mock };
  t.error = jest.fn();
  return { __esModule: true, default: t };
});
jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => React.createElement('Icon', props) });
});
jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react');
  const { View } = require('react-native');
  const draw = (c: unknown) => (typeof c === 'function' ? React.createElement(c as never) : (c as React.ReactNode));
  return {
    __esModule: true,
    ScaleDecorator: ({ children }: { children: React.ReactNode }) => children,
    default: ({ ListHeaderComponent, ListFooterComponent, ListEmptyComponent, data, renderItem }: Record<string, any>) =>
      React.createElement(View, null,
        draw(ListHeaderComponent),
        ...(data ?? []).map((item: unknown, index: number) =>
          React.createElement(React.Fragment, { key: index },
            renderItem ? renderItem({ item, getIndex: () => index, drag: () => {}, isActive: false }) : null)),
        (data ?? []).length === 0 ? draw(ListEmptyComponent) : null,
        draw(ListFooterComponent)),
  };
});

const FILMS = [
  { id: 1, title: 'Blade Runner', poster_path: '/br.jpg' },
  { id: 2, title: 'Chinatown', poster_path: '/ct.jpg' },
];
const STACK = {
  id: STACK_ID, title: 'Neon Noir Masterpieces', description: 'A note.',
  isPrivate: false, isRanked: false, films: FILMS, userId: 'me',
};

const preventRemoveMock = () => jest.requireMock('expo-router/react-navigation').usePreventRemove as jest.Mock;
/** Whether the sheet holds every way out now: the latest render's word. */
const holding = (): unknown => {
  const calls = preventRemoveMock().mock.calls;
  const last = calls[calls.length - 1];
  return last ? last[0] : undefined;
};
/** What a way out taken now meets: the latest render's handler, as React Navigation calls it. */
const leave = () => {
  const calls = preventRemoveMock().mock.calls;
  const last = calls[calls.length - 1];
  expect(last).toBeDefined();
  (last![1] as (e: { data: { action: { type: string } } }) => void)({ data: { action: { type: 'GO_BACK' } } });
};

let ask: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockLists = [];
  mockCachedStack = undefined;
  ask = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  require('@/src/stores/auth').useAuthStore.setState({ user: { id: 'me' } });
  require('@/src/utils/memberDrafts').clearDraft('me', 'stack');
});
afterEach(() => {
  ask.mockRestore();
  require('@/src/stores/auth').useAuthStore.setState({ user: null });
  require('@/src/utils/memberDrafts').clearDraft('me', 'stack');
});

const amend = async () => {
  mockParams = { editId: STACK_ID };
  mockLists = [STACK];
  const r = render(<ListModal />);
  await waitFor(() => expect(r.getByLabelText('Stack title').props.value).toBe('Neon Noir Masterpieces'));
  return r;
};

it('an amended stack asks "Discard these amendments?" on its way out, and an untouched one does not', async () => {
  const r = await amend();
  expect(holding()).toBe(false);

  await act(async () => { await fireEvent.changeText(r.getByLabelText('Stack title'), 'Neon Noir, Revised'); });
  // CLOSE, a swipe and Android's back are each a removal of the sheet: each is held, and asked.
  expect(holding()).toBe(true);
  leave();
  expect(ask).toHaveBeenCalledTimes(1);
  expect(ask).toHaveBeenCalledWith('Discard these amendments?', expect.any(String), expect.any(Array));

  // Typed back to the stack as it was filed: nothing is left to lose.
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Stack title'), 'Neon Noir Masterpieces'); });
  expect(holding()).toBe(false);
});

it('a new stack is never held on its way out: its draft is kept instead', async () => {
  const r = render(<ListModal />);
  await waitFor(() => expect(r.getByLabelText('Stack title')).toBeTruthy());
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Stack title'), 'Rooms With No Exit'); });
  expect(holding()).toBe(false);
});

it('a saved amendment leaves without a word', async () => {
  mockUpdateList.mockResolvedValue(undefined);
  const r = await amend();
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Stack description'), 'A longer note.'); });
  expect(holding()).toBe(true);
  await act(async () => { await fireEvent.press(r.getByLabelText('SAVE THE AMENDMENTS')); });
  await waitFor(() => expect(mockUpdateList).toHaveBeenCalledTimes(1));
  expect(holding()).toBe(false);
});

it('the rest of a long stack, read after the sheet opened, is not counted as an amendment', async () => {
  const { StackService } = require('@/src/services/StackService') as typeof import('@/src/services/StackService');
  const rest = jest.spyOn(StackService, 'getStackItemsPage').mockResolvedValueOnce([{ id: 999, title: 'The Third Man', poster_path: null }]);
  mockParams = { editId: STACK_ID };
  mockCachedStack = { list: { ...STACK, films: FILMS, filmCount: FILMS.length + 1 } };
  const r = render(<ListModal />);
  await waitFor(() => expect(r.getByText('The Third Man')).toBeTruthy());
  expect(holding()).toBe(false);
  // The member's own change, after it, still is.
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Stack title'), 'Neon Noir, Revised'); });
  expect(holding()).toBe(true);
  rest.mockRestore();
});
