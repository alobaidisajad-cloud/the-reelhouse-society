/**
 * aNewerOneWasWrittenElsewhere.test.tsx — the one question the backup can ask.
 * ─────────────────────────────────────────────────────────────────────────────
 * The whole risk of putting drafts on a server is this moment. Get it wrong and
 * the backup becomes a new way to lose an evening: device A quietly replaces
 * device B, or the member is asked something they cannot answer and guesses.
 *
 * So it asks, it never merges, and the question NAMES BOTH SIDES with a time and
 * a length — "a newer version exists, replace?" is not a question anybody can
 * answer about their own writing.
 *
 * Every branch here is driven through the real screen with a seeded remote row,
 * which is what makes this verifiable without a second handset.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import ComposeScreen from '@/app/dispatch/compose';
import { draftKey } from '@/src/utils/memberDrafts';

const mockStore = new Map<string, string>();
const mockParams: Record<string, string> = { kind: 'dossier' };
const mockUser = { id: 'u1', username: 'ana', tier: 'auteur', member_no: 17 };
/** What the house is holding, if anything. */
let mockRemote: { payload: unknown; saved_at: string } | null = null;
/** The house could not be asked. */
let mockPullFails = false;
/** Every backup the room sent. */
const mockPushed: unknown[] = [];

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const state = { user: mockUser };
      return typeof sel === 'function' ? sel(state) : state;
    },
    { getState: () => ({ user: mockUser }) },
  ),
}));
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockStore.get(k),
    getAllKeys: () => [...mockStore.keys()],
    set: (k: string, v: string) => { mockStore.set(k, v); },
    delete: (k: string) => { mockStore.delete(k); },
  },
  isStorageEncrypted: () => true,
}));
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = () => self();
      chain.eq = () => self();
      chain.not = () => Promise.resolve({ data: [], error: null });
      chain.upsert = (row: unknown) => { mockPushed.push(row); return Promise.resolve({ error: null }); };
      chain.delete = () => self();
      chain.maybeSingle = () => Promise.resolve(table === 'member_drafts' && mockPullFails
        ? { data: null, error: { message: 'TypeError: Network request failed' } }
        : { data: table === 'member_drafts' ? mockRemote : null, error: null });
      chain.then = (r: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(r);
      return chain;
    },
    rpc: () => Promise.resolve({
      data: [{ films: 9, films_needed: 5, days: 9, days_needed: 2, may_file: true }],
      error: null,
    }),
  },
}));
jest.mock('@/src/stores/dispatch', () => ({
  useDispatch: Object.assign(() => ({}), { getState: () => ({ file: jest.fn(), amend: jest.fn() }) }),
}));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: { error: jest.fn(), success: jest.fn() } }));

const local = (savedAt: string, content: string, title = 'On this phone') => {
  mockStore.set(draftKey('u1', 'dossier'), JSON.stringify({
    v: 2, savedAt, data: { title, content },
  }));
};

const mount = async () => {
  const r = render(<ComposeScreen />);
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  return r;
};

const OLDER = new Date(2026, 8, 8, 21, 40).toISOString();   // Tuesday
const NEWER = new Date(2026, 8, 11, 9, 12).toISOString();   // Friday

beforeEach(() => {
  mockStore.clear();
  mockRemote = null;
  mockPullFails = false;
  mockPushed.length = 0;
});

