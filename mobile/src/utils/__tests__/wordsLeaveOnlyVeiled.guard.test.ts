/**
 * A member's words leave the app only as the reader may read them (the kinds pass, kind 5: a reader
 * protection kept per surface).
 * ─────────────────────────────────────────────────────────────────────────────
 * SHARE sent a spoiler unveiled out of the app, and only new shares were veiled (round 13): each place
 * words leave the app (the share sheet, a picture shared, the clipboard) was written alone, and kept
 * the spoiler rule only where its author thought of it. The house veils shared words in one place
 * (utils/sharedWords.ts, and the Dispatch's filingShareLine and filingShareOpening built on it). Here every such
 * place in the app (universe appCode) is listed: it passes the words through that one veil, or it
 * carries no member's words a reader may not read (a film's title, the member's own figures, the
 * words already on the reader's screen), said with why. A new place fails until it is judged.
 * Checked on planted text first, so it is seen to say no.
 */
import { readFileSync } from 'fs';
import { files, rel } from '@/test-utils/universe';
import { stripComments } from '@/test-utils/readCode';

/** Where words leave the app: the share sheet, a file shared, the clipboard. */
const SINK = /\b(?:Share\.share|Sharing\.shareAsync|\w*Clipboard\.setStringAsync)\s*\(/g;
/** The house's one veil for a member's shared words. */
const VEIL = /\b(?:sharedWords|filingShareLine|filingShareOpening)\s*\(/;

/** Each file's places words leave the app, and whether the file passes words through the veil. */
export function sinksOf(sources: { file: string; text: string }[]): Map<string, { count: number; veiled: boolean }> {
  const out = new Map<string, { count: number; veiled: boolean }>();
  for (const { file, text } of sources) {
    const count = [...text.matchAll(SINK)].length;
    if (count) out.set(file, { count, veiled: VEIL.test(text) });
  }
  return out;
}

type Judged = { count: number } & ({ veil: string } | { noWords: string });

/** Each file that sends words out of the app: how many places, and how its words are kept. */
const PLACES: Record<string, Judged> = {
  'app/dispatch/[id].tsx': { count: 4, veil: 'the filing\'s line and an essay\'s opening through filingShareLine and filingShareOpening; the picture is the clipping drawn from them' },
  'src/components/film/ShareCardModal.tsx': { count: 2, veil: 'the review through sharedWords: a spoiler leaves as the word SPOILERS alone' },
  'app/log/[id].tsx': { count: 2, noWords: 'names whose log and the film\'s title alone; the picture is NitrateFileCard (through LogShareCard), which veils a spoiler through sharedWords' },
  'src/components/profile/ProjectorRoom.tsx': { count: 1, noWords: 'the member\'s standing in figures and the house\'s word for it (standingShare), no one\'s words' },
  'src/components/profile/TasteDNA.tsx': { count: 1, noWords: 'a picture of the taste figures: genres and counts, no one\'s words' },
  'src/features/settings/DataVault.tsx': { count: 2, noWords: 'the member\'s own data, exported to themselves' },
  'src/components/lounge/ActionSheet.tsx': { count: 1, noWords: 'a salon message the reader is reading, copied as it stands on their screen (a hidden member\'s never reaches it)' },
  'src/components/admin/SecondKeyDoor.tsx': { count: 1, noWords: 'the moderator\'s own second-key secret, copied for their authenticator' },
  'src/utils/housePages.ts': { count: 1, noWords: 'the house\'s support address' },
};

describe('the rule, on planted text', () => {
  it('finds every place words leave, and whether the file passes them through the veil', () => {
    const found = sinksOf([
      { file: 'a.tsx', text: "await Share.share({ message: log.review }); await ExpoClipboard.setStringAsync(m.content);" },
      { file: 'b.tsx', text: "await Share.share({ message: sharedWords(log.review, log.isSpoiler) });" },
      { file: 'c.tsx', text: 'const shared = 1;' },
    ]);
    expect([...found]).toEqual([['a.tsx', { count: 2, veiled: false }], ['b.tsx', { count: 1, veiled: true }]]);
  });

  it('says no to a new place, and to a file judged veiled that no longer veils', () => {
    const found = sinksOf([{ file: 'src/components/film/ShareCardModal.tsx', text: 'Share.share({ message: x }); Sharing.shareAsync(u);' }, { file: 'new.tsx', text: 'Share.share({ message: x })' }]);
    expect(judge(found)).toEqual(['new.tsx: a place words leave the app, unjudged', 'src/components/film/ShareCardModal.tsx: judged veiled, but passes nothing through the veil']);
  });
});

/** The faults of the places found against the judgments, in words. */
function judge(found: Map<string, { count: number; veiled: boolean }>, checkStale = false): string[] {
  const faults: string[] = [];
  for (const [file, { count, veiled }] of found) {
    const j = PLACES[file];
    if (!j) { faults.push(`${file}: a place words leave the app, unjudged`); continue; }
    if (j.count !== count) faults.push(`${file}: ${count} places, judged ${j.count}`);
    if ('veil' in j && !veiled) faults.push(`${file}: judged veiled, but passes nothing through the veil`);
  }
  if (checkStale) for (const file of Object.keys(PLACES)) if (!found.has(file)) faults.push(`${file}: judged, but sends nothing out now`);
  return faults.sort();
}

describe('every place a member\'s words leave the app', () => {
  const found = sinksOf(files('appCode').map((f) => ({ file: rel(f), text: stripComments(readFileSync(f, 'utf8'), f) })));

  it('reads the share sheets, the shared pictures and the clipboard', () => {
    expect(found.size).toBeGreaterThan(5);
    expect(found.has('app/dispatch/[id].tsx')).toBe(true);
  });

  it('passes the words through the house\'s one veil, or carries none a reader may not read, each judged', () => {
    expect(judge(found, true)).toEqual([]);
  });
});
