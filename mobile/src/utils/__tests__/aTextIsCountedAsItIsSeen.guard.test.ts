/**
 * aTextIsCountedAsItIsSeen.guard.test.ts — no text is sized by its code units or cut at a
 * fixed one (WORKLIST P4.31).
 *
 * A string's length counts code units, not what a reader sees (a family of four is eleven), and
 * a cut at a fixed one can fall inside a character. Fourteen places did one or the other to a
 * member's words: a name of emoji set at the smallest step, a review with piled marks planned at
 * three times its lines, an excerpt stored ending on half an emoji. Each now counts with
 * characterCount, cuts with cutWhole or firstCharacters (utils/text.ts), or measures with emOf.
 *
 * Found by the type checker, as runtimeLacks finds a method: a `.length` or a `.slice` read off
 * a string, never off a list. A string's length compared with a number other than none, and a
 * string cut from its start at a fixed length, each stand only on the list below, with why.
 */
import { join } from 'path';
import ts from 'typescript';
import { MOBILE } from '@/test-utils/readCode';
import { appSources, findUses, programFor, type Source } from '@/test-utils/runtimeLacks';

/**
 * A length weighed against a size: a number (not none: `.length > 0` asks only for any), a named
 * constant, or a max, limit, width or room. An index walked along a string (`i < s.length`) is
 * no size, and a caret moved by what was typed counts the units the field holds.
 */
const SIZE = String.raw`(?:[1-9]\d*|[A-Z][A-Z0-9_]*(?:\.\w+)*|\w*(?:max|min|limit|width|room|least|Max|Min|Limit|Width|Room|Least)\w*)`;
const WEIGHED = new RegExp(String.raw`\.length\s*[<>]=?\s*${SIZE}\b(?!\s*[-+])|(?<![-+*/]\s*)\b${SIZE}\s*[<>]=?\s*[\w.?()]+\.length\b`);
/** A cut from the start at a fixed length: a cut at a place found in the text (a space) is not one. */
const CUT = new RegExp(String.raw`\.(?:slice|substring|substr)\(0,\s*${SIZE}\s*\)`);

/** Each allowed, matched by file and the line's own words, with why. */
const HANDLE = 'a handle is ASCII letters, digits, dots and underscores (handleGuard): a unit is a character';
const DATE = 'a date as the house or TMDB writes it (2026-11-07): its year and its day are fixed places';
const LIMIT = "a column's limit counts code units, as the field and the house count them: the cut that follows is whole";
const TRACE = 'a few words of a diagnostic, for the E2E trace or Sentry: never drawn';
const ALLOWED: [file: string, line: string, why: string][] = [
  ['app/(modals)/login.tsx', 'username.length < 3', HANDLE],
  ['src/hooks/useAuthFlow.ts', 'trimmed.length < 3', HANDLE],
  ['src/utils/validateUsername.ts', 'sanitized.length < 3', HANDLE],
  ['src/utils/validateUsername.ts', 'sanitized.length > 30', HANDLE],
  ['src/utils/handleGuard.ts', 'username.length > MAX_HANDLE_LENGTH', HANDLE],
  ['src/components/InitiationModal.tsx', 'handle.length <= STAMP_LINE', HANDLE],
  ['src/components/reels/StackCan.tsx', 'p.length < 2', "a piece of a handle broken at its joints: ASCII"],
  ['app/user/[username].tsx', 'd.substring(0, 10)', DATE],
  ['src/components/dispatch/ComposeDesks.tsx', 'String(r.release_date).slice(0, 4)', DATE],
  ['src/components/film/releaseOf.ts', 'today.slice(0, 4)', DATE],
  ['src/components/lobby/wallRead.ts', 'release.slice(0, 4)', DATE],
  ['src/components/lobby/wallRead.ts', 'toISOString().slice(0, 10)', DATE],
  ['src/components/log/LogForm.tsx', 'film.release_date.slice(0, 4)', DATE],
  ['src/components/person/PersonDefining.tsx', 'film.release_date.slice(0, 4)', DATE],
  ['src/components/person/PersonFilmography.tsx', 'film.release_date.slice(0, 4)', DATE],
  ['src/components/person/PersonHero.tsx', '.substring(0, 4)', DATE],
  ['src/components/profile/ProfileTriptych.tsx', 'film.release_date.slice(0, 4)', DATE],
  ['src/features/archive/archiveImport.ts', 'trimmed.slice(0, 10)', DATE],
  ['src/features/archive/archiveImport.ts', 'release_date.slice(0, 4)', DATE],
  ['src/hooks/useLogFlow.ts', 'film.release_date.slice(0, 4)', DATE],
  ['src/lib/tmdb.ts', 'dateStr.slice(0, 4)', DATE],
  ['src/stores/domain/archiveSlice.ts', 'film.release_date.slice(0, 4)', DATE],
  ['src/stores/domain/watchlistSlice.ts', 'film.release_date.slice(0, 4)', DATE],
  ['src/utils/mappers.ts', 'value.slice(0, 10)', DATE],
  ['src/utils/instant.ts', 'places.slice(0, 3)', "an instant's fraction of a second, digits a machine wrote"],
  ['src/utils/instant.ts', 'zone.slice(0, 3)', 'a zone offset (+0300), digits a machine wrote'],
  ['src/components/ShareToLoungeModal.tsx', 'whole.length <= MAX_LENGTHS.loungeShareTitle', LIMIT],
  ['src/components/dispatch/excerpt.ts', 'prose.length <= limit', LIMIT],
  ['src/components/dispatch/paper/paperText.ts', 'whole.length <= max', LIMIT],
  ['src/utils/markdownSafety.ts', 'content.length <= MAX_LENGTHS.filingEssay', LIMIT],
  ['src/utils/sanitizeInput.ts', 'clean.length <= maxLen', LIMIT],
  ['src/utils/sanitizeInput.ts', 'length > MAX_LENGTHS[fieldType]', LIMIT],
  ['src/utils/searchPattern.ts', 'raw.length <= SEARCH_MAX', LIMIT],
  ['src/utils/text.ts', 'text.length <= max ? text', 'cutWhole itself: the limit in units, the cut between characters'],
  ['src/utils/text.ts', 'raw.length <= max', "truncateReview's limit in units, cut between characters below it"],
  ['src/stores/lounge.ts', 'trimmedName.length > MAX_LENGTHS.loungeName', LIMIT],
  ['src/hooks/useEditProfile.ts', 'url.length > MAX_LENGTHS.linkUrl', 'an address: ASCII once encoded, and its column counts units'],
  ['src/components/log/LogForm.tsx', 'review.length > REVIEW_WARN_AT', "the counter beside the field counts what the field's limit counts"],
  ['src/components/moderation/ReportSheet.tsx', 'details.length >= COUNTER_WARN_THRESHOLD', "the counter beside the field counts what the field's limit counts"],
  ['src/utils/draftSync.ts', 'payload.length > SYNC_CEILING', "a draft's stored size, a byte budget, not what is drawn"],
  ['src/services/ProfileWriteService.ts', 'base64Str.length > MAX_AVATAR_BASE64_LENGTH', "a picture's encoded size"],
  ['src/stores/mmkv-storage.ts', 'stored.slice(0, MMKV_KEY_BYTES)', "an encryption key's characters, hex a machine wrote"],
  ['src/utils/secondKey.ts', '.slice(0, KEY_DIGITS)', 'an authenticator code: digits'],
  ['src/features/settings/SettingsScreen.tsx', 'otpCode.length', 'a code sent by email: digits'],
  ['src/components/auth/PasswordStrengthMeter.tsx', 'pw.length >= 8', "a password's strength: the house checks its length in units too"],
  ['src/lib/tmdb.ts', 'text.length > 2', "a fallback search's words, sent to TMDB: a guess at what is worth a request"],
  ['src/lib/tmdb.ts', 'w.length > 2', 'a word already held to a-z and 0-9'],
  ['src/components/profile/NoirPassport.tsx', 'label.length <= width', "a stamp's own English label"],
  ['src/components/profile/RadarChart.tsx', 'label.toUpperCase().slice(0, 3)', "a genre's English name, TMDB's"],
  ['src/utils/text.ts', 'mark.length > MARK_MOST', 'the marks that open a review (quotes, a bracket, dots): one unit each'],
  ['src/components/text/index.tsx', 'words.slice(0, 80)', TRACE],
  ['src/stores/mmkv-storage.ts', '.slice(0, 160)', TRACE],
  ['src/utils/offlineQueue.ts', 'errMsg.slice(0, 80)', TRACE],
  ['src/lib/sentryScrub.ts', 'v.length < 120', 'a Sentry tag kept only if short: a budget on what is sent'],
  ['src/lib/sentryScrub.ts', 'v.length <= 400', 'a component stack kept only if short: a budget on what is sent'],
];

