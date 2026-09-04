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
import { Alert, AppState } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

/**
 * The router, with `setParams` — which the shared setup mock does not carry, so
 * it cannot be spied on. This screen is ONE route for five desks and changes
 * desk by setting `?kind=`, so that call is the picker's entire behaviour.
 */
const mockParams: Array<Record<string, string>> = [];
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: {
      push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(),
      setParams: (p: Record<string, string>) => { mockParams.push(p); },
    },
    useLocalSearchParams: jest.fn(() => ({})),
    Stack: { Screen: () => null },
    useFocusEffect: jest.fn(),
    Link: ({ children }: { children?: unknown }) => React.createElement(React.Fragment, null, children),
  };
});
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

/**
 * A stand-in for the OS telling the app it is going away.
 *
 * `AppState.addEventListener` is what the screen subscribes to for its
 * background flush — the one path that decides whether an essay survives being
 * killed while somebody takes a phone call.
 */
const mockAppState = {
  listeners: [] as Array<(s: string) => void>,
  fire(state: string) { for (const l of [...this.listeners]) l(state); },
  reset() { this.listeners.length = 0; },
};

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
  mockParams.length = 0;
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

describe('the door sends you to the right desk', () => {
  it('opens the ballot desk for a ballot and the short desk for the rest', () => {
    at({ kind: 'ballot' });
    expect(render(<ComposeScreen />).getByLabelText('Your question')).toBeTruthy();

    for (const kind of ['take', 'seeking', 'wire'] as const) {
      at({ kind });
      const { getByLabelText } = render(<ComposeScreen />);
      expect(getByLabelText(`Your ${kind}`)).toBeTruthy();
    }
  });

  it('picking a form sets the kind rather than pushing a second route', async () => {
    // The picker and the desk are one act. Two routes would mean the back
    // gesture from a desk returns to a picker already answered, to be dismissed
    // twice.
    at({});
    const { getByText } = render(<ComposeScreen />);
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
    await type(getByLabelText('Dossier headline'), 'The Empty Room');
    await type(getByLabelText('Dossier content body'), 'The very last sentence.');

    // Straight to background, with no time for the timer.
    await act(async () => { mockAppState.fire('background'); });

    const saved = JSON.parse(mockStore.get(DRAFT_KEY)!);
    expect(saved.title).toBe('The Empty Room');
    expect(saved.content).toBe('The very last sentence.');
  });

  it('writes nothing when there is nothing to write', async () => {
    at({ kind: 'dossier' });
    render(<ComposeScreen />);
    await act(async () => { mockAppState.fire('background'); });
    // An empty draft saved on every backgrounding is a file that outlives the
    // intent to write.
    expect(mockStore.has(DRAFT_KEY)).toBe(false);
  });

  it('does not flush while the app is still in front', async () => {
    at({ kind: 'dossier' });
    const { getByLabelText } = render(<ComposeScreen />);
    await type(getByLabelText('Dossier headline'), 'Still writing');
    await act(async () => { mockAppState.fire('active'); });
    expect(mockStore.has(DRAFT_KEY)).toBe(false);
  });
});

describe('the formatting toolbar', () => {
  const open = () => { at({ kind: 'dossier' }); return render(<ComposeScreen />); };

  it('wraps the selection, and leaves the caret after it', async () => {
    const { getByLabelText } = open();
    const body = getByLabelText('Dossier content body');
    await type(body, 'Ozu frames a room.');

    // The member selects "Ozu" and presses Bold.
    await act(async () => {
      fireEvent(body, 'selectionChange', { nativeEvent: { selection: { start: 0, end: 3 } } });
    });
    await press(getByLabelText('Bold'));

    expect(getByLabelText('Dossier content body').props.value).toBe('**Ozu** frames a room.');
  });

  it('puts the caret BETWEEN the marks when nothing is selected', async () => {
    // Pressing Bold with no selection should leave somebody ready to type
    // inside the emphasis, not after it.
    const { getByLabelText } = open();
    const body = getByLabelText('Dossier content body');
    await type(body, 'Ozu');
    await act(async () => {
      fireEvent(body, 'selectionChange', { nativeEvent: { selection: { start: 3, end: 3 } } });
    });
    await press(getByLabelText('Italic'));

    expect(getByLabelText('Dossier content body').props.value).toBe('Ozu**');
    expect(getByLabelText('Dossier content body').props.selection).toEqual({ start: 4, end: 4 });
  });

  it('carries every mark the desk offers', async () => {
    const { getByLabelText } = open();
    for (const label of ['Bold', 'Italic', 'Heading', 'Block quote', 'Horizontal rule', 'Insert link']) {
      expect(getByLabelText(label)).toBeTruthy();
    }
  });
});

