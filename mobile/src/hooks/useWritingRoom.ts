/**
 * useWritingRoom — this screen is a writing room a launch may reopen (src/utils/lastRoom.ts).
 *
 * Entered as it opens and stamped as the app leaves the screen. Forgotten when it closes with the
 * app in front, which is the member leaving it; closed with the app in the background it is the
 * system tearing it down, and it is kept for the launch that follows. `active` false (an edit of
 * a record, which keeps no draft a launch could take up) leaves it out.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { enterRoom, leaveRoom, stampRoom, type RoomName } from '@/src/utils/lastRoom';

export function useWritingRoom(room: RoomName, active = true): void {
  useEffect(() => {
    if (!active) return undefined;
    enterRoom(room);
    const sub = AppState.addEventListener('change', (next) => { if (next !== 'active') stampRoom(); });
    return () => {
      sub.remove();
      if (AppState.currentState === 'active') leaveRoom(room);
    };
  }, [room, active]);
}
