/**
 * theSuggestionsComeBack.test.tsx — the Darkroom's suggestions follow the member.
 *
 * They close when the keyboard goes away. On Android the back key hides the
 * keyboard but leaves the field focused, so a second tap on it never fires
 * onFocus: the keyboard coming back, or a keystroke, has to reopen them.
 */
import React from 'react';
import { Keyboard } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { DarkroomHeader } from '../DarkroomHeader';
import { useDiscoverStore } from '@/src/stores/discover';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/src/lib/tmdb', () => ({
  tmdb: {
    search: jest.fn(async () => ({
      results: [{ id: 238, title: 'The Godfather', media_type: 'movie', release_date: '1972-03-14', poster_path: null }],
    })),
    detail: jest.fn(),
  },
}));

type Handler = () => void;
let keyboard: Record<string, Handler[]>;

beforeEach(() => {
  jest.useFakeTimers();
  keyboard = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: Handler) => {
    (keyboard[event] ??= []).push(fn);
    return { remove: () => { keyboard[event] = keyboard[event].filter((f) => f !== fn); } };
  }) as never);
  useDiscoverStore.setState({ inputVal: '', query: '' } as never);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const emit = (event: string) => act(() => { (keyboard[event] ?? []).forEach((fn) => fn()); });

async function open() {
  const r = render(<DarkroomHeader />);
  const field = () => r.getByTestId('darkroom-search-input');
  return {
    rows: () => r.queryAllByTestId('darkroom-suggestion-row'),
    focus: () => fireEvent(field(), 'focus'),
    blur: () => fireEvent(field(), 'blur'),
    type: async (text: string) => {
      await fireEvent.changeText(field(), text);
      await act(async () => { await jest.advanceTimersByTimeAsync(450); });
    },
  };
}

describe('the Darkroom’s suggestions', () => {
  it('show while the member types in the search', async () => {
    const d = await open();
    await d.focus();
    await d.type('the godfather');
    expect(d.rows()).toHaveLength(1);
  });

  it('close when the keyboard goes, and come back with it (Android: back, then a tap)', async () => {
    const d = await open();
    await d.focus();
    await d.type('the godfather');

    await emit('keyboardDidHide');
    expect(d.rows()).toHaveLength(0);

    await emit('keyboardDidShow'); // the field never lost focus, so no onFocus
    expect(d.rows()).toHaveLength(1);
  });

  it('come back with a keystroke, though the keyboard said it had gone', async () => {
    const d = await open();
    await d.focus();
    await d.type('the godfathe');
    await emit('keyboardDidHide');

    await d.type('the godfather');
    expect(d.rows()).toHaveLength(1);
  });

  it('stay closed when the keyboard is for another field', async () => {
    const d = await open();
    await d.focus();
    await d.type('the godfather');
    await d.blur();

    await emit('keyboardDidShow');
    expect(d.rows()).toHaveLength(0);
  });
});
