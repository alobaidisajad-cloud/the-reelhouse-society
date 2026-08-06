/**
 * Stack detail — the three screen catches from batch 2, EXECUTED.
 *
 * Findings 116 and 117 plus the bare `catch {` found beside them. All three
 * were verified by reading. This drives the real handlers: the certify toggle,
 * the comments query function, and the delete confirmation, each failed two
 * ways, asserting a genuine defect reaches Sentry and an offline one does not.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import StackDetailScreen from '../[id]';
import { addBreadcrumb, captureError } from '@/src/lib/sentry';

/** handleCertify pre-flight-validates the id as a UUID; anything else returns early. */
const STACK_ID = '11111111-1111-4111-8111-111111111111';
const OFFLINE = new TypeError('Network request failed');
const GENUINE = Object.assign(new Error('permission denied'), { code: '42501' });

const STACK = {
    id: STACK_ID, title: 'Noir', description: 'd', userId: 'u1', user: 'cinephile',
    createdAt: '2026-01-01T00:00:00Z', films: [], isPrivate: false, isRanked: false,
};

let mockToggleListEndorse: jest.Mock;
let mockDeleteList: jest.Mock;
/** queryFn of the stackComments query, captured so it can be run directly. */
let capturedCommentsFn: (() => Promise<unknown>) | null = null;

