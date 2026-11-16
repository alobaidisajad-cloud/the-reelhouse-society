/**
 * aNoteIsEditedOnceItsSheetIsGone.test.tsx — review round 7 (src/components/log/NoteSheet.tsx).
 *
 * EDIT NOTE closed the note sheet and opened the Log sheet in one breath: both Modals, the first
 * still falling while the second was asked to rise. A Modal presented while another is still
 * leaving is the iOS trap, and the Log sheet never rose. Now the note sheet falls first, and asks
 * for the edit only once it is gone, as REPORT waits on an action sheet
 * (aReportRisesOnceItsSheetIsGone.test.tsx).
 */
import React, { act, useState } from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import NoteSheet from '../NoteSheet';
import { SHEET_FALL_MS } from '@/src/hooks/useSheetPresence';
import { ARRIVAL_GRACE_MS } from '@/src/hooks/useArrival';

jest.mock('react-native-gesture-handler', () => {
  const ReactLocal = require('react');
  const RN = require('react-native');
  const pan: Record<string, unknown> = {};
  pan.onChange = () => pan;
  pan.onEnd = () => pan;
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: (p: object) => ReactLocal.createElement(RN.View, p),
  };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const GONE = SHEET_FALL_MS + ARRIVAL_GRACE_MS + 10;

/** As the log's page holds it: the note open until closed, its edit opening the Log sheet. */
function Page({ edits }: { edits: string[] }) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  return (
    <>
      {open ? (
        <NoteSheet
          visible note="about tonight" viewingLabel="◆ CURRENT" canEdit
          onClose={() => setOpen(false)}
          onEdit={() => { edits.push('edit'); setOpen(false); setEditing(true); }}
          onRemove={() => {}}
        />
      ) : null}
      {editing ? <Text>the Log sheet</Text> : null}
    </>
  );
}

describe("the note sheet's EDIT NOTE", () => {
  it('lets the note fall first, and opens the Log sheet only once the note is gone', async () => {
    const edits: string[] = [];
    const r = render(<Page edits={edits} />);
    await fireEvent.press(r.getByLabelText('Edit this note'));
    // Falling: the Log sheet is not yet asked for.
    expect(edits).toEqual([]);
    expect(r.queryByText('the Log sheet')).toBeNull();
    await act(async () => { jest.advanceTimersByTime(GONE); });
    expect(edits).toEqual(['edit']);
    expect(r.getByText('the Log sheet')).toBeTruthy();
    expect(r.queryByLabelText('Edit this note')).toBeNull();
  });

  it('asks for the edit once, after the fall and never in the press', async () => {
    const onEdit = jest.fn();
    const r = render(
      <NoteSheet visible note="about tonight" viewingLabel="◆ CURRENT" canEdit onClose={jest.fn()} onEdit={onEdit} onRemove={jest.fn()} />,
    );
    await fireEvent.press(r.getByLabelText('Edit this note'));
    expect(onEdit).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(GONE); });
    expect(onEdit).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(GONE * 4); });
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
