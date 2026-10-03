/**
 * everyCritiqueCanBeReached.test.tsx — a log's thread can be read to its first
 * critique.
 *
 * The page held the newest 100 critiques and printed the true total beside
 * them; SHOW MORE revealed only what the page held. A thread of 140 said 140
 * and let 100 be read. Once what it holds runs out, SHOW MORE now asks the
 * house for the next older page.
 */
import React, { createRef } from 'react';
import type { TextInput } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import LogComments from '../LogComments';

const critique = (i: number) => ({
  id: `c${i}`, user_id: 'u9', username: 'ana', avatar_url: null,
  body: `critique ${i}`, created_at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
});

const mount = (held: number, total: number, onLoadOlder?: () => void, loadingOlder = false) => render(
  <LogComments
    comments={Array.from({ length: held }, (_, i) => critique(i))}
    commentTotal={total}
    newComment=""
    posting={false}
    critiqueInputRef={createRef<TextInput>() as React.RefObject<TextInput>}
    onNewCommentChange={jest.fn()}
    onPostComment={jest.fn()}
    onWithdrawComment={jest.fn()}
    onPressUser={jest.fn()}
    onLoadOlder={onLoadOlder}
    loadingOlder={loadingOlder}
  />,
);

// A press is debounced against the clock; each test makes one press at most.
it('counts what the house holds beyond the page, not only what the page hides', () => {
  const r = mount(5, 140, jest.fn());
  expect(r.getByText('SHOW MORE CRITIQUES · 135 MORE')).toBeTruthy();
});

it('once what it holds runs out, the press asks for the next older page', async () => {
  const older = jest.fn();
  const r = mount(5, 140, older);
  await act(async () => { await fireEvent.press(r.getByLabelText('Show 135 more critiques')); });
  expect(older).toHaveBeenCalledTimes(1);
});

it('while the page is on its way it says so, and takes no second press', async () => {
  const older = jest.fn();
  const r = mount(5, 140, older, true);
  expect(r.getByText('READING EARLIER CRITIQUES…')).toBeTruthy();
  // The second press, pressed: it must not ask the house for the page again.
  await act(async () => { await fireEvent.press(r.getByLabelText('Reading earlier critiques')); });
  expect(older).not.toHaveBeenCalled();
});

it('without a way to fetch, nothing is offered that could not be reached', () => {
  const r = mount(5, 140);
  expect(r.queryByText(/SHOW MORE/)).toBeNull();
  // The five it holds are all drawn.
  expect(r.getAllByText(/^critique \d$/)).toHaveLength(5);
});
