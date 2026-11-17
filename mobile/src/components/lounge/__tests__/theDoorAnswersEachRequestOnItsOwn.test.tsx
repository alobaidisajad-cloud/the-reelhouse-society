/**
 * theDoorAnswersEachRequestOnItsOwn.test.tsx — review round 8, the host's panel of requests.
 * ─────────────────────────────────────────────────────────────────────────────
 * The panel held one request's answer as on its way. ADMIT on one member, then DECLINE on another
 * before the first answered, freed the first row's buttons while its answer was out: pressed
 * again, it sent a second, contrary answer. And the first answer landing freed the second row's.
 * Now each request answered is held until its own answer lands; one refused is free again (its
 * own row only); one the house took stays held until it leaves the door.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import { AtTheDoorPanel } from '../AtTheDoorPanel';
import { useLoungeStore } from '@/src/stores/lounge';

/** Each answer, held until the test lets it go. */
type Held = { member: string; land: (ok: boolean) => Promise<void> };
const answers: Held[] = [];
const hold = (_lounge: string, member: string) => new Promise<boolean>((resolve) => {
  answers.push({ member, land: async (ok) => { await act(async () => { resolve(ok); await Promise.resolve(); await Promise.resolve(); }); } });
});
const approveMember = jest.fn(hold);
const declineMember = jest.fn(hold);

const ana = { user_id: 'u1', username: 'ana', avatar_url: null } as never;
const bea = { user_id: 'u2', username: 'bea', avatar_url: null } as never;

/** The forward clock: each press is past the last one's debounce. */
let clock = 10_000;
let now: jest.SpyInstance;
beforeEach(() => {
  answers.length = 0;
  approveMember.mockClear();
  declineMember.mockClear();
  useLoungeStore.setState({ approveMember, declineMember } as never);
  now = jest.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => { now.mockRestore(); });

const panel = (pending: never[], onResolved = jest.fn()) => render(
  <AtTheDoorPanel visible loungeId="l1" pending={pending} onClose={() => {}} onResolved={onResolved} />,
);
/** Whether the control is held (said disabled). */
const held = (r: ReturnType<typeof panel>, label: string) => r.getByLabelText(label).props.accessibilityState?.disabled === true;
const rowHeld = (r: ReturnType<typeof panel>, name: string) => [held(r, `Admit ${name}`), held(r, `Decline ${name}`)];
const press = async (r: ReturnType<typeof panel>, label: string) => {
  clock += 1_000;
  await fireEvent.press(r.getByLabelText(label));
};
const answerFor = (member: string) => {
  const a = answers.find((x) => x.member === member);
  expect(a).toBeDefined();
  return a!;
};

it('ADMIT on one member, then DECLINE on another before either answers: both rows stay held', async () => {
  const r = panel([ana, bea]);
  await press(r, 'Admit ana');
  expect(rowHeld(r, 'ana')).toEqual([true, true]);
  await press(r, 'Decline bea');
  // The second press does not free the first row while its answer is out.
  expect(rowHeld(r, 'ana')).toEqual([true, true]);
  expect(rowHeld(r, 'bea')).toEqual([true, true]);
  expect(approveMember).toHaveBeenCalledTimes(1);
  expect(declineMember).toHaveBeenCalledTimes(1);
});

it('the first answer landing does not free the other row, whose answer is still out', async () => {
  const onResolved = jest.fn();
  const r = panel([ana, bea], onResolved);
  await press(r, 'Admit ana');
  await press(r, 'Decline bea');
  await answerFor('u1').land(true);
  expect(onResolved).toHaveBeenCalledTimes(1);
  expect(rowHeld(r, 'bea')).toEqual([true, true]);
});

it('an answer the house refused frees its own row only, to be pressed again', async () => {
  const onResolved = jest.fn();
  const r = panel([ana, bea], onResolved);
  await press(r, 'Admit ana');
  await press(r, 'Decline bea');
  await answerFor('u2').land(false);
  expect(onResolved).not.toHaveBeenCalled();
  expect(rowHeld(r, 'bea')).toEqual([false, false]);
  expect(rowHeld(r, 'ana')).toEqual([true, true]);
  await press(r, 'Decline bea');
  expect(declineMember).toHaveBeenCalledTimes(2);
});

it('a request the house answered stays held until it leaves the door; a later request of theirs is free', async () => {
  const onResolved = jest.fn();
  const r = panel([ana, bea], onResolved);
  await press(r, 'Admit ana');
  await answerFor('u1').land(true);
  // Answered, and the door not yet read again: never pressed twice.
  expect(rowHeld(r, 'ana')).toEqual([true, true]);
  expect(rowHeld(r, 'bea')).toEqual([false, false]);
  // The door read again: ana is gone from it.
  await act(async () => { r.rerender(<AtTheDoorPanel visible loungeId="l1" pending={[bea]} onClose={() => {}} onResolved={onResolved} />); });
  expect(r.queryByLabelText('Admit ana')).toBeNull();
  // She asks again later: her new request is hers to answer.
  await act(async () => { r.rerender(<AtTheDoorPanel visible loungeId="l1" pending={[ana, bea]} onClose={() => {}} onResolved={onResolved} />); });
  expect(rowHeld(r, 'ana')).toEqual([false, false]);
});
