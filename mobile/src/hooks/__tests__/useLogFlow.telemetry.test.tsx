/**
 * useLogFlow.handleLog — finding 88, EXECUTED.
 *
 * Filing a log is the app's core write and had no telemetry at all: addLogOp
 * and updateLogOp have no top-level catch, so this handler is where a failed
 * write actually surfaces. The fix was verified by reading; this drives the
 * real hook and fails the real write.
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';

import { useLogFlow } from '../useLogFlow';
import { captureError } from '@/src/lib/sentry';

const OFFLINE = new TypeError('Network request failed');
const GENUINE = Object.assign(new Error('permission denied'), { code: '42501' });

let mockAddLog: jest.Mock;

jest.mock('expo-router', () => ({
    useLocalSearchParams: () => ({ filmId: '550', filmTitle: 'Fight Club', filmPoster: '/p.jpg', filmYear: '1999' }),
    useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismiss: jest.fn() }),
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismiss: jest.fn() },
}));
jest.mock('@/src/stores/auth', () => ({
    useAuthStore: () => ({ user: { id: 'u1', username: 'cinephile', tier: 'auteur' }, isAuthenticated: true }),
}));
// ONE stable object. Returning a fresh one per render gives `logs` a new
// identity every time, and the hook's form-reset effect depends on `logs` —
// that loops forever. Zustand hands back a stable reference in the real app.
jest.mock('@/src/stores/films', () => {
    const state = {
        logs: [], lists: [], _loggedIndex: {},
        addLog: (...a: unknown[]) => mockAddLog(...a),
        updateLog: jest.fn(), removeLog: jest.fn(),
        addFilmToList: jest.fn(), removeFilmFromList: jest.fn(),
    };
    return { useFilmStore: () => state };
});
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('@/src/lib/tmdb', () => ({
    tmdb: {
        poster: () => 'https://x/p.jpg',
        movieImages: jest.fn().mockResolvedValue({ posters: [] }),
        movie: jest.fn().mockResolvedValue({}),
    },
}));
jest.mock('@/src/utils/requestReview', () => ({ maybeRequestReview: jest.fn() }));

/** Exposes the hook's API so handleLog can be driven directly. */
let api: ReturnType<typeof useLogFlow> | null = null;
function Probe() {
    api = useLogFlow();
    return null;
}

const fileALog = async () => {
    render(<Probe />);
    // A rating (or a review) is required, or validateLogSubmission blocks the
    // submit before the try and nothing would run at all.
    await act(async () => { api!.setRating(8); });
    await act(async () => { await api!.handleLog(); });
};

beforeEach(() => {
    jest.clearAllMocks();
    api = null;
    mockAddLog = jest.fn();
});

describe('filing a log — the core write', () => {
    it('reports a genuine defect with the film attached', async () => {
        mockAddLog.mockRejectedValue(GENUINE);
        await fileALog();
        expect(captureError).toHaveBeenCalledWith(
            GENUINE,
            expect.objectContaining({ scope: 'useLogFlow.handleLog', isEditing: false, filmId: 550 }),
        );
    });

    it('stays silent when the member is simply offline', async () => {
        mockAddLog.mockRejectedValue(OFFLINE);
        await fileALog();
        expect(mockAddLog).toHaveBeenCalled();
        expect(captureError).not.toHaveBeenCalled();
    });

    it('reports nothing when the write succeeds', async () => {
        mockAddLog.mockResolvedValue(undefined);
        await fileALog();
        expect(mockAddLog).toHaveBeenCalled();
        expect(captureError).not.toHaveBeenCalled();
    });
});
