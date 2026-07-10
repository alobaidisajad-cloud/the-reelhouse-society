/**
 * loungeSharePayloads.test.ts — locks the share-payload contract.
 *
 * Every share type the client can send must survive LoungeMessagePayloadSchema,
 * because a schema rejection is a silent "Message could not be sent." toast.
 * This is the gate that broke stack shares once; it must never drift again.
 */
import { LoungeMessagePayloadSchema } from '../LoungeService';

// jest hoists these above the import at runtime.
jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const LOUNGE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const base = { lounge_id: LOUNGE_ID, user_id: USER_ID, content: '' };

describe('LoungeMessagePayloadSchema — share payloads', () => {
  it('accepts a plain text message', () => {
    expect(LoungeMessagePayloadSchema.safeParse({ ...base, content: 'hello', type: 'text' }).success).toBe(true);
  });

  it('accepts a film share (explicit film columns)', () => {
    expect(LoungeMessagePayloadSchema.safeParse({
      ...base, type: 'film_share',
      film_id: 603, film_title: 'The Matrix', film_poster: '/poster.jpg', metadata: undefined,
    }).success).toBe(true);
  });

  it('accepts a log share (film columns + log metadata)', () => {
    expect(LoungeMessagePayloadSchema.safeParse({
      ...base, type: 'log_share',
      film_id: 603, film_title: 'The Matrix', film_poster: '/poster.jpg',
      metadata: { log_id: '33333333-3333-4333-8333-333333333333', owner_username: 'sajad' },
    }).success).toBe(true);
  });

  it('accepts a stack share (everything nested in metadata)', () => {
    expect(LoungeMessagePayloadSchema.safeParse({
      ...base, type: 'list_share',
      metadata: { listId: '44444444-4444-4444-8444-444444444444', title: 'Noir Essentials', filmCount: 12, curator: 'sajad', topPosters: [] },
    }).success).toBe(true);
  });

  it('accepts a dossier share (essay title in film_title, id + author in metadata)', () => {
    expect(LoungeMessagePayloadSchema.safeParse({
      ...base, type: 'dossier_share',
      film_title: 'On the Death of the Matinee',
      metadata: { dossier_id: '55555555-5555-4555-8555-555555555555', author_username: 'sajad' },
    }).success).toBe(true);
  });

  it('rejects unknown share types', () => {
    expect(LoungeMessagePayloadSchema.safeParse({ ...base, type: 'poster_share' }).success).toBe(false);
  });
});
