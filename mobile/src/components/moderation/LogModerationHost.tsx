/**
 * The Tribunal's sheets for a log in a list: one pair for the whole screen, never a pair hidden
 * in every frame. A frame's ··· asks for them with the log and its author (askAboutLog); the
 * host, mounted once beside the list, opens the same ContentActionSheet and ReportSheet the log
 * page opens, with the same block and mute.
 */
import React, { useState } from 'react';
import { create } from 'zustand';
import { ContentActionSheet } from '@/src/components/moderation/ContentActionSheet';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import { useBlockStore } from '@/src/stores/blockStore';
import { registerStoreReset } from '@/src/stores/resetAllStores';

interface LogAsked { logId: string; userId: string; username: string }

const useAsked = create<{ asked: LogAsked | null; ask: (log: LogAsked) => void; done: () => void }>((set) => ({
  asked: null,
  ask: (log) => set({ asked: log }),
  done: () => set({ asked: null }),
}));

// A sheet asked for by one member is never opened for the next on this phone.
registerStoreReset(() => { useAsked.getState().done(); });

/** A frame's ···: the Tribunal's sheet for this log and its author. */
export const askAboutLog = (log: LogAsked) => useAsked.getState().ask(log);

export function LogModerationHost() {
  const asked = useAsked((s) => s.asked);
  const done = useAsked((s) => s.done);
  const blockUser = useBlockStore((s) => s.blockUser);
  const muteUser = useBlockStore((s) => s.muteUser);
  // The report form outlives the sheet that opened it: the log it is about is kept apart.
  const [reporting, setReporting] = useState<LogAsked | null>(null);
  return (
    <>
      {asked ? (
        <ContentActionSheet
          visible
          targetUserId={asked.userId}
          targetUsername={asked.username}
          contentType="log"
          contentId={asked.logId}
          onClose={done}
          onReport={() => { setReporting(asked); done(); }}
          // The store rolls a refused block or mute back and says so itself: nothing here waits on it.
          onBlock={() => { void blockUser(asked.userId); done(); }}
          onMute={() => { void muteUser(asked.userId); done(); }}
        />
      ) : null}
      {reporting ? (
        <ReportSheet
          visible
          contentType="log"
          contentId={reporting.logId}
          targetUserId={reporting.userId}
          targetUsername={reporting.username}
          onDismiss={() => setReporting(null)}
        />
      ) : null}
    </>
  );
}
