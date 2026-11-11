/**
 * e2eRuntime — the phone's own JavaScript runtime, written to the device log
 * once, by the sealed E2E build alone (e2eTrace is silent in every other build).
 *
 * The own property names of the global object and of each built-in the app
 * touches (`reads` in runtimeLacks.json): Hermes, with React Native's polyfills
 * and the app's own, as a member's phone runs it. e2e/runtime-dump.mjs holds the
 * run to the committed copy, and runtimeDump.contract.test.ts holds that copy
 * against Node and the list of what the phone lacks.
 *
 * A log line is cut near 4,000 bytes, so each built-in's names go out in parts:
 *   [e2e] runtime {"of":"globalThis","part":1,"parts":2,"names":[…]}
 */
import { E2E_BUILD, e2eTrace } from './e2eTrace';
import runtime from './runtimeLacks.json';

/**
 * Each path's own property names, sorted; null when the path is not there.
 * Plain on purpose: the contract test runs this same function on Node.
 */
export function runtimeNames(paths: string[]): Record<string, string[] | null> {
  const out: Record<string, string[] | null> = {};
  for (let i = 0; i < paths.length; i++) {
    const keys = paths[i] === 'globalThis' ? [] : paths[i].split('.');
    let at: unknown = globalThis;
    for (let k = 0; k < keys.length && at != null; k++) at = (at as Record<string, unknown>)[keys[k]];
    out[paths[i]] = at == null ? null : Object.getOwnPropertyNames(at).sort();
  }
  return out;
}

/** The most names' characters one log line carries, well inside logcat's cut. */
export const PART_CHARS = 2500;

/** One built-in's names as the lines that carry them, each under PART_CHARS of names. */
export function runtimeLines(of: string, names: string[] | null): Record<string, unknown>[] {
  if (names === null) return [{ of, part: 1, parts: 1, names: null }];
  const parts: string[][] = [[]];
  let size = 0;
  for (const name of names) {
    const cost = JSON.stringify(name).length + 1;
    if (size + cost > PART_CHARS && parts[parts.length - 1].length > 0) { parts.push([]); size = 0; }
    parts[parts.length - 1].push(name);
    size += cost;
  }
  return parts.map((p, i) => ({ of, part: i + 1, parts: parts.length, names: p }));
}

let written = false;

/** Writes the runtime once per launch, in the E2E build alone; the first screen calls it. */
export function traceRuntimeOnce(): void {
  if (written || !E2E_BUILD) return;
  written = true;
  const all = runtimeNames(runtime.reads);
  for (const of of runtime.reads) {
    for (const line of runtimeLines(of, all[of])) e2eTrace('runtime', line);
  }
}
