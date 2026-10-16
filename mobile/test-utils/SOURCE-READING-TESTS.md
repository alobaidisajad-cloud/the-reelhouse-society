# Tests that read source — the ledger

A test that reads a source file as text says that something is *spelled* in a
file. That is the right test when the spelling IS the rule — "no file calls
Intl", "this migration grants that column" — and the wrong one when the rule is
something a member sees or does, which a render can show and a string cannot.
Tests of the second kind churn: every refactor that keeps the behaviour breaks
them, and every one that breaks the behaviour but keeps the spelling passes.

Every jest test in `mobile/`, wherever it lives (the `tests` universe of
`test-utils/universe.js`), that reads a file (`readFileSync`, `readCode(`) is listed here with the reason
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
| `src/utils/__tests__/animationConfigsAreLiterals.guard.test.ts` | Every Reanimated config written in src/ and app/, read with TypeScript's checker: what no test runs. |
| `src/utils/__tests__/everyChannelIsPrivate.guard.test.ts` | Every supabase.channel call in app/ and src/, and the realtime.messages rules in production as it will be. |
| `src/utils/__tests__/everyClassIsAccountedFor.test.ts` | The register's classes.yaml and CLASSES.md, and each GUARDED class's named test files, read for their titles. |
| `src/utils/__tests__/everyMutantIsSound.guard.test.ts` | The mutant registry against the register's classes and their tests' titles, the past fixes in git, and the E2E scripts that judge a run; the verdicts kept, against the registry, git and the private record. |
| `src/utils/__tests__/hooks.guard.test.ts` | The hooks' files, their install, the committed snapshot the dump check must pass, and the CI step. |
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
| `src/components/layout/__tests__/aCentredCardScrollsAtTheLargestText.test.tsx` | Every React Native `<Modal>` in app/ and src/, read with TypeScript's parser and named with its kind, so a new one fails until it is said what it is; a centred card must be drawn in a CentredCard. Each centred card is MOUNTED at ×3.1 for its scroll, its words, its room and its ground: a render sees the modals it draws, not the one added tomorrow. |
| `src/hooks/__tests__/everyMainScreenTracesItsScroll.guard.test.ts` | Each main screen (MAIN_ROUTES) names the file that draws its scroll, and that file traces it to Sentry: a stutter in a scroll is only measured on the phones, which no render shows. |
| `src/utils/__tests__/everyCheckRuns.guard.test.ts` | Every workflow file, npm script and tsconfig, read for whether anything runs it: a check nobody runs reads as coverage, which no render shows. Every script file too, and the store builds' preflight. |
| `src/utils/__tests__/everyDoorLeadsToARoute.guard.test.ts` | Every navigation target app/ and src/ write, read with TypeScript's parser, against the routes app/'s files make: a mistyped path compiles and fails only when pressed. |
| `src/utils/__tests__/everyPictureStatesItsCache.guard.test.ts` | Every expo-image picture in app/ and src/, read with TypeScript's parser: each states its `cachePolicy`, and one on another policy is listed with its reason. A picture with none decodes again on every visit, which no render shows. |
| `src/components/motion/__tests__/exitingIsNeverUsed.guard.test.ts` | Every JSX attribute in app/ and src/, read with TypeScript's parser: none is Reanimated's `exiting`, which withholds a removal React has made and can destroy React on Android; and the count of exits that play through `PresenceView`. Leaving is tested by mounting (`Presence.test.tsx`). |
| `src/components/__tests__/busterRegister.test.ts` | Every place Buster is drawn, read from each file's syntax tree (a renamed import followed), held to the register (one to a screen, never in a row); and every picture of him, by file and by its PNG's own pixel size. His behaviour is tested by mounting him (`Buster.test.tsx`). |
| `src/theme/__tests__/aFlatSurfaceCastsNothing.test.ts` | Every style that spreads `effects.flat` and still carries elevation (a black shadow on Android before 9); an exact ratchet, lowered as each feature is read. |
| `src/hooks/__tests__/aSheetComesAndGoesOnce.test.tsx` | No sheet unmounts itself at the end of its own fall; useSheetPresence is the one place (its behaviour is tested on the hook). |
| `test-utils/__tests__/everyTestClientKeepsTheHouseRules.test.ts` | Every `new QueryClient(` in the tree: only the app's client and testQueryClient(), both built from queryPolicy.ts. What the test client does is tested by the screens that render with it. |
| `src/hooks/__tests__/aSheetStaysAboveTheKeyboard.test.tsx` | The film and series sheets are wrapped in the lift; the lift itself is tested on the hook (a keyboard cannot be rendered). |
| `src/features/settings/__tests__/anExportIsWhole.test.ts` | Every export of the private notes names their key (the viewing); the paging itself is tested on readAllRows. |
| `src/utils/__tests__/everyPullSaysWhatItReached.guard.test.ts` | Every pull to refresh says the shared sentence when it reached nothing, or names who says it. |
| `src/utils/__tests__/aMemberBackSoonIsBackWhereTheyWere.test.ts` | The tab bar's three hooks into lastTab (remember on focus, stamp on leaving, reopen only a launch at the Lobby): the layout mounts the whole navigator, and the rule's own behaviour is tested on lastTab itself. |
| `src/utils/__tests__/migrationSafety.guard.test.ts` | The scripts that hold the database address, read for how they read it; the rules' wiring; old-clients.json, each shipped client held to its rules. |
| `src/utils/__tests__/offlineIsSaidOneWay.guard.test.ts` | Every toast that says a write was kept for later says it the house's one way. |
| `src/components/critique/__tests__/oneCritiqueRow.guard.test.ts` | Every screen that draws a member's critique (its spoken name, its DELETE) draws it through the one `CritiqueRow`. |
| `src/components/__tests__/authRouting.test.ts` | Every route to `/login` says which form it opens. |
| `src/components/__tests__/oneRankMark.test.ts` | The rank mark is drawn in one place; no surface draws its own. |
| `src/components/__tests__/theHouseSignsWithItsLogo.test.tsx` | Which files import a stand-in eye (ReelEyeIcon, lucide's Eye): an import is the spelling of the rule. What the banner draws is rendered, in the same file. |
| `src/components/__tests__/aTabDrawsItsIconOnce.test.tsx` | No file sets `tabBarIcon`, and every tab the bar shows names its own button: a spelling that brings back React Navigation's double icon. What a tab draws is rendered, in the same file. |
| `src/components/__tests__/overlayElevation.test.ts` | Every overlay out-ranks what it covers in Android's elevation order (a browser paints in DOM order, so no drawing shows it). |
| `src/components/__tests__/aLabelIsSpoken.test.ts` | Every View that carries an accessibility label or role is `accessible`, or a container whose children are. |
| `src/lib/__tests__/aResolvedErrorIsRead.test.ts` | Every supabase answer whose `error` is not read — awaited, or taken out of a `Promise.all` — is read, or judged with its reason. |
| `src/utils/__tests__/everyDoorGoesThroughNav.test.ts` | Every raw router call outside nav, counted exactly so the count only falls as features move to nav. |
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
| `src/components/moderation/__tests__/everyModerationRowActs.guard.test.ts` | Every BLOCK, MUTE, UNBLOCK and UNMUTE handler a screen gives the moderation sheet performs its act: the sheet acts through its handlers alone, and a render of one screen cannot see the others. |
| `src/components/moderation/__tests__/reportSheetDimensions.guard.test.ts` | No module reads the window's size once at load. |
| `src/components/profile/__tests__/roomInset.test.ts` | One page inset, actually shared, across the rooms. |
| `src/constants/__tests__/aMemberWhoLeftIsNamedOneWay.test.tsx` | That the database's mark for a departed member is written in one file, and that the Lounge store keeps no "unknown" stand-in: a sweep and an absence no render can show. Behaviour: the same file renders the critique row and reads a reply aloud. |
| `src/constants/__tests__/aRankIsSoldEnforcedAndExplained.test.ts` | Every promise the Society sells is enforced by a gate and explained by a trigger. |
| `src/constants/__tests__/standing.test.ts` | One ladder of standing, used by every surface that names one. |
| `src/constants/__tests__/theVaultIsThePrivateNotes.test.ts` | "The Vault" means the private notes, everywhere. |
| `src/stores/__tests__/encryptionAtRest.guard.test.ts` | Every persisted store goes through the encrypted storage; drives the real module. |
| `src/stores/__tests__/logoutClearsEveryModuleCache.test.ts` | Every module-level cache has a logout reset. |
| `src/stores/__tests__/logoutLeavesNoTrace.guard.test.ts` | A real logout leaves no member key behind; every key is enumerated. |
| `src/stores/__tests__/staleWriteGuard.test.ts` | Every store write after an await re-checks the member. |
| `src/theme/__tests__/aGlowFadesInsideItsBox.guard.test.ts` | Each radial glow's box where its users lay it (a route's own sheet, the welcome page's scroll padding, the seal's halo size): no render here lays a box out on a screen. |
| `src/theme/__tests__/aTextGlowHasRoom.guard.test.ts` | Every style with a wide text shadow across the app, and React Native's own Android text view, whose clipping is the rule: a sweep of styles no render measures. |
| `src/theme/__tests__/aPhotographIsNotLit.test.ts` | No edge light is laid on an image. |
| `src/theme/__tests__/theGroundLadder.test.ts` | Every ground is on the ladder. |
| `src/theme/__tests__/theRoomIsLit.test.ts` | Every screen painted in the house colour carries the room's light. |
| `src/theme/__tests__/aGradientIsNeverABitmap.guard.test.ts` | No drawing that is only a gradient is an SVG (a bitmap the size of its view), and no radial gradient is written in the single-size form React Native misreads: what an SVG holds is spelling no render shows. |
| `src/theme/__tests__/theTextBoxGrowsWithItsText.test.ts` | Every box that holds text grows with it, and no text is grown twice. |
| `src/theme/__tests__/theTypeFloor.test.ts` | Every word a member reads is at least 10pt. |
| `src/theme/__tests__/theVeilMeetsTheLight.test.ts` | Every hero veil ends solid, on the room's own tone. |
| `src/theme/__tests__/wordsAreNotMarks.test.ts` | Words are set in inks, not pigments. |
| `src/theme/__tests__/wordsAreSolid.test.ts` | No word is drawn at partial opacity. |
| `src/components/layout/__tests__/everyListChoosesItsAnchor.guard.test.ts` | Every vertical FlashList chooses whether it anchors (the header race shows only on a device). |
| `src/stores/__tests__/everyPersistedStoreWaitsForTheKey.guard.test.ts` | Every persisted store skips hydration and is rehydrated by the root layout after the encryption key. |
| `src/utils/__tests__/aHiddenControlIsHiddenWhole.guard.test.ts` | No pressable is hidden from screen readers by halves (a backdrop is drawn only inside its sheet). |
| `src/utils/__tests__/everyControlHasAName.guard.test.ts` | Every control a screen reader can name, and every sheet it can leave (a render sees one screen). |
| `src/utils/__tests__/everyFileSurvivedTheShell.guard.test.ts` | No file is double-encoded by a shell round-trip. |
| `src/utils/__tests__/everyMemberKeyHasAnEraser.test.ts` | Every per-member storage key has an eraser. |
| `src/utils/__tests__/everyQueuedWriteHasItsKind.test.ts` | Every `enqueueMutation` call site in the app, and the kind each type it queues has in the typed map. |
| `src/utils/__tests__/noControlCharacters.guard.test.ts` | No source file carries a raw control character. |
| `src/utils/__tests__/noMachinePaths.guard.test.ts` | No code names a place on one computer. |
| `src/utils/__tests__/noPageAddsToTheInset.guard.test.ts` | Every file in app/ and src/, read with TypeScript's parser: no sum on the safe-area inset's top or bottom, no bare inset as a top or a foot, no bare bottom inset handed to any helper but navMetrics' own, and no `navTopPadding(`, `tabBarHeight(` or `tabBarBottomPadding(` outside navMetrics (and the tab layout). Where each page starts and ends is tested by mounting it (everyTabStartsBelowTheBar, everyPushedHeaderStartsAtItsTop, everyModalAndOverlayStartsAtItsTop, everyTabEndsAboveTheTabBar, everyPushedScreenEndsAboveItsFoot, everyModalSheetAndOverlayEndsAboveItsFoot, aCentredPageScrollsAtTheLargestText). |
| `src/utils/__tests__/prose-handlers.guard.test.ts` | Every handler that writes prose passes it through the sanitiser. |
| `src/utils/__tests__/searchFieldsDoNotAutocorrect.guard.test.ts` | Every search field turns autocorrect off (the keyboard's composing is not drawn in jest). |
| `src/utils/__tests__/searchWiring.guard.test.ts` | Every search call site uses the escaper, unquoted. |
| `src/utils/__tests__/runtimeLacks.guard.test.ts` | Every line of app/ and src/, read with TypeScript's parser for an API the phone's runtime lacks (src/utils/runtimeLacks.json): jest sees only the lines a test runs. Also jest.setup.ts, which must take that same list away and no other. |
| `test-utils/__tests__/aSweepAsksTheUniverse.test.ts` | Every test and script, read as code: none lists a folder itself, unless named with why. Which call a file makes is in its source. |
| `test-utils/__tests__/theUniverseNamesEveryFile.test.ts` | expo-router's own route pattern, read from the installed package, against the route files: which files the router loads is in its source. |
| `__tests__/animationMockCoverage.test.ts` | Every animation builder the app names in a prop, against the reanimated mock. |
| `__tests__/colorLock.test.ts` | Every raw hex colour in the app, counted against the committed baseline. |
| `__tests__/notificationsMockCoverage.test.ts` | Every expo-notifications member the app calls, against the mock in jest.setup.ts. |
| `__tests__/tmdbMockCoverage.test.ts` | Every TMDB method the app calls, against the mock. |

## Contract

| File | Where the fact lives |
|---|---|
| `app/(admin)/__tests__/tribunalNeverLiesEmpty.guard.test.ts` | The RPC signature the queue calls, against the schema. |
| `app/__tests__/boot-structure.test.tsx` | The root layout mounts the bootstrapper (the root layout is the app; jest cannot mount it whole). |
| `src/components/__tests__/theKeyboardHasRoom.test.tsx` | The root layout puts the whole app inside the keyboard's room (jest cannot mount the root whole); the room itself is mounted. |
| `src/components/dispatch/__tests__/everyRuleIsTrue.test.ts` | The house rules page against the schema's constraints. |
| `src/components/dispatch/__tests__/oneCapNotThree.test.ts` | The input's cap, the sanitiser's and the column's CHECK are one number. |
| `src/components/lounge/__tests__/theDoorIsAName.test.tsx` | The Lounge's door, and the Maestro flow that walks through it; mounts the gate too. |
| `src/components/profile/__tests__/hideStatsRemoved.guard.test.ts` | A retired control that must not come back as theatre. |
| `src/lib/__tests__/aRankIsOnlyTakenOnAnAnswer.test.ts` | The migration that ends a rank, against the client that asks. |
| `src/services/__tests__/certifyCountAuthority.test.ts` | The migration and the backend contract the count comes from. |
| `src/services/__tests__/aReportIsFiledThroughOneDoor.test.ts` | Every client (the app and the web) files a report through submit_report, and the web offers only reasons the table accepts; the migration it relies on is rehearsed on the database. |
| `src/services/__tests__/everyNameAClientCallsExists.test.ts` | Every table and function a client calls exists in the schema snapshot. |
| `src/services/__tests__/aQueryAsksOnlyForWhatExists.test.ts` | Every column a query in the app, the website or an edge function selects, filters, orders by or writes exists in the schema snapshot, and every function is called with arguments it takes: a mocked client accepts any column and any argument, so only the source and the snapshot can say. |
| `src/utils/__tests__/everyCapAnswersToItsColumn.test.ts` | Every cap in MAX_LENGTHS against its column's CHECK, parsed from the schema snapshot: the limit lives only in the database. |
| `src/services/__tests__/tmdbProxyAllowsEveryPath.test.ts` | The edge function's allowed paths against every path the clients use. |
| `src/services/__tests__/theVaultHasOneDoor.guard.test.ts` | No file but VaultService queries log_private_notes. |
| `src/constants/__tests__/theHouseLinksToItself.guard.test.ts` | No code sends a link to reelhouse.app, another company's domain. |
| `src/utils/__tests__/imagePrefetchSites.guard.test.ts` | Every place that fetches a picture ahead is a listed one, at the size its screen draws: which calls exist, and with which size, is in the source. |
| `src/utils/__tests__/expoImagePatch.guard.test.ts` | The installed expo-image holds the patch, and package.json, node_modules and the patch's file name name one version; the patch, the install script and the EAS upload rules are files, and no render reaches native code. |
| `src/components/profile/__tests__/theProfileRedrawsForItsOwn.guard.test.ts` | The member page subscribes to its eight film-store fields, never the whole store. |
| `src/stores/__tests__/theSalonNameIsNotCutInSilence.test.ts` | The salon name's four limits, the column's among them. |
| `src/components/theme/__tests__/oneBrassSheen.test.tsx` | Both brass plates import the one BrassSheen, and no screen keeps a copy. Behaviour: the same file renders it in front, behind a tab and under Reduce Motion. |
| `src/components/lounge/__tests__/theSealSaysWhatTheCountMeans.test.tsx` | The card's unread limit against the LIMIT in the SQL that counts it. Behaviour: the same file renders the card at each count. |
| `src/stores/__tests__/aReactionIsOneOfFive.test.ts` | The app's five reactions against the CHECK in the schema snapshot. |
| `test-utils/__tests__/everyCommentIsTrue.test.ts` | The reading ledger (scripts/COMMENTS-READ.md) against the files comment-truth checks. |
| `src/utils/__tests__/aWithdrawnFilingKeepsNothing.test.ts` | Every column of a filing, emptied or kept when it ends, against the schema snapshot. |
| `src/utils/__tests__/addOnly.guard.test.ts` | Every migration in both trees, read by the add-only check, and the CI job that runs it. |
| `src/utils/__tests__/appConfig.guard.test.ts` | The build configs: only the E2E build differs; EAS uploads the commit alone, numbered as committed; the project, update feed and Sentry project as the services hold them, and Metro's config writing the maps. |
| `src/utils/__tests__/releaseGuard.guard.test.ts` | The workflow steps that run the release guard (never on the E2E app), the Maestro flow that opens the sitemap cold, the trace's one switch and the written exception's file: workflows, flows and which code can turn E2E on are files no render reaches. The rules themselves run on built inputs. |
| `src/utils/__tests__/ciAlert.behaviour.test.ts` | The CI alert's script, run out of its workflow. |
| `src/utils/__tests__/ciWorkflows.guard.test.ts` | Every workflow: actions pinned, permissions scoped; the advisers run in their count-only mode, and known-vulnerable packages are judged where the item says; jest and the captures run in parts their read-together jobs count alike, jest in every zone of `scripts/test-timezones.js`; every gate runs on main or a schedule; a step let fail is a download tried again. |
| `src/utils/__tests__/dispatchFieldCaps.test.ts` | The Dispatch's field caps against the migrations' CHECKs. |
| `src/utils/__tests__/easUpload.guard.test.ts` | Every .gitignore rule against the root .easignore, which EAS reads in their place. |
| `src/utils/__tests__/maestroFlows.guard.test.ts` | Every Maestro flow names only what the app has. |
| `src/utils/__tests__/notificationColumns.guard.test.ts` | A notification column's four gates, the SELECT among them. |
| `src/utils/__tests__/rehearsalsRunInCi.guard.test.ts` | Every production rehearsal (SQL a person runs on production), its kit, the seed and the CI step that runs them: each opens and ends the one way, holds no transaction control or real member's id, and CI runs them all. What each case asks is run by e2e/db/rehearsals.mjs in db-integration.yml. |
| `src/utils/__tests__/secretsScan.guard.test.ts` | The secrets scan's rules, its baseline and the job that runs them: the files ARE the rule. |
| `src/utils/__tests__/schemaSnapshot.guard.test.ts` | The committed snapshot of production holds what it must. |
| `src/utils/__tests__/theLineEndsChangeNoFunction.guard.test.ts` | Production's function bodies in the snapshot, for a carriage return inside quoted text, and every file the train applies or rehearses, for its line ends: the bytes are the rule. |
| `src/utils/__tests__/theFrontDeskAnswers.test.ts` | The support address, held in one place and printed from it. |
| `src/utils/__tests__/theTappedNoticeOpensIt.test.ts` | The push payload the edge function sends, against what the app reads. |
| `src/utils/__tests__/theRecordingsTravel.test.ts` | The sealed E2E world's TMDB recordings: every one its index names exists, and no `.gitignore` pattern hides it. |
| `src/utils/__tests__/runtimeDump.contract.test.ts` | The phone's own runtime, as the sealed E2E build wrote it (the committed copy), against Node and the list of what the phone lacks; until a run writes it, the register's pending note. No jest engine is the phone's. |
| `test-utils/__tests__/readCode.test.ts` | The comment stripper itself. |
| `test-utils/__tests__/oneCommentStripper.test.ts` | No file takes comments out with a regex of its own; the parser is the only stripper. |
| `__tests__/backendContract.test.ts` | Every RPC and edge function the app calls, against the backend contract file. |
| `__tests__/deletionIntegrity.test.ts` | The deletion migration it holds to its rules. |
| `__tests__/moderationActs.test.ts` | The moderation migration and both clients' tribunal screens. |
| `__tests__/schemaLengthCaps.test.ts` | The text ceilings in the migrations and the snapshot, against both clients' limits. |
| `__tests__/searchPathHardening.test.ts` | Every migration in both trees: each SECURITY DEFINER function pins pg_temp. |
| `e2e/__tests__/advisers.test.ts` | The advisers' allowlist and the sealed world's config.toml. |
| `e2e/__tests__/advisories.test.ts` | The reports its own runs of advisories.mjs wrote, and the advisories' allowlist. |
| `e2e/__tests__/anonKey.test.ts` | The E2E workflow and the sealed world's config.toml. |
| `e2e/__tests__/attack.test.ts` | The attack matrix, the schema snapshot and the pending migrations: every table, view and callable function production will have must have its written rules. |
| `e2e/__tests__/glideLogLevel.test.ts` | The E2E workflow and package.json. |
| `e2e/__tests__/iosLaunch.test.ts` | The iPhone launch workflow. |
| `e2e/__tests__/keyboardRoom.test.ts` | The flow runner, the keyboard flows and the app's code, for the ids a probe taps. |
| `e2e/__tests__/prefetchDownloadOnly.test.ts` | The E2E workflow (.github/workflows/e2e.yml). |
| `e2e/__tests__/runFlows.rehearsal.test.ts` | The flow runner, its screen ceilings and the state its own run wrote. |
| `e2e/__tests__/screenTimes.test.ts` | The record its own run wrote, the flows the runner runs, and the screen-time history its ceilings are derived from. |
| `e2e/__tests__/shardVerdict.test.ts` | The E2E workflow (.github/workflows/e2e.yml). |
| `e2e/__tests__/shards.test.ts` | The shard map and the E2E workflow. |
| `e2e/__tests__/flowHistory.test.ts` | The flow history, the shard map it must make, and the E2E workflow's limits around it. |
| `e2e/__tests__/functionsWorld.test.ts` | Every deployed edge function's code, the sealed world's config.toml, the functions world's scripts and the DB workflow's functions job: each function served, loaded and asked, and each outside address it reads stood in for. No jest render reaches Deno code. |
| `src/utils/__tests__/resumeSaysWhereTheWorkStands.test.ts` | APPLIED.txt, against the shared migration list, and resume.cjs's own text for how it finds the private folder: the record of what production has applied is a file, not a render. |
| `src/utils/__tests__/everySecretIsInventoried.test.ts` | Every functions tree, script, workflow, the schema snapshot and eas.json, for the names they read, against the inventory: which secret a file reads is spelled in the file. |
| `src/utils/__tests__/everyEventIsAwaited.guard.test.ts` | Every test file, parsed, for each fireEvent, act and renderHook nobody waits for: a sweep of the tests themselves, which no render of a screen sees. |
| `src/utils/__tests__/aFailedToolSaysWhy.guard.test.ts` | Every script that ships, for each run of another program: its answer heard, or why not named; each catch of a run or a fetch reporting the cause. |
| `src/utils/__tests__/aSecondPressWaitsOutTheDebounce.guard.test.ts` | Every test file, parsed, for a control pressed again with no time passed: a sweep of the tests themselves. |
| `src/utils/__tests__/anAbsenceIsAnchored.guard.test.ts` | Every test file, parsed, for a test that only finds things absent on a screen: a sweep of the tests themselves. |
| `src/utils/__tests__/revenuecatWebhookDecide.test.ts` | The app's limit on a call to the house (src/lib/supabase.ts), which the store's own limit, in Deno, must stay under: no one runtime holds both. |
| `e2e/__tests__/startStack.test.ts` | The stack's start script, its workflows and the sealed world's config.toml. |
| `plugins/__tests__/withoutDevLauncherScanner.test.ts` | The installed expo-dev-launcher's manifest, for the entry the plugin removes, and app.json's plugins. |
| `plugins/__tests__/withSplashWithoutHandoff.test.ts` | The generated MainActivity fixture, app.json's plugins and the app's code, for who imports the splash screen. |

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
| `src/components/layout/__tests__/everyModalAndOverlayStartsAtItsTop.test.tsx` | Which routes the root layout presents as modals (its `Stack.Screen` options), so a new one is measured; every modal and overlay is mounted. |
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
| `src/components/profile/__tests__/portraitInitial.test.ts` | Both member-file screens ask `portraitInitial`, the DNA card takes its handle's, and each letter is kept from the screen reader (UNSPOKEN is a prop, which a render of three screens and a Lounge room would need far more setup to reach). |
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
| `src/hooks/__tests__/anArrivalAlwaysArrives.test.tsx` | A ratchet: the count of mount-time `entering` animations across the app, which only falls as each moves to useArrival. A count over every file is the rule; no render reaches it. (The rescue itself is tested by mounting.) |
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
| `src/utils/__tests__/aLetterIsTakenWhole.guard.test.ts` | No file takes a first letter by hand: each comes from `initialOf` / `firstCharacter` (a cut letter shows only for a name in another script, which few renders hold). |

## Fixtures

| File | What it reads |
|---|---|
| `mockups/paper/__tests__/zz-paper.gen.test.tsx` | Poster art and fixture JSON for its drawings. |
| `scripts/__tests__/mergeCoverage.test.ts` | The coverage summaries jest and merge-coverage.cjs write for a small project it makes in a temporary folder: their numbers are the thing compared. |
| `src/utils/__tests__/aHandleIsJudgedByItsWords.test.ts` | The handle filter's word lists in the database migration and the live schema, and the website's copy of the rule: one rule in three places, which no render reaches. Behaviour: the same file's cases, and `a_handle_is_judged_by_its_words_rehearsal.sql` on production. |
| `src/utils/__tests__/aMembersWordsAreCleaned.test.ts` | Every text column a member can write, read from the snapshot's grants, is cleaned by its table's trigger or named with its reason: a column added later is a place the cleaning does not reach until someone remembers it. Behaviour: `a_members_words_are_cleaned_rehearsal.sql` on production. |
| `src/utils/__tests__/theDatabaseCleansAsTheAppDoes.test.ts` | The corpus file holds every case with cleanForStorage's own answer; the database is held to the same answers by the sealed E2E (verify-cleaning.mjs). |
| `src/utils/__tests__/websiteFreeze.guard.test.ts` | The website freeze's CI step and Dependabot's paused website entry. |
| `src/theme/__tests__/everyStyleIsRead.guard.test.ts` | Every key of every StyleSheet is read somewhere in the app: a style nobody draws renders nothing, so no render can find it. |
| `src/components/__tests__/aComponentHasOneName.guard.test.ts` | Which module exports a component name: a fact about the code that no render shows. |
| `e2e/__tests__/appCrashes.test.ts` | Recorded device logs, as fixtures for the crash gate. |
| `e2e/__tests__/attempt.test.ts` | A recorded device log, as a fixture for the attempt judge. |
| `e2e/__tests__/flowScreens.test.ts` | The files its own run of flow-screens.mjs wrote. |
| `e2e/__tests__/passwordNeverLeaves.test.ts` | The artifacts its own run of the scrubber wrote. |
| `e2e/__tests__/runtimeDump.test.ts` | The runtime file its own run wrote. |
