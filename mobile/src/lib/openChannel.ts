/**
 * openChannel — a live channel opened under a name it was just closed under waits for that close.
 *
 * realtime-js hands back the channel already holding a topic (RealtimeClient.channel), and a channel
 * being left keeps its topic until the house answers the leave; subscribe() joins only a closed one.
 * A salon joined again in the same render (a seat taken, a mute, a seat lost) was handed its channel
 * on the way out: nothing joined, no status came, and the room heard nothing while it said it was
 * live (review round 9). The notices' channel, closed for one member and opened for the next, is
 * the same shape.
 *
 * Two holders of one topic at once (two copies of one salon on the stack) share ONE channel: the
 * second is never handed to `open`, which would add listeners to a channel already joined (realtime-js
 * refuses that, it throws), and the channel is left only when its last holder closes. One holder
 * leaving never removes the channel the other still listens on (review round 12).
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Each topic's last leave, until the house has answered it. */
const leaving = new Map<string, Promise<void>>();

/** Each topic's open channel, and how many holders are listening on it. */
interface Held { channel: RealtimeChannel; holders: number }
const held = new Map<string, Held>();

/**
 * Opens `topic` through `open` once its last leave is answered (at once when there is none), and
 * returns the close. A topic already open is shared, not opened again. A close before the open never
 * opens it; a second close does nothing.
 */
export function openChannel(topic: string, open: (topic: string) => RealtimeChannel): () => void {
  let mine: Held | null = null;
  let closed = false;
  const start = () => {
    if (closed) return;
    const there = held.get(topic);
    if (there) {
      there.holders += 1;
      mine = there;
      return;
    }
    mine = { channel: open(topic), holders: 1 };
    held.set(topic, mine);
  };
  const before = leaving.get(topic);
  if (before) void before.then(start); else start();
  return () => {
    if (closed) return;
    closed = true;
    const h = mine;
    mine = null;
    if (!h) return;
    h.holders -= 1;
    // Another holder still listens on it: it stays open for them.
    if (h.holders > 0) return;
    if (held.get(topic) === h) held.delete(topic);
    const channel = h.channel;
    // Promise.resolve: an answer that is no promise (a stand-in client) is a leave already answered.
    const left: Promise<void> = Promise.resolve(supabase.removeChannel(channel)).then(
      () => { if (leaving.get(topic) === left) leaving.delete(topic); },
      () => { if (leaving.get(topic) === left) leaving.delete(topic); },
    );
    leaving.set(topic, left);
  };
}
