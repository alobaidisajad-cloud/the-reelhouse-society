/**
 * A stranger is asked in, and brought back (P4.19, P4.21).
 *
 * Member-only screens opened signed out drew a false "nothing here", a blank page or a "could not
 * reach", and every sign-in but three went to the Lobby, so the screen a link asked for, and what
 * the stranger was doing there, was lost. Each now asks the stranger in, carrying where it was; a
 * sign-in lands there, on any screen of the app (src/utils/signInReturn.ts), and nowhere a link
 * could choose. The return table is held to the app's routes: a screen added later is returned to,
 * or named as a door with its reason.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { MembersOnly, returnAfterSignIn } from '../MembersOnly';
import { NEVER, signInHref } from '@/src/utils/signInReturn';
import { queryOf } from '@/src/utils/routeParams';
import { nav } from '@/src/utils/typedRouter';
import { files as universe, rel } from '@/test-utils/universe';

jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));

const STACK = '11111111-1111-4111-8111-111111111111';

describe('where a sign-in lands', () => {
  it('on the screen that asked, its query whole', () => {
    for (const next of ['/notifications-modal', `/list-modal?editId=${STACK}`, '/list-modal', `/cover-picker?loungeId=${STACK}`,
      '/settings', '/edit-profile', '/year-in-cinema', '/profile', '/', `/lounge/${STACK}`, `/lounge/${STACK}?door=1`,
      '/film/129', '/person/608', '/dispatch/compose?kind=take', '/membership?reason=essays&rank=auteur',
      `/log-modal?filmId=129&filmTitle=${encodeURIComponent('Amélie: 100% Wolf')}&filmPoster=${encodeURIComponent('/a.jpg')}`,
      '/social-modal?personId=608&personName=Ingrid%20Bergman', '/user/e2e_member', `/stacks/${STACK}`]) {
      expect([next, returnAfterSignIn(next)]).toEqual([next, next]);
    }
  });

  it('on the Lobby for anything else a link could name', () => {
    for (const next of [undefined, null, '', '/(admin)/tribunal', '/tribunal', '/login', '/login?next=/settings', '/auth-callback?code=x',
      '/reset-password', 'https://elsewhere.example', '//elsewhere.example', '/notifications-modal/../settings',
      `/list-modal?editId=${STACK}&then=/settings`, `/list-modal?editId=${STACK}&editId=${STACK}`, '/list-modal?editId',
      '/settings?x=1', '/film/abc', '/film/0', `/lounge/${STACK}/more`, '/settings?', `/user/${'a'.repeat(65)}`,
      `/film-reviews/129?title=${encodeURIComponent('a\nb')}`, `/film-reviews/129?title=%E0%A4%A`, `/settings${'x'.repeat(600)}`]) {
      expect([next, returnAfterSignIn(next)]).toEqual([next, '/(tabs)']);
    }
  });

  it('is told to the sign-in, or not at all, and a joining keeps it', () => {
    expect(signInHref('/settings')).toBe(`/login?next=${encodeURIComponent('/settings')}`);
    expect(signInHref('/settings', 'signup')).toBe(`/login?action=signup&next=${encodeURIComponent('/settings')}`);
    expect([signInHref(null), signInHref('/tribunal'), signInHref(null, 'signup')]).toEqual(['/login', '/login', '/login?action=signup']);
  });

  // Every screen app/ has is returned to, or is a door that says why not: a screen added later
  // and forgotten here would send its strangers to the Lobby.
  it('reaches every screen the app has, but its doors', () => {
    const SAMPLE: Record<string, string> = { '[id]': STACK, '[username]': 'e2e_member' };
    const routes = universe('routes', { ext: ['.tsx'] }).map(rel)
      .filter((f) => !/(^|\/)(_layout|\+[\w-]+)\.tsx$/.test(f));
    const unreached = routes.filter((f) => {
      if (f in NEVER) return false;
      const segments = f.replace(/^app\//, '').replace(/\.tsx$/, '').split('/').filter((s) => !/^\(.*\)$/.test(s) && s !== 'index');
      const tries = segments.some((s) => s === '[id]') ? [STACK, '129'] : [''];
      return !tries.some((id) => {
        const path = `/${segments.map((s) => (s === '[id]' ? id : SAMPLE[s] ?? s)).join('/')}`;
        return returnAfterSignIn(path) === path;
      });
    });
    expect(unreached).toEqual([]);
    // A door named here is a route the app has.
    expect(Object.keys(NEVER).filter((f) => !routes.includes(f))).toEqual([]);
  });
});

describe('where the stranger stands', () => {
  it("is the screen's path and its own query, its path's segments left out", () => {
    expect(queryOf({ id: '129' }, ['film', '[id]'])).toBe('');
    expect(queryOf({ id: STACK, door: '1' }, ['lounge', '[id]'])).toBe('door=1');
    expect(queryOf({ personName: 'Ingrid Bergman', personId: '608', empty: '' }, ['(modals)', 'social-modal']))
      .toBe('personId=608&personName=Ingrid%20Bergman');
    expect(queryOf({ editId: [STACK, 'x'] }, ['(modals)', 'list-modal'])).toBe(`editId=${STACK}`);
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
