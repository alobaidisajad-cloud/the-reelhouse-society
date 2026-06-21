import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import TactileEngine from '@/src/utils/TactileEngine';
import { Alert } from 'react-native';

interface ReportPayload {
  reported_id: string;
  log_id: string;
  reason?: string;
}

export function useReportUser() {
  return useMutation({
    mutationFn: async ({ reported_id, log_id, reason = 'Inappropriate content' }: ReportPayload) => {
      const { error } = await supabase.from('user_reports').insert({
        reported_id,
        log_id,
        reason,
      });

      if (error) {
        if (error.code === '42900') {
           throw new Error(error.message); // Rate limit exception from Trigger
        }
        throw error;
      }
    },
    onSuccess: () => {
      TactileEngine.success();
    },
    onError: (error) => {
      TactileEngine.error();
      Alert.alert("Report Failed", error.message || "Failed to submit report. You may be submitting reports too quickly.");
    }
  });
}
