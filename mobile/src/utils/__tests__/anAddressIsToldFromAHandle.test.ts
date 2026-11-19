/**
 * anAddressIsToldFromAHandle.test.ts — utils/authSignals.ts: what was typed into "email or username"
 * is an address only when all of it is one (something before the @, a dotted domain after it), its
 * edges' spaces aside; an email's link back into the app names its kind; a handle the house holds back
 * carries its seconds and from where from the store to the form; and the key the house hands a phone
 * for a handle is kept for that handle alone.
 */
import { authLink, doorFor, handleResting, handleRestingOf, isAddress, keepDoor } from '../authSignals';

jest.mock('expo-linking', () => ({
  createURL: (path: string, opts?: { queryParams?: Record<string, string> }) =>
    `reelhouse://${path}${opts?.queryParams ? `?${new URLSearchParams(opts.queryParams).toString()}` : ''}`,
}));

it('takes a whole address as one, its edges\' spaces aside', () => {
  expect(isAddress('member@reelhouse.co')).toBe(true);
  expect(isAddress('  member@reelhouse.co  ')).toBe(true);
  expect(isAddress('first.last@mail.example.org')).toBe(true);
});

it('takes a handle as a handle, however much it looks like an address', () => {
  expect(isAddress('@name')).toBe(false);
  expect(isAddress('old@handle')).toBe(false);
  expect(isAddress('name')).toBe(false);
  expect(isAddress('')).toBe(false);
});

it('takes nothing as an address that only holds one: all of it must be the address', () => {
  expect(isAddress('say member@reelhouse.co')).toBe(false);
  expect(isAddress('member@reelhouse.co please')).toBe(false);
  expect(isAddress('a b@reelhouse.co')).toBe(false);
});

it('names the kind of email in its link back, to the one place that reads it', () => {
  expect(authLink('signup')).toBe('reelhouse://auth-callback?type=signup');
  expect(authLink('recovery')).toBe('reelhouse://auth-callback?type=recovery');
});

it('a handle the house holds back carries its whole seconds, at least one, and from where, read back as them', () => {
  expect(handleResting(125, 'here')).toBe('Handle resting 125 here');
  expect(handleResting(0.2, 'elsewhere')).toBe('Handle resting 1 elsewhere');
  expect(handleResting(59.5, 'here')).toBe('Handle resting 60 here');
  expect(handleRestingOf(handleResting(125, 'elsewhere'))).toEqual({ seconds: 125, from: 'elsewhere' });
});

it('nothing else is read as a handle held back', () => {
  for (const raw of ['Too many requests', 'Handle resting', 'Handle resting 12', 'Handle resting soon here', 'Handle resting 12s here',
    'Handle resting 12 there', 'x Handle resting 12 here', 'Handle resting 12 here x', '']) {
    expect([raw, handleRestingOf(raw)]).toEqual([raw, null]);
  }
});

describe('the key the house hands a phone for a handle', () => {
  const phone = () => {
    const held = new Map<string, string>();
    return { read: (k: string) => held.get(k), write: (k: string, v: string) => { held.set(k, v); }, held };
  };
  const key = (c: string) => c.repeat(64);

  it('is kept for the handle as the house finds it, whatever its spelling, and read back', () => {
    const p = phone();
    keepDoor('@Noir Fan ', key('a'), p.read, p.write);
    expect(doorFor('noir_fan', p.read)).toBe(key('a'));
    expect(doorFor('@NOIR_FAN', p.read)).toBe(key('a'));
    expect(doorFor('someone_else', p.read)).toBeNull();
  });

  it('a newer key for a handle replaces its older one; five handles at most, the newest kept', () => {
    const p = phone();
    keepDoor('noir_fan', key('a'), p.read, p.write);
    keepDoor('noir_fan', key('b'), p.read, p.write);
    expect(doorFor('noir_fan', p.read)).toBe(key('b'));
    for (const h of ['h1', 'h2', 'h3', 'h4', 'h5']) keepDoor(h, key('c'), p.read, p.write);
    expect(doorFor('noir_fan', p.read)).toBeNull();
    expect(doorFor('h5', p.read)).toBe(key('c'));
    expect(doorFor('h1', p.read)).toBe(key('c'));
  });

  it('nothing not shaped as a key is kept or read as one', () => {
    const p = phone();
    for (const bad of [undefined, null, 42, '', 'short', key('g'), `${key('a')} `]) keepDoor('noir_fan', bad, p.read, p.write);
    expect(p.held.size).toBe(0);
    p.write('handle_doors', 'not json');
    expect(doorFor('noir_fan', p.read)).toBeNull();
    p.write('handle_doors', JSON.stringify([['noir_fan', 'short'], ['x'], 'y']));
    expect(doorFor('noir_fan', p.read)).toBeNull();
  });
});
