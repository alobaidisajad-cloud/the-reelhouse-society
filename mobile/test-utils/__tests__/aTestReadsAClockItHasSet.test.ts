/**
 * A TEST READS A CLOCK IT HAS SET — the finder, as a test.
 *
 * A test that reads the real clock passes or fails by when it runs. theWallKeepsTheDay read the day
 * as it set up and again as it judged; run 25 seconds past midnight UTC, the day turned between the
 * two and the test failed with nothing wrong. So, in every test file of mobile/:
 *
 *   - a reading of the clock (`Date.now()`, `new Date()` with nothing in it, the house clock's
 *     `houseNow()` and `houseIso()`, `localCalendarDate()` or `getLocalDateString()` given no instant)
 *     comes after a clock set at a fixed moment, or its file is judged below with why no hour, day,
 *     month or year changes its verdict;
 *   - a day still to come, written out (`'2031-05-01'`, `new Date(2031, 4, 1)`, `Date.UTC(2031, …)`:
 *     any day after WRITTEN), stands for "the future" only until the real day passes it: it too comes
 *     after a clock set at a fixed moment, or its file is judged.
 *
 * A clock is set at a fixed moment by `jest.useFakeTimers({ now })` with Date left faked, or by
 * `jest.setSystemTime(moment)`. It holds what runs after it: the rest of the function it is called in
 * (a test's own body, or the file's top level), or, called in a beforeEach or beforeAll, every
 * function of that hook's describe (of the whole file, for a hook at its top level). What a describe's
 * own body reads runs as the file is gathered, before any hook, and is not held.
 */
import { readFileSync } from 'fs';
import ts from 'typescript';
import { files, rel } from '../universe';

/** The day this rule was written: a day written out later than it is a day still to come. */
const WRITTEN = '2026-11-24';

type Site = { line: number; text: string };
type Judged = Record<string, { sites: number; why: string }>;

