# Tests that read source — the ledger

A test that reads a source file as text says that something is *spelled* in a
file. That is the right test when the spelling IS the rule — "no file calls
Intl", "this migration grants that column" — and the wrong one when the rule is
something a member sees or does, which a render can show and a string cannot.
Tests of the second kind churn: every refactor that keeps the behaviour breaks
them, and every one that breaks the behaviour but keeps the spelling passes.

Every test file under `app/`, `src/`, `mockups/`, `test-utils/` and `scripts/`
that reads a file (`readFileSync`, `readCode(`) is listed here with the reason
it does. `test-utils/__tests__/everySourceReaderIsLedgered.test.ts` fails when a
file reads source and is not listed, and when a listed file no longer exists or
no longer reads anything — so this ledger is always the whole list, never a
memory of one.

Source text is read through `test-utils/readCode.ts`, which strips comments
with the TypeScript parser: a regex strips a `//` inside a string, and matches a
comment that merely MENTIONS a banned name.

Decisions, as of 2026-09-28:

- **Converted** — its behaviour is tested by mounting the thing, and its layout
  measured on the drawn page (`mockups/`); what it still reads is only what no
  render reaches, each place saying why.
- **Sweep** — enumerates a whole CLASS across the codebase (every file, every
  style, every key). A render sees one screen; a sweep sees the files nobody
  rendered. Kept.
- **Contract** — the fact lives where no jest render reaches: a migration or the
  schema snapshot, a workflow, the build config, an edge function, a Maestro
  flow, or code that must not come back. Kept.
- **Mounted** — mounts the real thing, and reads source only for a fact the
  render cannot show. Kept.
- **Wiring** — asserts a call site exists ("the store calls the invalidator").
  This project measured that a correct function with its call sites deleted
  leaves the suite green, which is why these exist; each is convertible to
  a test that drives the path end to end, and should be when next touched.
- **Fixtures** — reads data or art files, not code. Listed so the list is whole.

## Converted

| File | What is still read, and why |
|---|---|
| `src/components/log/__tests__/logComposer.test.ts` | The seal follows the keyboard's frame (no keyboard in jest); the seal's height constant against the bar it stands for (the keyboard slide is not drawn); the verdict slot's minimum; a nested scroller that must not be a FlashList (jest's list draws everything); no orphaned styles. Behaviour: `theComposerKeepsItsWord.test.tsx`. Layout: `zz-composer.gen`. |
| `src/components/log/__tests__/logSurfaces.test.ts` | The colour vocabulary (a literal and its token render alike; only source shows which is used); store subscriptions by selector (until the render budgets cover the page). Behaviour: `app/log/__tests__/theRecordReadsTrue.test.tsx`. Layout: `zz-log.gen`. |
| `src/utils/__tests__/logScreenPolish.guard.test.ts` | Five contracts the log screen's render cannot show. Behaviour: `theLogSaysWhatHappened.test.ts`, `theSealLeavesWithTheScreen.test.tsx`, `theDossierSealIsSpoken.test.tsx`. |
| `src/components/__tests__/stackedRowHitSlop.test.ts` | Touch rules only for the 16 controls no drawn screen measures beside a neighbour; the rest are MEASURED (`layout.cjs` STEAL, CI `captures`) and held to `mockups/touch-measured.txt`. Keeps the sweep that every repeated control declares its halo. |

(Also converted this pass, and no longer reading source at all: the personPage test →
`app/person/__tests__/thePersonFileReadsTrue.test.tsx` + `zz-person.gen`;
`logTouchTargets` → the composer's drawn-coverage and SMALL checks in CI;
`noIntlInTheDispatch`, and the Intl checks in `FilmStub`, `FilmActionTray` and
`memberFile` → the app-wide no-Intl lint rule.)

## Sweep