const sources = appSources().filter((src) => WEIGHED.test(src.text) || CUT.test(src.text));

const READS = ['String.prototype.length', 'String.prototype.slice', 'String.prototype.substring', 'String.prototype.substr'];
/** Each read off a string that weighs its length or cuts it at a fixed one. */
const found = (from: Source[], program: (files: string[]) => ts.Program) => findUses(from, READS, program)
  .filter((u) => (u.api.endsWith('.length') ? WEIGHED : CUT).test(u.code));

it('sizes no text by its code units, and cuts none at a fixed one, but what is listed', () => {
  const uses = found(sources, programFor);
  const unlisted = uses.filter((u) => !ALLOWED.some(([file, line]) => u.file === file && u.code.includes(line)))
    .map((u) => `${u.file}:${u.line}  ${u.code}`);
  expect(unlisted).toEqual([]);
});

it('finds a string weighed or cut by its units, and not a list, nor a length asked only for any', () => {
  const file = 'src/planted.ts';
  const lines = [
    'const big = name.length > 16;',
    'const head = name.slice(0, 40);',
    'const many = rows.length > 16;',
    'const some = rows.slice(0, 3);',
    'const any = name.length > 0;',
  ];
  const text = `declare const name: string;\ndeclare const rows: string[];\n${lines.join('\n')}\n`;
  const planted = [{ file, text }];
  const inMemory = (files: string[]) => {
    const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts'], strict: false, noEmit: true };
    const host = ts.createCompilerHost(options);
    const read = host.getSourceFile;
    host.getSourceFile = (name, version) => (name.split('\\').join('/').endsWith(file) ? ts.createSourceFile(name, text, version) : read(name, version));
    return ts.createProgram(files.map((f) => join(MOBILE, f)), options, host);
  };
  expect(found(planted, inMemory).map((u) => u.code)).toEqual([lines[0], lines[1]]);
});

it('lists nothing that is no longer there', () => {
  const stale = ALLOWED.filter(([file, line]) => !sources.some((src) => src.file === file && src.text.includes(line)))
    .map(([file, line]) => `${file}: ${line}`);
  expect(stale).toEqual([]);
});
