import { StateCreator } from 'zustand';
import { DomainLog } from '../../types';
import { FilmState } from '../films';
import {
    addLogOp,
    fetchLogsOp,
    getCinephileStatsOp,
    markAsWatchedOp,
    removeLogOp,
    unmarkWatchedOp,
    updateLogOp
} from './logSlice/helpers/logOperations';

export interface LogSlice {
    logs: DomainLog[];
    logsHasMore: boolean;
    _logsCursor: string | null;
    _loggedIndex: Record<number, DomainLog>;
    _fetchingLogs: boolean;
    _addLogMutex: boolean;
    _updateLogMutex: boolean;
    _markWatchedMutexes: Record<number, boolean>;

    fetchLogs: (loadMore?: boolean) => Promise<void>;
    addLog: (log: Partial<DomainLog>) => Promise<void>;
    updateLog: (id: string, updates: Partial<DomainLog>) => Promise<void>;
    removeLog: (id: string, forceDeleteAll?: boolean) => Promise<void>;
    markAsWatched: (film: { id: number; title?: string; name?: string; poster_path?: string | null; release_date?: string }, status?: 'watched' | 'rewatched' | 'abandoned') => Promise<void>;
    unmarkWatched: (filmId: number) => Promise<void>;
    getCinephileStats: (overrideCount?: number) => { count: number, level: string, color: string, progress: number };
}

export const createLogSlice: StateCreator<FilmState, [], [], LogSlice> = (set, get) => ({
    logs: [],
    logsHasMore: true,
    _logsCursor: null,
    _loggedIndex: {},
    _fetchingLogs: false,
    _addLogMutex: false,
    _updateLogMutex: false,
    _markWatchedMutexes: {},

    fetchLogs: async (loadMore = false) => fetchLogsOp(set, get, loadMore),
    addLog: async (log) => addLogOp(set, get, log),
    // Awaited rather than returned: updateLogOp reports whether it queued the
    // write offline, but that is only for internal STEP callers, which call the
    // helper directly. The public action stays Promise<void>.
    updateLog: async (id, updates) => { await updateLogOp(set, get, id, updates); },
    removeLog: async (id, forceDeleteAll = false) => removeLogOp(set, get, id, forceDeleteAll),
    markAsWatched: async (film, status = 'watched') => markAsWatchedOp(set, get, film, status as any),
    unmarkWatched: async (filmId) => unmarkWatchedOp(set, get, filmId),
    getCinephileStats: (overrideCount) => getCinephileStatsOp(set, get, overrideCount),
});
