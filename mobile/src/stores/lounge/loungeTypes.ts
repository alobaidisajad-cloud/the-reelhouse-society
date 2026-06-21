/**
 * Extracted lounge types to dedicated module.
 * 
 * All types consumed by both the store and UI components live here.
 * The main lounge.ts re-exports everything for backward compatibility.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';

// ── Room Types ──
export interface LoungeRoom {
  id: string;
  name: string;
  description: string;
  is_private: boolean;
  invite_code: string | null;
  creator_id: string;
  created_at: string;
  cover_image?: string | null;
  member_count?: number;
  unread_count?: number;
  last_message?: string;
  last_message_at?: string;
  is_member?: boolean;
}

// ── Message Types ──
export interface LoungeMessage {
  id: string;
  lounge_id: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  content: string;
  type: 'text' | 'film_share' | 'log_share' | 'system' | string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_content?: string | null;
  film_id?: number | null;
  film_title?: string | null;
  film_poster?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ── Store State ──
export interface LoungeState {
  lounges: LoungeRoom[];
  currentMessages: LoungeMessage[];
  currentLoungeId: string | null;
  loading: boolean;
  sending: boolean;
  _fetchingMoreMessages: boolean;
  _hasMoreMessages: boolean;

  fetchLounges: (silent?: boolean) => Promise<void>;
  canSendMessage: () => boolean;
  sendMessage: (loungeId: string, content: string, type?: string, meta?: Record<string, unknown>) => Promise<boolean>;
  fetchMessages: (loungeId: string) => Promise<void>;
  loadMoreMessages: (loungeId: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  createLounge: (name: string, description: string, isPrivate: boolean) => Promise<string | null>;
  joinLounge: (inviteCode: string) => Promise<string | null>;
  joinLoungeById: (loungeId: string) => Promise<boolean>;
  leaveLounge: (loungeId: string) => Promise<void>;
  deleteLounge: (loungeId: string) => Promise<boolean>;
  subscribeToLounge: (loungeId: string) => () => void;
  markRead: (loungeId: string) => Promise<void>;
  connectionState: 'connected' | 'disconnected' | 'connecting';
  _activeChannel: RealtimeChannel | null;
  _lastMarkReadMap: Record<string, number>;
  abortFetchLounges: () => void;
  abortFetchMessages: () => void;
  syncGlobalAvatar: (userId: string, avatarUrl: string | null) => void;
  syncLatestMessages: (loungeId: string) => Promise<void>;
  clearMessages: (loungeId?: string) => void;
  _pendingLeaveLoungeIds: Set<string>;
}

// ── Realtime Raw Payload ──
export interface RawLoungePayload {
  id: string;
  lounge_id: string;
  user_id: string;
  content: string;
  type: string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_content?: string | null;
  film_id?: number | null;
  film_title?: string | null;
  film_poster?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

// ── Constants ──
export const CREATE_COOLDOWN = 30000; // 30s between lounge creations
export const MAX_RECONNECT_ATTEMPTS = 10;
export const RECONNECT_BASE_MS = 1000;   // 1s initial backoff
export const RECONNECT_MAX_MS = 30000;   // 30s max backoff
export const MESSAGE_DEDUP_CAP = 5000;
export const MESSAGE_DEDUP_RETAIN = 3000;
