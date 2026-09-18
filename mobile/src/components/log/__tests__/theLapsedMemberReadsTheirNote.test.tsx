/**
 * A member whose rank has ended, opening a log that holds their own note.
 *
 * Found in the post-ship check of Phase 2: the form drew the note inside the
 * LOCKED instrument — faded to 40% and hidden from VoiceOver — because it used
 * the same inert panel as a feature the member cannot use. But reading is never
 * gated, and neither is taking your writing back. Only changing it is.
 */
import React from 'react';
import { Alert, View } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import LogForm from '../LogForm';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (props: any) => React.createElement('Icon', props) });
});
jest.mock('@/src/components/NitrateCalendar', () => () => null);
jest.mock('@/src/components/AutopsyGauge', () => () => null);

const NOTE = 'Watched it the night Dad came home from the hospital.';
const mockRemove = jest.fn();

function Harness({ held, note }: { held: boolean; note: string }) {
  const flow = useLogFlow();
  return (
    <View>
      <LogForm
        flow={{ ...flow, isPremium: held, isAuteur: false, noteReady: true, privateNotes: note, removeVaultNote: mockRemove } as never}
        user={{ username: 'member' } as never}
      />
    </View>
  );
}

const mount = (held: boolean, note = NOTE) => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '603', filmTitle: 'The Matrix', filmYear: '1999' });
  useAuthStore.setState({ user: { id: '44444444-4444-4444-8444-444444444444', username: 'member', tier: held ? 'archivist' : 'free', role: 'cinephile' } as never });
  return render(<Harness held={held} note={note} />);
};

/** True when a node, or any ancestor, is hidden from the screen reader. */
const hiddenFromReader = (node: any): boolean => {
  for (let n = node; n; n = n.parent) {
    const p = n.props ?? {};
    if (p.accessibilityElementsHidden || p.importantForAccessibility === 'no-hide-descendants') return true;
  }
  return false;
};

beforeEach(() => jest.clearAllMocks());

describe('reading your own note is never gated', () => {
  it('the note is drawn as writing, not inside a locked instrument', () => {
    const r = mount(false);
    const text = r.getByText(NOTE);
    expect(hiddenFromReader(text)).toBe(false);
    // …and not as a greyed text box: there is no editable field holding it.
    expect(r.queryByDisplayValue(NOTE)).toBeNull();
  });

  it('it is offered for removal, and removal asks first', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const r = mount(false);
    await fireEvent.press(r.getByLabelText('Remove this note'));
    expect(alert).toHaveBeenCalledWith('Remove this note?', 'The viewing stays. The note is gone for good.', expect.any(Array), expect.anything());
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map(b => b.text)).toEqual(['Keep', 'Remove']);
    expect(mockRemove).not.toHaveBeenCalled();
    mockRemove.mockResolvedValueOnce({ queuedOffline: false });
    await buttons[1].onPress!();
    await new Promise(res => setTimeout(res, 0));
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('a member who holds the rank still gets the editable field, not the read-only one', () => {
    const r = mount(true);
    expect(r.getByDisplayValue(NOTE)).toBeTruthy();
    expect(r.queryByLabelText('Remove this note')).toBeNull();
  });

  it('with no note and no rank, the field is the rope — nothing to read or remove', () => {
    const r = mount(false, '');
    expect(r.queryByLabelText('Remove this note')).toBeNull();
  });
});
