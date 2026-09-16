/**
 * theCounterNamesNobody.test.ts — the funnel's destination, executed.
 * ─────────────────────────────────────────────────────────────────────────────
 * `theFunnelHasOneSeam` pins this file by READING it: first-party, no vendor,
 * no identity in the payload. That is the right guard for what must never be
 * added. But reading source never runs it, and the coverage ratchet noticed
 * before anybody else did — `src/lib/` fell a point the day this file landed.
 *
 * So here it runs. What is worth proving by execution rather than by reading:
 * the call the app actually makes, the empty-string defaults the server's
 * primary key depends on, and that a measurement failure can never reach a
 * member — offline, or refused, or thrown.
 */
const mockRpc = jest.fn();
jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock('@/src/lib/sentry', () => ({ addBreadcrumb: jest.fn() }));

// eslint-disable-next-line import/first
import { installGateMetricsSink } from '@/src/lib/gateMetricsSink';
// eslint-disable-next-line import/first
import { recordGateEvent, setGateTelemetrySink } from '@/src/utils/gateTelemetry';

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  setGateTelemetrySink(null);
});
afterAll(() => setGateTelemetrySink(null));

describe('the counter names nobody', () => {
  it('sends exactly the four counter fields, and nothing else', () => {
    installGateMetricsSink();
    recordGateEvent('gate_tapped', { featureId: 'the-vault', rank: 'archivist', standing: 'lapsed' });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('record_gate_event', {
      p_event: 'gate_tapped', p_feature_id: 'the-vault', p_rank: 'archivist', p_standing: 'lapsed',
    });
  });

  it('an absent detail is sent as empty text, never null — the server keys on these', () => {
    // A NULL in a primary-key column makes every upsert a new row, so one
    // counter would become one row per event.
    installGateMetricsSink();
    recordGateEvent('rank_relinquished');
    expect(mockRpc).toHaveBeenCalledWith('record_gate_event', {
      p_event: 'rank_relinquished', p_feature_id: '', p_rank: '', p_standing: '',
    });
  });

  it('a refused or failed write is swallowed — no unhandled rejection reaches the app', async () => {
    installGateMetricsSink();
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      mockRpc.mockReturnValueOnce(Promise.reject(new Error('offline')));
      expect(() => recordGateEvent('gate_refused', { featureId: 'the-lounge' })).not.toThrow();
      await flush();
      await flush();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('works with a thenable that has no .catch — which is what PostgREST returns', async () => {
    // The first version called `.catch` on the builder and did not typecheck,
    // because the query builder is a PromiseLike, not a Promise.
    installGateMetricsSink();
    const thenableOnly = { then: (_ok: unknown, bad: (e: unknown) => void) => { bad(new Error('refused')); } };
    mockRpc.mockReturnValueOnce(thenableOnly);
    expect(() => recordGateEvent('membership_opened')).not.toThrow();
    await flush();
  });

  it('even a sink that throws synchronously cannot take the caller down', () => {
    mockRpc.mockImplementationOnce(() => { throw new Error('client not ready'); });
    installGateMetricsSink();
    expect(() => recordGateEvent('gate_tapped', { featureId: 'essays' })).not.toThrow();
  });

  it('a breadcrumb that throws cannot stop the member’s trip', () => {
    // Every rope records BEFORE it travels. A throw from the trail would leave
    // the button silently doing nothing — which a test's partial stand-in for
    // sentry.ts once caused, on the Dispatch's "WHAT AN AUTEUR CAN DO →".
    const sentry = jest.requireMock('@/src/lib/sentry') as { addBreadcrumb: jest.Mock };
    sentry.addBreadcrumb.mockImplementationOnce(() => { throw new Error('sentry not ready'); });
    installGateMetricsSink();
    expect(() => recordGateEvent('gate_tapped', { featureId: 'essays' })).not.toThrow();
    // And the counting still happens after the trail failed.
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('nothing is sent until the sink is installed', () => {
    recordGateEvent('gate_tapped', { featureId: 'essays' });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
