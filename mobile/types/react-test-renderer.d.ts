/**
 * Minimal types for react-test-renderer, which ships none. Not
 * @types/react-test-renderer: the renderer is deprecated in React 19 (this app's),
 * and those types describe React 18's.
 *
 * Exactly what __tests__/integration/errorBoundaryRecovery.test.tsx calls: it needs
 * the ErrorBoundary's CLASS INSTANCE, which the testing library does not expose. A
 * test that uses more widens this, never `any`.
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
