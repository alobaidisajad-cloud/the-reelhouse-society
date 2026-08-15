/**
 * TopNavBar.test.tsx — the bar, assembled.
 * ─────────────────────────────────────────────────────────────
 * ConciergeButton has its own tests, but every one of them renders the button
 * ALONE. Nothing rendered the bar itself: delete `<ConciergeButton />` from the
 * cluster, or break its import, and the whole suite stayed green while the
 * app's primary action vanished. These tests close that hole.
 *
 * The bar had no test at all before this, and the reason was mechanical rather
 * than deliberate: `scrollBridge.ts` calls `makeMutable(0)` at module load, and
 * the shared reanimated mock did not provide it, so importing TopNavBar threw
 * before a single line could render. jest.setup.ts now supplies it.
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

// The Modal is stood in for so the Concierge sheet's contents are reachable —
// React Native's Modal is a composite and RNTL v14 only walks host elements.
const mockModal: { props: Record<string, any> } = { props: {} };
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactLocal = require('react');
  const ViewLocal = require('react-native/Libraries/Components/View/View').default;
  return {
    __esModule: true,
    default: (props: Record<string, any>) => {
      mockModal.props = props;
      return props.visible ? ReactLocal.createElement(ViewLocal, null, props.children) : null;
    },
  };
});

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View };
});

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

jest.mock('@/src/components/MasterLogo', () => {
  const { View } = require('react-native');
  return { MasterLogo: () => <View testID="master-logo" /> };
});

jest.mock('@/src/components/ui/NotificationBadge', () => {
  const { View } = require('react-native');
  return { NotificationBadge: () => <View testID="notif-badge" /> };
});

// eslint-disable-next-line import/first
import { TopNavBar } from '../TopNavBar';
// eslint-disable-next-line import/first
import { useAuthStore } from '@/src/stores/auth';

describe('TopNavBar', () => {
  beforeEach(() => {
    mockModal.props = {};
    useAuthStore.setState({ user: null, isAuthenticated: false, loading: false } as never);
  });

  it('carries the Concierge ＋ — the app has no other permanent create button', () => {
    const api = render(<TopNavBar />);
    expect(api.getByLabelText('Create')).toBeTruthy();
  });

  it('carries the rest of the crown', () => {
    const api = render(<TopNavBar />);
    expect(api.getByLabelText('Search')).toBeTruthy();
    expect(api.getByLabelText('Notices')).toBeTruthy();
    // Below Archivist the Lounge shows as the brass key rather than being hidden.
    expect(
      api.queryByLabelText('Lounge') ??
        api.getByLabelText('The Lounge — clearance required. Opens membership details.')
    ).toBeTruthy();
  });

  it('the ＋ opens the Concierge from inside the bar, not just in isolation', async () => {
    const api = render(<TopNavBar />);
    await fireEvent.press(api.getByLabelText('Create'));
    await act(async () => { mockModal.props.onShow?.(); });

    expect(api.getByText('Log a Film')).toBeTruthy();
    expect(api.getByText('Curate a Stack')).toBeTruthy();
  });

  it('exposes exactly one Create control, so the sweep never doubles it up', async () => {
    const api = render(<TopNavBar />);
    expect(api.queryAllByLabelText('Create')).toHaveLength(1);

    // While the sheet is open the twin above the scrim is labelled Close, not
    // Create — otherwise a screen reader would meet two identical buttons.
    await fireEvent.press(api.getByLabelText('Create'));
    await act(async () => { mockModal.props.onShow?.(); });
    expect(api.queryAllByLabelText('Create')).toHaveLength(1);
    expect(api.queryAllByLabelText('Close')).toHaveLength(1);
  });
});
