/**
 * useScreenReady — the mark a screen hands Sentry, and the line the E2E build
 * writes, when the screen's content is in.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { render } from '@testing-library/react-native';
import { useScreenReady } from '../useScreenReady';

const mockTrace = jest.fn();
jest.mock('@/src/utils/e2eTrace', () => ({ e2eTrace: (...a: unknown[]) => mockTrace(...a) }));

function Screen({ ready }: { ready: boolean }) {
  const mark = useScreenReady('lobby', ready);
  // Two different trees, as a screen with an early return has: the mark goes in both.
  return ready ? <View>{mark}</View> : <>{mark}</>;
}

type Node = { type: string; props: Record<string, unknown>; children: Node[] | null };

/** Sentry's full-display reporter (drawn as a host element in tests), and what holds it. */
function reporter(r: ReturnType<typeof render>): { node: Node; holder: Node } {
  const find = (n: Node, parent: Node): { node: Node; holder: Node } | null => {
    if (n.type === 'SentryFullDisplay') return { node: n, holder: parent };
    for (const c of n.children ?? []) {
      if (typeof c === 'object') { const got = find(c, n); if (got) return got; }
    }
    return null;
  };
  const root = r.toJSON() as unknown as Node;
  const got = find(root, root);
  if (!got) throw new Error('no reporter drawn');
  return got;
}
const handed = (r: ReturnType<typeof render>) => reporter(r).node.props.ready;

beforeEach(() => mockTrace.mockClear());

describe('useScreenReady', () => {
  it('hands Sentry "not yet" while the content is loading, and writes nothing', () => {
    const r = render(<Screen ready={false} />);
    expect(handed(r)).toBe(false);
    expect(mockTrace).not.toHaveBeenCalled();
  });

  it('hands Sentry "ready" once the content is in, and writes how long it took, once', () => {
    // Timed from the screen's first render, across the loading branch giving way.
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const r = render(<Screen ready={false} />);
    now.mockReturnValue(1_600);
    r.rerender(<Screen ready />);
    now.mockRestore();
    expect(handed(r)).toBe(true);
    expect(mockTrace).toHaveBeenCalledTimes(1);
    const [event, detail] = mockTrace.mock.calls[0];
    expect(event).toBe('screen.ready');
    expect(detail.name).toBe('lobby');
    expect(detail.ms).toBe(600);

    r.rerender(<Screen ready />);
    expect(mockTrace).toHaveBeenCalledTimes(1);
  });

  it('takes no room in the screen it sits in', () => {
    const r = render(<Screen ready />);
    const { holder } = reporter(r);
    const style = StyleSheet.flatten(holder.props.style as never);
    expect(style).toMatchObject({ position: 'absolute', width: 0, height: 0 });
    expect(holder.props.pointerEvents).toBe('none');
  });
});
