/**
 * Minimal types for react-test-renderer.
 * ─────────────────────────────────────────────────────────────────────────────
 * The package ships no types of its own, so once the test files were finally
 * type-checked `import TestRenderer from 'react-test-renderer'` became an implicit
 * `any` under `strict` — the last of the 174 errors that the tsconfig exclusion had
 * been hiding.
 *
 * WHY NOT @types/react-test-renderer: react-test-renderer is deprecated as of React
 * 19 (this project is on 19.1.0), and its DefinitelyTyped package tracks the older
 * React 18 shape. Pulling in types that describe a different version to trade one
 * kind of wrongness for another is not an improvement.
 *
 * So this declares exactly what __tests__/integration/errorBoundaryRecovery.test.tsx
 * actually calls, and nothing more. That file reaches for the renderer directly
 * because it needs the ErrorBoundary CLASS INSTANCE to drive componentDidCatch,
 * which the testing-library wrapper deliberately does not expose.
 *
 * ⚠️ If a test starts using more of this API, widen it here rather than reaching for
 * `any` — an unchecked import is what let this sit unnoticed in the first place.
 */
declare module 'react-test-renderer' {
  import type * as React from 'react';

  namespace TestRenderer {
    interface ReactTestInstance {
      instance: unknown;
      type: React.ElementType;
      props: Record<string, unknown>;
      parent: ReactTestInstance | null;
      children: (ReactTestInstance | string)[];
      find(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance;
      findByType(type: React.ElementType): ReactTestInstance;
      findByProps(props: Record<string, unknown>): ReactTestInstance;
      findAllByType(type: React.ElementType): ReactTestInstance[];
      findAllByProps(props: Record<string, unknown>): ReactTestInstance[];
    }

    interface ReactTestRenderer {
      root: ReactTestInstance;
      toJSON(): unknown;
      update(element: React.ReactElement): void;
      unmount(): void;
    }

    function create(element: React.ReactElement, options?: unknown): ReactTestRenderer;
    function act(callback: () => void | Promise<void>): void;
  }

  export = TestRenderer;
}
