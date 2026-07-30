/**
 * useLogFlow.validation.test.ts — exercises the REAL validation gate.
 *
 * The previous version mirrored handleLog's conditions inline and asserted on
 * its own copy, so it would have passed even if the rule changed underneath it.
 * validateLogSubmission has been an exported pure function the whole time —
 * there was never a need to mirror anything.
 */
import { validateLogSubmission } from '../useLogFlow';

describe('validateLogSubmission — watched / rewatched', () => {
  it.each(['watched', 'rewatched'] as const)('%s: blocks an empty record', (status) => {
    // Nothing to file: no score and nothing written.
    expect(validateLogSubmission(status, 0, '', '')).toBeTruthy();
    expect(validateLogSubmission(status, 0, '   ', '')).toBeTruthy();
  });

  it.each(['watched', 'rewatched'] as const)('%s: a rating alone is enough', (status) => {
    expect(validateLogSubmission(status, 0.5, '', '')).toBeNull();
    expect(validateLogSubmission(status, 5, '', '')).toBeNull();
  });

  it.each(['watched', 'rewatched'] as const)('%s: a critique alone is enough', (status) => {
    expect(validateLogSubmission(status, 0, 'Devastating.', '')).toBeNull();
  });

  it('whitespace is not a critique', () => {
    expect(validateLogSubmission('watched', 0, '\n\t  ', '')).toBeTruthy();
  });

  it('an abandoned reason does NOT satisfy a watched log', () => {
    // The reason belongs to the abandoned path; it must not unlock this one.
    expect(validateLogSubmission('watched', 0, '', 'Too Slow')).toBeTruthy();
  });
});

describe('validateLogSubmission — abandoned', () => {
  it('requires a reason', () => {
    expect(validateLogSubmission('abandoned', 0, '', '')).toBeTruthy();
  });

  it('passes with a reason, needing neither rating nor critique', () => {
    // Abandoning is itself the statement — demanding a score would be wrong.
    expect(validateLogSubmission('abandoned', 0, '', 'Too Slow')).toBeNull();
  });

  it('a rating or critique alone does not substitute for the reason', () => {
    expect(validateLogSubmission('abandoned', 5, '', '')).toBeTruthy();
    expect(validateLogSubmission('abandoned', 0, 'Gave up.', '')).toBeTruthy();
  });
});

describe('validateLogSubmission — messages', () => {
  it('names the missing thing rather than failing vaguely', () => {
    expect(validateLogSubmission('watched', 0, '', '')).toMatch(/rating or critique/i);
    expect(validateLogSubmission('abandoned', 0, '', '')).toMatch(/reason/i);
  });

  it('returns null — not an empty string — when a log is valid', () => {
    // Callers gate on truthiness; an empty string would read as "no problem"
    // by accident rather than by contract.
    expect(validateLogSubmission('watched', 4, '', '')).toBeNull();
  });
});
