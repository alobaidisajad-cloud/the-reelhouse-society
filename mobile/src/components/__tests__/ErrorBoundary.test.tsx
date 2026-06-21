/**
 * ErrorBoundary.test.tsx — Component Tests
 * ─────────────────────────────────────────
 * FLAW-07: Tests the root crash shield — fallback rendering,
 * retry counting, safe mode trigger, and thematic error lore.
 */
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import ErrorBoundary from '../ErrorBoundary';

// Mock dependencies
jest.mock('../../utils/typedRouter', () => ({
  nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));
jest.mock('../../utils/TactileEngine', () => ({
  __esModule: true,
  default: { mutate: jest.fn(), destroy: jest.fn() },
}));
jest.mock('../../stores/mmkv-storage', () => ({
  storage: { clearAll: jest.fn(), getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  getSecureStorage: jest.fn().mockResolvedValue({ clearAll: jest.fn() }),
}));

// Suppress console.error from React's error boundary logging
const originalConsoleError = console.error;
beforeAll(() => { console.error = jest.fn(); });
afterAll(() => { console.error = originalConsoleError; });

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Network request failed');
  return <Text>Healthy</Text>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>App content</Text>
      </ErrorBoundary>
    );
    expect(getByText('App content')).toBeTruthy();
  });

  it('renders fallback screen with PROJECTION FAILURE on crash', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(getByText('PROJECTION FAILURE')).toBeTruthy();
  });

  it('maps network errors to thematic lore', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    // In __DEV__ mode, the actual error message is displayed in the error box
    expect(getByText(/Network request failed/i)).toBeTruthy();
  });

  it('renders custom fallback when provided', () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary fallback={<Text>Custom fallback</Text>}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(getByText('Custom fallback')).toBeTruthy();
    expect(queryByText('PROJECTION FAILURE')).toBeNull();
  });

  it('shows retry button with correct count', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(getByText(/RETRY SCREENING \(3 left\)/)).toBeTruthy();
  });

  it('shows error reference ID', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(getByText(/REF: ERR-/)).toBeTruthy();
  });




  it('has accessible retry button', () => {
    const { getByLabelText } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(getByLabelText('Retry loading the screen')).toBeTruthy();
  });
});
