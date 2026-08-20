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
import * as RN from 'react-native';
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

  it('says so on the page while the index is too large to rewrite', async () => {
    mockParams = { editId: STACK_ID };
    mockCachedStack = { list: { ...STACK, films: FILMS, filmCount: 620 } };
    const r = mount();
    await waitFor(() => expect(r.getByText(/LARGER THAN THIS SHEET CAN HOLD/)).toBeTruthy());
    expect(r.getByText(/620 REELS\./)).toBeTruthy();          // the notice's own count
    expect(r.getByText(/KEPT EXACTLY AS THEY STAND/)).toBeTruthy();
  });

  it('and the bar reports the stack’s true size, not the part it is holding', async () => {
    // The notice said 620 REELS and the bar directly below it said 2 REELS —
    // one screen, one stack, two numbers.
    mockParams = { editId: STACK_ID };
    mockCachedStack = { list: { ...STACK, films: FILMS, filmCount: 620 } };
    const r = mount();
    await waitFor(() => expect(r.getByText('620 REELS  ·  UNRANKED  ·  PUBLIC')).toBeTruthy());
    expect(r.queryByText(/^2 REELS/)).toBeNull();
  });

  it('and takes the holdings controls away, rather than discarding what they do', async () => {
    // Omitting the holdings keeps them safe, but it left the ✕, the grip and the
    // search all live over a set that would then be thrown away: every removal
    // appeared to take, and came back on the next open.
    mockParams = { editId: STACK_ID };
    mockCachedStack = { list: { ...STACK, films: FILMS, filmCount: 620 } };
    const r = mount();
    await waitFor(() => expect(r.getByText('Blade Runner')).toBeTruthy());
    expect(r.queryByLabelText('Remove Blade Runner')).toBeNull();
    expect(r.queryByLabelText('Search films to add to stack')).toBeNull();
    expect(r.queryByLabelText('Reorder Blade Runner')).toBeNull();
    expect(r.queryByText(/DRAG TO ORDER/)).toBeNull();
  });

  it('sends them when it does hold all of them', async () => {
    mockParams = { editId: STACK_ID };
    mockCachedStack = { list: { ...STACK, films: FILMS, filmCount: 2 } };
    const r = mount();
    await waitFor(() => expect(r.getByLabelText('Stack title').props.value).toBe('Neon Noir Masterpieces'));
    expect(r.queryByText(/LARGER THAN THIS SHEET CAN HOLD/)).toBeNull();
    expect(r.getByLabelText('Remove Blade Runner')).toBeTruthy();   // and still editable
    await act(async () => { fireEvent.press(r.getByLabelText('SAVE THE AMENDMENTS')); });
    await waitFor(() => expect(mockUpdateList).toHaveBeenCalled());
    expect(mockUpdateList.mock.calls[0][1].films).toHaveLength(2);
  });

  it('says so, rather than creating a duplicate, when the stack cannot be opened', async () => {
    mockParams = { editId: STACK_ID };                    // resolves to nothing
    const r = mount();
    await act(async () => { fireEvent.changeText(r.getByLabelText('Stack title'), 'Anything'); });
    await waitFor(() => expect(r.getByText('THIS STACK COULD NOT BE OPENED')).toBeTruthy());
    await act(async () => { fireEvent.press(r.getByLabelText(/SAVE THE AMENDMENTS/)); });
    await act(async () => {});
    expect(mockCreateList).not.toHaveBeenCalled();
    expect(mockUpdateList).not.toHaveBeenCalled();
  });

  it('and still calls itself an amendment while the stack has not arrived', async () => {
    // The mode is what the member asked for, not what happened to load. Read off
    // `editList`, the sheet called itself "Curate a Stack" with a FILE THE STACK
    // button for the whole window before the store resolved — the very
    // contradiction this page was opened to remove, just later.
    mockParams = { editId: STACK_ID };
    const r = mount();
    await waitFor(() => expect(r.getByText('Amend a Stack')).toBeTruthy());
    expect(r.getByText('SAVE THE AMENDMENTS')).toBeTruthy();
    expect(r.queryByText('Curate a Stack')).toBeNull();
    expect(r.queryByText('FILE THE STACK')).toBeNull();
  });
});

describe('the header tells the truth', () => {
  it('says it is amending, and does not repeat the title the plate holds', async () => {
    // It said NEW STACK beside a button reading SAVE CHANGES. Naming the stack
    // here instead put the same words twice within sixty points, since the
    // plate below carries that title in a larger face.
    mockParams = { editId: STACK_ID };
    mockLists = [STACK];
    const r = mount();
    await waitFor(() => expect(r.getByText('Amend a Stack')).toBeTruthy());
    expect(r.queryByText('NEW STACK')).toBeNull();
    // exactly once on the page: in the plate, where it can be edited
    expect(r.queryAllByText('Neon Noir Masterpieces')).toHaveLength(0);
    expect(r.getByLabelText('Stack title').props.value).toBe('Neon Noir Masterpieces');
  });

  it('names the act it is actually offering when creating', async () => {
    const r = mount();
    await waitFor(() => expect(r.getByText('Curate a Stack')).toBeTruthy());
    expect(r.queryByText('Amend a Stack')).toBeNull();
  });

  it('never shrinks the title to fit, because the two platforms disagree', () => {
    const at = SOURCE.indexOf('style={s.headerTitleWrap}');
    expect(SOURCE.slice(at, SOURCE.indexOf('</View>', at))).not.toMatch(/adjustsFontSizeToFit/);
  });
});

