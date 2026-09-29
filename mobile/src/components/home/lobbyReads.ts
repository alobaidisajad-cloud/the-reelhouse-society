/**
 * lobbyReads — what the Lobby asks the house for, each read in one place.
 *
 * The Lobby owns its reads and hands each section what came back; a section
 * only draws. So the page knows in one place which reads failed, says so once,
 * and a pull asks them all.
 *
 * Each read THROWS when it could not be answered. The Pulse and the Lead Story
 * used to catch their own failures and return "none": React Query then kept an
 * empty answer for five minutes, the Pulse said "The screening room is dark.
 * When a member logs their first film, it will appear here." to a member with
 * no signal, and the Lead Story simply was not there.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { filterContentByBlocks } from '@/src/utils/filterContentByBlocks';
import type { FeaturedLog, PulseActivity } from './types';
import { timeAgo } from './types';

/**
 * Every Lobby read is under ['lobby', ...], so the page can ask for all of them
 * at once. The programme and the Canon change weekly and are asked again only
 * when out of date; the Pulse and the Lead Story are the house's live pages.
 */
export const LOBBY = ['lobby'] as const;
export const PULSE_KEY = ['lobby', 'pulse'] as const;
export const FEATURED_KEY = ['lobby', 'featured'] as const;
export const LIVE_LOBBY_READS: readonly string[] = [PULSE_KEY[1], FEATURED_KEY[1]];

const LOG_COLUMNS = 'id, film_id, film_title, poster_path, rating, review, status, abandoned_reason, watched_with, pull_quote, drop_cap, editorial_header, is_autopsied, autopsy, is_spoiler, created_at, user_id, profiles!logs_user_id_fkey(username, role, avatar_url)';

const profileOf = (log: FeaturedLog) => (Array.isArray(log.profiles) ? log.profiles[0] : log.profiles);

/** The wire: the newest reviews, with their writers, and never a blocked member's. */
export async function readPulse(): Promise<PulseActivity[]> {
  const { data, error } = await supabase
    .from('logs')
    .select(LOG_COLUMNS)
    .neq('review', '')
    .not('review', 'is', null)
    .order('created_at', { ascending: false })
    // Seven, not six: the Lead Story is taken out at render and the wire cut
    // back to six, so removing it never leaves the wire short.
    .limit(7);
  if (error) throw error;

  const mapped = ((data ?? []) as FeaturedLog[]).map((log): PulseActivity => ({
    id: log.id,
    user_id: log.user_id,
    user: profileOf(log)?.username ?? 'cinephile',
    userRole: profileOf(log)?.role ?? 'cinephile',
    userAvatar: profileOf(log)?.avatar_url ?? null,
    film: { id: log.film_id, title: log.film_title, poster_path: log.poster_path },
    rating: log.rating,
    text: log.review,
    dropCap: log.drop_cap,
    pullQuote: log.pull_quote ?? '',
    status: log.status,
    abandoned_reason: log.abandoned_reason,
    watchedWith: log.watched_with,
    is_autopsied: log.is_autopsied,
    autopsy: log.autopsy,
    is_spoiler: log.is_spoiler ?? false,
    editorialHeader: log.editorial_header ?? null,
    time: timeAgo(log.created_at),
  }));
  // Hide logs from blocked/muted members (HOOK-8).
  return filterContentByBlocks(mapped, (a) => a.user_id ?? '');
}

/**
 * The Lead Story: the day's most engaged review, or null when the day has none.
 * `maybeSingle`: no row is an answer ("none today"), not a failure.
 */
export async function readFeatured(): Promise<FeaturedLog | null> {
  const { data, error } = await supabase
    .rpc('get_featured_critique')
    .select(LOG_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  const log = data as FeaturedLog | null;
  // Never a blocked or muted member's review as the Lead Story (HOOK-8).
  if (log?.user_id && filterContentByBlocks([log], (l) => l.user_id ?? '').length === 0) return null;
  return log;
}

/** `enabled`: a member's Lobby only — the front door shows neither. */
export function usePulse(enabled: boolean) {
  return useQuery({ queryKey: PULSE_KEY, queryFn: readPulse, staleTime: 5 * 60 * 1000, enabled });
}

export function useFeaturedCritique(enabled: boolean) {
  return useQuery({ queryKey: FEATURED_KEY, queryFn: readFeatured, staleTime: 5 * 60 * 1000, enabled });
}
