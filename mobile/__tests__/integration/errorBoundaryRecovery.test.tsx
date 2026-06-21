/**
 * errorBoundaryRecovery.test.tsx — Integration: ErrorBoundary Retry & Recovery
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises the REAL ErrorBoundary component with controlled error throwing to verify:
 *   1. Render with error → retry → children render successfully
 *   2. retryCount resets after successful recovery (stability timer)
 *
 * Uses react-test-renderer directly to access the ErrorBoundary class instance
 * for invoking handleRetry, since the custom RNTL wrapper in this project does
 * not support fireEvent.
 */

import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import ErrorBoundary from '@/src/components/ErrorBoundary';

// ── Mock dependencies BEFORE importing ErrorBoundary ─────────────────────────

jest.mock('@/src/lib/sentry', () => ({
  captureError: jest.fn(),
}));

jest.mock('@/src/lib/queryClient', () => ({
  queryClient: { clear: jest.fn() },
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

// Mock PressableScale to a simple View (we invoke handleRetry directly)
jest.mock('@/src/components/PressableScale', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => {
      const { children, accessibilityLabel, style } = props;
      return React.createElement(View, { ref, accessibilityLabel, testID: 'retry-btn', style }, children);
    }),
  };
});

// Suppress React error boundary console.error noise
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

// ── Helper: Controllable error-throwing component ────────────────────────────

let shouldThrow = true;

function UnstableChild() {
  if (shouldThrow) {
    throw new Error('Render crash');
  }
  return <Text testID="child-content">App is working</Text>;
}

// ── Helper to find text in tree ─────────────────────────────────────────────

function getAllTextContent(root: TestRenderer.ReactTestInstance): string[] {
  const texts: string[] = [];
  try {
    const allTexts = root.findAllByType(Text as any);
    for (const node of allTexts) {
      const children = node.props.children;
      if (typeof children === 'string') texts.push(children);
      else if (Array.isArray(children)) {
        texts.push(children.filter((c: unknown) => typeof c === 'string').join(''));
      }
    }
  } catch { /* empty tree */ }
  return texts;
}

function hasText(root: TestRenderer.ReactTestInstance, text: string | RegExp): boolean {
  const allText = getAllTextContent(root);
  if (typeof text === 'string') return allText.includes(text);
  return allText.some(t => text.test(t));
}

function findByTestId(root: TestRenderer.ReactTestInstance, testID: string): TestRenderer.ReactTestInstance | null {
  try {
    return root.findByProps({ testID });
  } catch {
    return null;
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ErrorBoundary Recovery Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    shouldThrow = true;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('render with error → retry → children render successfully', () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    // 1. Initial render: component throws — ErrorBoundary catches it
    act(() => {
      renderer = TestRenderer.create(
        <ErrorBoundary>
          <UnstableChild />
        </ErrorBoundary>
      );
    });

    const root = renderer.root;

    // Verify: fallback screen is shown
    expect(hasText(root, 'PROJECTION FAILURE')).toBe(true);
    expect(findByTestId(root, 'child-content')).toBeNull();

    // Verify: retry button shows correct count
    expect(hasText(root, /RETRY SCREENING \(3 left\)/)).toBe(true);

    // 2. Fix the error condition
    shouldThrow = false;

    // 3. Invoke handleRetry directly on the ErrorBoundary instance
    const ebInstance = root.findByType(ErrorBoundary as any).instance as InstanceType<typeof ErrorBoundary>;
    act(() => {
      ebInstance.handleRetry();
    });

    // 4. Verify: children now render successfully
    expect(hasText(root, 'App is working')).toBe(true);
    expect(findByTestId(root, 'child-content')).not.toBeNull();
  });

  it('retryCount resets after successful recovery (stability timer)', () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    // 1. Initial render: component throws
    act(() => {
      renderer = TestRenderer.create(
        <ErrorBoundary>
          <UnstableChild />
        </ErrorBoundary>
      );
    });

    const root = renderer.root;

    // Verify error state
    expect(hasText(root, 'PROJECTION FAILURE')).toBe(true);

    // 2. Fix error and retry
    shouldThrow = false;
    const ebInstance = root.findByType(ErrorBoundary as any).instance as InstanceType<typeof ErrorBoundary>;
    act(() => {
      ebInstance.handleRetry();
    });

    // Verify recovery
    expect(hasText(root, 'App is working')).toBe(true);

    // 3. Wait for stability timer to reset retryCount (3 seconds)
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // 4. Trigger another error to verify count was reset
    shouldThrow = true;

    // Force re-render — the child will throw again
    act(() => {
      renderer.update(
        <ErrorBoundary>
          <UnstableChild />
        </ErrorBoundary>
      );
    });

    // 5. Verify: retryCount was reset — shows full 3 retries
    // After stability timer fires, retryCount resets to 0.
    // getDerivedStateFromError sets hasError=true but doesn't touch retryCount.
    // display = MAX_RETRIES - retryCount = 3 - 0 = 3 left
    expect(hasText(root, /RETRY SCREENING \(3 left\)/)).toBe(true);

    // 6. Fix and retry again — should still work (not exhausted)
    shouldThrow = false;
    act(() => {
      ebInstance.handleRetry();
    });
    expect(hasText(root, 'App is working')).toBe(true);
  });
});
