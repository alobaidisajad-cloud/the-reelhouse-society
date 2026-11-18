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
import { AccessibilityInfo, Alert, AppState, InteractionManager } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import ComposeScreen from '@/app/dispatch/compose';
import { draftKey } from '@/src/utils/memberDrafts';
import * as draftSync from '@/src/utils/draftSync';

/**
 * The router, with `setParams` — which the shared setup mock does not carry, so
 * it cannot be spied on. This screen is ONE route for five desks and changes
 * desk by setting `?kind=`, so that call is the picker's entire behaviour.
 */
const mockParams: Record<string, string>[] = [];
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    ...require('@/test-utils/expoRouterMock').expoRouterMock(),
    router: {
      push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true,
      setParams: (p: Record<string, string>) => { mockParams.push(p); },
    },
    useLocalSearchParams: jest.fn(() => ({})),
    Stack: { Screen: () => null },
    useFocusEffect: jest.fn(),
    Link: ({ children }: { children?: unknown }) => React.createElement(React.Fragment, null, children),
  };
});

/**
 * The draft's key carries the MEMBER now.
 *
 * It used to be this bare string for everybody, and logout never cleared it —
 * so one member's unpublished essay sat in the writing room waiting for the
 * next person to sign in on that phone, readable and filable under their name.
 * `theDraftIsYours.test.ts` proves the leak is shut; these tests simply use the
 * real key, which is derived rather than typed so it cannot drift from it.
 */
const DRAFT_KEY = 'reelhouse_draft_u1_dossier';

let mockUser: Record<string, unknown> | null = { id: 'u1', username: 'me', tier: 'auteur' };
let mockFiled: Record<string, unknown>[] = [];
let mockAmended: [string, Record<string, unknown>][] = [];
let mockFileFails = false;
/** The essays the reader holds whole (the store's `opened`), and what a read of one answers. */
let mockOpened: Record<string, Record<string, unknown>> = {};
let mockHydrate: (id: string) => Promise<unknown> = async () => null;
let mockHydrated: string[] = [];
/** The wire is down: the store keeps the write for later and says so. */
let mockOffline = false;
/** When set, a filing or an amend is answered only once this settles: the house still on its way. */
let mockFilingHeld: Promise<void> | null = null;
const mockStore = new Map<string, string>();
let mockStoreFull = false;
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
    // `memberDrafts` sweeps by prefix on logout and evicts by age, so the mock
    // has to be able to enumerate. Without it the sweep silently does nothing
    // and every leak test passes for the wrong reason.
    getAllKeys: () => [...mockStore.keys()],
    set: (k: string, v: string) => {
      // A full phone is the ordinary failure, and it is the one the room has to
      // be able to report at the exit.
      if (mockStoreFull) throw new Error('no space left on device');
      mockStore.set(k, v);
    },
    delete: (k: string) => { mockStore.delete(k); },
  },
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
}));

