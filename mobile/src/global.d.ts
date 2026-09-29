/**
 * global.d.ts — globals the runtime provides that the types do not declare.
 */
declare global {
    /** Hermes engine GC — exposed when debugger is attached or via `--expose-gc` */
    var gc: (() => void) | undefined;
}

export {};
