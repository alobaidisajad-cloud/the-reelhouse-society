/**
 * aRenameIsAnsweredWithTheHandleKept.test.ts — review round 11 (ProfileService.updateProfile)
 * ─────────────────────────────────────────────────────────────────────────────
 * A member whose handle predates today's letters ("john.doe") renamed it to its cleaned form
 * ("johndoe"). The write asked for nothing back, and the house's rule for old builds (which sent
 * the cleaned handle on every save) put the old handle back without a word: the phone was told
 * nothing and held a handle no row had. A rename now goes through the house's own door
 * (rename_my_handle), which lets a chosen rename through and answers with the handle kept; every
 * other field is written as before and read back; and the service answers with the handle the
 * house holds.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { ProfileService } from '../ProfileWriteService';

const MEMBER = '7a1c3e55-0000-4000-8000-000000000011';
const renames: unknown[] = [];
const mockHouse = supabaseFake({
  rows: { profiles: [{ id: MEMBER, username: 'john.doe', bio: 'Stored bio.' }] },
  rpc: {
    rename_my_handle: (args: { p_new: string }) => {
      renames.push(args);
      if (args.p_new === 'taken_one') return { error: { code: '23505', message: 'This username is already taken.' } };
      return args.p_new;
    },
  },
  session: { userId: MEMBER },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
const mockRemember = jest.fn();
jest.mock('@/src/utils/handleHistory', () => ({ rememberPreviousHandle: (...a: unknown[]) => mockRemember(...a) }));

beforeEach(() => { renames.length = 0; mockRemember.mockClear(); mockHouse.asked.length = 0; });

it('a chosen rename goes through the house\'s rename, and is answered with the handle the house kept', async () => {
  const kept = await ProfileService.updateProfile(MEMBER, { bio: 'A new bio', username: 'johndoe' }, 'john.doe');
  expect(renames).toEqual([{ p_new: 'johndoe' }]);
  expect(kept).toEqual({ username: 'johndoe' });
  // The other fields by the plain write, the handle not among them, read back.
  const write = mockHouse.asked.find((a) => a.table === 'profiles' && a.op === 'update');
  expect(write).toBeDefined();
  expect(write!.values).toEqual([{ bio: 'A new bio' }]);
  expect(write!.selects).toBe(true);
  // The handle given up is recorded, from what the caller handed over.
  expect(mockRemember).toHaveBeenCalledWith(MEMBER, 'john.doe');
});

it('an amendment without a rename is answered with the handle the house holds, and renames no one', async () => {
  const kept = await ProfileService.updateProfile(MEMBER, { bio: 'Only words' }, 'john.doe');
  expect(renames).toEqual([]);
  expect(kept).toEqual({ username: 'john.doe' });
  expect(mockRemember).not.toHaveBeenCalled();
});

it('a rename the house refuses is thrown, never answered as kept, and records no past handle', async () => {
  await expect(ProfileService.updateProfile(MEMBER, { bio: 'Words', username: 'taken_one' }, 'john.doe'))
    .rejects.toMatchObject({ code: '23505' });
  expect(mockRemember).not.toHaveBeenCalled();
});
