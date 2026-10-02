/**
 * refusalEvents — the sentence of every refusal the server sends (HTTP 403),
 * for whoever needs to hear it.
 *
 * The Supabase client tells it (supabase.ts); standing.ts listens, so a write
 * refused because the member was suspended a moment ago brings the notice up
 * whichever screen made it. Its own module, importing nothing, so neither of
 * the two has to import the other.
 */
const listeners = new Set<(message: string) => void>();

export function onRefusal(listener: (message: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function heardRefusal(message: string): void {
  for (const listener of listeners) {
    try { listener(message); } catch { /* one listener's fault is not the request's */ }
  }
}
