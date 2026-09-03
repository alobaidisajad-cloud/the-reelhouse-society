/**
 * composeScreen.test.tsx — the writing room, and the draft it must not lose.
 * ─────────────────────────────────────────────────────────────────────────────
 * 145 statements, none of which had ever run, on the screen the whole Auteur
 * tier exists for. An essay here is an evening's work, so the interesting
 * assertions are all about not losing it:
 *
 *   · the draft is written to storage, and RESTORED
 *   · it is deleted only after the write is ACCEPTED — it used to go on the
 *     strength of a success that a silent truncation had already spoiled
 *   · an over-limit essay is refused BEFORE anything is written or deleted, so
 *     the failure is "this cannot be filed yet" and not "your essay was
 *     shortened and your draft is gone"
 *   · an EDIT never touches the new-dossier draft
 *
 * And the tier gate, which is checked once on the route rather than in each
 * desk, because a member who cannot file a dossier must never reach its desk to
 * find that out at the end.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import ComposeScreen from '@/app/dispatch/compose';

const DRAFT_KEY = 'reelhouse_dispatch_draft';

let mockUser: Record<string, unknown> | null = { id: 'u1', username: 'me', tier: 'auteur' };
let mockFiled: Array<Record<string, unknown>> = [];
let mockAmended: Array<[string, Record<string, unknown>]> = [];
let mockFileFails = false;
const mockStore = new Map<string, string>();
const mockToast = { error: jest.fn(), success: jest.fn() };

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
    set: (k: string, v: string) => { mockStore.set(k, v); },
    delete: (k: string) => { mockStore.delete(k); },
  },
}));

jest.mock('@/src/stores/dispatch', () => ({
  useDispatch: {
    getState: () => ({
      file: async (d: Record<string, unknown>) => {
        if (mockFileFails) throw new Error('refused');
        mockFiled.push(d);
        return { id: 'new' };
      },
      amend: async (id: string, u: Record<string, unknown>) => {
        if (mockFileFails) throw new Error('refused');
        mockAmended.push([id, u]);
      },
    }),
  },
}));

jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), {
    error: (...a: unknown[]) => mockToast.error(...a),
    success: (...a: unknown[]) => mockToast.success(...a),
  });
  return { __esModule: true, default: fn };
});

const at = (params: Record<string, string | undefined>) =>
  (useLocalSearchParams as unknown as jest.Mock).mockReturnValue(params);

const type = async (field: unknown, text: string) => {
  await act(async () => { fireEvent.changeText(field as never, text); });
};
const press = async (control: unknown) => {
  await act(async () => { fireEvent.press(control as never); });
};
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  mockUser = { id: 'u1', username: 'me', tier: 'auteur' };
  mockFiled = []; mockAmended = []; mockFileFails = false;
  mockStore.clear();
  mockToast.error.mockClear(); mockToast.success.mockClear();
  at({});
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
});
afterEach(() => { jest.useRealTimers(); });

describe('the door', () => {
  it('asks which form when no kind is chosen', () => {
    const { getByText } = render(<ComposeScreen />);
    expect(getByText('TAKE')).toBeTruthy();
    expect(getByText('DOSSIER')).toBeTruthy();
  });

  it('turns a member without the tier away at the route, not at the desk', async () => {
    // A ballot and a dossier need the tier; a take, a seeking and a wire do
    // not. Checking it here means nobody writes an essay and is refused at the
    // end by a rule they were never shown.
    mockUser = { id: 'u1', username: 'me', tier: 'cinephile' };
    at({ kind: 'dossier' });
    render(<ComposeScreen />);
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith('Auteur tier required');
  });
});

describe('the writing room', () => {
  const open = () => { at({ kind: 'dossier' }); return render(<ComposeScreen />); };

  it('writes the draft to storage as you type', async () => {
    const { getByLabelText } = open();
    await type(getByLabelText("Dossier headline"), 'The Empty Room');
    await act(async () => { jest.advanceTimersByTime(1200); });
    expect(JSON.parse(mockStore.get(DRAFT_KEY)!).title).toBe('The Empty Room');
  });

  it('gives the draft back when the room is opened again', async () => {
    mockStore.set(DRAFT_KEY, JSON.stringify({ title: 'Half Written', content: 'The opening line.' }));
    const { getByDisplayValue } = open();
    expect(getByDisplayValue('Half Written')).toBeTruthy();
    expect(getByDisplayValue('The opening line.')).toBeTruthy();
  });

  it('survives a corrupt draft rather than refusing to open', async () => {
    mockStore.set(DRAFT_KEY, 'not json at all');
    const { getByLabelText } = open();
    expect(getByLabelText("Dossier headline")).toBeTruthy();
  });

  it('clears the draft when the room is emptied', async () => {
    mockStore.set(DRAFT_KEY, JSON.stringify({ title: 'x', content: 'y' }));
    const { getByLabelText } = open();
    await type(getByLabelText("Dossier headline"), '');
    await type(getByLabelText("Dossier content body"), '');
    await act(async () => { jest.advanceTimersByTime(1200); });
    expect(mockStore.has(DRAFT_KEY)).toBe(false);
  });

  it('files the essay, and only then throws the draft away', async () => {
    const { getByLabelText } = open();
    await type(getByLabelText("Dossier headline"), 'The Empty Room');
    await type(getByLabelText("Dossier content body"), 'Ozu frames a room and then leaves it.');
    await act(async () => { jest.advanceTimersByTime(1200); });
    expect(mockStore.has(DRAFT_KEY)).toBe(true);

    await press(getByLabelText('File the dossier'));
    await flush();

    expect(mockFiled).toHaveLength(1);
    expect(mockFiled[0].kind).toBe('dossier');
    expect(mockFiled[0].title).toBe('The Empty Room');
    expect(mockFiled[0].fullContent).toBe('Ozu frames a room and then leaves it.');
    expect(mockStore.has(DRAFT_KEY)).toBe(false);
  });

  it('KEEPS the draft when the filing is refused', async () => {
    // The one thing this screen must never do is throw away an evening's work
    // on the strength of a write that did not land.
    mockFileFails = true;
    const { getByLabelText } = open();
    await type(getByLabelText("Dossier headline"), 'The Empty Room');
    await type(getByLabelText("Dossier content body"), 'The opening line.');
    await act(async () => { jest.advanceTimersByTime(1200); });

    await press(getByLabelText('File the dossier'));
    await flush();

    expect(mockStore.has(DRAFT_KEY)).toBe(true);
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('will not file until there is both a title and a body', async () => {
    const { getByLabelText } = open();
    expect(getByLabelText(/Not ready yet/).props.accessibilityState.disabled).toBe(true);

    await type(getByLabelText("Dossier headline"), 'The Empty Room');
    expect(getByLabelText(/Not ready yet/).props.accessibilityState.disabled).toBe(true);

    await type(getByLabelText("Dossier content body"), 'The opening line.');
    expect(getByLabelText('File the dossier').props.accessibilityState.disabled).toBe(false);
  });

  it('refuses an over-length essay before touching anything', async () => {
    const { getByLabelText } = open();
    await type(getByLabelText("Dossier headline"), 'Too Long');
    await type(getByLabelText("Dossier content body"), 'x'.repeat(25001));
    await act(async () => { jest.advanceTimersByTime(1200); });

    await press(getByLabelText('File the dossier'));
    await flush();

    // Nothing written, nothing deleted, and the member told by how much.
    expect(mockFiled).toHaveLength(0);
    expect(mockStore.has(DRAFT_KEY)).toBe(true);
    expect(String(mockToast.error.mock.calls[0][0])).toMatch(/over the limit/);
  });

  it('shows the counter only near the fence', async () => {
    const { getByLabelText, queryByText } = open();
    await type(getByLabelText("Dossier content body"), 'A short opening.');
    expect(queryByText(/LEFT/)).toBeNull();

    await type(getByLabelText("Dossier content body"), 'x'.repeat(21000));
    expect(queryByText(/LEFT/)).toBeTruthy();
  });

  it('switches between writing and reading it back', async () => {
    const { getByLabelText } = open();
    await type(getByLabelText("Dossier content body"), 'Ozu frames a room.');
    await press(getByLabelText('Preview the dossier'));
    expect(getByLabelText('Back to editing')).toBeTruthy();
  });
});

describe('amending a dossier that already exists', () => {
  const openEdit = () => {
    at({ kind: 'dossier', edit: 'f1', initialTitle: 'The Empty Room', initialContent: 'The first version.' });
    return render(<ComposeScreen />);
  };

  it('opens with the essay already in it', () => {
    const { getByDisplayValue } = openEdit();
    expect(getByDisplayValue('The Empty Room')).toBeTruthy();
    expect(getByDisplayValue('The first version.')).toBeTruthy();
  });

  it('amends rather than filing a second one', async () => {
    const { getByLabelText } = openEdit();
    await type(getByLabelText("Dossier content body"), 'The second version.');
    await press(getByLabelText('Re-file the dossier'));
    await flush();

    expect(mockFiled).toHaveLength(0);
    expect(mockAmended[0][0]).toBe('f1');
    expect(mockAmended[0][1].fullContent).toBe('The second version.');
  });

  it('never touches the NEW-dossier draft', async () => {
    // An edit loads from the server. Saving it over the draft would overwrite an
    // unfinished essay somebody has not filed yet.
    mockStore.set(DRAFT_KEY, JSON.stringify({ title: 'Unfinished', content: 'Elsewhere.' }));
    const { getByLabelText } = openEdit();
    await type(getByLabelText("Dossier content body"), 'The second version.');
    await act(async () => { jest.advanceTimersByTime(1200); });

    expect(JSON.parse(mockStore.get(DRAFT_KEY)!).title).toBe('Unfinished');

    await press(getByLabelText('Re-file the dossier'));
    await flush();
    expect(mockStore.has(DRAFT_KEY)).toBe(true);
  });
});
