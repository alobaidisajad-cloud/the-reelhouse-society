/**
 * aStandingIsSharedAsWhoseItIs.test.tsx — the Projector's share.
 *
 * The Projector is drawn on every member's file, and its button said SHARE
 * YOUR STANDING and shared "My ReelHouse Archive" — so a visitor sharing
 * another member's standing claimed it as their own. A failed share showed the
 * raw error message.
 */
import React, { act } from 'react';
import { Share } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ProjectorRoom, standingShare } from '../ProjectorRoom';
import reelToast from '@/src/utils/reelToast';

jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

const stats = { count: 247, level: 'Devotee', color: '#b8891a', progress: 40 };

describe('what a share says', () => {
  it('your own standing is yours', () => {
    expect(standingShare(247, 'Devotee', true, 'tomas')).toMatch(/^My ReelHouse archive:/);
  });
  it("another member's is theirs, by name", () => {
    expect(standingShare(247, 'Devotee', false, 'vesper')).toMatch(/^@vesper's ReelHouse archive:/);
  });
  it('one film is a film', () => {
    expect(standingShare(1, 'Initiate', true)).toMatch(/\n1 film on file\n/);
  });
});

describe('the button', () => {
  it('names whose standing it shares, and shares it as theirs', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    const r = render(<ProjectorRoom stats={stats} user={{ username: 'vesper' }} isSelf={false} />);
    await act(async () => { fireEvent.press(r.getByLabelText('Share this standing')); });
    expect(share.mock.calls[0][0].message).toMatch(/^@vesper's/);
    expect(r.queryByText('SHARE YOUR STANDING')).toBeNull();
  });

  it('a share that fails is said plainly', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('E_SHARE_SHEET 0x8badf00d'));
    const r = render(<ProjectorRoom stats={stats} user={{ username: 'tomas' }} isSelf />);
    await act(async () => { fireEvent.press(r.getByLabelText('Share your standing')); });
    expect(reelToast.error).toHaveBeenCalledWith('The standing could not be shared.');
  });
});