/** Files whose readings of the real clock change no verdict, each with how many it holds and why. */
const READS: Judged = {
  '__tests__/components/feed/ActivityCard.test.tsx': { sites: 1, why: 'the card is dated now only to be a log just filed; no test reads its time' },
  '__tests__/integration/offlineQueueFlush.test.ts': { sites: 2, why: 'when a count was asked, a second before and ten seconds after the tap on the same clock: only their order is read' },
  '__tests__/utils/mutationExecutor.test.ts': { sites: 2, why: 'a queued write is given an id and a stamp, only to be new; nothing reads either as a day' },
  'app/(modals)/__tests__/aNoticeIsDismissedWithoutSight.test.tsx': { sites: 1, why: 'a notice is dated now only to be a notice; no test reads its time' },
  'app/(modals)/__tests__/aSalonsDoorAndABallotAreDrawnAsWhatTheyAre.test.tsx': { sites: 1, why: 'a notice is dated now only to be a notice; no test reads its time' },
  'app/(modals)/__tests__/aVerdictsNoticeOpensItWhole.test.tsx': { sites: 1, why: 'a notice is dated now only to be a notice; no test reads its time' },
  'app/log/__tests__/theLogPageMovesEveryCard.test.tsx': { sites: 3, why: 'when a count was asked, now or a second before the tap on the same clock: only their order is read' },
  'app/log/__tests__/theRecordReadsTrue.test.tsx': { sites: 1, why: 'the clock is moved a second on from where it stood, for a second tap: a wait, not a day' },
  'e2e/__tests__/attack.test.ts': { sites: 1, why: 'the probe dates its row thirty days before its own reading of the clock, and this reading comes after: more than twenty-nine days at any hour' },
  'e2e/__tests__/flowHistory.test.ts': { sites: 1, why: 'a deadline by design: a flow named new in flow-history is held to fourteen days from the day written beside it, and fails once they pass' },
  'e2e/__tests__/runFlows.rehearsal.test.ts': { sites: 1, why: "the fake phone answers the runner's own clock, so its log's first line is stamped by it too, before every later reading; the stamp names no year, as a phone's log names none" },
  'e2e/__tests__/screenTimes.test.ts': { sites: 5, why: 'days written beside a learning screen, counted again by the script on its own clock: today is none or one day old, fifteen days ago is fifteen or sixteen, and each case holds at either; the last is a deadline by design, screen-learning.json held to fourteen days' },
  'e2e/__tests__/seed.rehearsal.test.ts': { sites: 3, why: 'the fake house is founded now and counts its own age on the same clock, in one run: a wait, not a day' },
  'mockups/tabs/__tests__/zz-dispatch.gen.test.tsx': { sites: 2, why: 'the filings of a drawn page, dated hours back from now so the page is of today; the test reads only that a page was drawn' },
  'mockups/tabs/__tests__/zz-reel.gen.test.tsx': { sites: 1, why: 'the logs of a drawn page, dated hours back from now so the page is of today; the test reads only that a page was drawn' },
  'scripts/__tests__/wake.test.ts': { sites: 1, why: 'the last time a daily schedule was due before now, under a day old at any hour, given to a check that takes any under twenty-six hours' },
  'src/components/__tests__/aSuspensionIsSaid.test.tsx': { sites: 1, why: 'a suspension ending an hour from now, read back from the store as the same words; nothing is weighed against a day' },
  'src/components/admin/__tests__/theTribunalAsksForASecondKey.test.tsx': { sites: 1, why: "the forward clock follows the test's own clock: this reading is of the clock the line before it set" },
  'src/components/dispatch/__tests__/ballotDesk.test.tsx': { sites: 2, why: "the timers are faked in this file's beforeEach, so the clock stands where it stood then: the closing is seven days from this same reading" },
  'src/components/dispatch/__tests__/composeScreen.test.tsx': { sites: 1, why: 'a draft kept now, only to be a draft that is fresh; no test reads its time' },
  'src/components/dispatch/__tests__/readerScreen.test.tsx': { sites: 11, why: 'ballots that close a day or three from now (a minute to spare) and filings ended or withheld now, each weighed by the page against the same clock a moment later: open, closing in so many days, or ended, at any hour' },
  'src/components/dispatch/__tests__/theReaderAtFullLength.test.tsx': { sites: 2, why: 'how long the capping took: a wait, not a day' },
  'src/components/feed/__tests__/aReelCardKeepsItsTime.test.tsx': { sites: 1, why: 'a card filed now, then the clock set twenty-six hours on from that same reading: an age, not a day' },
  'src/components/lounge/__tests__/speakingIsTheArchivists.test.tsx': { sites: 1, why: 'a queued message is stamped now only to be new; nothing reads the stamp as a day' },
  'src/components/lounge/__tests__/zz-lounge.gen.test.tsx': { sites: 1, why: 'the salons of a drawn page, last spoken in minutes back from now; the test reads only that a page was drawn' },
  'src/features/settings/__tests__/theSignOutNamesWhatItErases.test.tsx': { sites: 3, why: 'refused writes stamped now only to be writes; the test counts them, never their age' },
  'src/hooks/__tests__/aFeedMovesOnlyAtItsTop.test.tsx': { sites: 1, why: 'when the file opened, so the clock can be set an hour on from it: an age, not a day' },
  'src/hooks/__tests__/aMemberFileReadAgainKeepsItsLaterPages.test.tsx': { sites: 1, why: 'when the file opened, so the clock can be set six minutes on from it: an age, not a day' },
  'src/hooks/__tests__/aPageIsCurrentOnReturn.test.tsx': { sites: 1, why: 'when the file opened, so the clock can be set a time on from it: an age, not a day' },
  'src/hooks/__tests__/theWelcomeIsNotLostInTheBreath.test.tsx': { sites: 1, why: 'a member who joined a minute before now, under timers faked in the beforeEach: new at any hour' },
  'src/hooks/__tests__/theWelcomeWaitsForTheLobby.test.tsx': { sites: 1, why: 'a member who joined a minute before now, under timers faked in the beforeEach: new at any hour' },
  'src/hooks/__tests__/useBanCheck.test.ts': { sites: 2, why: 'a suspension ending an hour from now, and one that ended an hour ago: still on, and over, at any hour; its words are matched by their shape' },
  'src/lib/__tests__/aHostileLinkDecodesFast.test.ts': { sites: 2, why: 'how long the decoding took: a wait, not a day' },
  'src/lib/__tests__/aPhoneSignedOutStopsHearingTheMember.test.ts': { sites: 3, why: 'a session good for an hour from now, and a registration stamped a minute and then a term before now: ages on one clock' },
  'src/lib/__tests__/aRequestIsWrittenToTheE2ELog.test.ts': { sites: 1, why: 'the request is written as begun no earlier than this reading, which comes before it: an order, not a day' },
  'src/lib/__tests__/aSignOutWithNoNetworkStillSignsOut.test.ts': { sites: 1, why: 'a session good for an hour from now, only to be a session still good' },
  'src/lib/__tests__/aWrongClockIsSetByTheHouse.test.tsx': { sites: 4, why: "the house clock read after the phone's clock is set by a spy at one fixed moment (phoneHears): it is weighed against that moment" },
  'src/providers/__tests__/aRankGainedElsewhereIsSeen.test.tsx': { sites: 1, why: 'when the file opened, so the clock can be set minutes on from it: an age, not a day' },
  'src/services/__tests__/aShelfEntryIsOnlyAddedTo.test.ts': { sites: 1, why: 'a queued write stamped now only to be new; nothing reads the stamp' },
  'src/stores/__tests__/aCritiqueMarkIsReadBeforeItIsDrawn.test.ts': { sites: 1, why: 'critiques dated minutes back from now, only to be in order; no test reads their time' },
  'src/stores/__tests__/aSalonChannelFollowsTheSalon.test.ts': { sites: 1, why: "the forward clock follows the test's own clock: this reading is of the clock the line before it set" },
  'src/stores/__tests__/aSeatReadsAsTheHouseWillRead.test.ts': { sites: 3, why: 'a room the fake house dates now, and the clock held where it stands or set a minute on from it: waits, not days' },
  'src/stores/__tests__/aSessionEndedElsewhereKeepsTheirWork.test.ts': { sites: 4, why: 'queued and refused writes stamped now only to be writes; the test reads whose they are, never their age' },
  'src/stores/__tests__/interactionSlice.test.ts': { sites: 11, why: 'when a count was asked, a second before or moments after the tap on the same clock: only their order is read' },
  'src/stores/__tests__/lounge.test.ts': { sites: 1, why: 'a message with no date is dated now by the stand-in parser, only to have one; no test reads it' },
  'src/stores/__tests__/loungeActs.test.ts': { sites: 1, why: 'the clock set ten seconds on from where it stands, past the throttle: a wait, not a day' },
  'src/stores/__tests__/theNoticesSayWhatTheyCouldNotReach.test.tsx': { sites: 1, why: 'a notice is dated now only to be a notice; no test reads its time' },
  'src/stores/__tests__/theThrottleIsPerRoom.test.ts': { sites: 2, why: "the test's own clock starts from now and is moved on by hand; the forward clock follows it: waits, not days" },
  'src/utils/__tests__/aSuspendedMembersWritesWait.test.ts': { sites: 2, why: 'a suspension ending an hour from now, and one that ended a second ago: still on, and over, at any hour' },
  'src/utils/__tests__/handleNotice.test.ts': { sites: 2, why: 'a request stamped thirty-one and twenty-nine days before now, read back against the same clock: past thirty days and within them at any hour' },
  'src/utils/__tests__/mutationExecutor.test.ts': { sites: 3, why: 'a queued write is given an id and a stamp, only to be new; nothing reads either as a day' },
  'src/utils/__tests__/offlineQueue.integration.test.ts': { sites: 5, why: 'writes stamped now, and twenty-five and forty-eight hours before it, read back against the same clock: fresh, and past the day a write is kept, at any hour' },
  'src/utils/__tests__/queryClient.test.ts': { sites: 3, why: 'a kept cache stamped now only to be fresh; the tests read its size' },
  'src/utils/__tests__/sanitisationCallSites.test.ts': { sites: 7, why: 'a queued write stamped now only to be a write; the tests read its words' },
  'src/utils/__tests__/theDeadLetterIsNobodyElsesToKeep.test.ts': { sites: 4, why: 'refused writes stamped now only to be writes; the tests read whose they are' },
  'src/utils/__tests__/wordsRefusedForTheRankAreKept.test.ts': { sites: 1, why: 'the clock set two days on from where it stands, past the day a write is kept: an age, not a day' },
};

