/**
 * list-modal.curate.test.tsx — the accession form, driven.
 *
 * This page had never been mounted by a test, and the defect that matters most
 * cannot be seen by reading it: a form that opens blank sends `films: []`, and
 * BOTH the direct write and the offline replay read that as "the curator
 * emptied the stack" and delete every list_item. `undefined` is skipped. So the
 * form must never be able to say "I don't know" in the word it uses for "I
 * removed everything".
 *
 * These drive the screen. Where a fact is pure geometry — the numbers that put
 * a control on the 48pt floor — it is read from the source instead, because
 * layout arithmetic has no rendered symptom until it is wrong on a device.
 */
import React, { act } from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

import ListModal from '../list-modal';

const SOURCE = readFileSync(join(__dirname, '..', 'list-modal.tsx'), 'utf8');
const STACK_ID = '22222222-2222-4222-8222-222222222222';

let mockParams: Record<string, string | undefined>;
let mockLists: unknown[];
let mockCachedStack: unknown;
const mockCreateList = jest.fn();
const mockUpdateList = jest.fn();

jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@tanstack/react-query', () => ({
  QueryClient: class { defaultOptions = {}; getQueryCache = () => ({ subscribe: () => () => {} }); },
  useQueryClient: () => ({
    getQueryData: (k: unknown[]) => (k[0] === 'stack' ? mockCachedStack : undefined),
    setQueryData: jest.fn(), removeQueries: jest.fn(), invalidateQueries: jest.fn(),
  }),
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
jest.mock('@/src/components/ToastOverlay', () => ({ ToastOverlay: () => null }));
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
  isPrivate: false, isRanked: false, films: FILMS,
};

const mount = () => render(<ListModal />);
/**
 * This repo's RNTL shim wraps `rerender` in React.act ITSELF. Nesting it inside
 * another act() produces "overlapping act() calls", which does not merely warn:
 * it leaves React's act scope corrupted, so every later render in the file
 * produces nothing and twenty tests fail for a reason none of them are about.
 */
const rerender = (r: ReturnType<typeof mount>) => r.rerender(<ListModal />);
const flat = (style: unknown) =>
  Object.assign({}, ...[style].flat(3).filter(Boolean)) as Record<string, number>;

