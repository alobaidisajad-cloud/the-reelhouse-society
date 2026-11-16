/**
 * heldClient — the shared fake's client (test-utils/supabaseFake), each answer held until the test
 * lets it go.
 *
 * The fake answers at once, so a test of what a screen shows WHILE the house is asked, or of two
 * answers arriving in an order of the test's choosing (a late answer from before a change), had to
 * hand-roll a client that answers anything. Here every query is still the fake's, as strict as
 * production; its answer is worked out when it is asked (the house as it stood then) and handed
 * back only when the test releases it.
 *
 *   const mockHouse = supabaseFake({ rows: { ... } });
 *   const mockHeld = heldClient(mockHouse.client);
 *   jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));
 *   await mockHeld.release('profiles');   // the oldest answer waiting from that table
 */
type Waiting = { table: string; go: () => void };

export function heldClient<C extends { from: (table: string) => unknown }>(client: C) {
  const waiting: Waiting[] = [];

  /** Worked out now, handed back on release. */
  const hold = <T>(table: string, asked: PromiseLike<T>): Promise<T> => {
    const answered = Promise.resolve(asked);
    return new Promise<T>((resolve, reject) => {
      waiting.push({ table, go: () => { answered.then(resolve, reject); } });
    });
  };

  const wrap = (table: string, query: object): object => new Proxy(query, {
    get(target, key) {
      const own = (target as Record<PropertyKey, unknown>)[key];
      if (key === 'then') {
        return (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          hold(table, { then: (a, b) => (target as PromiseLike<unknown>).then(a, b) }).then(res, rej);
      }
      if (typeof own !== 'function') return own;
      return (...args: unknown[]) => {
        const out = (own as (...a: unknown[]) => unknown).apply(target, args);
        if (out && typeof (out as PromiseLike<unknown>).then === 'function') {
          // A step of the query (the same builder), or a terminal answer (single, maybeSingle).
          return out === target || typeof (out as Record<string, unknown>).select === 'function'
            ? wrap(table, out as object)
            : hold(table, out as PromiseLike<unknown>);
        }
        return out;
      };
    },
  });

  const held = new Proxy(client, {
    get(target, key) {
      if (key === 'from') return (table: string) => wrap(table, target.from(table) as object);
      return (target as Record<PropertyKey, unknown>)[key];
    },
  }) as C;

  /** Until a query of this table is waiting: some promise turns after the call that asks it. */
  const waitFor = async (table: string): Promise<number> => {
    for (let i = 0; i < 50; i++) {
      const at = waiting.findIndex((w) => w.table === table);
      if (at >= 0) return at;
      await Promise.resolve();
    }
    throw new Error(`nothing is waiting on ${table}`);
  };

  return {
    client: held,
    /** How many answers are held, from one table or all. */
    count: (table?: string) => waiting.filter((w) => !table || w.table === table).length,
    /** Lets go the oldest answer waiting from this table (the `n`th, from 0), and lets it land. */
    release: async (table: string, n = 0) => {
      await waitFor(table);
      const mine = waiting.map((w, i) => [w, i] as const).filter(([w]) => w.table === table);
      const pick = mine[n];
      if (!pick) throw new Error(`no answer ${n} waiting on ${table}`);
      waiting.splice(pick[1], 1);
      pick[0].go();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
    /** Lets every answer go, oldest first, and each one asked after them, until none comes. */
    releaseAll: async () => {
      for (;;) {
        for (let i = 0; i < 50 && waiting.length === 0; i++) await Promise.resolve();
        const w = waiting.shift();
        if (!w) return;
        w.go();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      }
    },
  };
}
