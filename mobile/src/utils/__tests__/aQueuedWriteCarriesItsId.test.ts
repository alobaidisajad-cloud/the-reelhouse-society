/**
 * aQueuedWriteCarriesItsId.test.ts — a write sent twice lands once (P4.13).
 *
 * The phone makes each row's id before the first try and keeps it in the queued
 * payload, so a replay after a lost answer finds the row it made (23505, read as
 * delivered) and never files a second. A log is one per member and film, so its
 * key holds whatever it is named. A write kept by an older build without
 * its id would be filed under a fresh one each time it went: its schema refuses
 * it instead, and the queue gives it back to the member (words to their box,
 * the rest under UNSENT CHANGES), never sent twice and never stuck.
 */
import { MutationSchemaMap } from '@/src/types/mutations';

const ME = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';

/** Each kind the house keys by the phone's id, a payload of it whole, and the name the id goes by. */
const KEYED: [string, Record<string, unknown>, string][] = [
  ['add_log_comment', { id: ID, log_id: ID, user_id: ME, body: 'Rain all night.' }, 'id'],
  ['add_list_comment', { id: ID, list_id: ID, user_id: ME, content: 'Rain all night.' }, 'id'],
  ['create_list', { id: ID, user_id: ME }, 'id'],
  ['send_lounge_message', { id: ID, lounge_id: ID, user_id: ME, content: 'Rain all night.' }, 'id'],
  ['add_critique', { _tempId: ID, post_id: ID, user_id: ME, body: 'Rain all night.' }, '_tempId'],
  ['add_filing', { _tempId: ID, user_id: ME, kind: 'take' }, '_tempId'],
];

describe('a queued write carries the id the house keys it by', () => {
  it.each(KEYED)('%s is read whole with its id', (type, payload) => {
    expect(MutationSchemaMap[type]!.safeParse(payload).success).toBe(true);
  });

  it.each(KEYED)('%s kept without it is refused, to be given back', (type, payload, key) => {
    const { [key]: _gone, ...without } = payload;
    expect(MutationSchemaMap[type]!.safeParse(without).success).toBe(false);
  });

  it('a log needs none: it is one per member and film, and build 41 keeps it by its temporary name alone', () => {
    for (const type of ['add_log', 'mark_watched']) {
      expect(MutationSchemaMap[type]!.safeParse({ _tempId: ID, user_id: ME, film_id: 550 }).success).toBe(true);
    }
  });

  it('a salon message an older build kept under its temporary name still goes, by that id', () => {
    expect(MutationSchemaMap.send_lounge_message!.safeParse({ _tempId: ID, lounge_id: ID, user_id: ME, content: 'Rain.' }).success).toBe(true);
  });
});