jest.mock('expo-router', () => ({
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismiss: jest.fn() },
    useLocalSearchParams: () => ({ id: STACK_ID }),
    useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({
    // Must be constructible: src/lib/queryClient.ts instantiates a QueryClient at
    // module scope, and that module is now reachable from this test through the
    // offline queue (#82's post-flush feed refresh). Without this the whole suite
    // fails to LOAD rather than failing an assertion, which is far harder to read.
    QueryClient: class { defaultOptions = {}; getQueryCache = () => ({ subscribe: () => () => {} }); },
    useQueryClient: () => ({
        setQueryData: jest.fn(), getQueryData: jest.fn(), removeQueries: jest.fn(),
        invalidateQueries: jest.fn(), cancelQueries: jest.fn(() => Promise.resolve()),
    }),
    useQuery: (opts: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
        const key = String(opts.queryKey[0]);
        if (key === 'stackComments') {
            capturedCommentsFn = opts.queryFn;
            return { data: [] };
        }
        if (key === 'stack') {
            return { data: { list: STACK, endorseCount: 0 }, isLoading: false, isError: false };
        }
        return { data: undefined, isLoading: false, isError: false };
    },
}));
jest.mock('@/src/stores/films', () => {
    const state = {
        logs: [],
        lists: [STACK],
        _listEndorsedIndex: {},
        toggleListEndorse: (...a: unknown[]) => mockToggleListEndorse(...a),
        deleteList: (...a: unknown[]) => mockDeleteList(...a),
    };
    const useListStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
    (useListStore as unknown as { getState: () => unknown }).getState = () => state;
    return { useListStore };
});
jest.mock('@/src/stores/blockStore', () => {
    const state = { blockUser: jest.fn(), muteUser: jest.fn(), isBlocked: () => false, isMuted: () => false };
    const useBlockStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
    (useBlockStore as unknown as { getState: () => unknown }).getState = () => state;
    return { useBlockStore };
});
jest.mock('@/src/stores/auth', () => ({
    useAuthStore: () => ({ user: { id: 'u1', username: 'cinephile' } }),
}));
jest.mock('@/src/services/StackService', () => ({
    StackService: { getStackFullPayload: jest.fn(), getStackComments: jest.fn() },
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { poster: () => 'https://x/p.jpg' } }));
jest.mock('@/src/components/layout/CinematicFlashList', () => {
    const React = require('react');
    const { View } = require('react-native');
    return { CinematicFlashList: ({ ListHeaderComponent }: { ListHeaderComponent?: React.ReactNode }) =>
        React.createElement(View, null, typeof ListHeaderComponent === 'function'
            ? React.createElement(ListHeaderComponent as never) : ListHeaderComponent) };
});
jest.mock('@/src/components/ShareToLoungeModal', () => () => null);
jest.mock('@/src/components/moderation/ReportSheet', () => () => null);
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({ ContentActionSheet: () => null }));
jest.mock('expo-blur', () => {
    const React = require('react');
    const { View } = require('react-native');
    return { BlurView: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('expo-linear-gradient', () => {
    const React = require('react');
    const { View } = require('react-native');
    return { LinearGradient: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children) };
});

beforeEach(() => {
    jest.clearAllMocks();
    capturedCommentsFn = null;
    mockToggleListEndorse = jest.fn();
    mockDeleteList = jest.fn();
});

describe('certify toggle — the bare catch that could not log', () => {
    const certify = async () => {
        const screen = render(<StackDetailScreen />);
        await fireEvent.press(await screen.findByLabelText('Certify stack'));
    };

    it('reports a genuine defect', async () => {
        mockToggleListEndorse.mockRejectedValue(GENUINE);
        await certify();
        await waitFor(() => {
            expect(captureError).toHaveBeenCalledWith(
                GENUINE, expect.objectContaining({ scope: 'stacks.toggleCertification', stackId: STACK_ID }),
            );
        });
    });

    it('stays silent when the member is offline', async () => {
        mockToggleListEndorse.mockRejectedValue(OFFLINE);
        await certify();
        await waitFor(() => { expect(mockToggleListEndorse).toHaveBeenCalled(); });
        expect(captureError).not.toHaveBeenCalled();
    });
});

describe('comments fetch — finding 116', () => {
    const runCommentsFn = async () => {
        render(<StackDetailScreen />);
        await waitFor(() => { expect(capturedCommentsFn).not.toBeNull(); });
        await capturedCommentsFn!();
    };

    it('reports a genuine defect', async () => {
        const { StackService } = jest.requireMock('@/src/services/StackService');
        StackService.getStackComments.mockRejectedValue(GENUINE);
        await runCommentsFn();
        expect(captureError).toHaveBeenCalledWith(
            GENUINE, expect.objectContaining({ scope: 'stacks.fetchComments', stackId: STACK_ID }),
        );
    });

    it('stays silent when the member is offline', async () => {
        const { StackService } = jest.requireMock('@/src/services/StackService');
        StackService.getStackComments.mockRejectedValue(OFFLINE);
        await runCommentsFn();
        expect(captureError).not.toHaveBeenCalled();
    });
});

describe('delete — finding 117', () => {
    /** Pull the destructive button out of the confirm dialog and fire it. */
    const confirmDelete = async () => {
        const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
        const screen = render(<StackDetailScreen />);
        await fireEvent.press(await screen.findByLabelText('Delete stack'));
        const buttons = spy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
        const destructive = buttons.find((b) => b.text === 'Incinerate');
        await destructive!.onPress!();
        spy.mockRestore();
    };

    it('reports a genuine defect', async () => {
        mockDeleteList.mockRejectedValue(GENUINE);
        await confirmDelete();
        expect(captureError).toHaveBeenCalledWith(
            GENUINE, expect.objectContaining({ scope: 'stacks.deleteStack', stackId: STACK_ID }),
        );
    });

    it('stays silent when the member is offline', async () => {
        mockDeleteList.mockRejectedValue(OFFLINE);
        await confirmDelete();
        expect(captureError).not.toHaveBeenCalled();
    });
});

describe('the breadcrumb trail — a trace even when nothing is reported', () => {
    it('an offline delete leaves a breadcrumb though it raises no event', async () => {
        mockDeleteList.mockRejectedValue(OFFLINE);
        const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
        const screen = render(<StackDetailScreen />);
        await fireEvent.press(await screen.findByLabelText('Delete stack'));
        const buttons = spy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
        await buttons.find((b) => b.text === 'Incinerate')!.onPress!();
        spy.mockRestore();

        expect(addBreadcrumb).toHaveBeenCalledWith('stacks.deleteStack failed', 'telemetry');
        expect(captureError).not.toHaveBeenCalled();
    });
});
