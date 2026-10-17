/**
 * theRouteIsMarkedForTheWalk.test.tsx — the route mark (src/components/layout/E2ERouteMark.tsx):
 * in the E2E build, an unseen point Maestro can read whose id names the path the app stands on, as the
 * route walk waits for it (e2e/walk-routes.mjs's markOf, which walkRoutes.test.ts holds to the
 * same names); nothing in any other build.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

let mockE2E = true;
let mockPath = '/film/129';
jest.mock('@/src/utils/e2eTrace', () => ({ get E2E_BUILD() { return mockE2E; }, e2eTrace: jest.fn() }));
jest.mock('expo-router', () => ({ usePathname: () => mockPath }));

// eslint-disable-next-line import/first -- after the mocks it reads
import { E2ERouteMark, PreloaderGone, routeMarkOf } from '../E2ERouteMark';

/** The mark as a route draws it once the preloader has gone. */
const Marked = () => <PreloaderGone value><E2ERouteMark /></PreloaderGone>;

beforeEach(() => { mockE2E = true; mockPath = '/film/129'; });

it('marks the path the app stands on, unseen, untouched, and in the tree Maestro reads (run 39010069408)', () => {
  const { getByTestId } = render(<Marked />);
  // Found without asking for hidden elements: a mark hidden from the accessibility tree is one Maestro cannot see.
  const mark = getByTestId('e2e-route-film-129');
  expect(mark.props).toMatchObject({ pointerEvents: 'none', accessible: false, collapsable: false });
  expect([mark.props.accessibilityElementsHidden, mark.props.importantForAccessibility]).toEqual([undefined, undefined]);
  // Off the status bar, where Android called it invisible to the user (run 39016141904).
  expect(mark.props.style).toMatchObject({ position: 'absolute', top: '50%', left: 0 });
});

it('draws nothing while the preloader still covers the screen: a capture then would be of the preloader', () => {
  expect(render(<E2ERouteMark />).toJSON()).toBeNull();
});

it('names every path by its words alone, the home path as the bare mark', () => {
  expect(['/', '/lounge', '/dispatch/room/e2e_member', '/user/a.b-c'].map(routeMarkOf))
    .toEqual(['e2e-route', 'e2e-route-lounge', 'e2e-route-dispatch-room-e2e-member', 'e2e-route-user-a-b-c']);
});

it('draws nothing in any other build', () => {
  mockE2E = false;
  expect(render(<Marked />).toJSON()).toBeNull();
});
