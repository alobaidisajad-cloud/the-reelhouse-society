/**
 * useTribunalWaiting — the Tribunal door's count in Settings: the cases waiting, and the appeals this
 * admin may hear (round 14).
 *
 * It was read once, in a mount effect, outside the query cache: Settings stays mounted beneath the
 * Tribunal, so the five cases judged there stayed "· 5 WAITING" on return. It is read through the
 * query cache now, under the key the Tribunal reads again after every verdict, dismissal, appeal heard
 * and ban lifted (['admin', 'tribunal-waiting']); and read again each time Settings is come back to,
 * for what another moderator judged meanwhile. A failed read gives no number: the door opens without.
 */
import { useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { ModerationService } from '@/src/services/ModerationService';

export function useTribunalWaiting(adminId: string | null | undefined, isAdmin: boolean): number {
  const door = useQuery({
    queryKey: ['admin', 'tribunal-waiting', adminId],
    queryFn: () => ModerationService.getTribunalWaiting(),
    enabled: isAdmin && !!adminId,
  });
  const reread = door.refetch;
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    // The first focus is the mount, which reads it already.
    if (focused.current && isAdmin) void reread();
    focused.current = true;
  }, [isAdmin, reread]));
  return door.data ? door.data.cases + door.data.appeals : 0;
}
