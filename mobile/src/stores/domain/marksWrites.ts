/**
 * marksWrites — each write that changes a member's marks (a log filed or taken back, a film
 * saved or taken off), counted. The marks ledger reads again a read one overlapped
 * (marksLedger.ts): what it read may already be older than the write. Its own module, so
 * the slices that write can count without importing the store they are part of.
 */
let writes = 0;

export function markWritten(): void { writes += 1; }

export function marksWritten(): number { return writes; }
