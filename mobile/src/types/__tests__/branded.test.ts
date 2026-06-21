import { createFilmId, createListId, createLogId, createUserId } from '../branded';

describe('Branded Type Factories', () => {
  it('creates UserId from valid UUID', () => {
    const id = createUserId('550e8400-e29b-41d4-a716-446655440000');
    expect(typeof id).toBe('string');
    expect(id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('throws ZodError for invalid UUID string', () => {
    expect(() => createUserId('not-a-uuid')).toThrow();
  });

  it('creates FilmId from positive integer', () => {
    const id = createFilmId(42);
    expect(typeof id).toBe('number');
    expect(id).toBe(42);
  });

  it('throws ZodError for negative number', () => {
    expect(() => createFilmId(-1)).toThrow();
  });

  it('throws ZodError for decimal number', () => {
    expect(() => createFilmId(3.14)).toThrow();
  });

  it('creates ListId from valid UUID', () => {
    const id = createListId('550e8400-e29b-41d4-a716-446655440001');
    expect(id).toBe('550e8400-e29b-41d4-a716-446655440001');
  });

  it('creates LogId from valid UUID', () => {
    const id = createLogId('550e8400-e29b-41d4-a716-446655440002');
    expect(id).toBe('550e8400-e29b-41d4-a716-446655440002');
  });
});
