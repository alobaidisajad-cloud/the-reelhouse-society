/**
 * theDoorAdmits.test.tsx — the host's panel of requests, mounted.
 *
 * Its sheet arrived by a mount-time `entering`, the class that can stall and
 * leave a host a blurred screen with nobody to admit. It Arrives now; this
 * holds what the host must be able to do on it.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import { AtTheDoorPanel } from '../AtTheDoorPanel';
import { useLoungeStore } from '@/src/stores/lounge';

const approveMember = jest.fn(async () => true);
const declineMember = jest.fn(async () => true);

const ana = { user_id: 'u1', username: 'ana', avatar_url: null } as never;
const bea = { user_id: 'u2', username: 'bea', avatar_url: null } as never;

beforeEach(() => {
  approveMember.mockClear();
  declineMember.mockClear();
  useLoungeStore.setState({ approveMember, declineMember } as never);
});

const panel = (pending: never[], onResolved = jest.fn()) => render(
  <AtTheDoorPanel visible loungeId="l1" pending={pending} onClose={() => {}} onResolved={onResolved} />,
);

describe('at the door', () => {
  it('draws each request, and admits the one pressed', async () => {
    const onResolved = jest.fn();
    const r = panel([ana, bea], onResolved);
    expect(r.getByText('@ANA')).toBeTruthy();
    expect(r.getByText('@BEA')).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByLabelText('Admit bea')); });
    expect(approveMember).toHaveBeenCalledWith('l1', 'u2');
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('declines, and reports nothing resolved when the house refused', async () => {
    declineMember.mockResolvedValueOnce(false);
    const onResolved = jest.fn();
    const r = panel([ana], onResolved);
    await act(async () => { fireEvent.press(r.getByLabelText('Decline ana')); });
    expect(declineMember).toHaveBeenCalledWith('l1', 'u1');
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('says so when nobody is at the door', () => {
    expect(panel([]).getByText("No one's at the door.")).toBeTruthy();
  });
});
