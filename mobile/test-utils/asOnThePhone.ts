/**
 * asOnThePhone — takes away, in the tests' engine, each API the phone's runtime
 * lacks (src/utils/runtimeLacks.json), so a call to one fails in jest as it
 * fails on the phone. A call to AbortSignal.timeout threw "undefined is not a
 * function" on the iPhone and the Dispatch never loaded, while every test
 * passed. jest.setup.ts calls it with that list and nothing else, so the list
 * the finder reads and the one jest removes cannot drift
 * (runtimeLacks.guard.test.ts).
 */
export interface LackedApi { api: string }

/** Each API made undefined where it stands; the ones removed, in the list's order. */
export function removeWhatThePhoneLacks(lacks: LackedApi[], root: Record<string, unknown> = globalThis as never): string[] {
  const removed: string[] = [];
  for (const { api } of lacks) {
    const parts = api.split('.');
    let holder: Record<string, unknown> | undefined;
    if (parts.length === 2 && parts[0] === 'globalThis') holder = root;
    else if (parts.length === 2) holder = root[parts[0]] as Record<string, unknown> | undefined;
    else if (parts.length === 3 && parts[1] === 'prototype') {
      holder = (root[parts[0]] as { prototype?: Record<string, unknown> } | undefined)?.prototype;
    } else throw new Error(`${api}: not Name.member, Name.prototype.member or globalThis.Name`);
    if (!holder) continue;
    Object.defineProperty(holder, parts[parts.length - 1], { value: undefined, configurable: true, writable: true });
    removed.push(api);
  }
  return removed;
}