describe('a newer one written elsewhere', () => {
  it('asks, and names BOTH sides with a time and a length', async () => {
    local(OLDER, 'One hundred words here.');
    mockRemote = {
      payload: { title: 'Elsewhere', content: Array.from({ length: 320 }, () => 'word').join(' ') },
      saved_at: NEWER,
    };

    const { getByText } = await mount();

    expect(getByText('A NEWER ONE WAS WRITTEN ELSEWHERE')).toBeTruthy();
    // "A newer version exists, replace?" is not answerable. These are.
    expect(getByText(/ELSEWHERE · FRIDAY · 09:12 · 320 WORDS/)).toBeTruthy();
    expect(getByText(/HERE · TUESDAY · 21:40 · 4 WORDS/)).toBeTruthy();
  });

  it('changes NOTHING until the member chooses', async () => {
    local(OLDER, 'One hundred words here.');
    mockRemote = { payload: { title: 'Elsewhere', content: 'Theirs.' }, saved_at: NEWER };

    const { getByLabelText } = await mount();

    // The room still holds what was on this phone.
    expect(getByLabelText('Essay content body').props.value).toBe('One hundred words here.');
  });

  it('TAKE THAT ONE replaces the room with the other version', async () => {
    local(OLDER, 'On this phone.');
    mockRemote = { payload: { title: 'Elsewhere', content: 'Written elsewhere.' }, saved_at: NEWER };

    const r = await mount();
    await act(async () => {
      fireEvent.press(r.getByLabelText('Take the one written elsewhere'));
    });

    expect(r.getByLabelText('Essay content body').props.value).toBe('Written elsewhere.');
    expect(r.queryByText('A NEWER ONE WAS WRITTEN ELSEWHERE')).toBeNull();
    // And it says where the words came from, rather than leaving them
    // unexplained — the same courtesy a local restore gets.
    expect(r.getByText(/TAKEN UP WHERE YOU LEFT IT · FRIDAY/)).toBeTruthy();
  });

  it('KEEP THIS ONE leaves the room exactly as it was', async () => {
    local(OLDER, 'On this phone.');
    mockRemote = { payload: { title: 'Elsewhere', content: 'Written elsewhere.' }, saved_at: NEWER };

    const r = await mount();
    await act(async () => {
      fireEvent.press(r.getByLabelText('Keep the one on this phone'));
    });

    expect(r.getByLabelText('Essay content body').props.value).toBe('On this phone.');
    expect(r.queryByText('A NEWER ONE WAS WRITTEN ELSEWHERE')).toBeNull();
  });

  it('does not ask when the house is holding something older', async () => {
    local(NEWER, 'The newer one is here.');
    mockRemote = { payload: { title: 'Old', content: 'Stale.' }, saved_at: OLDER };

    const { queryByText, getByLabelText } = await mount();
    expect(queryByText('A NEWER ONE WAS WRITTEN ELSEWHERE')).toBeNull();
    expect(getByLabelText('Essay content body').props.value).toBe('The newer one is here.');
  });

  it('THE NEW PHONE: takes it without asking when there is nothing here', async () => {
    // Nothing local at all — a fresh install, or a handset that has never held
    // this essay. This is the case the whole feature exists for.
    mockRemote = {
      payload: { title: 'The Long Silence', content: 'Four thousand words.' },
      saved_at: NEWER,
    };

    const { getByLabelText, queryByText, getByText } = await mount();

    expect(getByLabelText('Essay content body').props.value).toBe('Four thousand words.');
    expect(queryByText('A NEWER ONE WAS WRITTEN ELSEWHERE')).toBeNull();
    expect(getByText(/TAKEN UP WHERE YOU LEFT IT · FRIDAY/)).toBeTruthy();
  });

  it('and says nothing at all when the house is holding nothing', async () => {
    local(OLDER, 'On this phone.');
    const { queryByText, getByLabelText } = await mount();
    expect(queryByText('A NEWER ONE WAS WRITTEN ELSEWHERE')).toBeNull();
    // …and the phone's own copy is the one on the desk.
    expect(getByLabelText('Essay content body').props.value).toBe('On this phone.');
  });
});

describe('the backup never replaces a copy the room has not seen', () => {
  const ESSAY = { title: 'The Long Silence', content: 'Four thousand words.' };
  /** Two minutes on, with the reads that follow allowed to land. */
  const tick = async () => {
    await act(async () => { jest.advanceTimersByTime(120_000); });
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
  };
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('THE NEW PHONE, OFFLINE: what is typed meanwhile is asked about, never pushed over the essay', async () => {
    // The pull fails, so the room opens empty. It used to read that as "the
    // house holds nothing", and the first backup replaced the essay.
    mockPullFails = true;
    mockRemote = { payload: ESSAY, saved_at: OLDER };
    const r = render(<ComposeScreen />);
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    await act(async () => { fireEvent.changeText(r.getByLabelText('Essay content body'), 'A first line, offline.'); });

    await tick();
    expect(mockPushed).toHaveLength(0);

    // The house is back: the next tick reads it, and asks.
    mockPullFails = false;
    await tick();
    expect(mockPushed).toHaveLength(0);
    expect(r.getByText('A NEWER ONE WAS WRITTEN ELSEWHERE')).toBeTruthy();
  });

  it('closing the room on the question pushes nothing over the newer copy', async () => {
    local(OLDER, 'On this phone.');
    mockRemote = { payload: { title: 'On this phone', content: 'Rewritten on the other phone.' }, saved_at: NEWER };
    const r = render(<ComposeScreen />);
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(r.getByText('A NEWER ONE WAS WRITTEN ELSEWHERE')).toBeTruthy();
    await tick();
    r.unmount();
    expect(mockPushed).toHaveLength(0);
  });

  it('an answer settles it, and the backup goes on from there', async () => {
    local(OLDER, 'On this phone.');
    mockRemote = { payload: { title: 'On this phone', content: 'Rewritten on the other phone.' }, saved_at: NEWER };
    const r = render(<ComposeScreen />);
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    await act(async () => { fireEvent.press(r.getByLabelText('Keep the one on this phone')); });
    await tick();
    expect(mockPushed).toHaveLength(1);
  });

  it('a house holding nothing is settled at once, and the backup goes', async () => {
    local(OLDER, 'On this phone.');
    render(<ComposeScreen />);
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    await tick();
    expect(mockPushed).toHaveLength(1);
  });
});
