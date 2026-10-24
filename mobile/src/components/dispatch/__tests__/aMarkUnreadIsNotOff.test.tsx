/**
 * aMarkUnreadIsNotOff.test.tsx — a member's mark not yet read is drawn unknown, never "off" (P0.112).
 *
 * The Dispatch no longer waits for the member's marks before its page. Drawn as CERTIFY and SAVE
 * while unread, a member who had certified was invited to certify again, and the house counted it.
 * Both places a member makes a mark — the card's stamp bar and the reader's dock — draw an unread
 * mark as the stamp's outline before its ink: unpressed, said to be reading, never selected.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PaperActions } from '@/src/components/dispatch/paper/PaperPost';
import { PaperCritiqueRow, PostDock } from '@/src/components/dispatch/paper/PaperCritiques';

describe('the card\'s stamps', () => {
  it('unread: neither pressable nor marked, each said to be reading; read: the member\'s, and pressable', async () => {
    const onCertify = jest.fn();
    const onSave = jest.fn();
    const unread = render(<PaperActions certified saved certifyKnown={false} saveKnown={false} onCertify={onCertify} onSave={onSave} />);
    const certify = unread.getByLabelText('Certify this. Reading your mark');
    const save = unread.getByLabelText('Save this. Reading your mark');
    expect(certify.props.accessibilityState).toMatchObject({ disabled: true, busy: true, selected: false });
    expect(save.props.accessibilityState).toMatchObject({ disabled: true, busy: true, selected: false });
    expect(unread.queryByText('CERTIFIED')).toBeNull();
    expect(unread.queryByText('SAVED')).toBeNull();
    await fireEvent.press(certify);
    await fireEvent.press(save);
    expect([onCertify.mock.calls.length, onSave.mock.calls.length]).toEqual([0, 0]);

    const read = render(<PaperActions certified saved onCertify={onCertify} onSave={onSave} />);
    expect(read.getByText('CERTIFIED')).toBeTruthy();
    expect(read.getByText('SAVED')).toBeTruthy();
    await fireEvent.press(read.getByLabelText('Saved'));
    expect(onSave.mock.calls).toEqual([[false]]);
  });

  it('signed out, it says members only as it always did, not that it reads', () => {
    const r = render(<PaperActions certifyKnown={false} saveKnown={false} />);
    expect(r.getByLabelText('Certify this. Members only')).toBeTruthy();
    expect(r.queryByLabelText(/Reading your mark/)).toBeNull();
  });
});

describe('the reader\'s dock', () => {
  it('unread: neither pressable nor marked, each said to be reading; read: the member\'s', async () => {
    const onCertify = jest.fn();
    const onSave = jest.fn();
    const unread = render(<PostDock certifyCount={3} commentCount={0} certified saved certifyKnown={false} saveKnown={false} onCertify={onCertify} onSave={onSave} />);
    const certify = unread.getByLabelText('Certify this filing. Reading your mark');
    expect(certify.props.accessibilityState).toMatchObject({ disabled: true, busy: true, selected: false });
    expect(unread.getByLabelText('Save. Reading your mark').props.accessibilityState).toMatchObject({ disabled: true, selected: false });
    await fireEvent.press(certify);
    expect(onCertify).not.toHaveBeenCalled();

    const read = render(<PostDock certifyCount={3} commentCount={0} certified saved onCertify={onCertify} onSave={onSave} />);
    expect(read.getByText('CERTIFIED')).toBeTruthy();
    expect(read.getByLabelText('Saved').props.accessibilityState).toMatchObject({ selected: true });
  });
});

describe('a critique\'s heart', () => {
  const c = { id: 'c1', author: null, body: 'A second look.', certifyCount: 3, certified: true, age: '2H' };

  it('unread: neither pressable nor certified, said to be reading; read: the member\'s, and pressable', async () => {
    const onCertify = jest.fn();
    const unread = render(<PaperCritiqueRow c={{ ...c, certifyKnown: false }} onCertify={onCertify} />);
    const heart = unread.getByLabelText('Certify this critique. Reading your mark');
    expect(heart.props.accessibilityState).toMatchObject({ disabled: true, busy: true, selected: false });
    await fireEvent.press(heart);
    expect(onCertify).not.toHaveBeenCalled();

    const read = render(<PaperCritiqueRow c={{ ...c, certifyKnown: true }} onCertify={onCertify} />);
    await fireEvent.press(read.getByLabelText(/^Certified\./));
    expect(onCertify.mock.calls).toEqual([[false]]);
  });
});
