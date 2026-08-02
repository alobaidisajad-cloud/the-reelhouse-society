/**
 * Types for the sync-render shim in react-native-testing-library.js.
 * ─────────────────────────────────────────────────────────────────────────────
 * jest.config.js maps '@testing-library/react-native' to that shim, which
 * re-implements `render` SYNCHRONOUSLY (RNTL v14 + React 19 made it async).
 * TypeScript does not read Jest's moduleNameMapper, so it was type-checking every
 * test against the REAL package — where `render` returns a Promise. That single
 * mismatch produced 73 of the 174 errors hiding behind the tsconfig exclusion:
 * "Property 'getByText' does not exist on type 'Promise<...>'", 73 times, in
 * tests that pass perfectly well at runtime.
 *
 * A matching `paths` entry in tsconfig.json points TypeScript here, so the type
 * checker and the test runner finally describe the same function.
 *
 * Nothing here invents a shape. The real package already exports RenderResult as
 * `Awaited<ReturnType<typeof render>>` — the resolved, synchronous object — so
 * this reuses it rather than restating it, and a future RNTL upgrade that changes
 * the query set flows through automatically.
 *
 * ⚠️ This file describes react-native-testing-library.js. If the shim's return
 * value changes, change this too — they are one unit.
 */

import type * as React from 'react';
import type { RenderOptions, RenderResult } from '@testing-library/react-native/dist/render';

// Everything the shim passes straight through from the real package
// (`module.exports = { ...actual, render: renderSync }`): act, cleanup,
// fireEvent, waitFor, within, screen, renderHook, userEvent, and the types.
// renderHook is deliberately NOT overridden — it is genuinely still the real
// one, and type-checking the tests produced zero renderHook errors.
export * from '@testing-library/react-native/dist/pure';

/**
 * What renderSync actually hands back: the same queries and helpers, resolved,
 * with `rerender` and `unmount` synchronous because the shim wraps them in a
 * plain `React.act()` rather than awaiting one.
 */
export type SyncRenderResult = Omit<RenderResult, 'rerender' | 'unmount'> & {
  rerender: (component: React.ReactElement) => void;
  unmount: () => void;
};

/**
 * The shim's synchronous render. Explicitly declared so it shadows the async
 * `render` that arrives via the `export *` above — in TypeScript an explicit
 * named export always wins over a star re-export.
 */
export declare function render<T>(
  element: React.ReactElement<T>,
  options?: RenderOptions,
): SyncRenderResult;
