/**
 * openChannel — a live channel opened under a name it was just closed under waits for that close.
 *
 * realtime-js hands back the channel already holding a topic (RealtimeClient.channel), and a channel
 * being left keeps its topic until the house answers the leave; subscribe() joins only a closed one.
 * A salon joined again in the same render (a seat taken, a mute, a seat lost) was handed its channel
 * on the way out: nothing joined, no status came, and the room heard nothing while it said it was
 * live (review round 9). The notices' channel, closed for one member and opened for the next, is
 * the same shape.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Each topic's last leave, until the house has answered it. */
const leaving = new Map<string, Promise<void>>();

/**
 * Opens `topic` through `open` once its last leave is answered (at once when there is none), and
 * returns the close. A close before the open never opens it.
 */
export function openChannel(topic: string, open: (topic: string) => RealtimeChannel): () => void {
  let channel: RealtimeChannel | null = null;
  let closed = false;
  const start = () => { if (!closed) channel = open(topic); };
  const before = leaving.get(topic);
  if (before) void before.then(start); else start();
  return () => {
    closed = true;
    if (!channel) return;
    // Promise.resolve: an answer that is no promise (a stand-in client) is a leave already answered.
    const left: Promise<void> = Promise.resolve(supabase.removeChannel(channel)).then(
      () => { if (leaving.get(topic) === left) leaving.delete(topic); },
      () => { if (leaving.get(topic) === left) leaving.delete(topic); },
    );
    leaving.set(topic, left);
    channel = null;
  };
}