jest.mock('@/src/stores/dispatch', () => ({
  useDispatch: {
    getState: () => ({
      opened: mockOpened,
      hydrate: (id: string) => { mockHydrated.push(id); return mockHydrate(id); },
      file: async (d: Record<string, unknown>) => {
        if (mockFilingHeld) await mockFilingHeld;
        if (mockFileFails) throw new Error('refused');
        mockFiled.push(d);
        return { id: 'new' };
      },
      amend: async (id: string, u: Record<string, unknown>) => {
        if (mockFilingHeld) await mockFilingHeld;
        if (mockFileFails) throw new Error('refused');
        mockAmended.push([id, u]);
        return mockOffline ? { offline: true } : undefined;
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

/**
 * A stand-in for the OS telling the app it is going away.
 *
 * `AppState.addEventListener` is what the screen subscribes to for its
 * background flush — the one path that decides whether an essay survives being
 * killed while somebody takes a phone call.
 */
const mockAppState = {
  listeners: [] as ((s: string) => void)[],
  fire(state: string) { for (const l of [...this.listeners]) l(state); },
  reset() { this.listeners.length = 0; },
};

const type = async (field: unknown, text: string) => {
  await act(async () => { await fireEvent.changeText(field as never, text); });
};
const press = async (control: unknown) => {
  await act(async () => { await fireEvent.press(control as never); });
};
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  mockUser = { id: 'u1', username: 'me', tier: 'auteur' };
  mockFiled = []; mockAmended = []; mockFileFails = false; mockOffline = false; mockFilingHeld = null;
  mockOpened = {}; mockHydrate = async () => null; mockHydrated = [];
  mockStore.clear();
  mockStoreFull = false;
  mockToast.error.mockClear(); mockToast.success.mockClear();
  at({});
  mockParams.length = 0;
  // Each case's own ways out: what an earlier case pushed, replaced or dismissed is not this one's.
  for (const way of ['push', 'replace', 'back', 'navigate', 'dismissTo'] as const) (router[way] as jest.Mock).mockClear();
  mockAppState.reset();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(
    ((_type: string, handler: (s: string) => void) => {
      mockAppState.listeners.push(handler);
      return { remove: () => { mockAppState.listeners = mockAppState.listeners.filter((l) => l !== handler); } };
    }) as never,
  );
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

/**
 * A stranger at the desk (P4.21). The Concierge offers "File to the Dispatch" to everyone, and a
 * link names the desk too: a reader who is not a member was told "Filing is for members." in a
 * toast and taken back, the way in never offered. The desk is the members' room: it says so,
 * offers the way in, and the sign-in brings them back to the desk they asked for.
 */
describe('a stranger at the desk', () => {
  for (const [kind, next] of [
    [undefined, '/dispatch/compose'],
    ['take', '/dispatch/compose?kind=take'],
    ['wire', '/dispatch/compose?kind=wire'],
    ['ballot', '/dispatch/compose?kind=ballot'],
    ['dossier', '/dispatch/compose?kind=dossier'],
  ] as const) {
    it(`is asked in at ${next}, and brought back to it`, async () => {
      mockUser = null;
      at({ kind });
      const { getByText, getByTestId, queryByText } = render(<ComposeScreen />);
      await flush();
      expect(getByText('For Members')).toBeTruthy();
      // No desk is drawn for a reader who cannot file, and nothing is said and taken away.
      expect([queryByText('TAKE'), queryByText('FILE IT')]).toEqual([null, null]);
      expect(mockToast.error).not.toHaveBeenCalled();
      await press(getByTestId('members-only-sign-in'));
      // Pushed; or replaced, as the router's helper does the fourth time one screen is opened (typedRouter).
      const sent = [...(router.push as jest.Mock).mock.calls, ...(router.replace as jest.Mock).mock.calls];
      expect(sent).toContainEqual([`/login?next=${encodeURIComponent(next)}`]);
    });
  }
});

describe('the door', () => {
  it('asks which form when no kind is chosen', async () => {
    const { getByText } = render(<ComposeScreen />);
    await flush();
    expect(getByText('TAKE')).toBeTruthy();
    expect(getByText('ESSAY')).toBeTruthy();
  });

  it('says a ballot is in progress, as it says an essay is (review round 4)', async () => {
    require('@/src/utils/memberDrafts').writeDraft('u1', 'ballot', { question: 'Which Ozu?', slots: [], closes: '2 DAYS' });
    const { getAllByLabelText } = render(<ComposeScreen />);
    await flush();
    const marked = getAllByLabelText(/One in progress/).map((n) => String(n.props.accessibilityLabel));
    expect(marked).toHaveLength(1);
    expect(marked[0]).toMatch(/^Ballot./i);
  });

  it('turns a member without the tier away at the route, not at the desk', async () => {
    // A ballot and a dossier need the tier; a take, a seeking and a wire do
    // not. Checking it here means nobody writes an essay and is refused at the
    // end by a rule they were never shown.
    mockUser = { id: 'u1', username: 'me', tier: 'cinephile' };
    at({ kind: 'dossier' });
    (router.back as jest.Mock).mockClear();
    // The way out waits for the entrance to settle; here it settles at once.
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(
      ((fn: () => void) => { fn(); return { cancel() {} }; }) as never,
    );
    render(<ComposeScreen />);
    await flush();
    // In the house's own words, and naming the FORM. "Auteur tier required" is
    // a settings screen talking about a subscription.
    expect(mockToast.error).toHaveBeenCalledWith('The essay is an Auteur’s to file.');
    // And turned AWAY: told, then taken back out, never left at the desk.
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('and tells a LAPSED Auteur their unfinished one is kept', async () => {
    // Turned away from a room still holding four thousand of their words, and
    // told only that they lack the tier, a member reasonably assumes the essay
    // went with the subscription.
    mockStore.set('reelhouse_draft_u1_dossier', JSON.stringify({
      v: 2, savedAt: new Date().toISOString(),
      data: { title: 'The Empty Room', content: 'Four thousand words.' },
    }));
    mockUser = { id: 'u1', username: 'me', tier: 'free' };
    at({ kind: 'dossier' });
    render(<ComposeScreen />);
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith('The essay is an Auteur’s. Your unfinished one is kept.');
  });
});

describe('the writing room', () => {
  const open = async () => { at({ kind: 'dossier' }); const r = render(<ComposeScreen />); await flush(); return r; };

  it('writes the draft to storage as you type', async () => {
    const { getByLabelText } = await open();
    await type(getByLabelText("Essay headline"), 'The Empty Room');
    await act(async () => { jest.advanceTimersByTime(1200); });
    expect(JSON.parse(mockStore.get(DRAFT_KEY)!).data.title).toBe('The Empty Room');
  });

  it('gives the draft back when the room is opened again', async () => {
    mockStore.set(DRAFT_KEY, JSON.stringify({ title: 'Half Written', content: 'The opening line.' }));
    const { getByDisplayValue } = await open();
    expect(getByDisplayValue('Half Written')).toBeTruthy();
    expect(getByDisplayValue('The opening line.')).toBeTruthy();
  });

  it('survives a corrupt draft rather than refusing to open', async () => {
    mockStore.set(DRAFT_KEY, 'not json at all');
    const { getByLabelText } = await open();
    expect(getByLabelText("Essay headline")).toBeTruthy();
  });

  it('clears the draft when the room is emptied', async () => {
    mockStore.set(DRAFT_KEY, JSON.stringify({ title: 'x', content: 'y' }));
    const { getByLabelText } = await open();
    await type(getByLabelText("Essay headline"), '');
    await type(getByLabelText("Essay content body"), '');
    await act(async () => { jest.advanceTimersByTime(1200); });
    expect(mockStore.has(DRAFT_KEY)).toBe(false);
  });

  it('files the essay, and only then throws the draft away', async () => {
    const { getByLabelText } = await open();
    await type(getByLabelText("Essay headline"), 'The Empty Room');
    await type(getByLabelText("Essay content body"), 'Ozu frames a room and then leaves it.');
    await act(async () => { jest.advanceTimersByTime(1200); });
    expect(mockStore.has(DRAFT_KEY)).toBe(true);

    await press(getByLabelText('File the essay'));
    await flush();

    expect(mockFiled).toHaveLength(1);
    expect(mockFiled[0].kind).toBe('dossier');
    expect(mockFiled[0].title).toBe('The Empty Room');
    expect(mockFiled[0].fullContent).toBe('Ozu frames a room and then leaves it.');
    expect(mockStore.has(DRAFT_KEY)).toBe(false);
    // Home to the Dispatch already beneath, never a second tab app built over the first.
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/dispatch');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('a filed essay is not backed up again as the room closes, so it never returns as a draft', async () => {
    const pushed = jest.spyOn(draftSync, 'pushDraft').mockResolvedValue(undefined as never);
    const r = await open();
    await type(r.getByLabelText('Essay headline'), 'The Empty Room');
    await type(r.getByLabelText('Essay content body'), 'Ozu frames a room and then leaves it.');
    await press(r.getByLabelText('File the essay'));
    await flush();
    expect(mockFiled).toHaveLength(1);
    pushed.mockClear();
    r.unmount();
    expect(pushed).not.toHaveBeenCalled();
    expect(mockStore.has(DRAFT_KEY)).toBe(false);
  });

  it('a room left with words in it backs them up, and keeps the last second of them, as it closes', async () => {
    const pushed = jest.spyOn(draftSync, 'pushDraft').mockResolvedValue(undefined as never);
    const r = await open();
    await type(r.getByLabelText('Essay headline'), 'The Empty Room');
    // Closed before the words have rested the second the phone waits.
    r.unmount();
    expect(JSON.parse(mockStore.get(DRAFT_KEY)!).data.title).toBe('The Empty Room');
    expect(pushed).toHaveBeenCalledWith('u1', 'dossier', expect.objectContaining({ title: 'The Empty Room' }), expect.any(String), '');
  });

  it('KEEPS the draft when the filing is refused', async () => {
    // The one thing this screen must never do is throw away an evening's work
    // on the strength of a write that did not land.
    mockFileFails = true;
    const { getByLabelText } = await open();
    await type(getByLabelText("Essay headline"), 'The Empty Room');
    await type(getByLabelText("Essay content body"), 'The opening line.');
    await act(async () => { jest.advanceTimersByTime(1200); });

    await press(getByLabelText('File the essay'));
    await flush();

    expect(mockStore.has(DRAFT_KEY)).toBe(true);
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('will not file until there is both a title and a body', async () => {
    const { getByLabelText } = await open();
    expect(getByLabelText(/Not ready yet/).props.accessibilityState.disabled).toBe(true);

    await type(getByLabelText("Essay headline"), 'The Empty Room');
    expect(getByLabelText(/Not ready yet/).props.accessibilityState.disabled).toBe(true);

    await type(getByLabelText("Essay content body"), 'The opening line.');
    expect(getByLabelText('File the essay').props.accessibilityState.disabled).toBe(false);
  });

  it('is not lit by spaces, which the filing would refuse in silence', async () => {
    const { getByLabelText } = await open();
    await type(getByLabelText("Essay headline"), '   ');
    await type(getByLabelText("Essay content body"), 'The opening line.');
    expect(getByLabelText(/Not ready yet/).props.accessibilityState.disabled).toBe(true);
  });

  it('refuses an over-length essay before touching anything', async () => {
    const { getByLabelText, getByText } = await open();
    await type(getByLabelText("Essay headline"), 'Too Long');
    await type(getByLabelText("Essay content body"), 'x'.repeat(25001));
    await act(async () => { jest.advanceTimersByTime(1200); });

    await press(getByLabelText('File the essay'));
    await flush();

    // Nothing written, nothing deleted, and the member told by how much: under the
    // writing, with it, and sent there (P4.39), not in a toast that leaves.
    expect(mockFiled).toHaveLength(0);
    expect(mockStore.has(DRAFT_KEY)).toBe(true);
    expect(getByLabelText('Essay content body').props.accessibilityHint).toMatch(/over the limit/);
    expect(getByText(/characters over the limit/)).toBeTruthy();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('shows the counter only near the fence', async () => {
    const { getByLabelText, queryByText } = await open();
    await type(getByLabelText("Essay content body"), 'A short opening.');
    expect(queryByText(/LEFT/)).toBeNull();

    await type(getByLabelText("Essay content body"), 'x'.repeat(21000));
    expect(queryByText(/LEFT/)).toBeTruthy();
  });

  it('switches between writing and reading it back', async () => {
    const { getByLabelText } = await open();
    await type(getByLabelText("Essay content body"), 'Ozu frames a room.');
    await press(getByLabelText('Preview the essay'));
    expect(getByLabelText('Edit: back to editing')).toBeTruthy();
  });
});

describe('the door sends you to the right desk', () => {
  it('opens the ballot desk for a ballot and the short desk for the rest', async () => {
    at({ kind: 'ballot' });
    const ballot = render(<ComposeScreen />);
    await flush();
    expect(ballot.getByLabelText('Your question')).toBeTruthy();

    for (const kind of ['take', 'seeking', 'wire'] as const) {
      at({ kind });
      const { getByLabelText } = render(<ComposeScreen />);
      await flush();
      expect(getByLabelText(`Your ${kind}`)).toBeTruthy();
    }
  });

  it('picking a form sets the kind rather than pushing a second route', async () => {
    // The picker and the desk are one act. Two routes would mean the back
    // gesture from a desk returns to a picker already answered, to be dismissed
    // twice.
    at({});
    const { getByText } = render(<ComposeScreen />);
    await flush();
    await press(getByText('TAKE'));
    expect(mockParams).toContainEqual({ kind: 'take' });
  });
});

describe('an evening of writing survives the app going away', () => {
  it('flushes the draft the moment the app leaves the foreground', async () => {
    // The debounce is a second long. A background-kill does not wait for it, so
    // the last thing typed would be the thing lost — which on this screen is an
    // essay.
    at({ kind: 'dossier' });
    const { getByLabelText } = render(<ComposeScreen />);
    await flush();
    await type(getByLabelText('Essay headline'), 'The Empty Room');
    await type(getByLabelText('Essay content body'), 'The very last sentence.');

    // Straight to background, with no time for the timer.
    await act(async () => { mockAppState.fire('background'); });

    // The payload rides inside an envelope now — `{ v, savedAt, data }` — so a
    // draft can say WHEN it was written and an older shape can still be read.
    const saved = JSON.parse(mockStore.get(DRAFT_KEY)!);
    expect(saved.data.title).toBe('The Empty Room');
    expect(saved.data.content).toBe('The very last sentence.');
  });

  it('writes nothing when there is nothing to write', async () => {
    at({ kind: 'dossier' });
    render(<ComposeScreen />);
    await flush();
    await act(async () => { mockAppState.fire('background'); });
    // An empty draft saved on every backgrounding is a file that outlives the
    // intent to write.
    expect(mockStore.has(DRAFT_KEY)).toBe(false);
  });

  it('does not flush while the app is still in front', async () => {
    at({ kind: 'dossier' });
    const { getByLabelText } = render(<ComposeScreen />);
    await flush();
    await type(getByLabelText('Essay headline'), 'Still writing');
    await act(async () => { mockAppState.fire('active'); });
    expect(mockStore.has(DRAFT_KEY)).toBe(false);
  });
});

describe('the formatting toolbar', () => {
  const open = async () => { at({ kind: 'dossier' }); const r = render(<ComposeScreen />); await flush(); return r; };

  it('wraps the selection, and leaves the caret after it', async () => {
    const { getByLabelText } = await open();
    const body = getByLabelText('Essay content body');
    await type(body, 'Ozu frames a room.');

    // The member selects "Ozu" and presses Bold.
    await act(async () => {
      await fireEvent(body, 'selectionChange', { nativeEvent: { selection: { start: 0, end: 3 } } });
    });
    await press(getByLabelText('Bold'));

    expect(getByLabelText('Essay content body').props.value).toBe('**Ozu** frames a room.');
  });

  it('puts the caret BETWEEN the marks when nothing is selected', async () => {
    // Pressing Bold with no selection should leave somebody ready to type
    // inside the emphasis, not after it.
    const { getByLabelText } = await open();
    const body = getByLabelText('Essay content body');
    await type(body, 'Ozu');
    await act(async () => {
      await fireEvent(body, 'selectionChange', { nativeEvent: { selection: { start: 3, end: 3 } } });
    });
    await press(getByLabelText('Italic'));

    expect(getByLabelText('Essay content body').props.value).toBe('Ozu**');
    expect(getByLabelText('Essay content body').props.selection).toEqual({ start: 4, end: 4 });
  });

  it('carries every mark the desk offers', async () => {
    const { getByLabelText } = await open();
    for (const label of ['Bold', 'Italic', 'Heading', 'Block quote', 'Break: a horizontal rule', 'Insert link']) {
      expect(getByLabelText(label)).toBeTruthy();
    }
  });
});

describe('leaving the room', () => {
  const open = async () => { at({ kind: 'dossier' }); const r = render(<ComposeScreen />); await flush(); return r; };

  it('asks before discarding words', async () => {
    const alerts: [string, string, { text: string; onPress?: () => void }[]][] = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string, m: string, b: never) => { alerts.push([t, m, b]); }) as never,
    );
    const { getByLabelText } = await open();
    await type(getByLabelText('Essay content body'), 'An opening line.');
    await press(getByLabelText(/Cancel/));

    // The form's own name, not "Draft" — the app says DOSSIER on every label and
    // button, and a member reads "Discard Draft?" as a fourth word for a thing
    // that already has one.
    expect(alerts[0][0]).toBe('Leave this essay?');
    // Leaving need not lose it: kept for later is offered beside discarding.
    expect(alerts[0]?.[2]?.map((b) => b.text)).toEqual(['Keep writing', 'Keep for later', 'Discard']);
    spy.mockRestore();
  });

  it('KEEP FOR LATER leaves with the essay kept, as it stands', async () => {
    const alerts: [string, string, { text: string; onPress?: () => void }[]][] = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string, m: string, b: never) => { alerts.push([t, m, b]); }) as never,
    );
    (router.back as jest.Mock).mockClear();
    const r = await open();
    await type(r.getByLabelText('Essay content body'), 'An opening line.');
    await press(r.getByLabelText(/Cancel/));
    await act(async () => { alerts[0]?.[2]?.find((b) => b.text === 'Keep for later')?.onPress?.(); });
    expect(router.back).toHaveBeenCalledTimes(1);
    r.unmount();
    expect(JSON.parse(mockStore.get(DRAFT_KEY)!).data.content).toBe('An opening line.');
    spy.mockRestore();
  });

  it('DISCARD leaves with nothing kept, on the phone or in the house', async () => {
    const alerts: [string, string, { text: string; onPress?: () => void }[]][] = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string, m: string, b: never) => { alerts.push([t, m, b]); }) as never,
    );
    const pushed = jest.spyOn(draftSync, 'pushDraft').mockResolvedValue(undefined as never);
    const r = await open();
    await type(r.getByLabelText('Essay content body'), 'An opening line.');
    await act(async () => { jest.advanceTimersByTime(1200); });
    expect(mockStore.has(DRAFT_KEY)).toBe(true);
    await press(r.getByLabelText(/Cancel/));
    await act(async () => { alerts[0]?.[2]?.find((b) => b.text === 'Discard')?.onPress?.(); });
    pushed.mockClear();
    r.unmount();
    expect(mockStore.has(DRAFT_KEY)).toBe(false);
    expect(pushed).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('and warns about the LOSS when the phone refused to keep it', async () => {
    /**
     * There is no save mark in this room and there is not going to be one — a
     * mark that only ever confirms is decoration, and none of the apps worth
     * copying has one. But if the phone genuinely refused the write, silence is
     * how somebody walks away from four thousand words believing they are safe.
     *
     * So the warning lives at the EXIT, the only moment the loss becomes real.
     */
    mockStoreFull = true;
    const alerts: [string, string][] = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(((t: string, m: string) => {
      alerts.push([t, m]);
    }) as never);

    const { getByLabelText } = await open();
    await type(getByLabelText('Essay content body'), 'Four thousand words.');
    await act(async () => { jest.advanceTimersByTime(1200); });
    await press(getByLabelText(/Cancel/));

    expect(alerts[0][0]).toBe('This is not being kept');
    expect(alerts[0][1]).toMatch(/out of space/);
    spy.mockRestore();
  });

  it('leaves without asking when there is nothing to lose', async () => {
    const alerts: unknown[] = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string) => { alerts.push(t); }) as never,
    );
    (router.back as jest.Mock).mockClear();
    const { getByLabelText } = await open();
    await press(getByLabelText(/Cancel/));
    // A confirmation over an empty page is a dialog that exists to be dismissed.
    expect(alerts).toHaveLength(0);
    // …and it LEAVES. Silence alone would also be true of a button that did nothing.
    expect(router.back).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('amending a dossier that already exists', () => {
  const ESSAY_ID = '00000017-0000-4000-8000-000000000017';
  /** The member's essay as the reader holds it: its opening in `body`, the whole in `fullContent`. */
  const essay = (over: Record<string, unknown> = {}) => ({
    id: ESSAY_ID, kind: 'dossier', authorId: 'u1', title: 'The Empty Room',
    body: 'The first', fullContent: 'The first version.', film: null, subjectId: null,
    seriesId: null, seriesTitle: null, partNumber: null, ...over,
  });
  /** As the reader's "Amend it" opens it: the essay held, and only its id in the link. */
  const openEdit = async () => {
    mockOpened = { [ESSAY_ID]: essay() };
    at({ kind: 'dossier', edit: ESSAY_ID });
    const r = render(<ComposeScreen />);
    await flush();
    return r;
  };

  it('opens with the essay already in it, read from the essay the reader holds', async () => {
    const { getByDisplayValue } = await openEdit();
    expect(getByDisplayValue('The Empty Room')).toBeTruthy();
    expect(getByDisplayValue('The first version.')).toBeTruthy();
    expect(mockHydrated).toEqual([]);
  });

  it('opens on the WHOLE essay, never the opening the paper holds', async () => {
    mockOpened = { [ESSAY_ID]: essay({ fullContent: null }) };
    mockHydrate = async () => essay({ fullContent: 'The whole of it, every line.' });
    at({ kind: 'dossier', edit: ESSAY_ID });
    const { getByDisplayValue, queryByDisplayValue } = render(<ComposeScreen />);
    await flush(); await flush();
    expect(getByDisplayValue('The whole of it, every line.')).toBeTruthy();
    expect(queryByDisplayValue('The first')).toBeNull();
  });

  it('a cold link reads the essay first, and re-files nothing until it is here', async () => {
    let answer: (v: unknown) => void = () => {};
    mockHydrate = () => new Promise((r) => { answer = r; });
    at({ kind: 'dossier', edit: ESSAY_ID });
    const { getByText, getByLabelText, getByDisplayValue } = render(<ComposeScreen />);
    await flush();
    expect(mockHydrated).toEqual([ESSAY_ID]);
    expect(getByText('READING THE ESSAY AS FILED…')).toBeTruthy();
    await press(getByLabelText('Re-file the essay. Not yet: the essay as filed is not here'));
    expect(mockAmended).toHaveLength(0);
    await act(async () => { answer(essay()); });
    expect(getByDisplayValue('The first version.')).toBeTruthy();
    await type(getByLabelText('Essay content body'), 'The first version, corrected.');
    await press(getByLabelText('Re-file the essay'));
    await flush();
    expect(mockAmended).toEqual([[ESSAY_ID, expect.objectContaining({ title: 'The Empty Room', fullContent: 'The first version, corrected.' })]]);
  });

  // Review round 12: the page's state was a live region only, which iOS ignores.
  it('an essay that could not be read is spoken on an iPhone as the page says it', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    mockHydrate = async () => 'unreachable';
    at({ kind: 'dossier', edit: ESSAY_ID });
    const { getByText } = render(<ComposeScreen />);
    await flush(); await flush();
    expect(getByText('THE ESSAY COULD NOT BE READ')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('THE ESSAY COULD NOT BE READ');
    announce.mockRestore();
  });

  it('an essay that could not be read is said, asked again, and never written over', async () => {
    mockHydrate = async () => 'unreachable';
    at({ kind: 'dossier', edit: ESSAY_ID });
    const { getByText, getByLabelText, getByDisplayValue } = render(<ComposeScreen />);
    await flush(); await flush();
    expect(getByText('THE ESSAY COULD NOT BE READ')).toBeTruthy();
    await press(getByLabelText('Re-file the essay. Not yet: the essay as filed is not here'));
    expect(mockAmended).toHaveLength(0);
    mockHydrate = async () => essay();
    await press(getByLabelText(/read the essay again/i));
    await flush(); await flush();
    expect(mockHydrated).toEqual([ESSAY_ID, ESSAY_ID]);
    expect(getByDisplayValue('The first version.')).toBeTruthy();
  });

  it('an amendment kept on the phone is never re-filed while the essay as filed cannot be read', async () => {
    mockStore.set(draftKey('u1', 'edit', ESSAY_ID), JSON.stringify({
      v: 2, savedAt: '2026-11-14T21:40:00.000Z', data: { title: 'The Empty Room', content: 'Only the lines typed last night.' },
    }));
    mockHydrate = async () => 'unreachable';
    at({ kind: 'dossier', edit: ESSAY_ID });
    const { getByDisplayValue, getByLabelText } = render(<ComposeScreen />);
    await flush(); await flush();
    expect(getByDisplayValue('Only the lines typed last night.')).toBeTruthy();
    await press(getByLabelText('Re-file the essay. Not yet: the essay as filed is not here'));
    await flush();
    expect(mockAmended).toHaveLength(0);
  });

  it("another member's essay is not amended from this room", async () => {
    mockOpened = { [ESSAY_ID]: essay({ authorId: 'u2' }) };
    mockHydrate = async () => essay({ authorId: 'u2' });
    at({ kind: 'dossier', edit: ESSAY_ID });
    const { getByText, queryByDisplayValue } = render(<ComposeScreen />);
    await flush(); await flush();
    expect(getByText('THIS ESSAY CAN NO LONGER BE AMENDED')).toBeTruthy();
    expect(queryByDisplayValue('The first version.')).toBeNull();
  });

  it('an amend left as it opened leaves without asking, and keeps no copy', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText } = await openEdit();
    await act(async () => { jest.advanceTimersByTime(1200); });
    expect(mockStore.has(draftKey('u1', 'edit', ESSAY_ID))).toBe(false);
    await press(getByLabelText('Cancel, and leave the writing room'));
    expect(alert).not.toHaveBeenCalled();
  });

  it('an amend with changes asks about the AMENDMENTS, saying the essay stays as filed if they go', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText } = await openEdit();
    await type(getByLabelText('Essay content body'), 'The second version.');
    await press(getByLabelText('Cancel, and leave the writing room'));
    expect(alert).toHaveBeenCalledWith(
      'Leave these amendments?',
      'Keep them for later and they wait for you here. Discard them and the essay stays as it was filed.',
      [expect.objectContaining({ text: 'Keep writing' }), expect.objectContaining({ text: 'Keep for later' }), expect.objectContaining({ text: 'Discard' })],
    );
  });

  it("shows the essay's film as filed, and offers no change an amendment would drop", async () => {
    mockOpened = { [ESSAY_ID]: essay({ subjectId: 603, film: { title: 'The Matrix', director: '1999', posterPath: null, backdropPath: null } }) };
    at({ kind: 'dossier', edit: ESSAY_ID });
    const { getByLabelText } = render(<ComposeScreen />);
    await flush();
    const slot = getByLabelText('Film: The Matrix, 1999, as filed');
    expect(slot.props.accessibilityState?.disabled ?? slot.props.disabled).toBeTruthy();
  });

  it('opens on an amend as build 41 kept it, over the published words (savedJsonOpensWhole)', async () => {
    const { saved } = require('@/src/utils/__tests__/fixtures/saved-json/drafts.json') as { saved: Record<string, unknown> };
    const envelope = Object.entries(saved).find(([k]) => /_edit_/.test(k))![1];
    mockStore.set(draftKey('u1', 'edit', '00000017-0000-4000-8000-000000000017'), JSON.stringify(envelope));
    const { getByDisplayValue } = await openEdit();
    expect([getByDisplayValue('Revised'), getByDisplayValue('A second look.')].every(Boolean)).toBe(true);
  });

  it('amends rather than filing a second one', async () => {
    const { getByLabelText } = await openEdit();
    await type(getByLabelText("Essay content body"), 'The second version.');
    await press(getByLabelText('Re-file the essay'));
    await flush();

    expect(mockFiled).toHaveLength(0);
    expect(mockAmended[0][0]).toBe('00000017-0000-4000-8000-000000000017');
    expect(mockAmended[0][1].fullContent).toBe('The second version.');
    // Back to the essay it amended, never to the Dispatch's front page.
    expect(router.back).toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('prints the read time the published page will print', async () => {
    // 250 words: the reader says 1 MIN (readTime.ts); a second formula once said 2.
    const { getByLabelText, getByText } = await openEdit();
    await type(getByLabelText("Essay content body"), Array.from({ length: 250 }, () => 'word').join(' '));
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(getByText('~1m')).toBeTruthy();
  });

  it('says an amendment kept for later is kept for later, not that it went', async () => {
    mockOffline = true;
    const { getByLabelText } = await openEdit();
    await type(getByLabelText("Essay content body"), 'The second version.');
    await press(getByLabelText('Re-file the essay'));
    await flush();
    expect(mockToast.success).toHaveBeenCalledWith('Amended. It goes out when the wire is back.');
    expect(mockToast.success).not.toHaveBeenCalledWith('Essay updated');
  });

  it('never touches the NEW-dossier draft', async () => {
    // An edit loads from the server. Saving it over the draft would overwrite an
    // unfinished essay somebody has not filed yet.
    // Seeded in the shape a real draft has: an envelope carrying the payload.
    mockStore.set(DRAFT_KEY, JSON.stringify({
      v: 2, savedAt: '2026-09-10T21:40:00.000Z',
      data: { title: 'Unfinished', content: 'Elsewhere.' },
    }));
    const { getByLabelText } = await openEdit();
    await type(getByLabelText("Essay content body"), 'The second version.');
    await act(async () => { jest.advanceTimersByTime(1200); });

    expect(JSON.parse(mockStore.get(DRAFT_KEY)!).data.title).toBe('Unfinished');

    await press(getByLabelText('Re-file the essay'));
    await flush();
    expect(mockStore.has(DRAFT_KEY)).toBe(true);
  });
});

/**
 * A desk swiped away while FILING… (review round 7). The essay still goes, and the toast says so;
 * but the member is already elsewhere, and the desk that is gone takes them nowhere: an amend's
 * back popped the reader they had gone back to, a filing's dismiss took them to the Dispatch from
 * wherever they were.
 */
describe('an essay whose filing lands after the desk has gone', () => {
  const ESSAY_ID = '00000017-0000-4000-8000-000000000017';

  it('a new essay is still said filed, and the member is not taken to the Dispatch from where they went', async () => {
    let release: () => void = () => {};
    mockFilingHeld = new Promise<void>((res) => { release = res; });
    at({ kind: 'dossier' });
    const r = render(<ComposeScreen />);
    await flush();
    await type(r.getByLabelText('Essay headline'), 'The Empty Room');
    await type(r.getByLabelText('Essay content body'), 'Ozu frames a room and then leaves it.');
    await press(r.getByLabelText('File the essay'));
    // Swiped away while the house had not yet answered.
    r.unmount();
    await act(async () => { release(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    expect(mockFiled).toHaveLength(1);
    expect(mockToast.success).toHaveBeenCalledWith('Essay filed');
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('an amend is still said updated, and the page the member went back to is not popped', async () => {
    let release: () => void = () => {};
    mockFilingHeld = new Promise<void>((res) => { release = res; });
    mockOpened = {
      [ESSAY_ID]: {
        id: ESSAY_ID, kind: 'dossier', authorId: 'u1', title: 'The Empty Room',
        body: 'The first', fullContent: 'The first version.', film: null, subjectId: null,
        seriesId: null, seriesTitle: null, partNumber: null,
      },
    };
    at({ kind: 'dossier', edit: ESSAY_ID });
    const r = render(<ComposeScreen />);
    await flush();
    await type(r.getByLabelText('Essay content body'), 'The second version.');
    await press(r.getByLabelText('Re-file the essay'));
    r.unmount();
    await act(async () => { release(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    expect(mockAmended).toHaveLength(1);
    expect(mockToast.success).toHaveBeenCalledWith('Essay updated');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});

/**
 * ── THE MARKDOWN TOOLBAR ────────────────────────────────────────────────────
 * Six controls, and not one statement behind them had ever run. They are how a
 * member sets a heading, a rule and a quotation in an essay, and every one of
 * them edits the text the member is writing — so a wrong marker or a caret left
 * in the wrong place is the app corrupting somebody's work in front of them.
 *
 * Both cases are checked for each: wrapping a SELECTION, and inserting into an
 * empty caret. They take different paths, and the caret rule is the opposite in
 * each — after the wrap when something was selected, between the markers when
 * nothing was, so a member can carry on typing inside what they just opened.
 */
describe('the tools that edit what the member wrote', () => {
  const open = async () => { at({ kind: 'dossier' }); const r = render(<ComposeScreen />); await flush(); return r; };

  const write = async (r: ReturnType<typeof render>, text: string) => {
    await act(async () => {
      await fireEvent.changeText(r.getByLabelText('Essay content body'), text);
    });
  };
  const selectRange = async (r: ReturnType<typeof render>, start: number, end: number) => {
    await act(async () => {
      await fireEvent(r.getByLabelText('Essay content body'), 'selectionChange', {
        nativeEvent: { selection: { start, end } },
      });
    });
  };
  const tap = async (r: ReturnType<typeof render>, label: string) => {
    await act(async () => { await fireEvent.press(r.getByLabelText(label)); });
  };
  const textNow = (r: ReturnType<typeof render>) =>
    r.getByLabelText('Essay content body').props.value;

  const TOOLS: [string, string, string][] = [
    ['Bold', '**', '**'],
    ['Italic', '*', '*'],
    ['Heading', '\n## ', '\n'],
    ['Block quote', '\n> ', '\n'],
    ['Break: a horizontal rule', '\n---\n', ''],
    ['Insert link', '[', '](url)'],
  ];

  for (const [label, before, after] of TOOLS) {
    it(`${label} — wraps what is selected, and leaves it selected-through`, async () => {
      const r = await open();
      await write(r, 'Ozu never once stood up.');
      await selectRange(r, 0, 3); // "Ozu"
      await tap(r, label);
      expect(textNow(r)).toBe(`${before}Ozu${after} never once stood up.`);
    });

    it(`${label} — opens the markers and puts the caret INSIDE them`, async () => {
      // With nothing selected the caret belongs between the markers, so the
      // member types into what they just opened rather than after it.
      const r = await open();
      await write(r, 'AB');
      await selectRange(r, 1, 1);
      await tap(r, label);
      expect(textNow(r)).toBe(`A${before}${after}B`);
      expect(r.getByLabelText('Essay content body').props.selection)
        .toEqual({ start: 1 + before.length, end: 1 + before.length });
    });
  }

  it('the caret after a wrap sits past the whole thing, not inside it', async () => {
    const r = await open();
    await write(r, 'Ozu');
    await selectRange(r, 0, 3);
    await tap(r, 'Bold');
    expect(r.getByLabelText('Essay content body').props.selection)
      .toEqual({ start: 7, end: 7 }); // ** + Ozu + ** === 7
  });

  it('releases the caret once the member moves it themselves', async () => {
    // The forced selection is programmatic control of somebody's cursor. Held
    // one render too long it fights them: they tap elsewhere and are dragged
    // back. It is released on the next selection change.
    const r = await open();
    await write(r, 'Ozu');
    await selectRange(r, 0, 3);
    await tap(r, 'Bold');
    expect(r.getByLabelText('Essay content body').props.selection).toBeTruthy();
    await selectRange(r, 1, 1);
    expect(r.getByLabelText('Essay content body').props.selection).toBeUndefined();
  });
});
