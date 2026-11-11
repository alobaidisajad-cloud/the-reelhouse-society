/**
 * A members' room, opened by a stranger, asks them in (P4.21).
 *
 * Opened signed out by a link, Settings and the profile editor drew NOTHING (a blank page, no way
 * out), the year in cinema said "the projector jammed" with a TRY AGAIN that could never work, and
 * a salon said it "has been incinerated or never existed" because its row is the members' to read.
 * Each now says it is for members, offers the way in carrying its own address, and a way out.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SettingsScreen } from '@/src/features/settings/SettingsScreen';
import { EditProfileScreen } from '@/src/features/profile/EditProfileScreen';
import YearInCinema from '@/app/year-in-cinema';
import SalonRoute from '@/app/lounge/[id]';
import { useAuthStore } from '@/src/stores/auth';

const SALON = '00000011-0000-4000-8000-000000000011';

jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useLocalSearchParams: jest.fn(() => ({ id: '00000011-0000-4000-8000-000000000011' })),
}));

// Outside a navigator: the screens' leave guards are given a navigation to hold.
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(),
  usePreventRemove: jest.fn(),
  useNavigation: () => ({ dispatch: jest.fn(), addListener: () => () => {} }),
  useIsFocused: () => true,
}));

beforeEach(() => useAuthStore.setState({ user: null, isAuthenticated: false } as never));

for (const [room, Screen, next, never] of [
  ['Settings', SettingsScreen, '/settings', null],
  ['the profile editor', EditProfileScreen, '/edit-profile', null],
  ['the year in cinema', YearInCinema, '/year-in-cinema', /projector jammed/],
  ['a salon', SalonRoute, `/lounge/${SALON}`, /Signal Lost|incinerated|never existed/],
] as const) {
  it(`${room}: said to be for members, the way in carrying ${next}, and a way out`, async () => {
    const r = await render(<Screen />);
    expect(r.getByText('For Members')).toBeTruthy();
    const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock; replace: jest.Mock } };
    router.push.mockClear(); router.replace.mockClear();
    await fireEvent.press(r.getByTestId('members-only-sign-in'));
    // Pushed; or replaced, as the router's helper does the fourth time one screen is opened (typedRouter).
    expect([...router.push.mock.calls, ...router.replace.mock.calls]).toEqual([[`/login?next=${encodeURIComponent(next)}`]]);
    expect(r.getByLabelText('Close')).toBeTruthy();
    if (never) expect(JSON.stringify(r.toJSON())).not.toMatch(never);
  });
}
