/**
 * watchChannel — what a live channel's status means for the screen it feeds (P4.8, P4.10).
 *
 * A live channel that dropped and came back said nothing: what was said in the gap was never
 * read, and a channel that stayed down left its screen silently stale, the network up all along.
 * Every channel hands its status here:
 *
 *   - SUBSCRIBED again after a break: what was missed is read again (`reread`);
 *   - broken (CHANNEL_ERROR, TIMED_OUT, CLOSED) for longer than a beat: the screen is told it is
 *     not live (`onLive(false)`), and it is read again on one fixed interval until the channel is
 *     back, when both stop. No read is tried while the phone is offline.
 */
import { onlineManager } from '@tanstack/react-query';

/** A drop shorter than this is the channel finding its feet again: nothing is said. */
export const NOT_LIVE_GRACE_MS = 5_000;
/** How often a screen not live is read again: one request's own time limit (REQUEST_LIMIT_MS), so reads never overlap. */
export const NOT_LIVE_REREAD_MS = 15_000;

const BROKEN = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

export function watchChannel({ reread, onLive }: { reread: () => void; onLive: (live: boolean) => void }) {
  let broken = false;
  let ended = false;
  let grace: ReturnType<typeof setTimeout> | undefined;
  let again: ReturnType<typeof setInterval> | undefined;

  const readIfOnline = () => { if (onlineManager.isOnline()) reread(); };
  const quiet = () => {
    clearTimeout(grace);
    clearInterval(again);
    grace = undefined;
    again = undefined;
  };

  /** The channel's status, as `.subscribe(` hands it. */
  const status = (s: string) => {
    if (ended) return;
    if (s === 'SUBSCRIBED') {
      quiet();
      onLive(true);
      if (broken) { broken = false; readIfOnline(); }
      return;
    }
    if (!BROKEN.has(s) || broken) return;
    broken = true;
    grace = setTimeout(() => {
      onLive(false);
      readIfOnline();
      again = setInterval(readIfOnline, NOT_LIVE_REREAD_MS);
    }, NOT_LIVE_GRACE_MS);
  };

  /** The channel left on purpose: nothing more is read or said. */
  const end = () => {
    ended = true;
    quiet();
  };

  return { status, end };
}
