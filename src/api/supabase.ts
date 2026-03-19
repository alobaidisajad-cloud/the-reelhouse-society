/**
 * ReelHouse — Supabase Data Access Layer (C2)
 * Centralized, typed API functions replacing scattered supabase calls across components.
 * Each function returns typed data and handles errors consistently.
 */
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import type { FilmLog, WatchlistItem, FilmList, Notification, CinemaReview } from '../types'

// ── Error wrapper ──
type ApiResult<T> = { data: T | null; error: string | null }

async function query<T>(fn: () => PromiseLike<{ data: any; error: any }>): Promise<ApiResult<T>> {
  if (!isSupabaseConfigured) return { data: null, error: 'Supabase not configured' }
  try {
    const { data, error } = await fn()
    if (error) return { data: null, error: error.message }
    return { data: data as T, error: null }
  } catch (e: any) {
    return { data: null, error: e?.message || 'Unknown error' }
  }
}

// ══════════════════════════════════════════
// PROFILES
// ══════════════════════════════════════════

export async function fetchProfile(username: string) {
  return query<any>(() =>
    supabase
      .from('profiles')
      .select('id, username, role, bio, avatar_url, followers_count, following_count, is_social_private, created_at, tier, display_name, social_visibility')
      .eq('username', username)
      .single()
  )
}

export async function updateProfile(userId: string, updates: Record<string, unknown>) {
  return query<any>(() =>
    supabase.from('profiles').update(updates).eq('id', userId)
  )
}

// ══════════════════════════════════════════
// LOGS
// ══════════════════════════════════════════

export async function fetchUserLogs(userId: string) {
  return query<any[]>(() =>
    supabase
      .from('logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
  )
}

export async function fetchCommunityFeed(limit = 50) {
  return query<any[]>(() =>
    supabase
      .from('logs')
      .select('id, user_id, film_id, film_title, poster_path, year, rating, review, status, watched_date, is_spoiler, pull_quote, drop_cap, alt_poster, editorial_header, is_autopsied, autopsy, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
  )
}

export async function insertLog(log: Record<string, unknown>) {
  return query<any>(() =>
    supabase.from('logs').insert(log).select().single()
  )
}

export async function updateLog(logId: string, updates: Record<string, unknown>) {
  return query<any>(() =>
    supabase.from('logs').update(updates).eq('id', logId)
  )
}

export async function deleteLog(logId: string) {
  return query<null>(() =>
    supabase.from('logs').delete().eq('id', logId)
  )
}

// ══════════════════════════════════════════
// WATCHLISTS
// ══════════════════════════════════════════

export async function fetchWatchlist(userId: string) {
  return query<WatchlistItem[]>(() =>
    supabase.from('watchlists').select('*').eq('user_id', userId)
  )
}

export async function addToWatchlist(userId: string, film: { film_id: number; film_title: string; poster_path?: string; year?: number }) {
  return query<any>(() =>
    supabase.from('watchlists').insert({ user_id: userId, ...film })
  )
}

export async function removeFromWatchlist(userId: string, filmId: number) {
  return query<null>(() =>
    supabase.from('watchlists').delete().eq('user_id', userId).eq('film_id', filmId)
  )
}

// ══════════════════════════════════════════
// LISTS
// ══════════════════════════════════════════

export async function fetchUserLists(userId: string) {
  return query<FilmList[]>(() =>
    supabase.from('lists').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  )
}

export async function fetchPublicLists(limit = 20) {
  return query<any[]>(() =>
    supabase.from('lists').select('*').eq('is_private', false).order('created_at', { ascending: false }).limit(limit)
  )
}

export async function fetchListWithItems(listId: string) {
  return query<any>(() =>
    supabase.from('lists').select('*, list_items(*)').eq('id', listId).single()
  )
}

export async function createList(list: { user_id: string; title: string; description?: string; is_ranked?: boolean }) {
  return query<any>(() =>
    supabase.from('lists').insert(list).select().single()
  )
}

export async function deleteList(listId: string) {
  return query<null>(() =>
    supabase.from('lists').delete().eq('id', listId)
  )
}

// ══════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════

export async function fetchNotifications(userId: string, limit = 50) {
  return query<any[]>(() =>
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
  )
}

export async function markNotificationsRead(userId: string) {
  return query<null>(() =>
    supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false)
  )
}

export async function dismissNotification(notifId: string) {
  return query<null>(() =>
    supabase.from('notifications').delete().eq('id', notifId)
  )
}

export async function insertNotification(notif: { user_id: string; type: string; from_username?: string; message: string }) {
  return query<any>(() =>
    supabase.from('notifications').insert(notif)
  )
}

// ══════════════════════════════════════════
// INTERACTIONS (follows, endorsements)
// ══════════════════════════════════════════

export async function fetchInteractions(userId: string) {
  return query<any[]>(() =>
    supabase.from('interactions').select('*').eq('user_id', userId)
  )
}

export async function insertInteraction(interaction: { user_id: string; target_user_id?: string; target_log_id?: string; type: string }) {
  return query<any>(() =>
    supabase.from('interactions').insert(interaction)
  )
}

export async function removeInteraction(userId: string, targetLogId: string, type: string) {
  return query<null>(() =>
    supabase.from('interactions').delete().eq('user_id', userId).eq('target_log_id', targetLogId).eq('type', type)
  )
}

// ══════════════════════════════════════════
// VENUES & SHOWTIMES
// ══════════════════════════════════════════

export async function fetchVenueByOwner(ownerId: string) {
  return query<any>(() =>
    supabase.from('venues').select('*').eq('owner_id', ownerId).single()
  )
}

export async function fetchAllVenues() {
  return query<any[]>(() =>
    supabase.from('venues').select('*').order('name')
  )
}

export async function fetchShowtimes(venueId: string) {
  return query<any[]>(() =>
    supabase.from('showtimes').select('*').eq('venue_id', venueId).order('date')
  )
}

// ══════════════════════════════════════════
// CINEMA REVIEWS
// ══════════════════════════════════════════

export async function fetchCinemaReviews(cinemaId: string) {
  return query<CinemaReview[]>(() =>
    supabase.from('cinema_reviews').select('*').eq('cinema_id', cinemaId).order('created_at', { ascending: false })
  )
}

export async function insertCinemaReview(review: { user_id: string; cinema_id: string; cinema_name: string; rating: number; review?: string }) {
  return query<any>(() =>
    supabase.from('cinema_reviews').upsert(review, { onConflict: 'user_id,cinema_id' })
  )
}

// ══════════════════════════════════════════
// DISPATCH (Dossiers)
// ══════════════════════════════════════════

export async function fetchPublishedDossiers(limit = 20) {
  return query<any[]>(() =>
    supabase.from('dispatch_dossiers').select('*').eq('is_published', true).order('created_at', { ascending: false }).limit(limit)
  )
}

export async function insertDossier(dossier: Record<string, unknown>) {
  return query<any>(() =>
    supabase.from('dispatch_dossiers').insert(dossier).select().single()
  )
}

// ══════════════════════════════════════════
// ERROR LOGGING
// ══════════════════════════════════════════

export async function logError(error: { user_id?: string; error_message: string; error_stack?: string; context?: Record<string, unknown>; url?: string }) {
  return query<null>(() =>
    supabase.from('error_logs').insert(error)
  )
}

// ══════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════

export async function searchProfiles(q: string, limit = 8) {
  return query<any[]>(() =>
    supabase
      .from('profiles')
      .select('username, role, bio, avatar_url')
      .or(`username.ilike.%${q}%,bio.ilike.%${q}%`)
      .order('username', { ascending: true })
      .limit(limit)
  )
}
