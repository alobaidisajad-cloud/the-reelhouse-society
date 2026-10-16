/**
 * aRankRefusalIsOnlyARanksRefusal.test.ts — src/utils/tierRefusal, asked
 * directly (TST-27: its guards were reached only through callers, which never
 * handed it the refusals it must turn away).
 *
 * Only the server's own sentence about a rank, under 42501, is a rank's
 * refusal. A privacy refusal is 42501 too, and "✦ ASCEND THE RANKS" there
 * would be a lie: no rank lets a member certify a stranger's log.
 */
import { asTierRefusal, KNOWN_TIER_SENTENCES } from '../tierRefusal';

const refused = (message: string, more: Record<string, unknown> = {}) => ({ code: '42501', message, ...more });

describe('a rank refusal', () => {
  it.each([
    ['The Lounge is an Archivist feature', 'the-lounge', 'archivist'],
    ['The Vault is an Archivist feature', 'the-vault', 'archivist'],
    ['The Physical Archive is an Archivist feature', 'physical-archive', 'archivist'],
    ['The Dispatch is an Auteur feature', 'essays', 'auteur'],
    ['A private screening room is an Auteur feature', 'private-rooms', 'auteur'],
  ])('"%s" is the door to %s, for an %s', (said, featureId, rank) => {
    expect(asTierRefusal(refused(said))).toEqual({ featureId, rank, said });
  });

  it('knows every sentence it names, and no other', () => {
    expect(KNOWN_TIER_SENTENCES).toHaveLength(5);
  });

  it('is read whatever says it was forbidden: a 403, or the row-level words', () => {
    expect(asTierRefusal({ status: 403, message: 'The Vault is an Archivist feature' })?.featureId).toBe('the-vault');
    expect(asTierRefusal({ code: '42501', message: '  The Vault is an Archivist feature  ' })?.said).toBe('The Vault is an Archivist feature');
  });
});

describe('is never anything else', () => {
  it('a privacy refusal under 42501, which no rank would answer', () => {
    expect(asTierRefusal(refused('Only mutual followers may certify this log'))).toBeNull();
    expect(asTierRefusal(refused('new row violates row-level security policy for table "logs"'))).toBeNull();
  });

  it('a rank\'s sentence without the refusal: somebody\'s own words that read like one', () => {
    expect(asTierRefusal({ code: '23514', message: 'The Lounge is an Archivist feature' })).toBeNull();
    expect(asTierRefusal({ message: 'The Lounge is an Archivist feature' })).toBeNull();
  });

  it('a sentence inside other words, or cut short', () => {
    expect(asTierRefusal(refused('Note: The Lounge is an Archivist feature'))).toBeNull();
    expect(asTierRefusal(refused('The Lounge is an Archivist'))).toBeNull();
  });

  it('a refusal with no words, or nothing that is an error', () => {
    expect(asTierRefusal(refused(''))).toBeNull();
    expect(asTierRefusal({ code: '42501' })).toBeNull();
    expect(asTierRefusal({ code: '42501', message: 42 })).toBeNull();
    expect(asTierRefusal(null)).toBeNull();
    expect(asTierRefusal('The Lounge is an Archivist feature')).toBeNull();
  });
});
