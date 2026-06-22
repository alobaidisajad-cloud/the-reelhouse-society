/**
 * reportStore.ts — Report Submission Store (Society Report System)
 * ────────────────────────────────────────────────────────────────
 * Manages report submission state, offline queueing via MMKV,
 * and session-level duplicate prevention.
 *
 * Architecture:
 *   • Zod validation before any submission attempt
 *   • Online: direct Supabase RPC call
 *   • Offline / network failure fallback: enqueue to offlineQueue
 *   • Duplicate prevention via in-memory Set of content_ids
 *   • Optional block toggle delegates to BlockStore
 *   • Haptic + toast feedback for all outcome states
 */
import { supabase } from '@/src/lib/supabase';
import { useBlockStore } from '@/src/stores/blockStore';
import { ReportPayloadSchema, type ReportPayload, type ReportResult } from '@/src/types/moderation';
import { logger } from '@/src/utils/logger';
import { isNetworkError } from '@/src/utils/networkError';
import { enqueueMutation } from '@/src/utils/offlineQueue';
import reelToast from '@/src/utils/reelToast';
import NetInfo from '@react-native-community/netinfo';
import TactileEngine from '@/src/utils/TactileEngine';
import { create } from 'zustand';

interface ReportState {
  isSubmitting: boolean;
  recentReports: Set<string>;
  submitReport: (payload: ReportPayload) => Promise<ReportResult>;
  hasReported: (contentId: string) => boolean;
}

export const useReportStore = create<ReportState>()((set, get) => ({
  isSubmitting: false,
  recentReports: new Set<string>(),

  hasReported: (contentId: string) => get().recentReports.has(contentId),

  submitReport: async (payload: ReportPayload): Promise<ReportResult> => {
    // Validate
    const parseResult = ReportPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      return { status: 'error', message: parseResult.error.issues[0]?.message ?? 'Invalid report' };
    }

    // Duplicate check
    if (get().recentReports.has(payload.content_id)) {
      reelToast("You've already reported this content.");
      return { status: 'duplicate', message: "You've already reported this content." };
    }

    set({ isSubmitting: true });

    try {
      const netState = await NetInfo.fetch();

      if (netState.isConnected && netState.isInternetReachable) {
        // Online: submit via RPC
        const { error } = await supabase.rpc('submit_report', {
          p_reporter_id: payload.reporter_id,
          p_content_id: payload.content_id,
          p_content_type: payload.content_type,
          p_reason: payload.reason,
          p_details: payload.details ?? null,
          p_target_user_id: payload.target_user_id,
        });

        if (error) {
          if (error.message?.includes('Rate limit')) {
            reelToast.error('Too many reports. Please wait.');
            return { status: 'error', message: 'Rate limit exceeded' };
          }
          if (isNetworkError(error)) {
            // Fall back to offline queue
            enqueueMutation({ type: 'submit_report', payload: payload as unknown as Record<string, unknown> });
            set(s => ({ recentReports: new Set([...s.recentReports, payload.content_id]) }));
            TactileEngine.success();
            reelToast('Report queued. Will be filed when connected.');
            return { status: 'queued' };
          }
          throw error;
        }

        // Success
        set(s => ({ recentReports: new Set([...s.recentReports, payload.content_id]) }));
        TactileEngine.success();
        reelToast('Report filed. The Tribunal will review.');

        // Handle optional block
        if (payload.block_target && payload.target_user_id) {
          await useBlockStore.getState().blockUser(payload.target_user_id);
        }

        return { status: 'submitted' };
      } else {
        // Offline: enqueue
        enqueueMutation({ type: 'submit_report', payload: payload as unknown as Record<string, unknown> });
        set(s => ({ recentReports: new Set([...s.recentReports, payload.content_id]) }));
        TactileEngine.success();
        reelToast('Report queued. Will be filed when connected.');

        if (payload.block_target && payload.target_user_id) {
          await useBlockStore.getState().blockUser(payload.target_user_id);
        }

        return { status: 'queued' };
      }
    } catch (err) {
      logger.error('[ReportStore] submitReport failed:', err);
      reelToast.error('Unable to file report. Please try again.');
      return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error' };
    } finally {
      set({ isSubmitting: false });
    }
  },
}));
