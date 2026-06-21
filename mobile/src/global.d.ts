/**
 * global.d.ts — Type Augmentations for Hermes/React Native Globals
 * ────────────────────────────────────────────────────────────────
 * Eliminates `(global as any)` casts by properly declaring
 * the Hermes engine's `onunhandledrejection` API on the global scope.
 */

 
declare global {
    var onunhandledrejection: ((event: { reason: unknown }) => void) | undefined;
    /** Hermes engine GC — exposed when debugger is attached or via `--expose-gc` */
    var gc: (() => void) | undefined;
}

export {};
