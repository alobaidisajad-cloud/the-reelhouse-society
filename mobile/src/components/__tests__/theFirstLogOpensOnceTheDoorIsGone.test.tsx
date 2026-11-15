/**
 * theFirstLogOpensOnceTheDoorIsGone.test.tsx — LOG YOUR FIRST FILM opens the log once the
 * Initiation's Modal is gone.
 *
 * The log was pushed 250ms after the tap, while the Initiation's Modal still faded and dismissed.
 * On iOS a presentation asked while another is still dismissing is refused: a new member's first
 * act opened nothing. The Modal now says when it is gone (onDismiss on iOS, a backstop once it
 * has left the tree; Android at once), and only then is the log opened.
 */
import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import InitiationModal, { GONE_TAIL_MS } from '../InitiationModal';
import { ARRIVAL_GRACE_MS } from '@/src/hooks/useArrival';

const FADE = 180;

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.useRealTimers(); Platform.OS = 'ios'; });

const door = (visible: boolean, onGone: () => void) => (
  <InitiationModal visible={visible} username="vera" memberNo={12} onComplete={jest.fn()} onGone={onGone} />
);

describe('the Initiation says when it is gone', () => {
  it('on iOS: by the Modal’s own onDismiss', async () => {
    const onGone = jest.fn();
    const r = await render(door(true, onGone));
    expect((r.toJSON() as { type: string; props: { onDismiss?: unknown } }).props.onDismiss).toBe(onGone);
  });

  it('on iOS: and, as a backstop, a tail after the Modal leaves the tree; never before', async () => {
    const onGone = jest.fn();
    const r = await render(door(true, onGone));
    await r.rerender(door(false, onGone));
    React.act(() => { jest.advanceTimersByTime(FADE + ARRIVAL_GRACE_MS); });
    expect(r.toJSON()).toBeNull();                       // the Modal has left the tree
    expect(onGone).not.toHaveBeenCalled();               // still dismissing on iOS
    React.act(() => { jest.advanceTimersByTime(GONE_TAIL_MS); });
    expect(onGone).toHaveBeenCalled();
  });

  it('on Android: as the Modal leaves the tree', async () => {
    Platform.OS = 'android';
    const onGone = jest.fn();
    const r = await render(door(true, onGone));
    await r.rerender(door(false, onGone));
    expect(onGone).not.toHaveBeenCalled();               // still fading
    React.act(() => { jest.advanceTimersByTime(FADE + ARRIVAL_GRACE_MS); });
    expect(onGone).toHaveBeenCalled();
  });
});
