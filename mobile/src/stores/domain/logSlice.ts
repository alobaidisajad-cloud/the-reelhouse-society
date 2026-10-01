import { StateCreator } from 'zustand';
import { DomainLog } from '../../types';
import { FilmState } from '../films';
import {
    addLogOp,
    fetchLogsOp,
    getCinephileStatsOp,
    removeLogOp,
    unmarkWatchedOp,
    updateLogOp
} from './logSlice/helpers/logOperations';

/**
 * The DATA this slice owns, separated from its actions.
 *
 * Logout has to restore every one of these, and the reset used to name them by
 * hand — it named four of eight, so a `hasMore: false` inherited from the
 * previous member disabled "load more" for the next one. Splitting the data out
 * means the initial-state factory below must supply every field or the build
 * fails, and the reset spreads that factory. A field added here cannot be
 * forgotten by either.
 */
export interface LogSliceData {
    logs: DomainLog[];
    logsHasMore: boolean;
    _logsCursor: string | null;
    _loggedIndex: Record<number, DomainLog>;
    _fetchingLogs: boolean;
    _addLogMutex: boolean;
    _updateLogMutex: boolean;
}

/**
 * A FUNCTION, deliberately — never a shared constant.
 *
 * `sortLogs` sorts in place, so a constant would hand every reset the same array
 * and let one session mutate the pristine copy the next reset depends on.
 */
export const logSliceInitialState = (): LogSliceData => ({
    logs: [],
    logsHasMore: true,
    _logsCursor: null,
    _loggedIndex: {},
    _fetchingLogs: false,
    _addLogMutex: false,
    _updateLogMutex: false,
});

export interface LogSlice extends LogSliceData {
    /** True when the read was answered (or there was nothing to read); false when it failed. */
    fetchLogs: (loadMore?: boolean) => Promise<boolean>;
    addLog: (log: Partial<DomainLog>) => Promise<void>;
    updateLog: (id: string, updates: Partial<DomainLog>) => Promise<void>;
    removeLog: (id: string, forceDeleteAll?: boolean) => Promise<void>;
    unmarkWatched: (filmId: number) => Promise<void>;
    getCinephileStats: (overrideCount?: number) => { count: number, level: string, color: string, progress: number };
}

export const createLogSlice: StateCreator<FilmState, [], [], LogSlice> = (set, get) => ({
    ...logSliceInitialState(),

    fetchLogs: async (loadMore = false) => fetchLogsOp(set, get, loadMore),
    addLog: async (log) => addLogOp(set, get, log),
    // Awaited rather than returned: updateLogOp reports whether it queued the
    // write offline, but that is only for internal STEP callers, which call the
    // helper directly. The public action stays Promise<void>.
    updateLog: async (id, updates) => { await updateLogOp(set, get, id, updates); },
    removeLog: async (id, forceDeleteAll = false) => removeLogOp(set, get, id, forceDeleteAll),
    unmarkWatched: async (filmId) => unmarkWatchedOp(set, get, filmId),
    getCinephileStats: (overrideCount) => getCinephileStatsOp(set, get, overrideCount),
});