/** Files whose days still to come change no verdict as they pass, each with how many it holds and why. */
const DAYS_TO_COME: Judged = {
  'app/(admin)/__tests__/theTribunalJudgesWhatWasReported.test.tsx': { sites: 2, why: 'recordStanding is handed its moment: the day a sanction ends is weighed against that, never the clock' },
  'app/__tests__/aYearIsKeptForItsNextOpening.test.tsx': { sites: 7, why: "the clock is set by a spy on Date.now at 10 March 2027, ticking on from there: the days are that year's, before it" },
  'app/__tests__/aYearIsReadAgainOnReturn.test.tsx': { sites: 2, why: "the clock is set by a spy on Date.now at 10 March 2027, ticking on from there: the day is that year's, before it" },
  'app/__tests__/aYearJustEndedIsTold.test.tsx': { sites: 5, why: 'the clock is set by a spy on Date.now at each moment named (on): the days are weighed against it' },
  'app/log/__tests__/zz-log.gen.test.tsx': { sites: 1, why: 'the day a withheld log may be appealed by, printed on a drawn page; the test reads only that a page was drawn' },
  'app/person/__tests__/thePersonFileReadsTrue.test.tsx': { sites: 3, why: 'two are weighed against a today handed in; the third, 2099, stands for a film not yet out on the drawn page, true until that year' },
  'app/stacks/__tests__/zz-stacks.gen.test.tsx': { sites: 1, why: 'the day a withheld stack may be appealed by, printed on a drawn page; the test reads only that a page was drawn' },
  'scripts/__tests__/aTrainIsRehearsedOnACopyFirst.test.ts': { sites: 1, why: 'when a proof was written, kept on its stamp and weighed against nothing' },
  'scripts/__tests__/deferredActions.test.ts': { sites: 7, why: 'days written in a list of deferred steps, each weighed against a today handed in beside it' },
  'scripts/__tests__/wake.test.ts': { sites: 1, why: 'a 31st of November, given to the reader of times to be refused as no day' },
  'src/components/admin/__tests__/aBanIsLiftedByAnAdmin.test.tsx': { sites: 1, why: 'the day a suspension ends, said in words; nothing weighs it against the clock' },
  'src/components/admin/__tests__/anAppealIsHeardByAnotherModerator.test.tsx': { sites: 2, why: 'the day a suspension ends, said in words on the docket; nothing weighs it against the clock' },
  'src/components/dispatch/__tests__/readerScreen.test.tsx': { sites: 1, why: '2099 stands for a ballot still open, true until that year' },
  'src/components/dispatch/__tests__/theIssueIsTheCalendarDay.test.ts': { sites: 1, why: 'the last minute of a leap year, handed to issueOf for its number: no clock is read' },
  'src/components/film/__tests__/aViewingOnNewYearsDayKeepsItsYear.test.ts': { sites: 1, why: "a viewing's day handed to watchedLabel with the year to read it in: no clock is read" },
  'src/components/film/__tests__/filmDossier.test.tsx': { sites: 2, why: "a cancelled film's old date, weighed against a today handed in (the film opening in 2031 is drawn under a clock its test sets)" },
  'src/components/film/__tests__/zz-film.gen.test.tsx': { sites: 1, why: 'a film to open in 2031 on a drawn page; the test reads only that a page was drawn' },
  'src/components/moderation/__tests__/aMemberReadsTheVerdictWholeAndAppealsOnce.test.tsx': { sites: 2, why: 'the day to appeal by, said in words; nothing weighs it against the clock' },
  'src/components/moderation/__tests__/aVerdictIsReachedWithoutItsNotice.test.tsx': { sites: 2, why: '2099 stands for a suspension still running, true until that year' },
  'src/components/moderation/__tests__/aWithheldPieceIsMarkedForItsAuthor.test.tsx': { sites: 1, why: 'the day to appeal by, said in words; nothing weighs it against the clock' },
  'src/lib/__tests__/aRankEndsOnlyWhenTheStoreSaysSo.test.ts': { sites: 3, why: 'the day a rank ends, as the store says it, handed back unread: the store says whether it is active, never the clock' },
  'src/services/__tests__/aFilmReadEarlyIsReadAgain.test.ts': { sites: 7, why: 'release days weighed against a now handed in beside each' },
  'src/services/__tests__/aWithheldPieceIsReadWithItsMark.test.ts': { sites: 1, why: 'the day to appeal by, read from the house and handed on as written' },
  'src/services/__tests__/aYearCountsEveryViewing.test.ts': { sites: 1, why: 'the moment handed to the count as its now' },
  'src/services/__tests__/aYearIsReadToTheLast.test.ts': { sites: 1, why: "a viewing's day in a stand-in house, read by the year asked for; no clock is read" },
  'src/services/__tests__/yearInCinema.test.ts': { sites: 5, why: 'viewings weighed against a now handed in, and moments handed to yearToTell' },
  'src/stores/__tests__/anOpenBallotIsCountedForItsVoters.test.ts': { sites: 1, why: '2099 stands for a ballot still open, true until that year' },
  'src/utils/__tests__/aLeapDayIsADay.test.tsx': { sites: 11, why: 'the leap day of 2028 and the days beside it, each handed in as the moment, or set by a spy on Date.now (at)' },
  'src/utils/__tests__/anInstantIsReadOneWay.test.ts': { sites: 4, why: 'instants handed to the reader of instants, the leap day of 2028 and the far ends of its range: no clock is read' },
};

