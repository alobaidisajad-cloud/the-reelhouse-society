/**
 * A hearing sheet holds while it acts — review round 14.
 *
 * The sheet itself, apart from the docket and the sanctions list that open it: with no hearing
 * nothing is drawn; while the act is under way it is not closed, by the back button or a screen
 * reader's escape; and a press that lands after the act stopped being ready (the finger was
 * down when the act began) is not heard a second time.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { HearingSheet, type Hearing } from '../HearingSheet';

const HEARING: Hearing = {
  title: 'LIFT THE BAN', ink: '#c4961a', fill: '#8b1a1a',
  description: 'The member may write again at once. The member is told, with your word.',
  wordLabel: 'YOUR WORD TO THE MEMBER', placeholder: 'Why the ban is lifted…',
  act: 'LIFT', actSaid: 'Lift the ban',
};

/** The sheet as a docket holds it: the word kept by its holder, as each docket keeps it. */
function Held(props: Partial<React.ComponentProps<typeof HearingSheet>>) {
  const [word, setWord] = React.useState('');
  return <HearingSheet hearing={HEARING} word={word} onWord={setWord} busy={false} onClose={jest.fn()} onSubmit={jest.fn()} {...props} />;
}
const sheet = (props: Partial<React.ComponentProps<typeof HearingSheet>> = {}) => <Held {...props} />;

/** A touch as the responder system hands it to the press that holds it. */
const touch = () => ({
  nativeEvent: { changedTouches: [], identifier: 0, locationX: 0, locationY: 0, pageX: 0, pageY: 0, target: 0, timestamp: 0, touches: [] },
  currentTarget: { measure: () => {} },
  target: {},
  persist: () => {},
});

it('draws nothing with no hearing', async () => {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(sheet({ hearing: null })); });
  expect(r.toJSON()).toBeNull();
  expect(r.queryByRole('header')).toBeNull();
});

it('is not closed while the act is under way, by the back button or a screen reader\'s escape', async () => {
  const onClose = jest.fn();
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(sheet({ busy: true, onClose })); });
  await fireEvent(r.getByRole('header', { name: 'LIFT THE BAN' }), 'requestClose');
  await fireEvent(r.getByRole('header', { name: 'LIFT THE BAN' }), 'accessibilityEscape');
  expect(onClose).not.toHaveBeenCalled();
  expect(r.getByRole('header', { name: 'LIFT THE BAN' })).toBeTruthy();
  // The act done, the same escape closes it.
  await act(async () => { r.rerender(sheet({ busy: false, onClose })); });
  await fireEvent(r.getByRole('header', { name: 'LIFT THE BAN' }), 'accessibilityEscape');
  expect(onClose).toHaveBeenCalledTimes(1);
});

/** A sheet with the word written, and a press on its act held down. */
async function pressedWithAWord(onSubmit: jest.Mock) {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(sheet({ onSubmit })); });
  await fireEvent.changeText(r.getByLabelText('your word to the member'), '  A second chance.  ');
  const button = () => r.getByRole('button', { name: 'Lift the ban' });
  await act(async () => { button().props.onResponderGrant(touch()); });
  return { r, button };
}

it('a press let go while ready is heard, with the word cleaned', async () => {
  const onSubmit = jest.fn();
  const { button } = await pressedWithAWord(onSubmit);
  await act(async () => { button().props.onResponderRelease(touch()); });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith('A second chance.');
});

it('a press let go after the act began is not heard again', async () => {
  const onSubmit = jest.fn();
  const { r, button } = await pressedWithAWord(onSubmit);
  // The act begins (busy) before the finger lifts. The press already held is let go, as the
  // phone's responder lets it go, whatever the button now says.
  await act(async () => { r.rerender(sheet({ onSubmit, busy: true })); });
  await act(async () => { button().props.onResponderRelease(touch()); });
  expect(onSubmit).not.toHaveBeenCalled();
});