describe('the docked act reserves exactly the room it takes', () => {
  // The same guard the composer's seal carries, for the same reason: two places
  // reserve this room from ONE hand-typed number, and neither is derived from
  // the bar's styles. It was reserving 80 against a real ~145, so the whole
  // RANKED / UNRANKED row sat behind the bar.
  const CAP = 1.35;   // scaledTextProps, the largest the line can be asked to grow

  it('CURATE_BAR_HEIGHT covers the bar it stands in for', () => {
    const declared = Number(SOURCE.match(/CURATE_BAR_HEIGHT = (\d+)/)![1]);
    const bar = styleBody('bar');
    const line = styleBody('barLine');
    const press = styleBody('barPress');
    const num = (body: string, prop: string) => Number(body.match(new RegExp(`${prop}: (\\d+)`))![1]);

    const real =
      num(bar, 'paddingTop') +
      Math.ceil(num(line, 'fontSize') * CAP * 1.3) +
      num(line, 'marginBottom') +
      num(press, 'minHeight') +
      14;                                  // the bar's own paddingBottom, added in the component

    expect(real).toBeGreaterThan(0);       // a failed parse must not pass vacuously
    expect(declared).toBeGreaterThanOrEqual(real);
  });

  it('and the scroll ends above it, using that same number', () => {
    expect(SOURCE).toMatch(/paddingBottom: insets\.bottom \+ CURATE_BAR_HEIGHT \+ 16/);
    expect(SOURCE).toMatch(/paddingBottom: insets\.bottom \+ 14/);   // the bar's own
  });

  it('the line is capped, which is what makes that number hold', () => {
    // Uncapped, an accessibility setting takes 7.5pt past 22 and the bar grows
    // straight through the constant that is standing in for it.
    const at = SOURCE.indexOf('style={s.barLine}');
    expect(SOURCE.slice(at, at + 160)).toMatch(/scaledTextProps/);
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

  it('offers one way out, not two', async () => {
    // CANCEL sat under the brass, 48pt of a bar that was already standing on
    // the form — and gave the page two names for the same act, when a sheet's
    // dismissal already lives top-right and it still pulls down.
    const r = mount();
    await waitFor(() => expect(r.getByLabelText('Close list modal')).toBeTruthy());
    expect(r.queryByText('CANCEL')).toBeNull();
  });
});

describe('a change to the holdings is spoken, not only shown', () => {
  // A film joins at the BOTTOM of an index hundreds of rows long, so the only
  // sighted confirmation is the count on the bar. accessibilityLiveRegion is
  // Android-only, so on iOS someone who cannot see that has nothing at all.
  it('announces a removal and the new count', async () => {
    const announce = RN.AccessibilityInfo.announceForAccessibility as jest.Mock;
    mockParams = { editId: STACK_ID };
    mockLists = [STACK];
    const r = mount();
    await waitFor(() => expect(r.getByText('Blade Runner')).toBeTruthy());
    await act(async () => { fireEvent.press(r.getByLabelText('Remove Blade Runner')); });
    expect(announce).toHaveBeenCalledWith('Blade Runner removed. 1 in the stack.');
  });

  it('says it once, not twice — the updater stays pure', async () => {
    // React may run a state updater more than once. Announcing from inside one
    // reads as a stutter to anyone listening, and it was written that way first.
    const announce = RN.AccessibilityInfo.announceForAccessibility as jest.Mock;
    mockParams = { editId: STACK_ID };
    mockLists = [STACK];
    const r = mount();
    await waitFor(() => expect(r.getByText('Blade Runner')).toBeTruthy());
    await act(async () => { fireEvent.press(r.getByLabelText('Remove Blade Runner')); });
    expect(announce.mock.calls.filter(c => String(c[0]).includes('Blade Runner removed'))).toHaveLength(1);
    expect(SOURCE).not.toMatch(/setFilms\(prev => \{[\s\S]{0,400}announceForAccessibility/);
  });
});

describe('what the page says, and stops saying', () => {
  it('no longer repeats the search field beneath itself', () => {
    expect(SOURCE).not.toContain('Search for films above to add them to your stack.');
    expect(SOURCE).toMatch(/ListEmptyComponent=\{null\}/);
  });

  it('says the order is kept, and only once there is an order to speak of', async () => {
    const blank = mount();
    await waitFor(() => expect(blank.getByText('HOLDINGS')).toBeTruthy());
    expect(blank.queryByText(/DRAG TO ORDER/)).toBeNull();

    mockParams = { editId: STACK_ID };
    mockLists = [{ ...STACK, films: [FILMS[0]] }];          // one reel has no order
    const single = mount();
    await waitFor(() => expect(single.getByText('Blade Runner')).toBeTruthy());
    expect(single.queryByText(/DRAG TO ORDER/)).toBeNull();

    mockLists = [STACK];
    const filled = mount();
    await waitFor(() => expect(filled.getByText(/DRAG TO ORDER/)).toBeTruthy());
    expect(filled.getByText(/THE ORDER IS KEPT EITHER WAY/)).toBeTruthy();
  });

  it('puts both notices ABOVE the index they are about', async () => {
    // They were beneath it, so on a stack of any size you met the caption after
    // scrolling past the thing it described — and the warning that your removals
    // would not be kept arrived only once you had made them.
    mockParams = { editId: STACK_ID };
    mockLists = [STACK];
    const r = mount();
    await waitFor(() => expect(r.getByText(/DRAG TO ORDER/)).toBeTruthy());
    const order = (needle: string) => JSON.stringify(r.toJSON()).indexOf(needle);
    expect(order('DRAG TO ORDER')).toBeLessThan(order('Blade Runner'));
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

  it('the display type is capped, so an accessibility setting cannot fill the sheet', () => {
    // 26pt is already display size. Uncapped, the largest system setting takes
    // it past 70 and four words own the whole page.
    const plate = SOURCE.slice(SOURCE.indexOf('style={s.plate}'), SOURCE.indexOf('{/* Film Search'));
    expect(plate).toMatch(/displayTextProps/);
    const hdr = SOURCE.indexOf('style={s.headerTitle}');
    expect(SOURCE.slice(hdr, hdr + 120)).toMatch(/displayTextProps/);
  });

  it('the note may run to the length the database already allows', () => {
    expect(SOURCE).toMatch(/maxLength=\{1000\}/);
    expect(SOURCE).not.toMatch(/maxLength=\{500\}/);
  });

  it('every control reaches 48 by its own geometry', () => {
    for (const [name, prop] of [
      ['closeBtn', 'minHeight'], ['toggleBtn', 'minHeight'], ['removeBtn', 'height'],
      ['removeBtn', 'width'], ['barPress', 'minHeight'],
    ] as const) {
      const found = styleBody(name).match(new RegExp(`${prop}: (\\d+)`));
      expect(found).not.toBeNull();
      expect(Number(found![1])).toBeGreaterThanOrEqual(48);
    }
  });

  it('EVERY pressable on the page declines the default halo', () => {
    // The first version of this test looked for `HITSLOP_` constants and inline
    // `hitSlop={{`, and passed — while two controls carried a 15pt halo by
    // simply NOT passing the prop, which is PressableScale's default. Listing
    // the ones I remembered is not the same as enumerating the class.
    //
    // It matters because both of those are STACKED lists. A halo is invisible to
    // either platform's accessibility layer, so past the floor it buys nothing
    // but a claim on a neighbour — and in an overlap the later sibling wins, so
    // the bottom of every film row was firing the row below it.
    const opens = [...SOURCE.matchAll(/<PressableScale\b/g)].map(m => m.index!);
    expect(opens.length).toBeGreaterThanOrEqual(8);      // never vacuous

    const naked = opens.filter(at => {
      // The props of this tag only: stop at the first '>' that is not inside
      // braces, so an arrow function in a handler cannot truncate the scan.
      let depth = 0;
      let end = at;
      for (let i = at; i < SOURCE.length; i++) {
        if (SOURCE[i] === '{') depth++;
        else if (SOURCE[i] === '}') depth--;
        else if (SOURCE[i] === '>' && depth === 0) { end = i; break; }
      }
      return !/hitSlop=\{null\}/.test(SOURCE.slice(at, end));
    });
    expect(naked).toHaveLength(0);
    expect(SOURCE).not.toMatch(/HITSLOP_/);
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
    // Enumerated, not listed: every key in the sheet must be reachable from the
    // code above it. Naming the ones I happened to remember is how two halos
    // survived a test that claimed to have swept them.
    const sheetAt = SOURCE.indexOf('const s = StyleSheet.create(');
    const body = SOURCE.slice(0, sheetAt);
    const names = [...SOURCE.slice(sheetAt).matchAll(/\n {4}([a-zA-Z][a-zA-Z0-9]*): \{/g)].map(m => m[1]);
    expect(names.length).toBeGreaterThan(30);            // never vacuous
    expect(names.filter(n => !new RegExp(`s\\.${n}\\b`).test(body))).toEqual([]);
  });
});
