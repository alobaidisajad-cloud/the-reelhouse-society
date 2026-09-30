/**
 * roomGate.test.ts — every standing, in a public room and a private one.
 */
import { knownStanding, roomGate, type RoomStanding } from '../roomGate';

const gate = (standing: RoomStanding, over: Partial<Parameters<typeof roomGate>[0]> = {}) =>
  roomGate({ isPrivate: true, isCreator: false, standing, requesting: false, rosterFailed: false, ...over });

describe('the gate of a private room', () => {
  it('while the roster is read, is a knock, never the request door', () => {
    expect(gate('unknown')).toBe('knocking');
  });

  it('when the roster cannot be read, says so, never the request door', () => {
    expect(gate('unknown', { rosterFailed: true })).toBe('unreachable');
  });

  it('once read, follows the standing', () => {
    expect(gate('none')).toBe('request');
    expect(gate('pending')).toBe('pending');
    expect(gate('banned')).toBe('banned');
    expect(gate('approved')).toBe('chat');
    expect(gate('muted')).toBe('chat');
  });

  it('a request just sent shows as pending before the roster knows it', () => {
    expect(gate('none', { requesting: true })).toBe('pending');
  });

  it('the host is always in, read or not', () => {
    expect(gate('unknown', { isCreator: true })).toBe('chat');
    expect(gate('unknown', { isCreator: true, rosterFailed: true })).toBe('chat');
  });

  it('a roster that failed once but has since been read follows the standing', () => {
    expect(gate('approved', { rosterFailed: true })).toBe('chat');
  });
});

describe('the gate of a public room', () => {
  it('is a preview for a guest, and not before the roster says so', () => {
    expect(gate('none', { isPrivate: false })).toBe('preview');
    expect(gate('unknown', { isPrivate: false })).toBe('knocking');
    expect(gate('unknown', { isPrivate: false, rosterFailed: true })).toBe('unreachable');
  });

  it('is the transcript for a member', () => {
    expect(gate('approved', { isPrivate: false })).toBe('chat');
  });
});

describe('the house recognises its members at the door', () => {
  const LIST = [
    { id: 'mine', membership_status: 'approved' as const },
    { id: 'asked', membership_status: 'pending' as const },
    { id: 'public-visited' },
  ];

  it('a room the Lounge list shows you in starts from that standing — straight to the transcript', () => {
    expect(knownStanding(LIST, 'mine')).toBe('approved');
    expect(roomGate({ isPrivate: true, isCreator: false, standing: knownStanding(LIST, 'mine'), requesting: false, rosterFailed: false })).toBe('chat');
    expect(knownStanding(LIST, 'asked')).toBe('pending');
  });

  it('a room the list does not know waits for the guest list — never the request door', () => {
    for (const id of ['public-visited', 'never-seen', undefined]) {
      expect(knownStanding(LIST, id)).toBe('unknown');
      expect(roomGate({ isPrivate: true, isCreator: false, standing: knownStanding(LIST, id), requesting: false, rosterFailed: false })).toBe('knocking');
    }
  });
});
