/**
 * The edits of a log and of a filing, laid only over what their member edited (SYN-28):
 * one read and one conditional write each, for the store's online edit and the queue's alike.
 * See keepWhatChangedSince.
 */
import { supabase } from '../lib/supabase';
import { FILING_EDIT_COLUMNS } from '../stores/dispatchTypes';
import { LOG_EDIT_COLUMNS, logAsStored } from '../utils/mappers';
import { FILING_CHANGED_SINCE, LOG_CHANGED_SINCE, keepWhatChangedSince, type KeptWrite } from '../utils/keepWhatChangedSince';

type Row = Record<string, unknown>;

const rows = <D>(res: { data: D; error: unknown }): D => {
    if (res.error) throw res.error;
    return res.data;
};

/**
 * A log's viewings, the house's and the phone's joined: a viewing on either side stays.
 * A composite key: `date` alone merges two rewatches on one day (date-only watches sit at
 * T12:00:00Z); the other fields tell two quick marks apart. An empty place in either history is
 * no viewing, and is dropped from both: kept, the phone's own reached the sort, which reads its
 * date and threw, and the edit was given up.
 */
export function mergeHistory(serverHistory: unknown[], offlineHistory: unknown[]): unknown[] {
    const compositeKey = (entry: any): string =>
        `${entry.date ?? ''}::${entry.rating ?? 0}::${entry.status ?? ''}::${entry.review?.slice(0, 40) ?? ''}::${entry.watchedWith ?? ''}::${entry.physicalMedia ?? ''}`;
    const mergedMap = new Map<string, unknown>();
    serverHistory.forEach((entry: any) => {
        if (entry) mergedMap.set(compositeKey(entry), entry);
    });
    offlineHistory.forEach((entry: any) => {
        if (!entry) return;
        const key = compositeKey(entry);
        // Only overwrite if the entry is genuinely the same (not a distinct rewatch)
        if (!mergedMap.has(key)) {
            mergedMap.set(key, entry);
        }
    });
    return Array.from(mergedMap.values()).sort((a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );
}

/**
 * A log's edit, by its member. The viewings are joined, never compared: each side keeps its
 * own. A log made before its time was kept has none (`is null`).
 */
export function keepLogEdit(id: string, owner: string, changes: Row, was: Row): Promise<KeptWrite> {
    return keepWhatChangedSince({
        changes,
        was,
        version: 'updated_at',
        refusal: LOG_CHANGED_SINCE,
        read: async () => rows(await supabase.from('logs').select(LOG_EDIT_COLUMNS)
            .eq('id', id).eq('user_id', owner).maybeSingle()) as Row | null,
        write: async (send, at) => rows(await (at === null
            ? supabase.from('logs').update(send).eq('id', id).eq('user_id', owner).is('updated_at', null).select('id')
            : supabase.from('logs').update(send).eq('id', id).eq('user_id', owner).eq('updated_at', at as string).select('id'))),
        free: ['viewing_history'],
        merge: (send, row) => (Array.isArray(send.viewing_history) && Array.isArray(row.viewing_history)
            ? { ...send, viewing_history: mergeHistory(row.viewing_history, send.viewing_history) }
            : send),
        asStored: logAsStored,
    });
}

/** A filing's edit, by its author. */
export function keepFilingEdit(id: string, owner: string, changes: Row, was: Row): Promise<KeptWrite> {
    return keepWhatChangedSince({
        changes,
        was,
        version: 'updated_at',
        refusal: FILING_CHANGED_SINCE,
        read: async () => rows(await supabase.from('dispatch_posts').select(FILING_EDIT_COLUMNS)
            .eq('id', id).eq('user_id', owner).maybeSingle()) as Row | null,
        write: async (send, at) => rows(await supabase.from('dispatch_posts').update(send)
            .eq('id', id).eq('user_id', owner).eq('updated_at', at as string).select('id')),
    });
}
