/**
 * useReadAgainWhenToldHere.test.tsx — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * A notice opened about the page in front tells that page (pageInFront), and the page reads again
 * what the notice is about. Heard only while the page is the screen in front, judged at the moment
 * it is told: a copy of the page under another screen reads nothing, and a page gone hears nothing.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { noteCurrentPath } from '@/src/utils/openSociety';
import { tellThePageInFront } from '@/src/utils/pageInFront';
import { useReadAgainWhenToldHere } from '../useReadAgainWhenToldHere';

let focused = true;
/** The screen's navigator, as a page meets it: asked whether its screen is in front. */
const SCREEN = { isFocused: () => focused } as unknown as React.ContextType<typeof NavigationContext>;

const PAGE = '/dispatch/44444444-4444-4444-8444-444444444444';

function Listening({ path, told }: { path: string | null; told: (door: string | null) => void }) {
  useReadAgainWhenToldHere(path, (query) => told(query.get('door')));
  return null;
}
const Page = (props: { path: string | null; told: (door: string | null) => void }) => (
  <NavigationContext.Provider value={SCREEN}><Listening {...props} /></NavigationContext.Provider>
);

beforeEach(() => {
  focused = true;
  noteCurrentPath(PAGE);
});

it('the page in front, told of a notice about it, reads again, with the notice’s query', async () => {
  const told = jest.fn();
  const r = render(<Page path={PAGE} told={told} />);
  tellThePageInFront(`${PAGE}?door=1`);
  expect(told.mock.calls).toEqual([['1']]);
  await r.unmount();
});

it('a page under another screen reads nothing: its focus is asked at the moment it is told', async () => {
  const told = jest.fn();
  const r = render(<Page path={PAGE} told={told} />);
  focused = false;
  tellThePageInFront(PAGE);
  expect(told).not.toHaveBeenCalled();
  focused = true;
  tellThePageInFront(PAGE);
  expect(told).toHaveBeenCalledTimes(1);
  await r.unmount();
});

it('a page gone, or one with no address yet, hears nothing', async () => {
  const told = jest.fn();
  const r = render(<Page path={PAGE} told={told} />);
  await r.unmount();
  tellThePageInFront(PAGE);
  const none = render(<Page path={null} told={told} />);
  tellThePageInFront(PAGE);
  expect(told).not.toHaveBeenCalled();
  await none.unmount();
});

it('outside a navigator nothing is in front of the page: it is told', async () => {
  const told = jest.fn();
  const r = render(<Listening path={PAGE} told={told} />);
  tellThePageInFront(PAGE);
  expect(told).toHaveBeenCalledTimes(1);
  await r.unmount();
});

it('the newest words of the page are the ones run, with no second subscription', async () => {
  const first = jest.fn();
  const second = jest.fn();
  const r = render(<Page path={PAGE} told={first} />);
  r.rerender(<Page path={PAGE} told={second} />);
  tellThePageInFront(PAGE);
  expect([first.mock.calls.length, second.mock.calls.length]).toEqual([0, 1]);
  await r.unmount();
});
