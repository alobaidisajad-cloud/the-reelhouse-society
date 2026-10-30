import { StateCreator } from 'zustand';
import { DomainLog } from '../../types';
import { FilmState } from '../films';
import type { LedgerOnDisk } from './marksDisk';
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
    /**
     * Whether `_loggedIndex` and `_watchlistIndex` hold every film the member has logged and
     * saved (marksLedger.ts): 'held', read whole; 'unread', not yet; 'failed', could not be.
     * Until 'held', a film neither holds is not known to be unseen or unsaved.
     */
    marksKnown: MarksKnown;
    /** On disk only: the ledger as last held, read back at launch and cleared (films.ts). */
    _ledger: LedgerOnDisk | null;
    _fetchingLogs: boolean;
    _addLogMutex: boolean;
    _updateLogMutex: boolean;
}

export type MarksKnown = 'held' | 'unread' | 'failed';

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
    marksKnown: 'unread',
    _ledger: null,
    _fetchingLogs: false,
    _addLogMutex: false,
    _updateLogMutex: false,
});

export interface LogSlice extends LogSliceData {
    /** True when the read was answered (or there was nothing to read); false when it failed. */
    fetchLogs: (loadMore?: boolean) => Promise<boolean>;
    /** `onKeptAhead`: the new log is kept on the phone, before its send (its draft may go). */
    addLog: (log: Partial<DomainLog>, opts?: { onKeptAhead?: () => void }) => Promise<void>;
    /** `held`: the record as its editor read it, when the phone holds it nowhere else. */
    updateLog: (id: string, updates: Partial<DomainLog>, held?: DomainLog) => Promise<void>;
    /** Throws when the record is not in hand: whether it goes or a viewing does turns on it. */
    removeLog: (id: string, forceDeleteAll?: boolean, held?: DomainLog) => Promise<void>;
    unmarkWatched: (filmId: number) => Promise<void>;
    getCinephileStats: (overrideCount?: number) => { count: number, level: string, color: string, progress: number };
}

export const createLogSlice: StateCreator<FilmState, [], [], LogSlice> = (set, get) => ({
    ...logSliceInitialState(),

    fetchLogs: async (loadMore = false) => fetchLogsOp(set, get, loadMore),
    addLog: async (log, opts) => addLogOp(set, get, log, opts),
    // Awaited rather than returned: updateLogOp reports whether it queued the
    // write offline, but that is only for internal STEP callers, which call the
    // helper directly. The public action stays Promise<void>.
    updateLog: async (id, updates, held) => { await updateLogOp(set, get, id, updates, held ? { held } : undefined); },
    removeLog: async (id, forceDeleteAll = false, held) => removeLogOp(set, get, id, forceDeleteAll, held),
    unmarkWatched: async (filmId) => unmarkWatchedOp(set, get, filmId),
    getCinephileStats: (overrideCount) => getCinephileStatsOp(set, get, overrideCount),
});
