/**
 * theRouteIsMarkedForTheWalk.test.tsx — the route mark (src/components/layout/E2ERouteMark.tsx):
 * in the E2E build, an unseen, unspoken point whose id names the path the app stands on, as the
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
import { E2ERouteMark, routeMarkOf } from '../E2ERouteMark';

beforeEach(() => { mockE2E = true; mockPath = '/film/129'; });

it('marks the path the app stands on, unseen and unspoken', () => {
  const { getByTestId } = render(<E2ERouteMark />);
  const mark = getByTestId('e2e-route-film-129', { includeHiddenElements: true });
  expect(mark.props).toMatchObject({ pointerEvents: 'none', accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', collapsable: false });
});

it('names every path by its words alone, the home path as the bare mark', () => {
  expect(['/', '/lounge', '/dispatch/room/e2e_member', '/user/a.b-c'].map(routeMarkOf))
    .toEqual(['e2e-route', 'e2e-route-lounge', 'e2e-route-dispatch-room-e2e-member', 'e2e-route-user-a-b-c']);
});

it('draws nothing in any other build', () => {
  mockE2E = false;
  expect(render(<E2ERouteMark />).toJSON()).toBeNull();
});