/** Pull one style body out of the sheet by brace-matching, never `[^}]*`. */
function styleBody(name: string): string {
  const at = SOURCE.indexOf(`\n    ${name}: {`);
  if (at === -1) throw new Error(`style not found: ${name}`);
  const open = SOURCE.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < SOURCE.length; i++) {
    if (SOURCE[i] === '{') depth++;
    else if (SOURCE[i] === '}' && --depth === 0) return SOURCE.slice(open, i + 1);
  }
  throw new Error(`unterminated style: ${name}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockLists = [];
  mockCachedStack = undefined;
});

describe('the form can never destroy a stack', () => {
  it('waits for the stack rather than filing the blank form it opened with', async () => {
    // THE DEFECT. The sheet opens for an edit, the store has not hydrated, so
    // every field is seeded empty by a useState initializer that runs once and
    // never again. The member types a title — the header used to say NEW STACK,
    // so they believe they are starting something — and saves. By then the
    // store HAS resolved, so the edit branch runs, carrying films: [] and
    // deleting every list_item in the stack.
    mockParams = { editId: STACK_ID };
    const r = mount();
    await act(async () => { fireEvent.changeText(r.getByLabelText('Stack title'), 'Anything'); });

    mockLists = [STACK];                                  // the stack lands late
    rerender(r);
    await waitFor(() => expect(r.getByText('Blade Runner')).toBeTruthy());

    await act(async () => { fireEvent.press(r.getByLabelText('SAVE THE AMENDMENTS')); });
    await waitFor(() => expect(mockUpdateList).toHaveBeenCalled());
    expect(mockUpdateList.mock.calls[0][1].films).toHaveLength(2);
  });

  it('hydrates the whole form the moment the stack arrives', async () => {
    mockParams = { editId: STACK_ID };
    const r = mount();
    expect(r.getByLabelText('Stack title').props.value).toBe('');
    mockLists = [STACK];
    rerender(r);
    await waitFor(() => expect(r.getByLabelText('Stack title').props.value).toBe('Neon Noir Masterpieces'));
    expect(r.getByLabelText('Stack description').props.value).toBe('A note.');
  });

  it('never overwrites what the member has since typed', async () => {
    // Hydrate once per stack. A refetch landing mid-edit must not wipe the
    // sentence someone is in the middle of writing.
    //
    // The refetch has to be simulated the way the store actually does it — a
    // NEW object carrying the same fields. Re-rendering with the same reference
    // leaves the effect's deps unchanged, so it never re-runs and the guard is
    // never exercised: deleting the guard entirely kept such a test green.
    mockParams = { editId: STACK_ID };
    mockLists = [STACK];
    const r = mount();
    await waitFor(() => expect(r.getByLabelText('Stack title').props.value).toBe('Neon Noir Masterpieces'));
    await act(async () => { fireEvent.changeText(r.getByLabelText('Stack title'), 'My New Name'); });
    expect(r.getByLabelText('Stack title').props.value).toBe('My New Name');

    mockLists = [{ ...STACK, films: [...FILMS] }];   // the same stack, refetched
    rerender(r);
    await act(async () => {});
    expect(r.getByLabelText('Stack title').props.value).toBe('My New Name');
  });

  it('omits the holdings entirely when it does not hold all of them', async () => {
    // The cached payload caps at 500 items and carries the true count beside
    // it. Holding fewer than exist, the note and terms still save and the index
    // is left exactly as it stands.
    mockParams = { editId: STACK_ID };
    mockCachedStack = { list: { ...STACK, films: FILMS, filmCount: 620 } };
    const r = mount();
    await waitFor(() => expect(r.getByLabelText('Stack title').props.value).toBe('Neon Noir Masterpieces'));
    await act(async () => { fireEvent.press(r.getByLabelText('SAVE THE AMENDMENTS')); });
    await waitFor(() => expect(mockUpdateList).toHaveBeenCalled());
    const payload = mockUpdateList.mock.calls[0][1];
    expect('films' in payload).toBe(false);              // never [], never a short set
    expect(payload.title).toBe('Neon Noir Masterpieces'); // the rest still saves
  });

  it('says so on the page while the index is short', async () => {
    mockParams = { editId: STACK_ID };
    mockCachedStack = { list: { ...STACK, films: FILMS, filmCount: 620 } };
    const r = mount();
    await waitFor(() => expect(r.getByText(/2 OF 620 REELS/)).toBeTruthy());
  });

  it('sends them when it does hold all of them', async () => {
    mockParams = { editId: STACK_ID };
    mockCachedStack = { list: { ...STACK, films: FILMS, filmCount: 2 } };
    const r = mount();
    await waitFor(() => expect(r.getByLabelText('Stack title').props.value).toBe('Neon Noir Masterpieces'));
    expect(r.queryByText(/THE FULL INDEX IS STILL ARRIVING/)).toBeNull();
    await act(async () => { fireEvent.press(r.getByLabelText('SAVE THE AMENDMENTS')); });
    await waitFor(() => expect(mockUpdateList).toHaveBeenCalled());
    expect(mockUpdateList.mock.calls[0][1].films).toHaveLength(2);
  });

  it('says so, rather than creating a duplicate, when the stack cannot be opened', async () => {
    mockParams = { editId: STACK_ID };                    // resolves to nothing
    const r = mount();
    await act(async () => { fireEvent.changeText(r.getByLabelText('Stack title'), 'Anything'); });
    await waitFor(() => expect(r.getByText('THIS STACK COULD NOT BE OPENED')).toBeTruthy());
    await act(async () => { fireEvent.press(r.getByLabelText(/FILE THE STACK/)); });
    await act(async () => {});
    expect(mockCreateList).not.toHaveBeenCalled();
    expect(mockUpdateList).not.toHaveBeenCalled();
  });
});

describe('the header tells the truth', () => {
  it('names the stack being amended', async () => {
    mockParams = { editId: STACK_ID };
    mockLists = [STACK];
    const r = mount();
    await waitFor(() => expect(r.getByText('AMENDING')).toBeTruthy());
    expect(r.getByText('Neon Noir Masterpieces')).toBeTruthy();
    expect(r.queryByText('NEW STACK')).toBeNull();
  });

  it('says nothing but its own name when creating', async () => {
    const r = mount();
    await waitFor(() => expect(r.getByText('Curate a Stack')).toBeTruthy());
    expect(r.queryByText('AMENDING')).toBeNull();
  });

  it('never shrinks the title to fit, because the two platforms disagree', () => {
    const at = SOURCE.indexOf('style={s.headerTitleWrap}');
    expect(SOURCE.slice(at, SOURCE.indexOf('</View>', at))).not.toMatch(/adjustsFontSizeToFit/);
  });
});

describe('the act, docked', () => {
  it('asks for a name before it will file anything', async () => {
    const r = mount();
    await waitFor(() => expect(r.getByText('A NAME FOR YOUR THESIS')).toBeTruthy());
  });

  it('carries the stack’s own mark once it has one', async () => {
    const r = mount();
    await act(async () => { fireEvent.changeText(r.getByLabelText('Stack title'), 'Neon Noir'); });
    await waitFor(() => expect(r.getByText('0 REELS  ·  UNRANKED  ·  PUBLIC')).toBeTruthy());
    await act(async () => { fireEvent.press(r.getByLabelText('Set stack to ranked')); });
    await act(async () => { fireEvent.press(r.getByLabelText('Set stack to private')); });
    await waitFor(() => expect(r.getByText('0 REELS  ·  RANKED  ·  SEALED')).toBeTruthy());
  });

  it('counts one reel in the singular', async () => {
    mockParams = { editId: STACK_ID };
    mockLists = [{ ...STACK, films: [FILMS[0]] }];
    const r = mount();
    await waitFor(() => expect(r.getByText('1 REEL  ·  UNRANKED  ·  PUBLIC')).toBeTruthy());
  });

  it('speaks the want aloud, since a dim control explains nothing', () => {
    const r = mount();
    // accessibilityLiveRegion is Android-only, so the reason has to travel in
    // the label or it does not travel at all on iOS.
    expect(r.getByLabelText('FILE THE STACK. A NAME FOR YOUR THESIS')).toBeTruthy();
  });

  it('names the act for what it is', () => {
    expect(mount().getByText('FILE THE STACK')).toBeTruthy();
  });

  it('is not at the foot of the scroll any more', () => {
    // It sat below the films, so a stack of fifty put fifty rows between the
    // member and the button that finishes the job.
    expect(styleBody('bar')).toMatch(/position: 'absolute'/);
    expect(SOURCE).not.toMatch(/s\.submitBtn/);
  });
});

describe('what the page says, and stops saying', () => {
  it('no longer repeats the search field beneath itself', () => {
    expect(SOURCE).not.toContain('Search for films above to add them to your stack.');
    expect(SOURCE).toMatch(/ListEmptyComponent=\{null\}/);
  });

  it('says the order is kept, and only once there is something to drag', async () => {
    const blank = mount();
    await waitFor(() => expect(blank.getByText('HOLDINGS')).toBeTruthy());
    expect(blank.queryByText(/DRAG TO ORDER/)).toBeNull();

    mockParams = { editId: STACK_ID };
    mockLists = [STACK];
    const filled = mount();
    await waitFor(() => expect(filled.getByText(/DRAG TO ORDER/)).toBeTruthy());
    expect(filled.getByText(/THE ORDER IS KEPT EITHER WAY/)).toBeTruthy();
  });

  it('spends no words on (OPTIONAL), and does not say STACK twice', async () => {
    const r = mount();
    await waitFor(() => expect(r.getByText('TITLE')).toBeTruthy());
    expect(r.queryByText(/OPTIONAL/)).toBeNull();
    expect(r.queryByText('STACK TITLE')).toBeNull();
    expect(r.getByText('NOTE')).toBeTruthy();
    expect(r.getByText('HOLDINGS')).toBeTruthy();
  });

  it('asks the terms once, not twice', async () => {
    const r = mount();
    await waitFor(() => expect(r.getByText('TERMS')).toBeTruthy());
    expect(r.queryByText('VISIBILITY')).toBeNull();
    expect(r.queryByText('FORMAT')).toBeNull();
    for (const t of ['PUBLIC', 'PRIVATE', 'UNRANKED', 'RANKED']) expect(r.getByText(t)).toBeTruthy();
  });

  it('counts the note only near its ceiling', async () => {
    const r = mount();
    const note = r.getByLabelText('Stack description');
    await act(async () => { fireEvent.changeText(note, 'x'.repeat(400)); });
    await waitFor(() => expect(r.queryByText(/\/1000/)).toBeNull());
    await act(async () => { fireEvent.changeText(note, 'x'.repeat(801)); });
    await waitFor(() => expect(r.getByText('801/1000')).toBeTruthy());
  });
});

describe('the plate, and the reach', () => {
  it('sets the name in the face the catalogue uses', () => {
    const body = styleBody('plate');
    expect(body).toMatch(/fontFamily: fonts\.display/);
    expect(body).toMatch(/fontSize: 26/);
    expect(body).toMatch(/borderBottomWidth: 1/);   // a rule, not another box
    expect(body).not.toMatch(/borderWidth:/);
  });

  it('the plate wraps rather than shrinks', () => {
    // Comments stripped first: this field's own comment EXPLAINS why it does not
    // shrink to fit, so a naive search of the slice finds the phrase it forbids.
    const field = SOURCE
      .slice(SOURCE.indexOf('style={s.plate}'), SOURCE.indexOf('accessibilityLabel="Stack title"'))
      .replace(/\/\/[^\n]*/g, '');
    expect(field).toMatch(/\n\s*multiline\n/);
    expect(field).not.toMatch(/adjustsFontSizeToFit/);
  });

  it('the note may run to the length the database already allows', () => {
    expect(SOURCE).toMatch(/maxLength=\{1000\}/);
    expect(SOURCE).not.toMatch(/maxLength=\{500\}/);
  });

  it('every control reaches 48 by its own geometry', () => {
    for (const [name, prop] of [
      ['closeBtn', 'minHeight'], ['toggleBtn', 'minHeight'], ['removeBtn', 'height'],
      ['removeBtn', 'width'], ['barPress', 'minHeight'], ['barCancel', 'minHeight'],
    ] as const) {
      const found = styleBody(name).match(new RegExp(`${prop}: (\\d+)`));
      expect(found).not.toBeNull();
      expect(Number(found![1])).toBeGreaterThanOrEqual(48);
    }
  });

  it('claims no halo beyond that floor', () => {
    // A halo is invisible to both platforms' accessibility layers, so past the
    // floor it only takes area from a neighbour — and the ✕ sat INSIDE the row
    // you grab to reorder, where a child always wins the touch.
    expect(SOURCE).not.toMatch(/HITSLOP_/);
    expect(SOURCE).not.toMatch(/hitSlop=\{\{/);
  });

  it('the remove control is 48 square and stakes no claim on the row', async () => {
    mockParams = { editId: STACK_ID };
    mockLists = [STACK];
    const r = mount();
    await waitFor(() => expect(r.getByLabelText('Remove Blade Runner')).toBeTruthy());
    const btn = r.getByLabelText('Remove Blade Runner');
    const box = flat(btn.props.style);
    expect(box.width).toBeGreaterThanOrEqual(48);
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(btn.props.hitSlop).toBeNull();
  });

  it('the remove control still removes', async () => {
    mockParams = { editId: STACK_ID };
    mockLists = [STACK];
    const r = mount();
    await waitFor(() => expect(r.getByText('Blade Runner')).toBeTruthy());
    await act(async () => { fireEvent.press(r.getByLabelText('Remove Blade Runner')); });
    await waitFor(() => expect(r.queryByText('Blade Runner')).toBeNull());
    expect(r.getByText('Chinatown')).toBeTruthy();
  });

  it('the search ember respects the reader’s motion setting', () => {
    const offenders = SOURCE.split('\n').filter(l => /withTiming\(/.test(l) && !/reduceMotion/.test(l));
    expect(offenders).toEqual([]);
  });

  it('leaves no style behind', () => {
    for (const gone of ['submitRow', 'submitBtn', 'submitText', 'submitDisabled',
                        'cancelBtn', 'cancelText', 'emptyListWrap', 'emptyListText']) {
      expect(SOURCE).not.toContain(`\n    ${gone}: {`);
    }
  });
});
