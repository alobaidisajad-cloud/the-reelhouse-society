/**
 * SocialModal — the two screen catches batch 2 added, EXECUTED.
 *
 * Finding 115 gave fetchData a voice; the share handler was brought in line
 * with it afterwards. Both were verified by reading. This renders the real
 * screen, makes the real calls fail, and asserts the gating actually holds:
 * a genuine defect reaches Sentry, an offline failure does not, and the
 * member is told either way (the sheet says a failed read in place).
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import SocialModal from '../social-modal';
import { addBreadcrumb, captureError } from '@/src/lib/sentry';
import { ProfileService } from '@/src/services/ProfileWriteService';
import { LoungeService } from '@/src/services/LoungeService';
import { useLoungeStore } from '@/src/stores/lounge';

/**
 * These components set state one tick after render — FlashList when it measures,
 * a guard when its session resolves. Without this the update lands after the
 * test body and React reports it as not wrapped in act.
 */
afterEach(async () => { await act(async () => { await Promise.resolve(); }); });


let mockParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
    router: { dismiss: jest.fn(), back: jest.fn(), push: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/src/services/ProfileWriteService', () => ({
    ProfileService: { getSocialConnections: jest.fn() },
}));
jest.mock('@/src/services/LoungeService', () => ({
    LoungeService: { getUserLounges: jest.fn() },
}));
jest.mock('@/src/stores/lounge', () => ({
    useLoungeStore: { getState: jest.fn(() => ({ sendMessage: jest.fn() })) },
}));
jest.mock('@/src/stores/auth', () => ({
    useAuthStore: () => ({ user: { id: 'u1', username: 'cinephile' } }),
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('expo-blur', () => {
    const React = require('react');
    const { View } = require('react-native');
    return { BlurView: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children) };
});
/** The list's last props: its end-of-list callback is called by hand. */
const mockList: { onEndReached?: () => void } = {};
jest.mock('@shopify/flash-list', () => {
    const React = require('react');
    const { View } = require('react-native');
    return {
        FlashList: ({ data, renderItem, onEndReached, ListFooterComponent }: { data: unknown[]; renderItem: (a: { item: unknown; index: number }) => React.ReactNode; onEndReached?: () => void; ListFooterComponent?: React.ReactNode }) => {
            mockList.onEndReached = onEndReached;
            return React.createElement(View, null, ...(data ?? []).map((item, index) =>
                React.createElement(View, { key: String(index) }, renderItem({ item, index }))), ListFooterComponent ?? null);
        },
    };
});

const OFFLINE = new TypeError('Network request failed');
const GENUINE = Object.assign(new Error('permission denied'), { code: '42501' });

beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
});

describe('SocialModal fetchData — finding 115', () => {
    beforeEach(() => { mockParams = { type: 'followers', userId: 'target-1' }; });

    it('reports a genuine defect with its scope', async () => {
        (ProfileService.getSocialConnections as jest.Mock).mockRejectedValue(GENUINE);
        render(<SocialModal />);
        await waitFor(() => {
            expect(captureError).toHaveBeenCalledWith(
                GENUINE, expect.objectContaining({ scope: 'socialModal.fetchData' }),
            );
        });
    });

    it('stays silent when the member is simply offline', async () => {
        (ProfileService.getSocialConnections as jest.Mock).mockRejectedValue(OFFLINE);
        render(<SocialModal />);
        await waitFor(() => {
            expect(ProfileService.getSocialConnections).toHaveBeenCalled();
        });
        expect(captureError).not.toHaveBeenCalled();
    });

    it('reports nothing at all when the fetch succeeds', async () => {
        (ProfileService.getSocialConnections as jest.Mock).mockResolvedValue({ profiles: [] });
        render(<SocialModal />);
        await waitFor(() => {
            expect(ProfileService.getSocialConnections).toHaveBeenCalled();
        });
        expect(captureError).not.toHaveBeenCalled();
    });
});

