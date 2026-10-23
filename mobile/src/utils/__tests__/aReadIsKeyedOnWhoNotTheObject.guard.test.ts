/**
 * aReadIsKeyedOnWhoNotTheObject.guard.test.ts — no read re-runs because the session settled.
 *
 * The auth store hands a new `user` object at each session restore, its preferences' change, its
 * rank history's arrival. A hook keyed on that object re-runs each time: the salon's roster read
 * was a callback keyed on it, an effect keyed on the callback, and one opening asked for the room,
 * its roster and the Lounge list three times over (speed lab 39868403930). A read is keyed on who
 * reads, `user?.id`. Every hook still keyed on the object is listed here with why it is no read;
 * a new one fails until it is judged, or keyed on the id. Read from source, comments stripped.
 */
import * as path from 'path';
import { readCode, MOBILE } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

/** Each hook keyed on the auth store's `user` object, by file and its dependency list, and why it may be. */
const JUDGED: Record<string, string> = {
  'app/dispatch/compose.tsx [user]': 'an effect that only sends a signed-out reader back; it reads nothing',
  'app/film/[id].tsx [derivedData, existingLog, isAuthenticated, isArchivist, currentUsername, user, validFilmId, loading, isError, retry, isFocused, goBack, handleLog, handleRewatch, handleOpenTrailer, handleOpenShare, handleOpenLounge, handleReadFullLog, trailer, playVideo]':
    'the film page\'s context value: a new object redraws what reads it, and reads nothing',
  'app/log/[id].tsx [queryClient, id, user, updateComments]': 'a press handler (delete a critique): re-created, never run by itself',
  'app/person/[id].tsx [user, canShare, openShare, person, id]': 'a press handler (share to a salon)',
  'app/stacks/[id].tsx [user, id, isCertified, toggleListEndorse, isCertifying, queryClient]': 'a press handler (certify)',
  'app/stacks/[id].tsx [commentText, submittingComment, user, id, queryClient, bumpCritiqueCount]': 'a press handler (file a critique)',
  'app/stacks/[id].tsx [user, id, queryClient, bumpCritiqueCount]': 'a press handler (delete a critique)',
  'app/stacks/[id].tsx [user]': 'a press handler (share to a salon)',
  'app/year-in-cinema.tsx [currentIndex, width, slideHeight, stats, slides, user, edge]': 'a slide drawer: it draws the member\'s name, reads nothing',
  'src/components/moderation/ReportSheet.tsx [selectedReason, user, submitReport, contentId, contentType, details, blockToggle, targetUserId, onDismiss]': 'a press handler (send the report)',
  'src/hooks/useEditProfile.ts [user, form]': 'fills the form from the member\'s own record: no read, and Edit Profile writes nothing that replaces the object while it is open',
  'src/hooks/useProfileController.ts [isSelf, user, data.targetUser?.username, targetUserHash]': 'copies the member\'s own record onto their file on screen: no read',
};

const keyedOnTheObject = (rel: string, src: string): string[] => {
  const fromAuth = /const\s+user\s*=\s*useAuthStore\(\s*\(?s\)?\s*=>\s*s\.user\s*\)|const\s*\{[^}]*\buser\b[^}]*\}\s*=\s*useAuthStore\(/.test(src);
  if (!fromAuth) return [];
  return [...src.matchAll(/\},\s*\[([^\]]*)\]\)/g)]
    .map((m) => (m[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean))
    .filter((deps) => deps.includes('user'))
    .map((deps) => `${rel} [${deps.join(', ')}]`);
};

const SITES = universe('appCode')
  .map((f) => ({ rel: path.relative(MOBILE, f).replace(/\\/g, '/'), src: readCode(f) }))
  .flatMap((f) => keyedOnTheObject(f.rel, f.src));

it('finds the hooks keyed on the user object, and can say no', () => {
  expect(SITES.length).toBeGreaterThan(5);
  const planted = "const user = useAuthStore((s) => s.user);\nuseEffect(() => { void read(user.id); }, [user]);";
  expect(keyedOnTheObject('x.tsx', planted)).toEqual(['x.tsx [user]']);
  expect(keyedOnTheObject('x.tsx', planted.replace('[user]', '[userId]'))).toEqual([]);
});

it('keys every other hook on who reads, not on the object a session restore replaces', () => {
  expect(SITES.filter((s) => !JUDGED[s])).toEqual([]);
  // And none judged that is gone: the list cannot outlive its sites.
  expect(Object.keys(JUDGED).filter((s) => !SITES.includes(s))).toEqual([]);
});