| File | The class it enumerates |
|---|---|
| `src/components/__tests__/animation-parking.test.ts` | Every endless animation parks when its screen is not focused. |
| `src/utils/__tests__/everyPullSaysWhatItReached.guard.test.ts` | Every pull to refresh says the shared sentence when it reached nothing, or names who says it. |
| `src/utils/__tests__/aMemberBackSoonIsBackWhereTheyWere.test.ts` | The tab bar's three hooks into lastTab (remember on focus, stamp on leaving, reopen only a launch at the Lobby): the layout mounts the whole navigator, and the rule's own behaviour is tested on lastTab itself. |
| `src/utils/__tests__/offlineIsSaidOneWay.guard.test.ts` | Every toast that says a write was kept for later says it the house's one way. |
| `src/components/critique/__tests__/oneCritiqueRow.guard.test.ts` | Every screen that draws a member's critique (its spoken name, its DELETE) draws it through the one `CritiqueRow`. |
| `src/components/__tests__/authRouting.test.ts` | Every route to `/login` says which form it opens. |
| `src/components/__tests__/oneRankMark.test.ts` | The rank mark is drawn in one place; no surface draws its own. |
| `src/components/__tests__/overlayElevation.test.ts` | Every overlay out-ranks what it covers in Android's elevation order (a browser paints in DOM order, so no drawing shows it). |
| `src/components/__tests__/textContrast.test.ts` | Every muted text's opacity against its ground, from the stylesheets. |
| `src/components/__tests__/theCountHangsBesideItsMark.test.tsx` | Every bar with a count draws it through `MarkFigure`; mounts the bars too. |
| `src/components/__tests__/theToastIsDrawnOnTop.test.ts` | Every `<Modal>` and modal route carries its own toast host. |
| `src/components/__tests__/theRankBadgeIsReadable.test.ts` | Each rank's word against the ground it sits on, from the badge's styles. |
| `src/components/dispatch/__tests__/aControlsNameCanBeRead.test.ts` | No control on the Dispatch freezes its label's size. |
| `src/components/dispatch/__tests__/dispatchNoDeadControls.test.ts` | Every control on the Dispatch does something. |
| `src/components/dispatch/__tests__/everyLeadInIsAccountedFor.test.ts` | Every lead-in the paper can print is in the direction table. |
| `src/components/dispatch/__tests__/everyTextHasACeiling.test.ts` | Every text on the Dispatch has a ceiling (the house Text's is inert on a phone). |
| `src/components/dispatch/__tests__/feedRowIsRecyclable.test.ts` | The list-row rules the recycling list needs, across the feed's rows. |
| `src/components/dispatch/__tests__/nothingLivesOnlyInTheMockups.test.ts` | No component is imported only by the design record. |
| `src/components/dispatch/__tests__/oneWordNamesOneThing.test.ts` | One word names one thing, across the app's copy. |
| `src/components/dispatch/__tests__/theDispatchSaysEssay.test.ts` | The printed word is ESSAY wherever a member reads it; the wire word stays in the wire. |
| `src/components/film/__tests__/oneBrass.test.ts` | Every brass fill is the ramp, never a flat sepia. |
| `src/components/moderation/__tests__/reportSheetDimensions.guard.test.ts` | No module reads the window's size once at load. |
| `src/components/profile/__tests__/roomInset.test.ts` | One page inset, actually shared, across the rooms. |
| `src/constants/__tests__/aRankIsSoldEnforcedAndExplained.test.ts` | Every promise the Society sells is enforced by a gate and explained by a trigger. |
| `src/constants/__tests__/standing.test.ts` | One ladder of standing, used by every surface that names one. |
| `src/constants/__tests__/theVaultIsThePrivateNotes.test.ts` | "The Vault" means the private notes, everywhere. |
| `src/stores/__tests__/encryptionAtRest.guard.test.ts` | Every persisted store goes through the encrypted storage; drives the real module. |
| `src/stores/__tests__/logoutClearsEveryModuleCache.test.ts` | Every module-level cache has a logout reset. |
| `src/stores/__tests__/logoutLeavesNoTrace.guard.test.ts` | A real logout leaves no member key behind; every key is enumerated. |
| `src/stores/__tests__/staleWriteGuard.test.ts` | Every store write after an await re-checks the member. |
| `src/theme/__tests__/aPhotographIsNotLit.test.ts` | No edge light is laid on an image. |
| `src/theme/__tests__/theGroundLadder.test.ts` | Every ground is on the ladder. |
| `src/theme/__tests__/theRoomIsLit.test.ts` | Every screen painted in the house colour carries the room's light. |
| `src/theme/__tests__/theTextBoxGrowsWithItsText.test.ts` | Every box that holds text grows with it, and no text is grown twice. |
| `src/theme/__tests__/theTypeFloor.test.ts` | Every word a member reads is at least 10pt. |
| `src/theme/__tests__/theVeilMeetsTheLight.test.ts` | Every hero veil ends solid, on the room's own tone. |
| `src/theme/__tests__/wordsAreNotMarks.test.ts` | Words are set in inks, not pigments. |
| `src/theme/__tests__/wordsAreSolid.test.ts` | No word is drawn at partial opacity. |
| `src/components/layout/__tests__/everyListChoosesItsAnchor.guard.test.ts` | Every vertical FlashList chooses whether it anchors (the header race shows only on a device). |
| `src/utils/__tests__/everyControlHasAName.guard.test.ts` | Every control a screen reader can name, and every sheet it can leave (a render sees one screen). |
| `src/utils/__tests__/everyFileSurvivedTheShell.guard.test.ts` | No file is double-encoded by a shell round-trip. |
| `src/utils/__tests__/everyMemberKeyHasAnEraser.test.ts` | Every per-member storage key has an eraser. |
| `src/utils/__tests__/noControlCharacters.guard.test.ts` | No source file carries a raw control character. |
| `src/utils/__tests__/noMachinePaths.guard.test.ts` | No code names a place on one computer. |
| `src/utils/__tests__/prose-handlers.guard.test.ts` | Every handler that writes prose passes it through the sanitiser. |
| `src/utils/__tests__/searchFieldsDoNotAutocorrect.guard.test.ts` | Every search field turns autocorrect off (the keyboard's composing is not drawn in jest). |
| `src/utils/__tests__/searchWiring.guard.test.ts` | Every search call site uses the escaper, unquoted. |

## Contract

| File | Where the fact lives |
|---|---|
| `app/(admin)/__tests__/tribunalNeverLiesEmpty.guard.test.ts` | The RPC signature the queue calls, against the schema. |
| `app/__tests__/boot-structure.test.tsx` | The root layout mounts the bootstrapper (the root layout is the app; jest cannot mount it whole). |
| `src/components/dispatch/__tests__/everyRuleIsTrue.test.ts` | The house rules page against the schema's constraints. |
| `src/components/dispatch/__tests__/oneCapNotThree.test.ts` | The input's cap, the sanitiser's and the column's CHECK are one number. |
| `src/components/lounge/__tests__/theDoorIsAName.test.tsx` | The Lounge's door, and the Maestro flow that walks through it; mounts the gate too. |
| `src/components/profile/__tests__/hideStatsRemoved.guard.test.ts` | A retired control that must not come back as theatre. |
| `src/lib/__tests__/aRankIsOnlyTakenOnAnAnswer.test.ts` | The migration that ends a rank, against the client that asks. |
| `src/services/__tests__/certifyCountAuthority.test.ts` | The migration and the backend contract the count comes from. |
| `src/services/__tests__/everyNameAClientCallsExists.test.ts` | Every table and function a client calls exists in the schema snapshot. |
| `src/services/__tests__/tmdbProxyAllowsEveryPath.test.ts` | The edge function's allowed paths against every path the clients use. |
| `src/stores/__tests__/theSalonNameIsNotCutInSilence.test.ts` | The salon name's four limits, the column's among them. |
| `test-utils/__tests__/everyCommentIsTrue.test.ts` | The reading ledger (scripts/COMMENTS-READ.md) against the files comment-truth checks. |
| `src/utils/__tests__/aWithdrawnFilingKeepsNothing.test.ts` | Every column of a filing, emptied or kept when it ends, against the schema snapshot. |
| `src/utils/__tests__/appConfig.guard.test.ts` | The build configs: only the E2E build differs. |
| `src/utils/__tests__/ciAlert.behaviour.test.ts` | The CI alert's script, run out of its workflow. |
| `src/utils/__tests__/ciWorkflows.guard.test.ts` | Every workflow: actions pinned, permissions scoped. |
| `src/utils/__tests__/dispatchFieldCaps.test.ts` | The Dispatch's field caps against the migrations' CHECKs. |
| `src/utils/__tests__/maestroFlows.guard.test.ts` | Every Maestro flow names only what the app has. |
| `src/utils/__tests__/notificationColumns.guard.test.ts` | A notification column's four gates, the SELECT among them. |
| `src/utils/__tests__/schemaSnapshot.guard.test.ts` | The committed snapshot of production holds what it must. |
| `src/utils/__tests__/theFrontDeskAnswers.test.ts` | The support address, held in one place and printed from it. |
| `src/utils/__tests__/theTappedNoticeOpensIt.test.ts` | The push payload the edge function sends, against what the app reads. |
| `src/utils/__tests__/theRecordingsTravel.test.ts` | The sealed E2E world's TMDB recordings: every one its index names exists, and no `.gitignore` pattern hides it. |
| `test-utils/__tests__/readCode.test.ts` | The comment stripper itself. |

## Mounted

| File | The fact a render cannot show |
|---|---|
| `app/(modals)/__tests__/list-modal.curate.test.tsx` | Style blocks of the screen it mounts, for the layout values its assertions need. |
| `app/stacks/__tests__/stack-detail.redesign.test.tsx` | The nav's iOS-only blur and its single bar, beside the mounted catalogue. |
| `src/components/dispatch/__tests__/aDossierHasACover.test.tsx` | The page's band and the preview's gutter come from one constant. |
| `src/components/dispatch/__tests__/essayBody.test.tsx` | The renderer is mounted with the link guard (markdown otherwise opens `tel:` links itself). |
| `src/components/dispatch/__tests__/feedScreen.test.tsx` | The index row scrolls — this screen's tree cannot be serialised (FlashList holds a circular fiber). |
| `src/components/dispatch/__tests__/motionLaws.test.tsx` | Every motion is taken from the laws module. |
| `src/components/dispatch/__tests__/seriesScreen.test.tsx` | A part still to come reads its inks from the table, not a faded opacity. |
| `src/components/dispatch/__tests__/theBallotAndTheCount.test.tsx` | No paper component defaults a count the reader should pass. |
| `src/components/dispatch/__tests__/theInvitationHasAnAddress.test.tsx` | The desks' routes, beside the mounted picker. |
| `src/components/feed/__tests__/theKeyLeadsWhereItSays.test.tsx` | Where each key's route leads, beside the mounted cards. |
| `src/components/film/__tests__/trayActsFire.test.tsx` | Which acts close the tray after acting, and the one that deliberately does not. |
| `src/components/log/__tests__/theVaultBelongsToItsViewing.test.tsx` | The columns and services the note travels through. |
| `src/components/profile/__tests__/memberFile.test.tsx` | Sweeps of the page's files (every control named, every text capped), beside the mounted file. |
| `src/components/profile/__tests__/memberFileScreen.test.tsx` | The breathing wash runs only where something reads it. |
| `src/components/profile/__tests__/roomSearch.test.tsx` | Every room uses the one search box. |
| `src/components/profile/__tests__/rooms.test.tsx` | The rooms' shared vocabulary, across their files. |
| `src/components/profile/__tests__/taste.test.tsx` | The panels no longer fetch from the phone. |
| `src/components/society/__tests__/theSocietySellsWhatItSays.test.tsx` | The same price and claim on every surface that states one. |
| `src/features/settings/__tests__/settings.redesign.test.tsx` | The lock's room, the permission read, and the shared timings. |

## Wiring

| File | The call site it holds |
|---|---|
| `src/components/dispatch/__tests__/aDraftSurvivesThePhone.test.tsx` | The writing room backs its draft up. |
| `src/components/dispatch/__tests__/nothingIsLostQuietly.test.tsx` | Every composer keeps its draft, amends included. |
| `src/components/dispatch/__tests__/thePreviewIsThePage.test.tsx` | The preview draws with the page's own typography. |
| `src/components/dispatch/__tests__/theRailFitsOneScreen.test.ts` | The rail's tools against the budget that sized them. |
| `src/components/dispatch/__tests__/theRoomOnScreenDecidesTheGate.test.ts` | The salon's reads answer to the room on screen. |
| `src/components/dispatch/__tests__/theWritingRoomExplainsItself.test.ts` | Each tool on the rail carries its name. |
| `src/components/dispatch/__tests__/yourOwnRankOnYourOwnByline.test.ts` | Every composing screen builds the author from the one helper. |
| `src/components/film/__tests__/castRailFits.test.ts` | The rail uses the height computation it is tested with. |
| `src/components/film/__tests__/filmPageWiring.test.ts` | The film page's fades and retired pieces, where a render cannot reach. |
| `src/components/film/__tests__/footageRailFits.test.ts` | The rail uses the numbers it is tested with. |
| `src/components/film/__tests__/stubFits.test.ts` | The stub's caller keeps the date short. |
| `src/components/layout/__tests__/theThumbStaysInItsTrack.test.ts` | The scrollbar uses the clamped thumb. |
| `src/components/lounge/__tests__/theCorridorIsOpen.test.ts` | No layer of the Lounge refuses a member. |
| `src/components/lounge/__tests__/thePollRunsWhileWatched.test.ts` | The corridor polls only while it is on screen. |
| `src/components/reels/__tests__/theReelIsTheAdvertisement.test.ts` | The Reel shows itself to a visitor rather than a wall. |
| `src/hooks/__tests__/theArchivePagesOnWhatTheServerGave.test.ts` | The archive pages on the server's count. |
| `src/services/__tests__/profileRoomFilters.test.ts` | Each room filter reaches the query it sends. |
| `src/stores/__tests__/followGraph.wiring.guard.test.ts` | The follow loader's one way into the store, and the layout that reads the saved list. |
| `src/stores/__tests__/loungeErrors.guard.test.ts` | Every Lounge call reads the error supabase-js resolves with. |
| `src/stores/__tests__/socialSlice.unfollow.test.ts` | Cancelling a request clears it, online and offline. |
| `src/stores/__tests__/theHouseSaysWhy.test.ts` | The server's refusal sentence reaches the member. |
| `src/stores/domain/__tests__/aShelfIsNeverHeldHostage.test.ts` | The shelf's reads and removals are never gated. |
| `src/utils/__tests__/aNarrowedWriteMustSeeItsRefusal.test.ts` | Every narrowed write asks for its rows back. |
| `src/utils/__tests__/boundedCounts.guard.test.ts` | A bounded fetch never supplies the count on screen. |
| `src/utils/__tests__/dispatchMutationRegistry.test.ts` | A mutation type is registered in all four places. |
| `src/utils/__tests__/dispatchOfflineParity.test.ts` | The offline write sends what the online one does. |
| `src/utils/__tests__/dossierPublishing.guard.test.ts` | The essay's cap, sanitiser and draft order. |
| `src/utils/__tests__/feedInvalidation.guard.test.ts` | Every follow path refreshes the feed. |
| `src/utils/__tests__/handleGuard.wiring.guard.test.ts` | The widened handle guard is the one in use. |
| `src/utils/__tests__/handleHistory.wiring.guard.test.ts` | The rename fix is wired at every call site. |
| `src/utils/__tests__/handleNotice.reader.guard.test.ts` | The handle notice is read and shown. |
| `src/utils/__tests__/profileCountsCache.wiring.guard.test.ts` | The counts seed is used. |
| `src/utils/__tests__/theFunnelHasOneSeam.test.ts` | Every rope reports through the one funnel. |
| `src/utils/__tests__/theSocietyOpensOverYou.test.ts` | Every rope opens the Society over the room. |
| `src/utils/__tests__/lucideIconsAreBundled.guard.test.ts` | The phone bundle lists every icon the source imports (Metro, not jest, reads the list). |
| `src/lib/__tests__/sentryMeasures.test.ts` | No file mounts Sentry's touch recorder, which reads accessibility labels. |
| `src/theme/__tests__/nothingOvershoots.guard.test.ts` | Nothing in the app springs or bounces (the law of motion is a property of all source). |
| `src/utils/__tests__/everyRouteHasItsOwnNet.guard.test.ts` | Every route file exports the house crash net (Expo Router reads the export, not a render). |
| `src/utils/__tests__/everyBackHasAWayOut.guard.test.ts` | Every back goes through `nav.back()` or checks `canGoBack()` first (a dead back shows only on a cold-opened screen, which no render reaches). |

## Fixtures

| File | What it reads |
|---|---|
| `mockups/paper/__tests__/zz-paper.gen.test.tsx` | Poster art and fixture JSON for its drawings. |
