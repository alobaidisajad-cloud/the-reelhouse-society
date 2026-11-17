/**
 * aRefusedRenameKeepsWhatWasSaved.test.ts — round 11 (ProfileService.updateProfile, and
 * src/services/handleNotChanged.ts), against the house as strict as it is (test-utils/supabaseFake).
 *
 * Edit Profile writes every amended field first and the handle last, through the house's rename. A
 * handle taken by someone else a moment before (the check at the press found it free), or one a
 * rule refuses, was thrown as the house's bare refusal: the member read that their profile "could
 * not be saved", while the bio they changed was saved. The refusal now says what was saved before
 * it and the handle the house still holds, and why the handle was not changed.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { ProfileService } from '../ProfileWriteService';
import { HandleNotChanged, saidOfHandleNotChanged } from '../handleNotChanged';

const MEMBER = '7a1c3e55-0000-4000-8000-000000000012';
let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/utils/handleHistory', () => ({ rememberPreviousHandle: jest.fn() }));

/** The house, holding the member as "vesper", answering the rename with `answer`. */
const houseRenaming = (answer: unknown) => {
  mockHouse = supabaseFake({
    rows: { profiles: [{ id: MEMBER, username: 'vesper', bio: 'Stored bio.' }] },
    rpc: { rename_my_handle: answer },
    session: { userId: MEMBER },
  });
};

/** The save, its refusal caught. */
async function refusalOf(updates: Record<string, unknown>): Promise<HandleNotChanged> {
  const refused = await ProfileService.updateProfile(MEMBER, updates, 'vesper').then(() => null, (e: unknown) => e);
  expect(refused).toBeInstanceOf(HandleNotChanged);
  return refused as HandleNotChanged;
}

it('a handle taken meanwhile, after a bio amended: the bio is saved, and the refusal says so, with the handle held', async () => {
  houseRenaming({ error: { code: '23505', message: 'This username is already taken.' } });
  const e = await refusalOf({ bio: 'A new bio', username: 'noir_fan' });
  expect(mockHouse.rows('profiles')).toEqual([expect.objectContaining({ bio: 'A new bio', username: 'vesper' })]);
  expect(e).toMatchObject({ code: '23505', othersSaved: true, kept: 'vesper' });
  expect(saidOfHandleNotChanged(e, 'noir_fan', 'vesper'))
    .toBe('Your other amendments are saved, but your handle is still @vesper: @noir_fan is already taken.');
});

it('a handle a rule refuses says the rule\'s own words', async () => {
  houseRenaming({ error: { code: '23514', message: 'This username is not allowed.' } });
  const e = await refusalOf({ bio: 'A new bio', username: 'quiet_one' });
  expect(saidOfHandleNotChanged(e, 'quiet_one', 'vesper'))
    .toBe('Your other amendments are saved, but your handle is still @vesper: This username is not allowed.');
});

it('a rename that never reached the house says so, and asks for another save', async () => {
  houseRenaming({ error: { code: '', message: 'TypeError: Failed to fetch' } });
  const e = await refusalOf({ bio: 'A new bio', username: 'noir_fan' });
  expect(saidOfHandleNotChanged(e, 'noir_fan', 'vesper')).toMatch(/^Your other amendments are saved, but your handle is still @vesper: the house could not be reached/);
});

it('a rename alone, refused, says nothing was saved but names the handle held', async () => {
  houseRenaming({ error: { code: '23505', message: 'This username is already taken.' } });
  const e = await refusalOf({ username: 'noir_fan' });
  expect(e.othersSaved).toBe(false);
  expect(saidOfHandleNotChanged(e, 'noir_fan', 'vesper')).toBe('Your handle is still @vesper: @noir_fan is already taken.');
});

it('a handle held by another in other capitals is taken at the press, as the house judges it; an underscore is a letter', async () => {
  mockHouse = supabaseFake({
    rows: {
      profiles: [
        { id: MEMBER, username: 'vesper' },
        { id: '7a1c3e55-0000-4000-8000-000000000013', username: 'JohnDoe' },
        { id: '7a1c3e55-0000-4000-8000-000000000014', username: 'noirXfan' },
      ],
    },
  });
  expect(await ProfileService.checkUsernameAvailable('johndoe', MEMBER)).toBe(false);
  expect(await ProfileService.checkUsernameAvailable('noir_fan', MEMBER)).toBe(true);
  // The member's own handle is theirs to keep.
  expect(await ProfileService.checkUsernameAvailable('vesper', MEMBER)).toBe(true);
});