const HOOKS = new Set(['beforeEach', 'beforeAll']);
const isFn = (n: ts.Node) => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);
/** The function a node runs in, or the file when it runs as the file loads. */
const homeOf = (n: ts.Node): ts.Node => {
  for (let p = n.parent; p; p = p.parent) if (isFn(p) || ts.isSourceFile(p)) return p;
  return n.getSourceFile();
};
const within = (n: ts.Node, outer: ts.Node) => {
  for (let p: ts.Node | undefined = n; p; p = p.parent) if (p === outer) return true;
  return false;
};
const two = (n: number) => String(n).padStart(2, '0');

/** A file's readings of the clock, and its days still to come, that no clock set at a fixed moment holds. */
function looseIn(file: string, text: string): { reads: Site[]; daysToCome: Site[] } {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const src = (n: ts.Node) => n.getText(sf);
  const jestCall = (n: ts.Node, name: string): n is ts.CallExpression =>
    ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && src(n.expression.expression) === 'jest' && n.expression.name.text === name;

  /** A call that sets the clock at a fixed moment. */
  const isSet = (n: ts.Node): n is ts.CallExpression => {
    if (jestCall(n, 'setSystemTime')) return n.arguments.length > 0;
    if (!jestCall(n, 'useFakeTimers')) return false;
    const opts = n.arguments[0];
    if (!opts || !ts.isObjectLiteralExpression(opts)) return false;
    const named = (name: string) => opts.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && src(p.name) === name);
    const real = named('doNotFake')?.initializer;
    return !!named('now') && !(real && /['"]Date['"]/.test(src(real)));
  };
  const sets: ts.CallExpression[] = [];
  const gather = (n: ts.Node) => { if (isSet(n)) sets.push(n); ts.forEachChild(n, gather); };
  gather(sf);

  /** Each setting with what it holds: the rest of `home` when it runs in a body, every function of `block` when a hook of that block runs it. */
  const holds = sets.map((set) => {
    const home = homeOf(set);
    const call = home.parent;
    const hook = isFn(home) && call && ts.isCallExpression(call) && ts.isIdentifier(call.expression) && HOOKS.has(call.expression.text) && call.arguments[0] === home;
    return hook ? { set, block: homeOf(call) } : { set, home };
  });
  // What a setting's own argument reads is read before the clock is set; what a describe's body reads, before its hooks.
  const readHeld = (n: ts.Node) => holds.some((h) => (h.block
    ? within(n, h.block) && homeOf(n) !== h.block
    : !!h.home && within(n, h.home) && h.set.getEnd() <= n.getStart(sf)));
  // A day written out is judged where it is used: under the block's hook, after the setting, or as the setting's own moment.
  const dayHeld = (n: ts.Node) => holds.some((h) => within(n, h.set) || (h.block
    ? within(n, h.block)
    : !!h.home && within(n, h.home) && h.set.getEnd() <= n.getStart(sf)));

  const isRead = (n: ts.Node) =>
    (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && src(n.expression.expression) === 'Date'
      && n.expression.name.text === 'now' && n.arguments.length === 0)
    || (ts.isNewExpression(n) && src(n.expression) === 'Date' && (n.arguments?.length ?? 0) === 0)
    || (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['localCalendarDate', 'getLocalDateString'].includes(n.expression.text) && n.arguments.length < 2)
    || (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['houseNow', 'houseIso'].includes(n.expression.text) && n.arguments.length === 0);

  /** The latest day a node writes out, as YYYY-MM-DD, or null when it writes none. */
  const dayOf = (n: ts.Node): string | null => {
    if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      const days = [...n.text.matchAll(/(?<!\d)(?<y>\d{4})-(?<m>0[1-9]|1[0-2])-(?<d>0[1-9]|[12]\d|3[01])(?!\d)/g)]
        .map((m) => `${m.groups?.y}-${m.groups?.m}-${m.groups?.d}`);
      return days.sort().pop() ?? null;
    }
    const made = ts.isNewExpression(n) && src(n.expression) === 'Date' ? n.arguments
      : ts.isCallExpression(n) && src(n.expression) === 'Date.UTC' ? n.arguments : undefined;
    const nums = (made ?? []).slice(0, 3).map((a) => (ts.isNumericLiteral(a) ? Number(a.text) : NaN));
    const y = nums.at(0) ?? NaN;
    const m = nums.at(1) ?? NaN;
    const d = nums.at(2) ?? 1;
    if (!(y >= 1000 && y <= 9999) || !(m >= 0 && m <= 11)) return null;
    return `${y}-${two(m + 1)}-${two(d >= 1 && d <= 31 ? d : 1)}`;
  };

  const reads: Site[] = [];
  const daysToCome: Site[] = [];
  const at = (n: ts.Node): Site => ({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text: src(n).split('\n', 1).join('').slice(0, 80) });
  const visit = (n: ts.Node) => {
    if (isRead(n) && !readHeld(n)) reads.push(at(n));
    const day = dayOf(n);
    if (day && day > WRITTEN && !dayHeld(n)) daysToCome.push(at(n));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { reads, daysToCome };
}

/** This file: the shapes it feeds its own reader are written out in it. */
const SELF = 'test-utils/__tests__/aTestReadsAClockItHasSet.test.ts';
const tests = files('tests', { ext: ['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs'] }).filter((f) => rel(f) !== SELF);
const found = tests.map((f) => ({ file: rel(f), ...looseIn(f, readFileSync(f, 'utf8')) }));

/** Each file whose loose sites are not as many as it is judged to hold, with the lines to look at. */
const unjudged = (kind: 'reads' | 'daysToCome', judged: Judged) => found
  .filter((f) => f[kind].length !== (judged[f.file]?.sites ?? 0))
  .map((f) => `${f.file}: ${f[kind].length} at lines ${f[kind].map((s) => s.line).join(', ') || '(none)'}, judged ${judged[f.file]?.sites ?? 0}`);

const FIXED = "jest.useFakeTimers({ now: new Date('2026-10-03T12:00:00Z') });";
const loose = (text: string) => { const l = looseIn('a.test.tsx', text); return [l.reads.map((s) => s.line), l.daysToCome.map((s) => s.line)]; };

describe('a test reads a clock it has set', () => {
  it('reads every test file of mobile/, this one aside', () => {
    expect(tests.length).toBeGreaterThan(1000);
    expect(tests.map(rel)).toEqual(expect.arrayContaining([
      'src/components/lobby/__tests__/theWallKeepsTheDay.test.tsx', '__tests__/store.test.ts', 'e2e/__tests__/screenTimes.test.ts', 'scripts/__tests__/wake.test.ts',
    ]));
  });

  it('reads the clock only after setting it at a fixed moment, or where its file is judged, as often as it is judged', () => {
    expect(unjudged('reads', READS)).toEqual([]);
  });

  it('writes out a day still to come only under a clock set at a fixed moment, or where its file is judged, as often as it is judged', () => {
    expect(unjudged('daysToCome', DAYS_TO_COME)).toEqual([]);
  });

  it('judges only a file that is there, and says why for each', () => {
    const there = new Set(found.map((f) => f.file));
    for (const [f, { why }] of [...Object.entries(READS), ...Object.entries(DAYS_TO_COME)]) {
      expect(`${f}: ${there.has(f) ? 'there' : 'gone'}, ${why.length >= 20 ? 'says why' : 'no reason'}`).toBe(`${f}: there, says why`);
    }
  });

  it('finds the clock read in one describe and set in another: the day that turned under theWallKeepsTheDay', () => {
    expect(loose([
      "describe('the clock', () => {",
      `  it('reads again', () => { ${FIXED} show(new Date()); });`,
      '});',
      "describe('the wall', () => {",
      '  async function hang() { answer(editionDayOf(new Date())); }',
      "  it('behind the day', async () => { await hang(); expect(edition()).toBe(editionDayOf(new Date())); });",
      '});',
    ].join('\n'))).toEqual([[5, 6], []]);
  });

  it('holds a reading under a hook of its describe or of its file, and after a setting in its own body', () => {
    expect(loose(`describe('d', () => {\n  beforeEach(() => { ${FIXED} });\n  const at = () => Date.now();\n  it('t', () => { at(); houseNow(); localCalendarDate(); });\n});`)).toEqual([[], []]);
    expect(loose(`beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 3, 12)); });\nit('t', () => { new Date(); });`)).toEqual([[], []]);
    expect(loose(`it('t', () => {\n  ${FIXED}\n  const later = () => Date.now();\n  later();\n});`)).toEqual([[], []]);
    expect(loose(`${FIXED}\nconst opened = Date.now();`)).toEqual([[], []]);
    // An instant handed in is no reading.
    expect(loose("it('t', () => { new Date(5); localCalendarDate(0, 5); getLocalDateString(1, 5); });")).toEqual([[], []]);
  });

  it('finds a reading no setting holds: before it, beside it, in a describe\'s own body, or under timers faked at no moment', () => {
    expect(loose(`it('t', () => {\n  const before = Date.now();\n  ${FIXED}\n});`)).toEqual([[2], []]);
    expect(loose(`it('one', () => { ${FIXED} });\nit('two', () => { houseIso(); });`)).toEqual([[2], []]);
    expect(loose(`describe('d', () => {\n  beforeEach(() => { ${FIXED} });\n  const today = new Date();\n});`)).toEqual([[3], []]);
    expect(loose("beforeEach(() => { jest.useFakeTimers(); });\nit('t', () => { Date.now(); });")).toEqual([[2], []]);
    expect(loose("beforeEach(() => { jest.useFakeTimers({ doNotFake: ['nextTick'] }); });\nit('t', () => { getLocalDateString(3); });")).toEqual([[2], []]);
    expect(loose("beforeEach(() => { jest.useFakeTimers({ now: 5, doNotFake: ['Date'] }); });\nit('t', () => { localCalendarDate(); });")).toEqual([[2], []]);
    // The clock a setting's own moment is read from is read before it is set.
    expect(loose("it('t', () => { jest.setSystemTime(Date.now() + 1000); });")).toEqual([[1], []]);
    expect(loose("afterEach(() => { jest.setSystemTime(5); });\nit('t', () => { houseNow(); });")).toEqual([[2], []]);
  });

  it('finds a day still to come, written as words or as numbers, and lets be a past day, a setting\'s own moment and a day under a set clock', () => {
    expect(loose("const until = '2031-05-01T10:00:00Z';\nconst then = new Date(2031, 4, 1);\nconst at = Date.UTC(2099, 0, 1);\nconst said = `closes 2031-05-01`;")).toEqual([[], [1, 2, 3, 4]]);
    expect(loose(`const was = '${WRITTEN}';\nconst old = new Date(2026, 9, 3, 12);\nconst id = '5eed0000-0000-4000-8000-0000000b0c27';\nconst n = '12031-05-011';`)).toEqual([[], []]);
    expect(loose("beforeEach(() => { jest.useFakeTimers({ now: new Date(2031, 4, 1) }); });\nconst opens = '2031-07-16';")).toEqual([[], []]);
    expect(loose("describe('d', () => { beforeEach(() => { jest.setSystemTime(new Date('2031-01-02T12:00:00')); }); });\nconst opens = '2031-07-16';")).toEqual([[], [2]]);
    expect(loose(`it('t', () => {\n  const before = '2031-07-16';\n  ${FIXED}\n  const after = '2031-07-16';\n});`)).toEqual([[], [2]]);
  });
});
