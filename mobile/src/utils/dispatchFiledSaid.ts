/**
 * dispatchFiledSaid.ts — what a Dispatch desk says of a filing it sent, in the Dispatch's paper voice.
 *
 * The store's file answers whether the house took it, kept it for the wire (`offline`), or kept it
 * because the house asked for a longer wait than a send waits (`paced`, check_write_pace). A filing
 * kept for the pace goes once the house takes more, and is never said as the wire's.
 */
export function filedSaid(filed: { offline?: boolean; paced?: boolean } | null | undefined, done: string): string {
  if (filed?.paced) return 'Filed. It goes out once the house takes more.';
  return filed?.offline ? 'Filed. It goes out when the wire is back.' : done;
}
