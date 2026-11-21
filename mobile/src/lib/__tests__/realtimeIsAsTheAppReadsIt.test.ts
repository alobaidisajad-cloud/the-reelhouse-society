/**
 * realtimeIsAsTheAppReadsIt.test.ts — the real realtime-js, as openChannel and the salon's tests read it.
 * ─────────────────────────────────────────────────────────────────────────────
 * openChannel opens a topic again only once its last leave is answered, shares one channel between
 * two holders, and never subscribes a channel twice. Review round 9 found the room deaf because the
 * library's real behaviour had never been met: the salon's tests stand a model of the client in for
 * it (aSalonJoinedAgainHearsTheRoom.test.ts). Here the package the app ships runs whole, over a
 * stand-in for the house's socket (the Phoenix protocol, version 1.0.0's JSON), and what it really
 * does is pinned: a topic's channel is handed back while held; a leave closes the channel at once,
 * lets the topic go and answers 'ok' without waiting for the house, and the next join goes out after
 * it on the same socket; a second subscribe asks nothing; listeners added after a join are refused.
 * A version that behaves otherwise fails here before openChannel and the model are trusted.
 */
const { RealtimeClient } = jest.requireActual('@supabase/realtime-js') as typeof import('@supabase/realtime-js');

type Frame = { topic: string; event: string; payload: Record<string, unknown>; ref: string | null; join_ref?: string | null };

/** The house's socket: answers each join at once, and each leave only when the test says. */
class House {
  static last: House | null = null;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  binaryType = 'arraybuffer';
  frames: Frame[] = [];
  leaves: (() => void)[] = [];
  constructor(public url: string) {
    House.last = this;
    setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0);
  }
  send(data: string) {
    const f = JSON.parse(data) as Frame;
    this.frames.push(f);
    const reply = () => this.onmessage?.({ data: JSON.stringify({
      topic: f.topic, event: 'phx_reply', ref: f.ref, join_ref: f.join_ref ?? null,
      payload: { status: 'ok', response: f.event === 'phx_join' ? { postgres_changes: [] } : {} },
    }) });
    if (f.event === 'phx_join') setTimeout(reply, 0);
    else if (f.event === 'phx_leave') this.leaves.push(reply);
    else if (f.event === 'heartbeat') setTimeout(reply, 0);
  }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
}

/** The socket opened and every answer due has come: the library's own timers, run out. */
const settle = () => jest.advanceTimersByTimeAsync(20);

describe('realtime-js, run whole', () => {
  let client: InstanceType<typeof RealtimeClient>;
  beforeEach(() => {
    jest.useFakeTimers();
    client = new RealtimeClient('ws://house.test/realtime/v1', {
      transport: House as unknown as typeof WebSocket, vsn: '1.0.0', params: { apikey: 'anon' }, heartbeatIntervalMs: 60_000,
    });
  });
  // The library keeps its own timers (a push's time limit, a close's fallback): run out with the test.
  afterEach(async () => {
    House.last?.leaves.forEach((answer) => answer());
    await client.disconnect();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('hands back the channel already holding a topic', () => {
    const first = client.channel('lounge-1');
    expect(client.channel('lounge-1') === first).toBe(true);
  });

  it('closes a channel as its leave is asked, lets its topic go at once, and answers the leave without the house', async () => {
    const first = client.channel('lounge-1');
    first.subscribe();
    await settle();
    expect(first.state).toBe('joined');
    const left = client.removeChannel(first);
    await settle();
    // The house has not answered the leave, and removeChannel has: 'ok', the channel closed, its topic free.
    expect(House.last!.leaves).toHaveLength(1);
    expect(await left).toBe('ok');
    expect(first.state).toBe('closed');
    const next = client.channel('lounge-1');
    expect(next === first).toBe(false);
    // The next join of the topic goes out on the same socket after the leave: the house hears them in order.
    next.subscribe();
    await settle();
    const order = House.last!.frames.filter((f) => f.topic === 'realtime:lounge-1').map((f) => f.event);
    expect(order).toEqual(['phx_join', 'phx_leave', 'phx_join']);
  });

  it('joins only a closed channel: a second subscribe asks the house nothing', async () => {
    const ch = client.channel('lounge-2');
    ch.subscribe();
    await settle();
    const joins = () => House.last!.frames.filter((f) => f.event === 'phx_join' && f.topic === 'realtime:lounge-2').length;
    expect(joins()).toBe(1);
    try { ch.subscribe(); } catch { /* refused whichever way it says so */ }
    await settle();
    expect(joins()).toBe(1);
  });

  it('refuses listeners added to a channel already joined, as openChannel shares one rather than opening twice', async () => {
    const ch = client.channel('lounge-3');
    ch.subscribe();
    await settle();
    expect(() => ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lounge_messages' }, () => undefined)).toThrow();
  });
});