describe('SocialModal share — the handler brought in line with it', () => {
    const lounges = [{ lounge_id: 'l1', lounges: { id: 'l1', name: 'The Booth' } }];

    beforeEach(() => {
        mockParams = { shareFilmId: '550', shareFilmTitle: 'Fight Club' };
        (LoungeService.getUserLounges as jest.Mock).mockResolvedValue(lounges);
    });

    const pressShare = async () => {
        const screen = render(<SocialModal />);
        const btn = await screen.findByLabelText('Share to The Booth');
        await fireEvent.press(btn);
        return screen;
    };

    it('reports a genuine defect with its scope', async () => {
        (useLoungeStore.getState as jest.Mock).mockReturnValue({
            sendMessage: jest.fn().mockRejectedValue(GENUINE),
        });
        await pressShare();
        await waitFor(() => {
            expect(captureError).toHaveBeenCalledWith(
                GENUINE, expect.objectContaining({ scope: 'socialModal.share', loungeId: 'l1' }),
            );
        });
    });

    it('stays silent when the member is simply offline', async () => {
        (useLoungeStore.getState as jest.Mock).mockReturnValue({
            sendMessage: jest.fn().mockRejectedValue(OFFLINE),
        });
        await pressShare();
        await waitFor(() => {
            expect(useLoungeStore.getState).toHaveBeenCalled();
        });
        expect(captureError).not.toHaveBeenCalled();
    });
});

describe('the breadcrumb trail — a trace even when nothing is reported', () => {
    it('an offline fetch leaves a breadcrumb though it raises no event', async () => {
        mockParams = { type: 'followers', userId: 'target-1' };
        (ProfileService.getSocialConnections as jest.Mock).mockRejectedValue(OFFLINE);
        render(<SocialModal />);
        await waitFor(() => {
            expect(addBreadcrumb).toHaveBeenCalledWith('socialModal.fetchData failed', 'telemetry');
        });
        // The whole point: a trace exists, but no Sentry event was spent on it.
        expect(captureError).not.toHaveBeenCalled();
    });
});

describe('the circle, read and failed, and read a page at a time', () => {
    beforeEach(() => { mockParams = { type: 'followers', userId: 'target-1' }; });
    const member = (n: number) => ({ id: `m${n}`, username: `member${n}`, avatar_url: null, role: 'cinephile' });

    it('a read that failed says so, with the way to ask again — never "The Circle Is Empty"', async () => {
        (ProfileService.getSocialConnections as jest.Mock)
            .mockRejectedValueOnce(OFFLINE)
            .mockResolvedValueOnce({ profiles: [member(1)], hasMore: false });
        const screen = render(<SocialModal />);
        expect(await screen.findByText('COULD NOT BE REACHED')).toBeTruthy();
        expect(screen.queryByText('The Circle Is Empty')).toBeNull();
        await act(async () => { fireEvent.press(screen.getByLabelText('Try again')); });
        expect(await screen.findByText('@MEMBER1')).toBeTruthy();
    });

    it('past the first fifty, the rest is read as the member reaches the end', async () => {
        (ProfileService.getSocialConnections as jest.Mock)
            .mockResolvedValueOnce({ profiles: [member(1), member(2)], hasMore: true, nextCursor: 'c1' })
            .mockResolvedValueOnce({ profiles: [member(3)], hasMore: false });
        const screen = render(<SocialModal />);
        expect(await screen.findByText('@MEMBER2')).toBeTruthy();
        await act(async () => { mockList.onEndReached?.(); });
        expect(ProfileService.getSocialConnections).toHaveBeenLastCalledWith('target-1', 'followers', { cursor: 'c1' });
        expect(await screen.findByText('@MEMBER3')).toBeTruthy();
    });

    it('and a page that failed is said at the foot, with the way to ask again', async () => {
        (ProfileService.getSocialConnections as jest.Mock)
            .mockResolvedValueOnce({ profiles: [member(1)], hasMore: true, nextCursor: 'c1' })
            .mockRejectedValueOnce(OFFLINE)
            .mockResolvedValueOnce({ profiles: [member(2)], hasMore: false });
        const screen = render(<SocialModal />);
        expect(await screen.findByText('@MEMBER1')).toBeTruthy();
        await act(async () => { mockList.onEndReached?.(); });
        expect(await screen.findByText('The rest could not be reached.')).toBeTruthy();
        await act(async () => { fireEvent.press(screen.getByLabelText('Ask for the rest again')); });
        expect(await screen.findByText('@MEMBER2')).toBeTruthy();
    });
});
