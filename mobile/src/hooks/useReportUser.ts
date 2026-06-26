import { useMutation } from '@tanstack/react-query';
import TactileEngine from '@/src/utils/TactileEngine';
import { Alert } from 'react-native';
import { useReportStore } from '@/src/stores/reportStore';
import { useAuthStore } from '@/src/stores/auth';
import type { ReportReason } from '@/src/types/moderation';

interface ReportPayload {
  reported_id: string;
  log_id: string;
  reason?: ReportReason;
}

/**
 * useReportUser — report a log + its author.
 *
 * HOOK-1 fix: routes through `reportStore.submitReport` → the `submit_report`
 * RPC → the `reports` table (the Tribunal queue admins actually read), with the
 * store's offline-queue fallback. The previous implementation wrote to the
 * separate `user_reports` table, which the Tribunal never reads and whose only
 * effect was a now-removed auto-shadowban — i.e. reports went nowhere.
 */
export function useReportUser() {
  return useMutation({
    mutationFn: async ({ reported_id, log_id, reason = 'inappropriate' }: ReportPayload) => {
      const reporterId = useAuthStore.getState().user?.id;
      if (!reporterId) throw new Error('You must be signed in to report.');

      const result = await useReportStore.getState().submitReport({
        reporter_id: reporterId,           // ignored server-side (auth.uid()), kept for schema compat
        content_id: log_id,
        content_type: 'log',
        reason,
        target_user_id: reported_id,
      });

      if (result.status === 'error') {
        throw new Error(result.message ?? 'Failed to submit report.');
      }
      return result;
    },
    onSuccess: () => {
      TactileEngine.success();
    },
    onError: (error) => {
      TactileEngine.error();
      Alert.alert(
        'Report Failed',
        error instanceof Error ? error.message : 'Failed to submit report. You may be submitting reports too quickly.',
      );
    },
  });
}
