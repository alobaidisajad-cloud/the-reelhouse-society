/**
 * A stranger is asked in, and brought back (P4.19).
 *
 * Three member-only screens opened signed out (the notices, a stack to amend, a salon's cover)
 * drew a false "nothing here", and every sign-in went to the Lobby, so the screen a link asked for
 * was lost. Each now asks the stranger in, carrying where it was; a sign-in lands there, when it
 * is one of those screens, and nowhere a link could choose.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { MembersOnly, returnAfterSignIn } from '../MembersOnly';
import { nav } from '@/src/utils/typedRouter';

jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));

const STACK = '11111111-1111-4111-8111-111111111111';

describe('where a sign-in lands', () => {
  it('on the member-only screen that asked', () => {
    expect(returnAfterSignIn('/notifications-modal')).toBe('/notifications-modal');
    expect(returnAfterSignIn(`/list-modal?editId=${STACK}`)).toBe(`/list-modal?editId=${STACK}`);
    expect(returnAfterSignIn('/list-modal')).toBe('/list-modal');
    expect(returnAfterSignIn(`/cover-picker?loungeId=${STACK}`)).toBe(`/cover-picker?loungeId=${STACK}`);
  });

  it('on the Lobby for anything else a link could name', () => {
    for (const next of [undefined, null, '', '/settings', '/(admin)/tribunal', 'https://elsewhere.example', '//elsewhere.example',
      '/notifications-modal/../settings', `/list-modal?editId=${STACK}&then=/settings`, '/list-modal?editId=not-an-id', '/cover-picker']) {
      expect([next, returnAfterSignIn(next)]).toEqual([next, '/(tabs)']);
    }
  });
});

describe('the door', () => {
  it('says the screen is for members, and its way in carries where it was', async () => {
    const r = await render(<MembersOnly next={`/cover-picker?loungeId=${STACK}`} />);
    expect(r.getByText('For Members')).toBeTruthy();
    await fireEvent.press(r.getByLabelText('Identify yourself. Sign in.'));
    expect(nav.push).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(`/cover-picker?loungeId=${STACK}`)}`);
    await fireEvent.press(r.getByLabelText('Close'));
    expect(nav.back).toHaveBeenCalled();
  });
});
