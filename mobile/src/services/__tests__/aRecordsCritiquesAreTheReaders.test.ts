/**
 * aRecordsCritiquesAreTheReaders.test.ts — round 11 (src/services/logCounts.ts: the counts a
 * direct read of logs asks for, and liftLogCounts), against the house as strict as it is
 * (test-utils/supabaseFake).
 *
 * A film's Log Archive printed each record's critique count from log_counts, kept the same for
 * every reader: critiques by members the reader has blocked or muted were counted, while the
 * record's own page counts only the critiques its reader may read. The archive said 3 and the
 * record "CRITIQUES · 2". A member now asks the house for critiques_seen, their own count. A
 * visitor hides no one, so log_counts' count is theirs, and is asked for as before: critiques_seen
 * is called with the whole row, which a visitor's column grants on logs refuse.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { LOG_SEEN_COUNTS_SELECT, liftLogCounts, logCertifySelect, logCountsSelect } from '../logCounts';

const ANA = '11111111-1111-4111-8111-111111111111';
const RECORD = '00000000-0000-4000-8000-000000000001';
/** Three critiques kept on the record; the reader has muted the writer of one. */
const mockHouse = supabaseFake({
  rows: {
    logs: [{ id: RECORD, user_id: ANA, film_id: 603, film_title: 'The Matrix', watched_date: '2026-11-01' }],
    log_counts: [{ log_id: RECORD, certify_count: 1, critique_count: 3 }],
  },
  computed: { critiques_seen: () => 2 },
});

it('a member\'s archive card counts the critiques they may read, as the record\'s page does', async () => {
  // The member's counts, as logCountsSelect asks them for a viewer (beside the viewer's own mark).
  expect(logCountsSelect(ANA)).toContain(LOG_SEEN_COUNTS_SELECT);
  const { data, error } = await mockHouse.client.from('logs').select(`id, ${LOG_SEEN_COUNTS_SELECT}`);
  expect(error).toBeNull();
  const row = (data as Record<string, unknown>[])[0];
  expect(row).toBeDefined();
  expect(liftLogCounts(row!)).toMatchObject({ id: RECORD, critique_count: 2 });
});

it('and so does the record\'s own read, for a member', () => {
  expect(logCertifySelect(ANA)).toContain('critiques_seen');
});

it('a visitor asks for no count of their own: log_counts\' count, as before', () => {
  for (const select of [logCountsSelect(null), logCertifySelect(null), logCountsSelect(undefined)]) {
    expect(select).not.toContain('critiques_seen');
    expect(select).toContain('log_counts(certify_count, critique_count)');
  }
});

it('a row read without the reader\'s count keeps the kept one', () => {
  expect(liftLogCounts({ id: RECORD, counts: { certify_count: 1, critique_count: 3 } })).toEqual({ id: RECORD, certify_count: 1, critique_count: 3 });
  expect(liftLogCounts({ id: RECORD, counts: null, critiques_seen: 0 })).toEqual({ id: RECORD, certify_count: 0, critique_count: 0 });
});