describe('leaving the room', () => {
  const open = () => { at({ kind: 'dossier' }); return render(<ComposeScreen />); };

  it('asks before discarding words', async () => {
    const alerts: Array<[string, string, Array<{ text: string; onPress?: () => void }>]> = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string, m: string, b: never) => { alerts.push([t, m, b]); }) as never,
    );
    const { getByLabelText } = open();
    await type(getByLabelText('Dossier content body'), 'An opening line.');
    await press(getByLabelText(/Cancel/));

    expect(alerts[0][0]).toBe('Discard Draft?');
    spy.mockRestore();
  });

  it('leaves without asking when there is nothing to lose', async () => {
    const alerts: unknown[] = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string) => { alerts.push(t); }) as never,
    );
    const { getByLabelText } = open();
    await press(getByLabelText(/Cancel/));
    // A confirmation over an empty page is a dialog that exists to be dismissed.
    expect(alerts).toHaveLength(0);
    spy.mockRestore();
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
  const open = () => { at({ kind: 'dossier' }); return render(<ComposeScreen />); };

  const write = async (r: ReturnType<typeof render>, text: string) => {
    await act(async () => {
      fireEvent.changeText(r.getByLabelText('Dossier content body'), text);
    });
  };
  const selectRange = async (r: ReturnType<typeof render>, start: number, end: number) => {
    await act(async () => {
      fireEvent(r.getByLabelText('Dossier content body'), 'selectionChange', {
        nativeEvent: { selection: { start, end } },
      });
    });
  };
  const tap = async (r: ReturnType<typeof render>, label: string) => {
    await act(async () => { fireEvent.press(r.getByLabelText(label)); });
  };
  const textNow = (r: ReturnType<typeof render>) =>
    r.getByLabelText('Dossier content body').props.value;

  const TOOLS: [string, string, string][] = [
    ['Bold', '**', '**'],
    ['Italic', '*', '*'],
    ['Heading', '\n## ', '\n'],
    ['Block quote', '\n> ', '\n'],
    ['Horizontal rule', '\n---\n', ''],
    ['Insert link', '[', '](url)'],
  ];

  for (const [label, before, after] of TOOLS) {
    it(`${label} — wraps what is selected, and leaves it selected-through`, async () => {
      const r = open();
      await write(r, 'Ozu never once stood up.');
      await selectRange(r, 0, 3); // "Ozu"
      await tap(r, label);
      expect(textNow(r)).toBe(`${before}Ozu${after} never once stood up.`);
    });

    it(`${label} — opens the markers and puts the caret INSIDE them`, async () => {
      // With nothing selected the caret belongs between the markers, so the
      // member types into what they just opened rather than after it.
      const r = open();
      await write(r, 'AB');
      await selectRange(r, 1, 1);
      await tap(r, label);
      expect(textNow(r)).toBe(`A${before}${after}B`);
      expect(r.getByLabelText('Dossier content body').props.selection)
        .toEqual({ start: 1 + before.length, end: 1 + before.length });
    });
  }

  it('the caret after a wrap sits past the whole thing, not inside it', async () => {
    const r = open();
    await write(r, 'Ozu');
    await selectRange(r, 0, 3);
    await tap(r, 'Bold');
    expect(r.getByLabelText('Dossier content body').props.selection)
      .toEqual({ start: 7, end: 7 }); // ** + Ozu + ** === 7
  });

  it('releases the caret once the member moves it themselves', async () => {
    // The forced selection is programmatic control of somebody's cursor. Held
    // one render too long it fights them: they tap elsewhere and are dragged
    // back. It is released on the next selection change.
    const r = open();
    await write(r, 'Ozu');
    await selectRange(r, 0, 3);
    await tap(r, 'Bold');
    expect(r.getByLabelText('Dossier content body').props.selection).toBeTruthy();
    await selectRange(r, 1, 1);
    expect(r.getByLabelText('Dossier content body').props.selection).toBeUndefined();
  });
});
