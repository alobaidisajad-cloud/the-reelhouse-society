/**
 * aRoomSaysWhetherItIsEmptyOrFailed.test.tsx — every shared drawing of a room with nothing to show
 * writes, to the E2E build's device log, which it is, with its words: state.empty (EmptyState,
 * RoomEmpty, EmptyMyLounges, PaperEmpty said empty) or state.failed (EmptyOffline,
 * SearchUnreachable, PaperEmpty said failed). A failure is never written as empty too. The fault
 * runs' judges read them (WORKLIST P0.76).
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { EmptyOffline, EmptyState } from '../EmptyStates';
import { PaperEmpty } from '../dispatch/paper/PaperFrame';
import { RoomEmpty } from '../profile/RoomParts';
import { EmptyMyLounges } from '../lounge/EmptyMyLounges';
import SearchUnreachable from '../search/SearchUnreachable';

const mockTrace = jest.fn();
jest.mock('@/src/utils/e2eTrace', () => ({ e2eTrace: (...a: unknown[]) => mockTrace(...a) }));
jest.mock('@/src/lore/fragments', () => ({ pickRandom: (lines: string[]) => lines[0] }));

/** Every state the drawing wrote, in order. */
const said = () => mockTrace.mock.calls.filter(([event]) => String(event).startsWith('state.'));

beforeEach(() => mockTrace.mockClear());

it('each shared room with nothing to show writes which it is, once, and nothing else', () => {
  const drawn: [string, () => React.ReactElement, unknown][] = [
    ['EmptyState', () => <EmptyState title="The board is clear." />, ['state.empty', { what: 'The board is clear.' }]],
    ['RoomEmpty', () => <RoomEmpty title="The Archive is Empty" />, ['state.empty', { what: 'The Archive is Empty' }]],
    ['EmptyMyLounges', () => <EmptyMyLounges onEstablishPress={() => {}} held />, ['state.empty', { what: 'The Velvet Seats Await' }]],
    ['PaperEmpty said empty', () => <PaperEmpty said="empty" title="Nothing filed yet." body="b" />, ['state.empty', { what: 'Nothing filed yet.' }]],
    ['EmptyOffline', () => <EmptyOffline />, ['state.failed', { what: 'Transmission Interrupted' }]],
    ['SearchUnreachable', () => <SearchUnreachable />, ['state.failed', { what: 'THE TELEGRAPH IS DOWN' }]],
    ['PaperEmpty said failed', () => <PaperEmpty said="failed" title="The paper could not be reached." body="b" />,
      ['state.failed', { what: 'The paper could not be reached.' }]],
  ];
  for (const [name, draw, expected] of drawn) {
    mockTrace.mockClear();
    const { unmount } = render(draw());
    expect([name, said()]).toEqual([name, [expected]]);
    unmount();
  }
});

it('writes its state again when what it says changes, and not when it draws again unchanged', () => {
  const { rerender } = render(<RoomEmpty title="Nothing under that name" />);
  rerender(<RoomEmpty title="Nothing under that name" />);
  rerender(<RoomEmpty title="Nothing from that era" />);
  expect(said()).toEqual([
    ['state.empty', { what: 'Nothing under that name' }],
    ['state.empty', { what: 'Nothing from that era' }],
  ]);
});
