# Every comment, read

`scripts/comment-truth.js` checks what a machine can: a comment names only
what exists, points at no line, tells no history, and is no longer than its
code. It cannot tell whether a comment's CLAIM is true. That takes reading the
comment against the code it describes, and this is the record that every file
was read that way — not a sample, every one.

A new file gets a row when it is written (`everyCommentIsTrue` fails
without one). "Read" is the day its comments were last read against its code.

| File | Read | What changed |
|---|---|---|
| __tests__/animationMockCoverage.test.ts | — |  |
| __tests__/backendContract.test.ts | — |  |
| __tests__/colorLock.test.ts | — |  |
| __tests__/components/feed/ActivityCard.test.tsx | 2026-10-01 | the poster says its film; the card lies flat |
| __tests__/deletionIntegrity.test.ts | — |  |
| __tests__/integration/errorBoundaryRecovery.test.tsx | — |  |
| __tests__/integration/feedFlow.test.ts | 2026-10-01 | one path, refusals raised |
| __tests__/integration/helpers.ts | — |  |
| __tests__/integration/notificationPagination.test.ts | — |  |
| __tests__/integration/offlineQueueFlush.test.ts | — |  |
| __tests__/integration/setup.test.ts | — |  |
| __tests__/integration/setup.ts | — |  |
| __tests__/integration/socialRollback.test.ts | — |  |
| __tests__/InteractionService.test.ts | 2026-10-03 | rewritten whole: only the two kinds that exist |
| __tests__/interpolateMock.test.ts | — |  |
| __tests__/moderationActs.test.ts | — |  |
| __tests__/notificationsMockCoverage.test.ts | — |  |
| __tests__/schemaLengthCaps.test.ts | 2026-10-03 | edited: the salon box names its cap; a typed number is refused |
| __tests__/searchPathHardening.test.ts | — |  |
| __tests__/store.test.ts | — |  |
| __tests__/stores/archiveSlice.test.ts | 2026-10-03 | edited: a shelf filing sends no note or condition; the server's formats win |
| __tests__/stores/filmStore.test.ts | — |  |
| __tests__/stores/listSlice.test.ts | — |  |
| __tests__/stores/socialSlice.test.ts | — |  |
| __tests__/tmdbMockCoverage.test.ts | — |  |
| __tests__/utils/mappers.test.ts | — |  |
| __tests__/utils/mutationExecutor.test.ts | 2026-10-03 | edited: the duplicate merge is a server rewatch under the device viewing id; the insert keeps it |
| __tests__/utils/offlineQueue.test.ts | 2026-10-03 | edited: the kind list matches the queue's union |
| ../.github/workflows/ci-alert.yml | 2026-09-29 | history reduced to the rule each step keeps |
| ../.github/workflows/ci.yml | 2026-09-29 | history reduced to the rule each step keeps |
| ../.github/workflows/db-integration.yml | 2026-10-03 | rebuilt in the tooling audit: production's shape from the snapshot, then e2e/db/security.sql; the copy of production's rules it tested is gone |
| ../.github/workflows/e2e.yml | 2026-09-29 | history reduced to the rule each step keeps |
| ../.github/workflows/god_tier_ci.yml | 2026-10-04 | edited: the character table is checked against Node’s segmenter |
| ../.github/workflows/load.yml | 2026-10-03 | read whole: applies e2e/load/proposed.sql to the full house before the probe; the probe runs as supabase_admin for nested plans |
| .claude/hooks/no-backslash-through-shell.cjs | 2026-09-29 | history reduced to the rule; its own test still passes |
| .claude/hooks/no-backslash-through-shell.test.cjs | 2026-09-29 | 1 finding |
| .maestro/auth_deep_link.yaml | 2026-09-29 | header narrowed to what it proves |
| .maestro/auth_flow.yaml | 2026-09-29 | true as written |
| .maestro/boot_verification.yaml | 2026-10-01 | header narrowed to what it proves; wrapped to 80 |
| .maestro/browse_vault.yaml | 2026-09-29 | true as written |
| .maestro/config.yaml | 2026-09-29 | true as written |
| .maestro/darkroom_search.yaml | 2026-09-29 | true as written |
| .maestro/error_recovery.yaml | 2026-10-01 | header narrowed to what it proves; wrapped to 80 |
| .maestro/film_log.yaml | 2026-09-29 | true as written |
| .maestro/flow_critical_path.yaml | 2026-09-29 | true as written |
| .maestro/keyboard/log.tap.yaml | 2026-10-01 | written with the keyboard probe |
| .maestro/keyboard/log.yaml | 2026-10-01 | written with the keyboard probe |
| .maestro/keyboard/stack.tap.yaml | 2026-10-01 | written with the keyboard probe: the stack form, reachable by a new member |
| .maestro/keyboard/stack.yaml | 2026-10-01 | written with the keyboard probe: the stack form, reachable by a new member |
| .maestro/log_film_flow.yaml | 2026-09-29 | true as written |
| .maestro/login_flow.yaml | 2026-09-29 | true as written |
| .maestro/lounge_flow.yaml | 2026-09-29 | true as written |
| .maestro/offline_resilience.yaml | 2026-09-29 | true as written |
| .maestro/README.md | 2026-09-29 | brought up to date with the one-flow-at-a-time runner and the Initiation |
| .maestro/lobby_wall_flow.yaml | 2026-09-30 | new: the wall hangs whole, down to its sign-off |
| .maestro/session_survives_restart.yaml | 2026-10-01 | written with the session kept on the device |
| .maestro/subflows/open_a_film.yaml | 2026-09-29 | true as written |
| .maestro/subflows/open_the_stub.yaml | 2026-09-30 | written with the stub's single tap |
| .maestro/subflows/sign_in.yaml | 2026-09-29 | rewritten this session: passes through the Initiation |
| ANDROID_LAUNCH.md | 2026-10-03 | read against the code: shadows and modals done, springify gone, keyboard via KeyboardRoom; the emulator runs every push |
| app.config.js | 2026-10-03 | read whole: sound |
| app/__tests__/boot-structure.test.tsx | — |  |
| app/__tests__/yourFileWaitsForYourHandle.test.tsx | 2026-10-03 | new: the Profile tab never calls you a stranger |
| app/_layout.tsx | 2026-10-02 | PathTracker moved out, and now tells nav too |
| app/(admin)/__tests__/tribunal.test.tsx | — |  |
| app/(admin)/__tests__/tribunalNeverLiesEmpty.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| app/(admin)/_layout.tsx | 2026-10-02 | read; sound |
| app/(admin)/tribunal.tsx | 2026-10-04 | edited: the accused’s letter is initialOf, whole |
| app/(modals)/__tests__/list-modal.curate.test.tsx | 2026-10-03 | edited: the stack's boxes name their caps |
| app/(modals)/__tests__/social-modal.telemetry.test.tsx | — |  |
| app/(modals)/__tests__/yourCircleIsSaidToYou.test.tsx | 2026-10-03 | new: your own circle is said to you |
| app/(modals)/cover-picker.tsx | 2026-10-01 |  |
| app/(modals)/list-modal.tsx | 2026-10-03 | edited: title and description name their caps |
| app/(modals)/log-modal.tsx | 2026-10-01 | Arrive; the scroll needs no Animated |
| app/(modals)/login.tsx | 2026-10-03 | edited: email, handle and password name their limits |
| app/(modals)/membership.tsx | 2026-10-03 | payments pass: one watchForRank for purchase, seat and restore; restore says "yours again" only once the house holds it; no session read mid-purchase |
| app/(modals)/notifications-modal.tsx | 2026-10-02 | rows say new/who/what/when; the rest could not be reached; history comments trimmed |
| app/(modals)/search-modal.tsx | 2026-10-03 | edited: no results holds through the next letter |
| app/(modals)/social-modal.tsx | 2026-10-01 | a failed read said in place, never an empty circle; the circle pages past fifty; no ticket history |
| app/(tabs)/_layout.tsx | 2026-10-04 | edited: the log modal after the initiation opens through useLater |
| app/(tabs)/darkroom.tsx | 2026-10-02 | the next batch that could not be developed is said, and asked again |
| app/(tabs)/dispatch.tsx | 2026-10-02 | Read whole (launch audit). A failed next page ended the paper as though it were the last filing: the foot says the rest could not be reached. The column was measured for a 390pt phone whatever the screen: the real width now. |
| app/(tabs)/index.tsx | 2026-10-03 | edited: the join plate draws the shared BrassSheen |
| app/(tabs)/lounge.tsx | 2026-10-03 | edited: the search box names SEARCH_MAX |
| app/(tabs)/profile.tsx | 2026-10-03 | your file waits for your handle: read first, a failed read says so with TRY AGAIN, never "Member Not Found" |
| app/(tabs)/reels.tsx | 2026-10-03 | edited: the curate plate draws the shared BrassSheen |
| app/+not-found.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| app/auth-callback.tsx | 2026-10-01 | a link with no code verifies nothing; comments short |
| app/dispatch/[id].tsx | 2026-10-02 | Read whole (launch audit). An open ballot said 'CLOSES MOMENTS AGO' (timeAgo clamps the future): timeUntil now. Measured at the real width (the share card keeps a fixed 390 measure on purpose). Its share link went to another company's domain (fixed in f01e7408). |
| app/dispatch/archive.tsx | 2026-10-02 | Read (launch audit). Column at the real width. Its paging re-asks on every scroll event, so a failed page is asked again: sound. |
| app/dispatch/compose.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| app/dispatch/room/[username].tsx | 2026-10-02 | Read (launch audit). A failed later page ended the room silently (its list asks once per length): the foot says so. Column at the real width. |
| app/dispatch/rules.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| app/dispatch/series/[id].tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| app/dossier/[id].tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| app/edit-profile.tsx | 2026-10-01 |  |
| app/film-reviews/__tests__/theArchiveSaysWhenItCouldNotRead.test.tsx | — |  |
| app/film-reviews/[id].tsx | 2026-10-01 | paged by cursor, never by offset; a failed page says so |
| app/film/[id].tsx | 2026-10-01 | doors through nav; the critiques' failure carried down; the footage named |
| app/log/__tests__/aCritiqueIsSaidAsOnAStack.test.tsx | 2026-09-30 | written with the log page's critiques matched to the stack's |
| app/log/__tests__/theLogPageMovesEveryCard.test.tsx | — |  |
| app/log/__tests__/theRecordReadsTrue.test.tsx | 2026-10-04 | edited: Read more sits on the side the review reads from |
| app/log/__tests__/zz-log.gen.test.tsx | — |  |
| app/log/[id].tsx | 2026-10-04 | edited: the critique box focus through useLater |
| app/lounge.tsx | 2026-10-01 | true as written |
| app/lounge/[id].tsx | 2026-10-04 | edited: a message’s letter is initialOf, kept from the screen reader |
| app/person/__tests__/thePersonFileReadsTrue.test.tsx | 2026-10-04 | edited: a portrait without a photograph carries the whole first letter, unspoken |
| app/person/__tests__/zz-person.gen.test.tsx | — |  |
| app/person/[id].tsx | 2026-10-01 | the not-found way out says where it goes; histories to the present |
| app/reset-password.tsx | 2026-10-03 | edited: a new password must fit the lock (72 bytes) |
| app/settings.tsx | 2026-10-02 | read; sound |
| app/stacks/__tests__/stack-detail.redesign.test.tsx | 2026-09-29 | 13 fixed + test that runs the real queryFn |
| app/stacks/__tests__/stack-detail.telemetry.test.tsx | — |  |
| app/stacks/__tests__/zz-stacks.gen.test.tsx | — |  |
| app/stacks/[id].tsx | 2026-10-04 | edited: the comment field focus moved out of the state updater into an effect, through useLater |
| app/user/[username].tsx | 2026-10-02 | Read whole in the launch audit: HIGHEST RATED now the server's six over the whole record (fetchHighestRated). |
| app/year-in-cinema.tsx | 2026-10-01 | nav; a single reel says so far, not the year is young |
| ARCHITECTURE.md | 2026-10-03 | read against the code: reads are not all TanStack Query (the Lounge, the Dispatch and notices read in their stores); CACHE_MAX_AGE in limits.ts never existed (now CACHE_KEYS) |
| audit/batch6/tier_mirror.mjs | 2026-09-29 | true as written: its transcription still matches src/utils/tier.ts |
| CONTRIBUTING.md | 2026-10-03 | read against the code: a <Modal> needs no accessibilityViewIsModal (an in-screen overlay does, plus the Android half); a toast is already spoken, so only a toast-less write announces |
| e2e/__tests__/flowScreens.test.ts | 2026-09-29 | read with the Darkroom focus fix / E2E probe |
| e2e/__tests__/keyboardRoom.test.ts | 2026-10-01 | written with the keyboard probe |
| e2e/__tests__/screenTimes.test.ts | 2026-10-02 | Written in the launch audit: the screen-time reader on threadtime log lines, and every way its gate says no. |
| e2e/annotate.mjs | 2026-09-29 | true; one line narrowed |
| e2e/db/bootstrap.mjs | 2026-09-28 | 7 findings; stale function count and 'how this was found' asides dropped |
| e2e/db/seal.sh | 2026-10-03 | Written in the tooling audit: the seal e2e.yml and load.yml each carried, in one place for three workflows. |
| e2e/db/seed.mjs | 2026-09-29 | true as written |
| e2e/db/verify-cleaning.mjs | 2026-10-03 | Written with 20261003_05: the sealed world's database answers the member-text corpus as the app does, a member's words are kept cleaned, and no API role can call the cleaning. |
| e2e/db/verify-functions.mjs | 2026-09-29 | true as written |
| e2e/db/verify-writes.mjs | 2026-09-29 | true as written |
| e2e/flow-screens.mjs | 2026-09-29 | read with the Darkroom focus fix / E2E probe |
| e2e/keyboard-room.mjs | 2026-10-01 | written with the keyboard probe |
| e2e/load/probe.mjs | 2026-10-03 | read whole: the paper in all four orders, critiques newest first, the following feed for a member of 2,000 follows; nested plans via auto_explain |
| e2e/plugins/withCleartextTraffic.js | 2026-09-29 | true; one line narrowed |
| e2e/run-flows.sh | 2026-10-03 | every flow begins with the network on: a failed offline flow no longer takes the next one down |
| e2e/screen-times.mjs | 2026-10-02 | Written in the launch audit: each screen's time to its content, read from the E2E device log; a gate once ceilings are set. |
| e2e/screen.mjs | 2026-09-29 | true; one line narrowed |
| e2e/supabase/functions/tmdb-proxy/index.ts | 2026-09-29 | history reduced to the rule |
| e2e/supabase/functions/tmdb-proxy/normalize.mjs | 2026-09-29 | true as written |
| e2e/tmdb/record.mjs | 2026-09-29 | true as written |
| eslint.config.js | 2026-09-29 | 3 findings; the crash and logo stories reduced to the rule each enforces |
| jest.afterEnv.ts | 2026-10-03 | read whole: the mock-gap comment now sits on the check it explains; no count that drifts |
| jest.config.js | 2026-10-04 | edited: testEnvironment, the timer-checking one, says what it is |
| jest.setup.ts | 2026-10-04 | edited: the mock-gap check is handed to the clients tests build (React Query logs nothing) |
| metro.config.js | 2026-09-29 | true as written (the ../public watch folder feeds Decorative's rating images) |
| mockups/capture.ts | 2026-09-29 | true as written |
| mockups/paper/__tests__/zz-badge.gen.test.tsx | 2026-09-29 | described the real badge as it was at one commit (brass ramp); now says A is whatever RankBadge is |
| mockups/paper/__tests__/zz-choices.gen.test.tsx | 2026-09-29 | a kept proposal: its 'recommendation' was not what shipped, and 'today' described a desk since replaced; both now say so; stale hex values dropped |
| mockups/paper/__tests__/zz-cover.gen.test.tsx | 2026-09-29 | a design record: its present-tense claims about the app were true only when drawn; now said as such |
| mockups/paper/__tests__/zz-drafts.gen.test.tsx | 2026-09-29 | true as written |
| mockups/paper/__tests__/zz-final.gen.test.tsx | 2026-09-29 | called itself 'the final look' but draws the design before it shipped (RankBadge's wash differs); the paywall line it argued against is long gone |
| mockups/paper/__tests__/zz-memberroom.gen.test.tsx | 2026-09-29 | 1 finding |
| mockups/paper/__tests__/zz-paper.gen.test.tsx | 2026-09-29 | 26 findings and 12 unflagged histories; TOKYO's note named backdrop 14 over a 7; two tombstone notes for deleted plates removed |
| mockups/paper/__tests__/zz-proposals.gen.test.tsx | 2026-09-29 | a design record: its present-tense claims about the app were true only when drawn; now said as such |
| mockups/paper/__tests__/zz-rank.gen.test.tsx | 2026-09-29 | a design record: its present-tense claims about the app were true only when drawn; now said as such |
| mockups/paper/__tests__/zz-room.gen.test.tsx | 2026-09-29 | 1 finding |
| mockups/paths.ts | 2026-09-29 | 6 findings; LARGE's JSDoc carried the layout rule, split to LAYOUTS |
| mockups/README.md | 2026-09-29 | true as written; checked its claim that the app's Text gives 1.35 (it does, and the harness note I wrote otherwise is corrected) |
| mockups/srcMark.ts | 2026-09-29 | an example path that names no file reworded |
| mockups/tabs/__tests__/zz-dispatch.gen.test.tsx | 2026-09-29 | true as written |
| mockups/tabs/__tests__/zz-lobby.gen.test.tsx | 2026-09-29 | true as written |
| mockups/tabs/__tests__/zz-reel.gen.test.tsx | 2026-09-29 | true as written |
| mockups/tabs/__tests__/zz-rooms.gen.test.tsx | 2026-10-04 | edited: the Lounge drawn from rooms in the store's own shape, two doors side by side |
| mockups/tabs/__tests__/zz-settings.gen.test.tsx | 2026-09-29 | true as written |
| mockups/tabs/flashListMock.tsx | 2026-10-01 | rows handed extraData, as FlashList does |
| mockups/tools/drawn.cjs | 2026-10-03 | read whole: controls counted through stripComments.js |
| mockups/tools/face-advances.cjs | 2026-10-03 | edited: writes a hidden key as its escape |
| mockups/tools/harness.cjs | 2026-09-28 | 5 findings; the header's middle sentence was garbled by an insertion; open() said 1.35 was the most a word grows (uncapped grows to 3.1) |
| mockups/tools/layout.cjs | 2026-09-28 | 12 findings; the header said it measured 'x1 and x1.35' (it runs five passes, iOS to 3.1 and Android to 2) and left SMALL, SHORT and LOST unlisted; two stacked JSDocs merged |
| mockups/tools/contrast.cjs | 2026-09-30 | new: every word against the pixels under it |
| mockups/tools/quote-ink.cjs | 2026-09-30 | new: the quote marks' outline, read from the font file |
| mockups/tools/selftest.cjs | 2026-09-28 | 19 findings; the bordered-pair note sat over scaledbeside, moved to its case |
| mockups/tools/shoot.cjs | 2026-09-29 | true as written |
| mockups/tools/yoga-parity.cjs | 2026-09-28 | 3 findings; the header claimed an iPhone point grid while the code sets none (setPointScaleFactor 0); the build() JSDoc sat above the config |
| README.md | 2026-10-03 | read against the code: the stack table and the folder notes said CQRS and 'pure, stateless', which the code is not; now true |
| scripts/bundle-size.js | 2026-10-03 | read whole: sound |
| scripts/check-app-routes.js | 2026-09-29 | claimed to fail CI, but no workflow ran it: CI now runs it (proved to fail on a planted non-route) |
| scripts/check-backend-live.mjs | 2026-09-28 | 13 findings; section numbers ran 1-5,9,10,8,6,7,8 and the admin-RPC note sat above the TRUNCATE block — renumbering dropped, each note moved over its own code; '#24' output replaced with what it means |
| scripts/comment-truth.js | 2026-09-29 | 8 fixed (its own examples tripped it); TODO now exempt in backticks; npm run comments:check added |
| scripts/coverage-ratchet.js | 2026-09-29 | the header's why-stories reduced to the rule |
| scripts/edge-functions.cjs | 2026-10-03 | paytabs-handler NOT_DEPLOYED, with why (it granted any rank to a posted "paid" message) |
| scripts/functions-check.mjs | 2026-10-03 | compares every file a deploy bundles, _shared included, each function in its own folder; a listed exception is reported once |
| scripts/gates-check.js | 2026-10-03 | read whole: the door sweep reads code through stripComments.js |
| scripts/grapheme-table.js | 2026-10-04 | edited: the table records its Unicode version, not the ICU patch |
| scripts/lucide-icons.js | 2026-10-03 | read whole: sound |
| scripts/schema-snapshot.mjs | 2026-09-28 | 5 findings; an orphan note trailed its code; the case for the snapshot kept, the incident counts dropped |
| scripts/secret-shapes.cjs | 2026-09-29 | true as written |
| scripts/surface-jest-failure.sh | 2026-10-03 | read whole: sound |
| scripts/test-timezones.js | 2026-09-29 | the batch story reduced to the fact it guards |
| src/components/__tests__/aComponentHasOneName.guard.test.ts | 2026-10-02 | Written in the launch audit: no two modules export a component under one name. |
| src/components/__tests__/aSuspensionIsSaid.test.tsx | 2026-10-02 | Written in the launch audit: a silenced or suspended member is told, and told when it ends. |
| src/components/__tests__/aTabIsTouchedWhereItIs.test.tsx | 2026-10-02 | Written 2026-10-02 (launch audit): a tab reaches no further than its own edges. |
| src/components/__tests__/Buster.test.tsx | 2026-10-04 | edited: suspicious glances the way its points have room |
| src/components/__tests__/busterRegister.test.ts | 2026-10-04 | edited: every picture carries its glance; suspicious glances left |
| src/components/__tests__/theInitiationTellsTheTruth.test.tsx | 2026-10-02 | Written 2026-10-02 (launch audit): the induction promises only what a new member has. |
| src/components/Arrive.tsx | 2026-10-01 | written: useArrival as a view |
| src/components/__tests__/ActionDeck.test.tsx | 2026-10-01 | rendered: owner, certify, save, stranger |
| src/components/__tests__/animation-parking.test.ts | — |  |
| src/components/__tests__/aRatingCanBeGivenWithoutSight.test.tsx | — |  |
| src/components/__tests__/aScreenThatFailsLetsYouLeave.test.tsx | — |  |
| src/components/__tests__/authRouting.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/__tests__/ControlledInput.test.tsx | 2026-10-03 | edited: the counter reads the bio's cap |
| src/components/__tests__/EmptyStates.test.tsx | — |  |
| src/components/__tests__/ErrorBoundary.test.tsx | — |  |
| src/components/__tests__/OfflineBanner.test.tsx | — |  |
| src/components/__tests__/oneRankMark.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/__tests__/overlayElevation.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/__tests__/PressableScale.hitSlop.test.tsx | — |  |
| src/components/__tests__/SectionErrorBoundary.test.tsx | — |  |
| src/components/__tests__/SpoilerVeil.test.tsx | 2026-10-01 | records every frame |
| src/components/__tests__/stackedRowHitSlop.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/__tests__/textContrast.test.ts | — |  |
| src/components/__tests__/theCountHangsBesideItsMark.test.tsx | — |  |
| src/components/__tests__/theDoorCanBeReadAndPressed.test.tsx | — |  |
| src/components/__tests__/theRankBadgeIsReadable.test.ts | — |  |
| src/components/__tests__/theShareSheetSaysWhenTheSalonsAreAway.test.tsx | 2026-10-01 | salons, selection, closed cost, crash copy |
| src/components/__tests__/theToastHasOneHome.test.tsx | — |  |
| src/components/__tests__/theToastIsDrawnOnTop.test.ts | — |  |
| src/components/atmosphere/__tests__/useSharedImage.test.tsx | — |  |
| src/components/atmosphere/RoomBloom.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/atmosphere/RoomLight.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/atmosphere/useSharedImage.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/auth/AuthChrome.tsx | 2026-10-01 | true as written |
| src/components/auth/EmailConfirmationScreen.tsx | 2026-10-01 | true as written |
| src/components/auth/PasswordRecoveryModal.tsx | 2026-10-03 | edited: the email box names EMAIL_MAX |
| src/components/auth/PasswordStrengthMeter.tsx | 2026-10-03 | read whole: one answer for a new password; says when it is too long for the lock |
| src/components/auth/SocietySeal.tsx | 2026-10-01 | true as written |
| src/components/AutopsyGauge.tsx | 2026-10-01 | true as written |
| src/components/Buster.tsx | 2026-10-04 | edited: his points glance as far, and the way, measured on each picture |
| src/components/busterArt.ts | 2026-10-04 | regenerated: each picture carries its measured glance |
| src/components/CinematicOverlays.tsx | 2026-10-01 | the dead film grain gone |
| src/components/clearance/__tests__/oneRopeNotThree.test.tsx | — |  |
| src/components/clearance/Clearance.tsx | 2026-10-01 | show it, locked; a second copy lives in the log (carried forward) |
| src/components/ControlledInput.tsx | 2026-10-03 | edited: the bio's default limit is the bio's cap |
| src/components/critique/__tests__/aCritiqueIsWithdrawnOrReported.test.tsx | 2026-10-01 | new |
| src/components/critique/__tests__/oneCritiqueRow.guard.test.ts | 2026-09-30 | written with the shared critique row |
| src/components/critique/CritiqueRow.tsx | 2026-10-04 | edited: the letter is initialOf, whole |
| src/components/critique/withdraw.ts | 2026-10-01 | new: the one question before a critique comes off the page |
| src/components/darkroom/__tests__/aYearTypedOnAnIPhoneIsApplied.test.tsx | 2026-09-29 | new |
| src/components/darkroom/__tests__/theFiltersSayWhatTheyHold.test.tsx | 2026-10-02 | Written 2026-10-02 (launch audit): the filter toggle and CLEAR speak. |
| src/components/darkroom/__tests__/theNextBatchSaysWhenItCouldNotBeDeveloped.test.tsx | 2026-10-02 | the next batch says it could not be developed; moods are buttons with state and keys |
| src/components/darkroom/__tests__/theSuggestionsComeBack.test.tsx | 2026-09-29 | read with the Darkroom focus fix / E2E probe |
| src/components/darkroom/__tests__/theTraySaysWhenTheCatalogueIsAway.test.tsx | — |  |
| src/components/darkroom/constants.ts | 2026-10-02 | read; sound |
| src/components/darkroom/DarkroomCards.tsx | 2026-10-02 | doors through nav |
| src/components/darkroom/DarkroomFilterPanel.tsx | 2026-10-03 | edited: the year boxes name YEAR_DIGITS |
| src/components/darkroom/DarkroomHeader.tsx | 2026-10-02 | Read (launch audit, the unsaid-selection sweep). The filter toggle had no role, no expanded state, and a bare count; CLEAR had no name. Both speak now. |
| src/components/darkroom/DarkroomHero.tsx | 2026-10-03 | edited: the search box names SEARCH_MAX |
| src/components/darkroom/DarkroomMoodBar.tsx | 2026-10-02 | keys; selected as a state; meaning spoken |
| src/components/Decorative.tsx | 2026-10-01 | the dead marquee and styles gone |
| src/components/dispatch/__tests__/aBallotsClosingTimes.test.ts | 2026-09-29 | new |
| src/components/dispatch/__tests__/aControlsNameCanBeRead.test.ts | — |  |
| src/components/dispatch/__tests__/aDeskControlNeverAnswersWithNothing.test.tsx | 2026-09-29 | new |
| src/components/dispatch/__tests__/aDossierHasACover.test.tsx | — |  |
| src/components/dispatch/__tests__/aDraftSurvivesThePhone.test.tsx | — |  |
| src/components/dispatch/__tests__/aFilingReachesTheRoom.test.tsx | — |  |
| src/components/dispatch/__tests__/aNewerOneWasWrittenElsewhere.test.tsx | — |  |
| src/components/dispatch/__tests__/archiveScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/aSeriesIsReadInOrder.test.ts | — |  |
| src/components/dispatch/__tests__/ballotDesk.test.tsx | — |  |
| src/components/dispatch/__tests__/composeScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/dayLabel.test.ts | — |  |
| src/components/dispatch/__tests__/dispatchNoDeadControls.test.ts | — |  |
| src/components/dispatch/__tests__/duplicateRows.test.tsx | — |  |
| src/components/dispatch/__tests__/essayBody.test.tsx | 2026-10-04 | edited: a right-to-left opening raises no letter |
| src/components/dispatch/__tests__/everyCardSaysSomething.test.tsx | — |  |
| src/components/dispatch/__tests__/everyLeadInIsAccountedFor.test.ts | — |  |
| src/components/dispatch/__tests__/everyRuleIsTrue.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/everyTextHasACeiling.test.ts | — |  |
| src/components/dispatch/__tests__/excerpt.test.ts | — |  |
| src/components/dispatch/__tests__/feedRowIsRecyclable.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/feedScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/motionLaws.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/noIntlInTheDispatch.test.ts | — |  |
| src/components/dispatch/__tests__/nothingIsLostQuietly.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/nothingLivesOnlyInTheMockups.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/oneCapNotThree.test.ts | 2026-10-03 | read whole: no box in the app types its own limit |
| src/components/dispatch/__tests__/oneWordNamesOneThing.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/paperTextLogic.test.ts | 2026-10-03 | edited: hidden characters written as escapes |
| src/components/dispatch/__tests__/readerScreen.test.tsx | 2026-10-03 | the sixty-critique page has its own 10 s limit (failed a busy full run at 5 s) |
| src/components/dispatch/__tests__/roomScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/rulesScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/seriesScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/signedOutHasNoInertControls.test.tsx | — |  |
| src/components/dispatch/__tests__/spokenAloud.test.tsx | — |  |
| src/components/dispatch/__tests__/theBallotAndTheCount.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/theDeskCountsAsTheReaderDoes.test.tsx | 2026-10-03 | new: the desk's minutes are readTime's |
| src/components/dispatch/__tests__/theDispatchAtItsLimits.test.tsx | 2026-10-03 | edited: hidden characters written as escapes |
| src/components/dispatch/__tests__/theDispatchSaysEssay.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/theDoorIsShown.test.tsx | — |  |
| src/components/dispatch/__tests__/theDraftIsTheWholePiece.test.tsx | — |  |
| src/components/dispatch/__tests__/theEssayAtLargeType.test.tsx | — |  |
| src/components/dispatch/__tests__/theHardcodedWidthIsHarmless.test.ts | — |  |
| src/components/dispatch/__tests__/theInvitationHasAnAddress.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/theIssueIsTheCalendarDay.test.ts | 2026-10-02 | Written in the launch audit: the issue number counted in calendar days, every hour of two years. |
| src/components/dispatch/__tests__/theMarginSaysWhatItCounts.test.tsx | 2026-09-29 | new |
| src/components/dispatch/__tests__/theNumberIsAMembershipFact.test.tsx | 2026-10-04 | edited: initialOf comes from utils/text |
| src/components/dispatch/__tests__/theParagraphKnowsItsDirection.test.tsx | 2026-10-03 | edited: hidden characters written as escapes |
| src/components/dispatch/__tests__/thePreviewIsThePage.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/theSeriesSheet.test.tsx | 2026-10-01 | written: the series sheet says what it read |
| src/components/dispatch/__tests__/theRailFitsOneScreen.test.ts | — |  |
| src/components/dispatch/__tests__/theReaderAtFullLength.test.tsx | — |  |
| src/components/dispatch/__tests__/theRoomOnScreenDecidesTheGate.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/theRoomSaysWhatItHolds.test.tsx | — |  |
| src/components/dispatch/__tests__/theSetOfTheType.test.tsx | 2026-10-04 | edited: an opening quote rides up with the raised initial |
| src/components/dispatch/__tests__/theWritingRoomExplainsItself.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/wireCarriesItsSource.test.tsx | — |  |
| src/components/dispatch/__tests__/yourOwnRankOnYourOwnByline.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/ComposeDesks.tsx | 2026-10-02 | Read (launch audit, the ballot desk). Sound. |
| src/components/dispatch/dayLabel.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/dispatch/EssayBody.tsx | 2026-10-04 | edited: no letter is raised from a right-to-left opening |
| src/components/dispatch/excerpt.ts | 2026-10-01 | true as written |
| src/components/dispatch/FilingRow.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperBallot.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperComposer.tsx | 2026-10-04 | edited: initialOf comes from utils/text |
| src/components/dispatch/paper/PaperCritiques.tsx | 2026-10-04 | edited: initialOf comes from utils/text |
| src/components/dispatch/paper/PaperDesk.tsx | 2026-09-29 | CLOSES made a working control; handler-less controls disabled; 7 dead styles; histories to rules |
| src/components/dispatch/paper/PaperDeskDoc.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperEssay.tsx | 2026-10-04 | edited: the raised initial is extractDropCap’s |
| src/components/dispatch/paper/PaperFill.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperFrame.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperKeyWell.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/paperMetrics.ts | 2026-10-02 | Read in the launch audit: issueOf counts calendar days (summer-time bug). |
| src/components/dispatch/paper/PaperMore.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/paperMotion.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/dispatch/paper/paperPerf.ts | 2026-10-02 | Read (launch audit). Sound; left alone. |
| src/components/dispatch/paper/PaperPost.tsx | 2026-10-04 | edited: its own initialOf gone; the one in utils/text |
| src/components/dispatch/paper/PaperStrike.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/dispatch/paper/paperStyles.ts | 2026-10-02 | Read whole in the launch audit: sound. |
| src/components/dispatch/paper/paperText.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/dispatch/readTime.ts | 2026-10-01 | true as written |
| src/components/dispatch/roomLink.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/SeriesPicker.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/EmptyStates.tsx | 2026-10-03 | edited: Buster by mood; the breathing icon rests under Reduce Motion |
| src/components/ErrorBoundary.tsx | 2026-10-02 | Read whole (launch audit). Retries spent left a disabled PLEASE RESTART APP: the button now restarts the app (expo-updates reloadAsync), and says how only when it cannot. |
| src/components/feed/__tests__/theKeyLeadsWhereItSays.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/feed/ActionDeck.tsx | 2026-10-04 | edited: the certify lock lifts through useLater, gone with the item and the card |
| src/components/feed/ActivityCard.tsx | 2026-10-01 | lies flat unless an Auteur's; comments made true |
| src/components/feed/AutopsyView.tsx | 2026-10-01 | each score read whole |
| src/components/feed/PosterFrame.tsx | 2026-10-01 | the poster says its film |
| src/components/feed/ReviewContent.tsx | 2026-10-04 | edited: the review and the pull quote each take their own direction |
| src/components/feed/UserAttributionRow.tsx | 2026-10-04 | edited: the letter is initialOf, whole |
| src/components/film/__tests__/castRailFits.test.ts | — |  |
| src/components/film/__tests__/FilmActionTray.test.tsx | — |  |
| src/components/film/__tests__/filmDossier.test.tsx | — |  |
| src/components/film/__tests__/filmPageWiring.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/film/__tests__/FilmStub.test.tsx | — |  |
| src/components/film/__tests__/filmStubMetrics.test.ts | — |  |
| src/components/film/__tests__/filmVerdict.test.tsx | — |  |
| src/components/film/__tests__/footageRailFits.test.ts | — |  |
| src/components/film/__tests__/oneBrass.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/film/__tests__/pickCertificate.test.ts | — |  |
| src/components/film/__tests__/stubFits.test.ts | — |  |
| src/components/film/__tests__/trayActsFire.test.tsx | — |  |
| src/components/film/__tests__/whatAFilmPageNames.test.tsx | 2026-10-04 | edited: a critique’s drop cap keeps its quote, and none from Arabic |
| src/components/film/__tests__/zz-film.gen.test.tsx | — |  |
| src/components/film/__tests__/whatTheFilmPageCouldNotRead.test.tsx | 2026-10-01 | written: the critiques' failure reaches the page; an unread verdict is unknown |
| src/components/film/CastCarousel.tsx | 2026-10-04 | edited: an actor without a photograph is drawn by initialOf |
| src/components/film/FilmActionTray.tsx | 2026-10-01 | histories to the present |
| src/components/film/FilmDetailLayout.tsx | 2026-10-01 | histories to the present; the not-found way out named |
| src/components/film/FilmDossier.tsx | 2026-10-01 | what it holds, not what it absorbed |
| src/components/film/FilmHero.tsx | 2026-10-01 | an unknown verdict claims nothing; histories to the present |
| src/components/film/FilmHeroSkeleton.tsx | 2026-10-01 | the promise, not its history |
| src/components/film/FilmMediaCarousel.tsx | 2026-10-01 | hands the whole video on; named |
| src/components/film/FilmReviews.tsx | 2026-10-04 | edited: no drop cap from right-to-left words |
| src/components/film/FilmScrollHeader.tsx | 2026-10-01 | the fault it fixes, said as what it does |
| src/components/film/FilmSectionHeader.tsx | 2026-10-01 | true as written |
| src/components/film/FilmSimilar.tsx | 2026-10-01 | nav; named for a screen reader |
| src/components/film/FilmStub.tsx | 2026-10-01 | histories to the present; rated of 5 |
| src/components/film/filmStubMetrics.ts | 2026-10-01 | true as written, one history line |
| src/components/film/LogShareCard.tsx | 2026-10-01 | the unused modal mode gone; the card alone |
| src/components/film/NitrateFileCard.tsx | 2026-10-01 | every word frozen, as its header promised |
| src/components/film/pickCertificate.ts | 2026-10-01 | the member's own region is real now |
| src/components/film/ShareCardModal.tsx | 2026-10-02 | Read (launch audit). Its text share linked to reelhouse.app/film, another company's domain: HOUSE_WEB. |
| src/components/film/TrailerModal.tsx | 2026-10-01 | names what it plays |
| src/components/film/WatchProviders.tsx | 2026-10-04 | edited: the monogram takes each initial whole |
| src/components/HapticTab.tsx | 2026-10-02 | Read whole (launch audit). Its 10pt reach gave each tab's edge to its neighbour and took 10pt of the screen above the bar: removed. |
| src/components/home/ProjectorBeam.tsx | 2026-10-01 | true as written |
| src/components/home/types.ts | 2026-10-01 | true as written |
| src/components/home/VelvetRopeCTA.tsx | 2026-10-03 | read whole: its sheen moved to theme/BrassSheen |
| src/components/InitiationModal.tsx | 2026-10-02 | Read whole (launch audit). Told every new member of private notes (the Vault, an Archivist's) and a Lounge behind the brass key (the house's mark for a locked door, which it is not). Both made true. |
| src/components/KeyboardRoom.tsx | 2026-10-01 | written: the keyboard's room on Android |
| src/components/layout/__tests__/aSectionIsAHeading.test.tsx | 2026-10-01 | written: a section title is a heading |
| src/components/layout/__tests__/aSwipeBackIsHeard.test.tsx | 2026-10-02 | nav's history hears the swipe back |
| src/components/layout/__tests__/ConciergeButton.test.tsx | — |  |
| src/components/layout/__tests__/everyListChoosesItsAnchor.guard.test.ts | 2026-09-29 | new |
| src/components/layout/__tests__/flashListKeyboard.test.tsx | 2026-09-29 | anchor tests |
| src/components/layout/__tests__/theThumbStaysInItsTrack.test.ts | 2026-10-01 | runs the real maths |
| src/components/layout/__tests__/TopNavBar.test.tsx | — |  |
| src/components/layout/CinematicFlashList.tsx | 2026-10-02 | Read (launch audit). Sound; left alone. |
| src/components/layout/CinematicScrollbar.tsx | 2026-10-01 | the thumb maths in one place |
| src/components/layout/CinematicScrollView.tsx | 2026-10-01 | true as written |
| src/components/layout/ConciergeButton.tsx | 2026-10-02 | door through nav; the hint names all three doors |
| src/components/layout/FrozenTab.tsx | 2026-10-01 | says it passes through; freezing carried to performance |
| src/components/layout/navMetrics.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/layout/PathTracker.tsx | 2026-10-02 | tells openSociety and nav the screen on every navigation |
| src/components/layout/SectionCards.tsx | 2026-10-01 | a section title is a heading |
| src/components/layout/TopNavBar.tsx | 2026-10-02 | Read whole (launch audit). router.navigate kept on purpose: the Lounge is a tab, and push would stack a second tab navigator. Sound. |
| src/components/lobby/__tests__/theWallHasNoDeadEnds.test.tsx | 2026-09-30 | new: doors, names, states, counts, every line's room |
| src/components/lobby/__tests__/theHonourStays.test.tsx | 2026-09-30 | new |
| src/components/lobby/__tests__/theLobbyScreenHangsTheWall.test.tsx | 2026-10-01 | both doors, every pull |
| src/components/lobby/__tests__/theWallIsMeasured.test.ts | 2026-09-30 | new |
| src/components/lobby/__tests__/theWallIsRead.test.ts | 2026-09-30 | new |
| src/components/lobby/__tests__/theWallKeepsTheDay.test.tsx | 2026-10-03 | new: the clock reads on the hour and on return; a wall behind the day is asked again |
| src/components/lobby/FeatureRow.tsx | 2026-09-30 | new |
| src/components/lobby/FilingsBill.tsx | 2026-09-30 | new; the byline moved out of the filing's door |
| src/components/lobby/KeepOff.tsx | 2026-09-30 | new |
| src/components/lobby/LobbyHonour.tsx | 2026-09-30 | new |
| src/components/lobby/LobbyWall.tsx | 2026-09-30 | new |
| src/components/lobby/Masthead.tsx | 2026-09-30 | new |
| src/components/lobby/measure.ts | 2026-09-30 | new |
| src/components/lobby/PairBills.tsx | 2026-09-30 | new; "of one height" held only side by side |
| src/components/lobby/parts.tsx | 2026-10-04 | edited: the letter is initialOf, whole |
| src/components/lobby/RankBill.tsx | 2026-09-30 | new |
| src/components/lobby/wallRead.ts | 2026-09-30 | new |
| src/components/lobby/words.ts | 2026-09-30 | new; named a test that did not exist |
| src/components/log/__tests__/editorialDesk.test.tsx | — |  |
| src/components/log/__tests__/everyCritiqueCanBeReached.test.tsx | 2026-10-02 | Written 2026-10-02 (launch audit): SHOW MORE asks for older critiques once the page runs out. |
| src/components/log/__tests__/logAtmosphere.test.tsx | — |  |
| src/components/log/__tests__/logComposer.test.ts | — |  |
| src/components/log/__tests__/logComposerRender.test.tsx | — |  |
| src/components/log/__tests__/LogForm.fields.test.tsx | — |  |
| src/components/log/__tests__/logRender.test.tsx | — |  |
| src/components/log/__tests__/logSealBar.test.tsx | — |  |
| src/components/log/__tests__/logSearchEngine.test.tsx | — |  |
| src/components/log/__tests__/logStacksChips.test.tsx | — |  |
| src/components/log/__tests__/logSurfaces.test.ts | — |  |
| src/components/log/__tests__/logTouchTargets.test.ts | — |  |
| src/components/log/__tests__/theComposerKeepsItsWord.test.tsx | 2026-10-03 | the five-page type sweep has its own 15 s limit (failed a busy full run at 5 s) |
| src/components/log/__tests__/theLapsedMemberReadsTheirNote.test.tsx | — |  |
| src/components/log/__tests__/theNoteSheetOffersOnlyWhatIsReal.test.tsx | — |  |
| src/components/log/__tests__/theVaultBelongsToItsViewing.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/log/__tests__/theVaultSaysWhenItCouldNotOpen.test.tsx | 2026-10-01 | written: the Vault on the record, when it could not open |
| src/components/log/__tests__/zz-composer.gen.test.tsx | — |  |
| src/components/log/AuteurToolkit.tsx | 2026-10-01 | histories to the present |
| src/components/log/EditorialDesk.tsx | 2026-10-03 | edited: the pull quote names its cap |
| src/components/log/LogActionDeck.tsx | 2026-10-01 | the autopsy toggle named; Arrive; a dead prop gone |
| src/components/log/LogAtmosphere.tsx | 2026-10-01 | the film behind the composer, said as why |
| src/components/log/LogChronicle.tsx | 2026-10-01 | the typed card, said as why |
| src/components/log/LogClearanceGate.tsx | 2026-10-01 | the rope said as what it is |
| src/components/log/LogComments.tsx | 2026-10-01 | true as written |
| src/components/log/logDetailStyles.ts | 2026-10-01 | flat record card; the Vault's unread line |
| src/components/log/LogForm.tsx | 2026-10-03 | edited: review, note and companion name their caps; the review counter reads the cap |
| src/components/log/LogFormBody.tsx | 2026-10-01 | true as written |
| src/components/log/LogHero.tsx | 2026-10-01 | the filing mark in the present tense |
| src/components/log/LogIndexEntry.tsx | 2026-10-01 | a held-but-unshown entry said as holding something |
| src/components/log/LogModalStyles.ts | 2026-10-01 | flat sheet and delete box; histories to the present |
| src/components/log/logRecord.ts | 2026-10-01 | histories to the present |
| src/components/log/LogReviewBody.tsx | 2026-10-01 | a Vault that could not open says so |
| src/components/log/LogSealBar.tsx | 2026-10-01 | histories to the present |
| src/components/log/LogSearchEngine.tsx | 2026-10-03 | edited: the search box names SEARCH_MAX |
| src/components/log/LogVerdict.tsx | 2026-10-01 | histories to the present |
| src/components/log/NoteSheet.tsx | 2026-10-01 | true as written |
| src/components/log/VaultNote.tsx | 2026-10-01 | true as written |
| src/components/lounge/__tests__/aKeystrokeRedrawsNoMessage.test.tsx | 2026-10-03 | read whole: openRoom proves rows were drawn before counting redraws |
| src/components/lounge/__tests__/aMessageCanBeHeardAndActedOn.test.ts | 2026-09-29 | new |
| src/components/lounge/__tests__/MemberFaceStack.model.test.ts | 2026-10-03 | read whole: sound |
| src/components/lounge/__tests__/roomGate.test.ts | 2026-09-29 | new |
| src/components/lounge/__tests__/aRefusedLeaveStaysInTheRoom.test.tsx | 2026-10-01 | written: the salon panel leaves only on success |
| src/components/lounge/__tests__/theCorridorIsOpen.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/lounge/__tests__/theDoorAdmits.test.tsx | 2026-10-01 | written: the host's panel, mounted |
| src/components/lounge/__tests__/theDoorIsAName.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/lounge/__tests__/theDoorWaitsForTheGuestList.test.tsx | 2026-09-29 | new |
| src/components/lounge/__tests__/thePollRunsWhileWatched.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/lounge/__tests__/theRoomSaysWhenItCouldNotBeReached.test.tsx | 2026-10-03 | read whole: sound |
| src/components/lounge/__tests__/theRopeWaitsForTheSheet.test.tsx | 2026-10-03 | read whole: sound |
| src/components/lounge/__tests__/theSalonsSayWhenTheyCouldNotBeRead.test.tsx | 2026-10-03 | read whole: sound |
| src/components/lounge/__tests__/theSealSaysWhatTheCountMeans.test.tsx | 2026-10-03 | written whole: the unread seal seen and said at each count, and its limit against the SQL |
| src/components/lounge/__tests__/theSheetOffersOnlyWhatCanWork.test.tsx | 2026-10-02 | Written in the launch audit: a departed member's message offers no report or block; a block always names who it blocks. |
| src/components/lounge/ActionSheet.tsx | 2026-10-01 | true as written |
| src/components/lounge/AtTheDoorPanel.tsx | 2026-10-01 | true as written |
| src/components/lounge/CreateLoungeSheet.tsx | 2026-10-03 | edited: name and description name their caps, boxes and counters |
| src/components/lounge/EmptyMyLounges.tsx | 2026-10-01 | contrast history to its reason |
| src/components/lounge/JoinedLoungeCard.tsx | 2026-10-03 | read whole: says "more than 99" where the server stops counting |
| src/components/lounge/LoungeGate.tsx | 2026-10-01 | the door names membership, without its history |
| src/components/lounge/LoungeSettingsPanel.tsx | 2026-10-01 | contrast history dropped |
| src/components/lounge/LoungeStyles.ts | 2026-10-01 | true as written |
| src/components/lounge/loungeTabStyles.ts | 2026-10-01 | contrast history to its reasons |
| src/components/lounge/MemberFaceStack.tsx | 2026-10-04 | edited: its own initialOf gone; the one in utils/text |
| src/components/lounge/PublicLoungeCard.tsx | 2026-10-04 | edited: the door takes no halo (it reached 16pt into the next one); the key sits above the name, which a long word ran past beside it |
| src/components/lounge/reactions.tsx | 2026-10-01 | true as written |
| src/components/lounge/roomGate.ts | 2026-10-02 | Read whole (launch audit). A member banned from a PUBLIC room got the preview (TAKE A SEAT), which the house refuses: banned is decided before the preview now. Verified on the server: protect_lounge_member_status refuses any status change but the host's, so neither a muted nor a banned member can seat themselves. |
| src/components/MarkFigure.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/MasterLogo.tsx | 2026-10-02 | Read (launch audit): artwork. Left alone. |
| src/components/moderation/__tests__/ContentActionSheet.mute.test.tsx | — |  |
| src/components/moderation/__tests__/everyModerationRowActs.guard.test.ts | 2026-10-03 | Written in the test-reading pass: every BLOCK, MUTE, UNBLOCK and UNMUTE handler given to the moderation sheet performs its act (the Dispatch reader's BLOCK blocked no one). |
| src/components/moderation/__tests__/ReportSheet.test.tsx | — |  |
| src/components/moderation/__tests__/reportSheetDimensions.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/moderation/ContentActionSheet.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/moderation/ReportSheet.tsx | 2026-10-03 | edited: the details cap is MAX_LENGTHS.reportDetails |
| src/components/NitrateCalendar.tsx | 2026-10-01 | the header without a stale line count |
| src/components/OfflineBanner.tsx | 2026-10-02 | Read whole (launch audit). Elapsed time in the house measure (MIN.), the label says it is offline, and the settle timer is cleared on unmount. |
| src/components/person/canon.ts | 2026-10-01 | the order, not the sort it replaced |
| src/components/person/PersonBio.tsx | 2026-10-01 | READ MORE named and its state said |
| src/components/person/PersonDefining.tsx | 2026-10-01 | histories to the present |
| src/components/person/PersonFilmography.tsx | 2026-10-01 | one FILM; histories to the present |
| src/components/person/PersonHero.tsx | 2026-10-04 | edited: the portrait letter is initialOf, unspoken |
| src/components/person/PersonOrnaments.tsx | 2026-10-01 | the rarity mark in the present tense |
| src/components/person/personStyles.ts | 2026-10-01 | histories to the present |
| src/components/Preloader.tsx | 2026-10-02 | Read whole (launch audit). A comment about a noise overlay that was never drawn removed. |
| src/components/PressableScale.tsx | 2026-10-02 | Read whole (launch audit). A suspected dropped disabled state was disproved (RN's Pressable merges it). Sound; left alone. |
| src/components/profile/__tests__/aNameIsEarnedOnce.test.ts | 2026-10-02 | Written in the launch audit: no honour or stamp shares a name or borrows a rank's. |
| src/components/profile/__tests__/anEmptyLedgerSaysSo.test.tsx | 2026-10-01 | written: an empty ledger is said as one |
| src/components/profile/__tests__/anHonourIsNeverBroken.test.tsx | — |  |
| src/components/profile/__tests__/aRewatchShowsItsHalfLife.test.ts | 2026-10-02 | Written in the launch audit: a rewatch's half-life from the viewing history and the current rating. |
| src/components/profile/__tests__/aRoomKeepsWhatTheServerFound.test.ts | 2026-10-01 | written: a room's search on the phone is the server's |
| src/components/profile/__tests__/aRoomReadsOneAnswer.test.tsx | 2026-10-01 | written: rows, paging and failure from one answer |
| src/components/profile/__tests__/aSearchKeepsItsBox.test.tsx | 2026-10-01 | written: every searchable room, searched to nothing |
| src/components/profile/__tests__/aStandingIsSharedAsWhoseItIs.test.tsx | 2026-10-01 | written: a standing is shared as whose it is |
| src/components/profile/__tests__/aTasteMatchReadsBothRecords.test.tsx | 2026-10-03 | Written with the Taste Match client: the card compares both whole records (get_taste_match), says when they could not be compared, and draws nothing for a record the viewer may not read. |
| src/components/profile/__tests__/computeDailyStreak.test.ts | — |  |
| src/components/profile/__tests__/decadeCounts.test.ts | — |  |
| src/components/profile/__tests__/everyRatingHasAChip.test.tsx | 2026-10-02 | Written in the launch audit: a half rating sits under the chip below it, in room, query and counts. |
| src/components/profile/__tests__/heroNameSize.test.ts | — |  |
| src/components/profile/__tests__/hideStatsRemoved.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/profile/__tests__/holdingsFit.test.ts | — |  |
| src/components/profile/__tests__/memberFile.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/profile/__tests__/memberFileRooms.test.tsx | — |  |
| src/components/profile/__tests__/memberFileScreen.test.tsx | 2026-10-03 | edited: hidden characters written as escapes |
| src/components/profile/__tests__/portraitInitial.test.ts | 2026-10-04 | edited: both member-file screens ask it; scripts tested in aCharacterIsNeverCut |
| src/components/profile/__tests__/projectorRoom.test.tsx | — |  |
| src/components/profile/__tests__/railFits.test.ts | — |  |
| src/components/profile/__tests__/reconcileCount.test.ts | — |  |
| src/components/profile/__tests__/roomContrast.test.tsx | — |  |
| src/components/profile/__tests__/roomInset.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/profile/__tests__/roomRail.test.tsx | — |  |
| src/components/profile/__tests__/rooms.test.tsx | 2026-10-03 | read whole: the repeat count is read past a nested call |
| src/components/profile/__tests__/roomSearch.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/profile/__tests__/roomSearchWiring.test.tsx | — |  |
| src/components/profile/__tests__/roomsRender.test.tsx | — |  |
| src/components/profile/__tests__/taste.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/profile/__tests__/theArchiveIsHeldWhereverItShows.test.tsx | 2026-10-02 | Written in the launch audit: the Archive's lock holds every place the own file shows it. |
| src/components/profile/__tests__/theArchiveLockHolds.test.tsx | 2026-10-01 | written: the archive lock holds |
| src/components/profile/__tests__/theCalendarDrawsToday.test.tsx | 2026-10-01 | written: the calendar draws today and counts what it draws |
| src/components/profile/__tests__/theDnaCardReadsTheRecord.test.tsx | 2026-10-01 | written: the DNA card reads the record and always opens |
| src/components/profile/__tests__/theDoorSaysWhatItCouldNotRead.test.tsx | 2026-10-02 | a failed door is said; a failed count keeps the last; @handles; decline-all asks first |
| src/components/profile/__tests__/theHonoursCountTheWholeRecord.test.tsx | 2026-10-01 | written: honours and stamps from the whole record |
| src/components/profile/__tests__/theOracleClosesClean.test.tsx | 2026-10-01 | written: the Oracle closes clean |
| src/components/profile/__tests__/theProfileRedrawsForItsOwn.guard.test.ts | 2026-10-02 | Written 2026-10-02 (launch audit): the member page never takes the whole film store. |
| src/components/profile/__tests__/theRestCouldNotBeReached.test.tsx | 2026-10-01 | written: a failed "more" is said in every room |
| src/components/profile/__tests__/theSharedCardIsAPicture.test.tsx | 2026-10-02 | the share card is unspoken and fixed-size |
| src/components/profile/__tests__/yearMarker.test.tsx | — |  |
| src/components/profile/__tests__/yourQueueOpensItsFilms.test.tsx | 2026-10-01 | written: your own queue's posters open their films |
| src/components/profile/__tests__/zz-art.gen.ts | — |  |
| src/components/profile/__tests__/zz-memberfile.gen.test.tsx | — |  |
| src/components/profile/__tests__/zz-mockup.gen.test.tsx | — |  |
| src/components/profile/__tests__/zz-render.lib.test.ts | — |  |
| src/components/profile/__tests__/zz-render.lib.ts | 2026-09-28 | 35 findings; the RN-vs-CSS differences kept as short present-tense rules, the story of each bug left to history |
| src/components/profile/Achievements.tsx | 2026-10-01 | every honour from the whole record; said while unread or failed |
| src/components/profile/ArchiveLock.tsx | 2026-10-01 | asks the phone's own means; never opens unasked; the room is not drawn behind it |
| src/components/profile/AvatarCropSheet.tsx | 2026-10-01 | a refused permission offers Settings; a failed photo said plainly; dead imports gone |
| src/components/profile/CinemaDNACard.tsx | 2026-10-04 | edited: the letter is the handle’s, as the card names its member |
| src/components/profile/CinematicInsights.tsx | 2026-10-01 | says retrieving or failed; whose-words; no history comments |
| src/components/profile/favourites.ts | 2026-10-01 | comments say what is true now |
| src/components/profile/FollowRequestsPanel.tsx | 2026-10-02 | a failed door is said; the rest could not be reached; decline-all asks first |
| src/components/profile/heroNameSize.ts | 2026-10-01 |  |
| src/components/profile/NitrateCalendarGrid.tsx | 2026-10-01 | today drawn; counts what it draws, "in the past year"; the app date helper; nav |
| src/components/profile/NoirPassport.tsx | 2026-10-01 | stamps from the whole record only; labels broken between words; said while unread or failed |
| src/components/profile/portraitInitial.ts | 2026-10-04 | rewritten: on initialOf |
| src/components/profile/ProfileArchiveTab.tsx | 2026-10-01 | nav; IMPORT lands on the import panel; comments say what is true now |
| src/components/profile/ProfileBackdrop.tsx | 2026-10-02 | comments say what is true now; poster via tmdb.poster |
| src/components/profile/profileComputed.ts | 2026-10-02 | Read (launch audit): date work is hand-built or ordering-only. Sound. |
| src/components/profile/ProfileHelpers.tsx | 2026-10-01 | comments say what is true now |
| src/components/profile/ProfileLedgerTab.tsx | 2026-10-01 | an empty ledger said as one; the high chip counts from the shared floor; nav; comments say what is true now |
| src/components/profile/ProfileListsTab.tsx | 2026-10-01 | a search that found nothing is said; nav; no ticket tags or history |
| src/components/profile/ProfilePhysicalTab.tsx | 2026-10-01 | a search that found nothing is said; catalogued as VHS (the space); nav; comments say what is true now |
| src/components/profile/ProfilePosterCard.tsx | 2026-10-01 | three modes no caller used, removed; nav; comments say what is true now |
| src/components/profile/profileStyles.ts | 2026-10-01 | 61 styles nothing read, removed; comments say what is true now |
| src/components/profile/ProfileTriptych.tsx | 2026-10-01 | a refused change is said; nav; the close backdrop is a button; comments say what is true now |
| src/components/profile/ProfileWatchlistTab.tsx | 2026-10-01 | sized by the true total: a search keeps its box, finding nothing is said; the Oracle only with a choice; nav |
| src/components/profile/ProjectorRoom.tsx | 2026-10-01 | a visitor shares the standing as the member's; a failed share said plainly; comments say what is true now |
| src/components/profile/RadarChart.tsx | 2026-10-01 |  |
| src/components/profile/RoomParts.tsx | 2026-10-01 | RoomMoreFailed; comments say what is true now |
| src/components/profile/roomStyles.ts | 2026-10-02 | Read whole in the launch audit: sound. |
| src/components/profile/TasteDNA.tsx | 2026-10-01 | says retrieving, failed, too few or still reading — never a heading over nothing; whose-words |
| src/components/profile/TasteDNAExportCanvas.tsx | 2026-10-02 | unspoken; words fixed-size (it is a picture); history comments trimmed |
| src/components/profile/TasteMatch.tsx | 2026-10-01 |  |
| src/components/profile/tasteMatchRead.ts | 2026-10-03 | Written with the Taste Match client: the read of both members' whole-record shapes, and the comparison the card shows. |
| src/components/profile/WatchlistRoulette.tsx | 2026-10-01 | a mid-spin close stops the spin; opens filmId; nav |
| src/components/RankBadge.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/ReelEyeIcon.tsx | 2026-10-02 | Read (launch audit): artwork. Left alone. |
| src/components/reels/__tests__/MemberRegistry.select.test.ts | 2026-10-01 | no comments |
| src/components/reels/__tests__/theReelIsTheAdvertisement.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/reels/__tests__/theReelSaysWhenItCouldNotRead.test.tsx | — |  |
| src/components/reels/MemberRegistry.tsx | 2026-10-01 | nav; comments cut to the why |
| src/components/reels/ReelsCards.tsx | 2026-10-03 | edited: the loader is his eyes; the flicker is gone |
| src/components/reels/ReelsFeedList.tsx | 2026-10-01 | stale contrast note gone |
| src/components/reels/ReelsHeader.tsx | 2026-10-01 | comments cut to the why |
| src/components/reels/ReelsStackList.tsx | 2026-10-01 | true as written |
| src/components/reels/types.ts | 2026-10-01 | true as written |
| src/components/RouteErrorBoundary.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/search/SearchResultRow.tsx | 2026-10-02 | ReelRating draws halves; resultLabel says what the row is |
| src/components/search/SearchUnreachable.tsx | 2026-10-02 | SearchPartly: above results that came back while a source did not |
| src/components/SectionErrorBoundary.tsx | 2026-10-01 | retries; comments made true |
| src/components/ShareToLoungeModal.tsx | 2026-10-01 | only salons it may speak in; subscribes only when open |
| src/components/society/__tests__/theSocietySellsWhatItSays.test.tsx | 2026-10-03 | payments pass: restore waits for the house; the store sheet returning mid-purchase reads nothing |
| src/components/society/BillingSwitch.tsx | 2026-10-02 | read; sound |
| src/components/society/FoundingCertificate.tsx | 2026-10-02 | read; sound |
| src/components/society/GeneralAdmission.tsx | 2026-10-02 | read; sound |
| src/components/society/PrivilegeLedger.tsx | 2026-10-02 | read; sound |
| src/components/society/PurchaseDock.tsx | 2026-10-02 | read; sound |
| src/components/society/purchaseStop.ts | 2026-10-02 | Read whole in the launch audit: sound. |
| src/components/society/RankTicket.tsx | 2026-10-02 | a ticket the store does not sell says so |
| src/components/society/SmallPrint.tsx | 2026-10-01 | its link shared with the sign-in footer |
| src/components/society/SocietyPoster.tsx | 2026-10-02 | read; sound |
| src/components/society/societyPricing.ts | 2026-10-02 | never a static dollar price for a product the store answered without |
| src/components/SpoilerVeil.tsx | 2026-10-01 | veiled from the first frame |
| src/components/StandingNotice.tsx | 2026-10-02 | Written in the launch audit: the notice a silenced or suspended member reads while it lasts. |
| src/components/text/__tests__/theTextKeepsItsPromises.test.tsx | — |  |
| src/components/text/AnimatedText.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/text/index.tsx | 2026-10-01 | the fourth promise: a word stops at the floor |
| src/components/theme/__tests__/oneBrassSheen.test.tsx | 2026-10-03 | written whole: the sheen sweeps only in front, and both plates draw it |
| src/components/theme/BrassSheen.tsx | 2026-10-03 | written whole: the one sheen both brass plates draw; still behind another tab and under Reduce Motion |
| src/components/theme/CrestGlow.tsx | 2026-10-01 | the leak note to what it does |
| src/components/theme/DiamondDivider.tsx | 2026-10-01 |  |
| src/components/theme/OrnamentalRule.tsx | 2026-10-01 | no comments |
| src/components/ToastHost.tsx | 2026-10-02 | Read whole (launch audit). Messages were cut at 2 lines (4 with a button): the body face is monospaced, so a 375pt phone kept ~66 characters (48 at x1.35) and the longest sentences lost the support address. Never cut now. |
| src/components/Toggle.tsx | 2026-10-01 | comments say what is true now |
| src/components/TryAgain.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/__tests__/aLabelIsSpoken.test.ts | 2026-10-01 | written: a label on a View is spoken |
| src/components/__tests__/theKeyboardHasRoom.test.tsx | 2026-10-01 | written with the keyboard's room |
| src/components/reels/__tests__/theReelSaysWhatEachControlIs.test.tsx | 2026-10-01 | written with the Reel's controls |
| src/components/ui/NotificationBadge.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/constants/__tests__/aMemberWhoLeftIsNamedOneWay.test.tsx | 2026-10-02 | Written in the launch audit: a departed member named one way in the paper, a critique and the Lounge; the mark written in one place. |
| src/constants/__tests__/aRankIsSoldEnforcedAndExplained.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/constants/__tests__/deepLinks.test.ts | — |  |
| src/constants/__tests__/standing.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/constants/__tests__/taste.test.ts | — |  |
| src/constants/__tests__/theHouseLinksToItself.guard.test.ts | 2026-10-02 | Written 2026-10-02 (launch audit): no link goes to reelhouse.app, another company's domain. |
| src/constants/__tests__/theRanksAreWellFormed.test.ts | — |  |
| src/constants/__tests__/theVaultIsThePrivateNotes.test.ts | — |  |
| src/constants/cacheKeys.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/constants/deepLinks.ts | 2026-10-01 | true as written |
| src/constants/departed.ts | 2026-10-02 | Written in the launch audit: how the house names a member who has left, and one whose name it could not read: one phrase, no made-up handle. |
| src/constants/formats.ts | 2026-10-01 | the shelf is the Physical Archive, not the Vault; no ticket tag |
| src/constants/gatedFeatures.ts | 2026-10-02 | Read whole (launch audit). essays-legacy said dispatch_dossiers was a view over the legacy table; it is a view over dispatch_posts (live schema). Its comment and reachedThrough corrected. |
| src/constants/inputLimits.ts | 2026-10-03 | written whole: the limits of boxes that write no column (email, search, year, email code) |
| src/constants/membership.ts | 2026-10-01 | one list; checked against production |
| src/constants/modalRoutes.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/constants/standing.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/constants/support.ts | 2026-10-02 | Read whole (launch audit). HOUSE_WEB added: the house's web address, said once. |
| src/constants/taste.ts | 2026-10-01 | coverageNote says your or their |
| src/constants/textScaling.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/features/archive/__tests__/anImportMergesIntoTheStackItFinds.test.ts | — |  |
| src/features/archive/__tests__/anImportNeverDropsWhatItCouldNotAsk.test.ts | — |  |
| src/features/archive/__tests__/archiveImport.test.ts | 2026-10-03 | edited: the byte-order mark written as an escape |
| src/features/archive/__tests__/aReturnedArchiveKeepsItsNotes.test.ts | 2026-10-02 | fresh viewing ids; notes follow their viewings; not-an-archive refused; undo keeps only what failed |
| src/features/archive/__tests__/undoImport.test.ts | — |  |
| src/features/archive/archiveImport.ts | 2026-10-03 | edited: each imported field cleaned by its own cap |
| src/features/archive/importReceipt.ts | 2026-10-02 | read; sound |
| src/features/archive/undoImport.ts | 2026-10-02 | a partial undo keeps only what failed |
| src/features/profile/__tests__/aLinkSaysWhyBeforeItVanishes.test.tsx | 2026-10-03 | edited: the override written as an escape |
| src/features/profile/__tests__/linksEditor.test.tsx | — |  |
| src/features/profile/__tests__/theDossierSealIsSpoken.test.tsx | — |  |
| src/features/profile/__tests__/theEditDeskSaysWhatWentWrong.test.tsx | 2026-10-01 | written: the edit desk says what went wrong |
| src/features/profile/EditProfileScreen.tsx | 2026-10-03 | edited: handle, name and bio name their caps |
| src/features/profile/LinksEditor.tsx | 2026-10-03 | edited: the link title and address name their caps |
| src/features/profile/profile.styles.ts | 2026-10-01 | 19 styles nothing read, removed |
| src/features/settings/__tests__/settings.redesign.test.tsx | 2026-10-03 | edited: the password panel asks passwordIsAccepted |
| src/features/settings/__tests__/anExportIsWhole.test.ts | 2026-10-01 | written: an export holds every row once |
| src/features/settings/DataVault.tsx | 2026-10-02 | no dead store subscriptions; mount re-armed; progress spoken; undo counts what is left |
| src/features/settings/readAllRows.ts | 2026-10-01 | written: the export's ordered paging, out of the screen |
| src/features/settings/settings.styles.ts | 2026-10-02 | read; sound |
| src/features/settings/SettingsScreen.tsx | 2026-10-04 | edited: the lock checks race the shared deadline; lockAnswer says a hang is a no |
| src/features/settings/SettingsSections.tsx | 2026-10-03 | edited: a new password is judged by passwordIsAccepted |
| src/generated/lucideIcons.js | 2026-10-03 | generated by scripts/lucide-icons.js; its --check guard holds it |
| src/hooks/__tests__/aFollowThatThrowsIsSaid.test.tsx | 2026-10-01 | written: a follow that throws is said and rolled back |
| src/hooks/__tests__/aMemberFilePullSaysWhatItReached.test.tsx | — |  |
| src/hooks/__tests__/aNewMemberStartsUnfiltered.test.tsx | 2026-10-01 | written: every filter wiped for a new member |
| src/hooks/__tests__/aReadIsStoppedOnlyByWhatMakesItStale.test.tsx | 2026-10-01 | written: each read cancelled only by what makes it stale |
| src/hooks/__tests__/aRestoredNoteIsSent.test.tsx | 2026-10-02 | Written 2026-10-02 (launch audit): a draft's restored private note is sealed with the record. |
| src/hooks/__tests__/aRoomSaysItCouldNotBeRead.test.tsx | — |  |
| src/hooks/__tests__/aSheetComesAndGoesOnce.test.tsx | 2026-10-01 | written with useSheetPresence |
| src/hooks/__tests__/aSheetStaysAboveTheKeyboard.test.tsx | 2026-10-01 | written with useKeyboardLift |
| src/hooks/__tests__/anArrivalAlwaysArrives.test.tsx | 2026-10-01 | the ratchet is exact |
| src/hooks/__tests__/aSlowPhoneIsKnownAtOnce.test.tsx | 2026-10-02 | Written 2026-10-02 (launch audit): a throttled phone is known on the first render. |
| src/hooks/__tests__/signingInTellsTheTruth.test.tsx | — |  |
| src/hooks/__tests__/theArchiveDoesNotRepeatItself.test.tsx | — |  |
| src/hooks/__tests__/theRoomDoesNotRepeatItself.test.tsx | 2026-10-01 | written: the room pages on what the server gave |
| src/hooks/__tests__/theArchivePagesOnWhatTheServerGave.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/hooks/__tests__/theCalendarReadsItsOwnYear.test.ts | — |  |
| src/hooks/__tests__/theNoteWaitsForItsViewing.test.tsx | — |  |
| src/hooks/__tests__/theSealLeavesWithTheScreen.test.tsx | — |  |
| src/hooks/__tests__/theSearchFindsWhatWasAskedFor.test.tsx | 2026-10-02 | @handles, exact first, plain excerpts, half reels, named tabs, partial note, emptied box |
| src/hooks/__tests__/theSearchKnowsWhichSourceWasDown.test.tsx | — |  |
| src/hooks/__tests__/theWelcomeIsNotLostInTheBreath.test.tsx | 2026-10-02 | Written 2026-10-02 (launch audit): the welcome survives the user being replaced inside its 600ms breath. |
| src/hooks/__tests__/useAuthFlow.validation.test.ts | — |  |
| src/hooks/__tests__/useAuthThrottle.pbt.test.ts | 2026-10-01 | the countdown keeps the rule |
| src/hooks/__tests__/useBanCheck.test.ts | — |  |
| src/hooks/__tests__/useEditProfile.logic.test.ts | — |  |
| src/hooks/__tests__/useFeeds.test.ts | 2026-10-01 | rewritten: drives the real hooks |
| src/hooks/__tests__/useInitiation.test.ts | — |  |
| src/hooks/__tests__/useLater.test.tsx | 2026-10-04 | written whole |
| src/hooks/__tests__/useLogFlow.payload.test.ts | — |  |
| src/hooks/__tests__/useLogFlow.telemetry.test.tsx | — |  |
| src/hooks/__tests__/useLogFlow.validation.test.ts | — |  |
| src/hooks/__tests__/useOfflineAware.test.ts | — |  |
| src/hooks/__tests__/useProfileController.logic.test.ts | — |  |
| src/hooks/__tests__/useProfileData.reducer.test.ts | — |  |
| src/hooks/__tests__/useScreenReady.test.tsx | — |  |
| src/hooks/useAmbientGlow.ts | 2026-10-01 |  |
| src/hooks/useArrival.ts | 2026-10-01 | written: an arrival that cannot stay invisible |
| src/hooks/useAuthFlow.ts | 2026-10-03 | edited: joining refuses a password too long for the lock, first |
| src/hooks/useAuthThrottle.ts | 2026-10-01 | a lifted lock keeps the rule |
| src/hooks/useBanCheck.ts | 2026-10-02 | says what it guards, and that the server guards every write |
| src/hooks/useCatalogueSearch.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/hooks/useKeyboardLift.ts | 2026-10-01 | written: a sheet over a screen rises with the keyboard |
| src/hooks/useClearance.ts | 2026-10-03 | payments pass: the rank history is a field of the member, no cast |
| src/hooks/useDeviceThrottling.ts | 2026-10-02 | Read whole (launch audit). Answered in an effect, after the preloader had decided on the first render; known synchronously now. A settings override no screen ever wrote removed. |
| src/hooks/useDispatchArchive.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/hooks/useDoor.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/hooks/useEditProfile.ts | 2026-10-03 | a refusal for the member's standing is not reported as a fault |
| src/hooks/useFeeds.ts | 2026-10-01 | one cursor rule; the fallback note gone with the fallback |
| src/hooks/useFilmAnimations.ts | 2026-10-01 | each loop only while seen |
| src/hooks/useFilmDetail.ts | 2026-10-01 | an unread verdict is null, never silence |
| src/hooks/useFollowRequests.ts | 2026-10-02 | failed + moreFailed + retry; the count never below 0; decline-all restores paging |
| src/hooks/useInitiation.ts | 2026-10-02 | Read whole (launch audit). The breath was the effect's cleanup, so a user replaced inside it lost the welcome after the flag burned; a user without created_at was decided no for good. Both closed. |
| src/hooks/useLater.ts | 2026-10-04 | written whole: a component's timer, gone with the component |
| src/hooks/useLogFlow.ts | 2026-10-02 | Read whole (launch audit). A draft's restored private note was untouched (and the restored film reset the touch), so sealing the restored record dropped the note: it travels now. |
| src/hooks/useMemberRoom.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/hooks/useMembershipPricing.ts | 2026-10-02 | read; sound |
| src/hooks/useModalKeyboardPadding.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/hooks/useNotableMembers.ts | 2026-10-01 | true as written |
| src/hooks/useOfflineAware.ts | 2026-10-01 | one subscription, no clock |
| src/hooks/useProfileController.ts | 2026-10-01 | one isNarrowed for refresh and filters; a follow that throws is said; dead ref gone; no ticket history |
| src/hooks/useProfileData.ts | 2026-10-01 | each read cancelled only by what makes it stale; failures wiped with the member; comments say what is true now |
| src/hooks/useScreenReady.tsx | 2026-10-01 | true as written |
| src/hooks/useSheetPresence.ts | 2026-10-01 | written: five sheets' rise and fall, once |
| src/hooks/useTextScale.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/hooks/useUniversalSearch.ts | 2026-10-02 | @handle reads usernames; the exact handle asked for and put first; plain one-line excerpts |
| src/hooks/useUpdateUser.ts | 2026-10-02 | read; sound |
| src/hooks/useVault.ts | 2026-10-01 | reload, for a Vault that could not open |
| src/lib/__tests__/aRankBoughtOfflineIsKept.test.ts | 2026-10-03 | payments pass: queued for the store's account, with no network and no session |
| src/lib/__tests__/aRankEndsOnlyWhenTheStoreSaysSo.test.ts | 2026-10-03 | payments pass: a stand-in store drives every answer a configured one gives |
| src/lib/__tests__/aRankIsOnlyTakenOnAnAnswer.test.ts | 2026-10-03 | payments pass: the source pins went; the paths they guarded now run |
| src/lib/__tests__/aResolvedErrorIsRead.test.ts | 2026-10-03 | membership's watcher reads its error now; two refreshes, not three |
| src/lib/__tests__/revenueCat.selectPackage.test.ts | — |  |
| src/lib/__tests__/sentryMeasures.test.ts | — |  |
| src/lib/__tests__/signingOutSilencesOnlyThisDevice.test.ts | — |  |
| src/lib/__tests__/theCounterNamesNobody.test.ts | — |  |
| src/lib/__tests__/theHouseAsksToSendWordWhenItMeansSomething.test.ts | 2026-10-01 | new |
| src/lib/__tests__/thePriceIsTheStores.test.ts | — |  |
| src/lib/__tests__/theSessionIsKeptWhole.test.ts | 2026-10-01 | written with the session store |
| src/lib/__tests__/theTokenMustNotSurviveLogout.test.ts | — |  |
| src/lib/__tests__/tmdb.test.ts | — |  |
| src/lib/authSessionStorage.ts | 2026-10-01 | written: the session outgrew SecureStore |
| src/lib/gateMetricsSink.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/lib/nativeOnly/revenuecatWebStub.js | 2026-10-03 | read whole: sound |
| src/lib/pushNotifications.ts | 2026-10-02 | the foreground handler is set as the module loads; comments say what is true |
| src/lib/pushPrimer.ts | 2026-10-01 | new: the house asks to send word at a moment that wants it |
| src/lib/queryClient.ts | 2026-10-04 | edited: the rules live in queryPolicy.ts; the header still true |
| src/lib/queryPolicy.ts | 2026-10-04 | written whole: the rules moved out of queryClient.ts, word for word, so tests read them too |
| src/lib/refusalEvents.ts | 2026-10-02 | Written in the launch audit: every refusal's sentence, for whoever listens. |
| src/lib/revenueCat.ts | 2026-10-03 | payments pass: the SDK is required (Jest runs every store path); a rank is queued for the account the store sold to |
| src/lib/scrollBridge.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/lib/sentry.ts | 2026-10-02 | Read whole (launch audit). The re-export was said to be for an ErrorBoundary wrapper in _layout; its one caller tags the session. |
| src/lib/supabase.ts | 2026-10-01 | the session kept by authSessionStorage; comments short |
| src/lib/tmdb.ts | 2026-10-02 | read; sound |
| src/lib/tmdbErrors.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/lore/fragments.ts | 2026-10-02 | Read whole in the launch audit: the false 'Ledger is encrypted' line replaced. |
| src/providers/__tests__/androidTracking.test.ts | — |  |
| src/providers/__tests__/theMissingSettingsAreNamed.test.ts | 2026-10-02 | Written in the launch audit: the missing-settings message, one line each. |
| src/providers/androidTracking.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/providers/AppBootstrapper.tsx | 2026-10-03 | payments pass: the boot check is the webhook's backstop; the "no webhook" comment was false |
| src/providers/FilmDetailProvider.tsx | 2026-10-01 | reviewsFailed and playVideo, said |
| src/schemas/__tests__/aFeedRowWithANullIsStillDrawn.test.ts | 2026-10-01 | written with the null-status fix |
| src/schemas/__tests__/schemas.test.ts | — |  |
| src/schemas/feed.schema.ts | 2026-10-01 | film id strict; a null status is watched |
| src/schemas/film.schema.ts | 2026-10-01 | the unused DomainLog mirror gone; no invented date or author |
| src/schemas/profile.schema.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/schemas/settings.ts | 2026-10-02 | read; sound |
| src/schemas/user.ts | 2026-10-03 | entitlement_source, read for the member alone |
| src/services/__tests__/aMemberTakesBackOnlyTheirOwnStackCritique.test.ts | 2026-09-30 | written with the stack critique delete |
| src/services/__tests__/aMissingLogIsAnAnswer.test.tsx | 2026-10-01 | written: a missing log is null; a nameless author is never unknown |
| src/services/__tests__/aQueryAsksOnlyForWhatExists.test.ts | 2026-10-03 | Written in the launch audit: every column a query names, in both clients and the functions, exists in production. |
| src/services/__tests__/aReportIsFiledThroughOneDoor.test.ts | 2026-10-01 | written with 20261001_03 |
| src/services/__tests__/aShelfEntryIsOnlyAddedTo.test.ts | 2026-10-03 | written whole: the shelf as a table that holds its rows; old replay payloads take nothing away |
| src/services/__tests__/aVisitorReadsWhatTheAppAsksFor.contract.test.ts | 2026-10-03 | read whole: sound |
| src/services/__tests__/aYearIsReadToTheLast.test.ts | 2026-10-01 | written: a year is read to the last row |
| src/services/__tests__/certifyCountAuthority.test.ts | 2026-10-03 | read whole: the migration loses its SQL (--) comments, not JS ones |
| src/services/__tests__/everyNameAClientCallsExists.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/services/__tests__/FeedService.test.ts | 2026-10-01 | cursor note made true |
| src/services/__tests__/getFilmVerdict.test.ts | 2026-10-03 | read whole: sound |
| src/services/__tests__/loungeEmbeds.contract.test.ts | 2026-10-03 | read whole: sound (the FK names; columns are the query guard's) |
| src/services/__tests__/loungeSharePayloads.test.ts | 2026-10-03 | read whole: sound |
| src/services/__tests__/ProfileDataService.test.ts | 2026-10-03 | read whole: sound |
| src/services/__tests__/profileRoomFilters.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/services/__tests__/profileService.test.ts | 2026-10-03 | read whole: sound |
| src/services/__tests__/servicesBatch1.test.ts | 2026-10-03 | edited: endorse_list routing and the log error case |
| src/services/__tests__/servicesBatch2.test.ts | 2026-10-03 | edited: the stack fixture has only real columns |
| src/services/__tests__/servicesBatch3.test.ts | 2026-10-03 | edited: the header names what the file tests |
| src/services/__tests__/theBestFilmsAreReadFromTheWholeRecord.test.ts | 2026-10-02 | Written in the launch audit: HIGHEST RATED asked of the database over the whole record, and a failed read throws. |
| src/services/__tests__/theDoorCursorCarriesATiebreaker.test.ts | 2026-10-03 | read whole: sound |
| src/services/__tests__/theRegistryRetriesAFailedRead.test.ts | 2026-09-29 | failed read throws; false RLS claim fixed |
| src/services/__tests__/theStackKnowsYourMark.test.ts | 2026-10-03 | read whole: sound |
| src/services/__tests__/theTribunalReadsTheWholeRecord.test.tsx | 2026-10-03 | read whole: sound |
| src/services/__tests__/theVaultHasOneDoor.guard.test.ts | 2026-10-02 | Written 2026-10-02 (launch audit): only VaultService queries log_private_notes. |
| src/services/__tests__/tmdbProxyAllowsEveryPath.test.ts | 2026-10-03 | read whole: sound |
| src/services/__tests__/VaultService.test.ts | 2026-10-03 | read whole: sound |
| src/services/__tests__/yearInCinema.test.ts | 2026-10-03 | read whole: sound |
| src/services/AuthService.ts | 2026-10-01 | true as written |
| src/services/FeedService.ts | 2026-10-01 | the cursor note made true: RPC arguments |
| src/services/FilmService.ts | 2026-10-01 | a failed verdict read is thrown; histories to the present |
| src/services/FollowRequestService.ts | 2026-10-02 | a failed read throws; a failed count is null; @ stripped |
| src/services/InteractionService.ts | 2026-10-03 | read whole: endorse_log / endorse_list only; the dead film/review kinds removed |
| src/services/logCounts.ts | 2026-10-01 | true as written |
| src/services/LogService.ts | 2026-10-01 | a missing log is null; histories to the present |
| src/services/LoungeService.ts | 2026-10-01 | true as written |
| src/services/MemberDiscoveryService.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/services/ModerationService.ts | 2026-10-02 | read; sound |
| src/services/ProfileDataService.ts | 2026-10-02 | Read whole in the launch audit: fetchHighestRated added; the rest sound. |
| src/services/ProfileWriteService.ts | 2026-10-02 | the circle's cursors through pgLiteral |
| src/services/ShelfService.ts | 2026-10-03 | written whole: a shelf filing adds formats, never rewrites the entry |
| src/services/StackService.ts | 2026-10-02 | Read whole (launch audit). The sheet read the newest 50 critiques with the true count beside them and no way to the rest: getStackComments takes a limit (ordered by id too), and the sheet asks for earlier ones. |
| src/services/VaultService.ts | 2026-10-02 | Read whole (launch audit). Claimed to be the only door to the notes while the import wrote the table itself: restoreNotes added and used; the claim narrowed to writes (the export reads); theVaultHasOneDoor guards it. |
| src/services/YearInCinemaService.ts | 2026-10-01 | every page of a year, not the first 1,000 |
| src/services/__tests__/aCountNotReadIsNotZero.test.ts | 2026-10-01 | written with the counts fix |
| src/stores/__tests__/aBlockListLeavesWithItsMember.test.ts | 2026-10-02 | sign-out erases the saved block list |
| src/stores/__tests__/aFailedLoadKeepsWhoYouFollow.test.ts | 2026-09-29 | follow-list wipe fixed; comments read |
| src/stores/__tests__/aFailedReadIsSaid.test.ts | 2026-10-01 | written: a failed read is answered as failed |
| src/stores/__tests__/aFailedSettingStaysUndone.test.ts | 2026-09-29 | new |
| src/stores/__tests__/aFollowMadeOfflineIsKept.test.ts | — |  |
| src/stores/__tests__/aMarkReadThatFailedIsHeard.test.ts | 2026-10-01 | written with the marks fix |
| src/stores/__tests__/aNoticeIsNarrowedToItsOwner.test.ts | 2026-10-03 | edited: a notice type the house sends |
| src/stores/__tests__/aProfileChangeIsNeverDropped.test.ts | — |  |
| src/stores/__tests__/aReactionIsOneOfFive.test.ts | 2026-10-03 | read whole: the five against the CHECK in the snapshot |
| src/stores/__tests__/aRefusedWriteIsNotSuccess.test.ts | — |  |
| src/stores/__tests__/aResetThatFailedIsHeard.test.ts | 2026-10-02 | Written 2026-10-02 (launch audit): a failed sign-out reset reaches the logger in production. |
| src/stores/__tests__/aSalonKeepsItsCoverAndItsDoor.test.ts | 2026-10-01 | written: the corridor reads covers; a rank refusal is a door |
| src/stores/__tests__/aSeatReadsAsTheHouseWillRead.test.ts | 2026-10-04 | written whole: a seat taken or given up is drawn as the next read gives it |
| src/stores/__tests__/aStackIsSavedWhole.test.ts | — |  |
| src/stores/__tests__/auth.test.ts | 2026-10-03 | payments pass: the rank history is asked for the member alone, and a failed ask throws nowhere |
| src/stores/__tests__/blockEnforcement.test.ts | — |  |
| src/stores/__tests__/blockStore.pbt.test.ts | — |  |
| src/stores/__tests__/dispatchActs.test.ts | — |  |
| src/stores/__tests__/dispatchCritiquePaging.test.ts | — |  |
| src/stores/__tests__/dispatchGuards.test.ts | 2026-09-28 | Shortened; a test added for the essay's cover. |
| src/stores/__tests__/dispatchReads.test.ts | — |  |
| src/stores/__tests__/dispatchRefusals.test.ts | — |  |
| src/stores/__tests__/dispatchWrites.test.ts | — |  |
| src/stores/__tests__/encryptionAtRest.guard.test.ts | 2026-10-03 | read whole: the false-justification check reads the file as written |
| src/stores/__tests__/everyPersistedStoreWaitsForTheKey.guard.test.ts | 2026-10-02 | every persisted store is read after the key |
| src/stores/__tests__/films.test.ts | — |  |
| src/stores/__tests__/followGraph.wiring.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/stores/__tests__/interactionSlice.test.ts | 2026-10-03 | read whole: a certification made before the answer survives |
| src/stores/__tests__/logoutBeatsTheRollback.test.ts | — |  |
| src/stores/__tests__/logoutClearsEveryModuleCache.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/stores/__tests__/logoutLeavesNoTrace.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/stores/__tests__/logSlice.test.ts | — |  |
| src/stores/__tests__/lounge.test.ts | — |  |
| src/stores/__tests__/loungeActs.test.ts | 2026-10-01 | a stale line count dropped |
| src/stores/__tests__/loungeErrors.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/stores/__tests__/markCounts.test.ts | — |  |
| src/stores/__tests__/notificationCap.test.ts | — |  |
| src/stores/__tests__/reportStore.pbt.test.ts | — |  |
| src/stores/__tests__/socialSlice.hydrationReconcile.test.ts | — |  |
| src/stores/__tests__/socialSlice.unfollow.test.ts | — |  |
| src/stores/__tests__/staleWriteGuard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/stores/__tests__/telemetryGating.test.ts | — |  |
| src/stores/__tests__/theBoardSaysWhenItCouldNotBeRead.test.tsx | — |  |
| src/stores/__tests__/theCursorCarriesATiebreaker.test.ts | — |  |
| src/stores/__tests__/theHouseSaysWhy.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/stores/__tests__/theLiveWireKnowsTheRoom.test.ts | — |  |
| src/stores/__tests__/theLogSaysWhatHappened.test.ts | — |  |
| src/stores/__tests__/theNoticesSayWhatTheyCouldNotReach.test.tsx | 2026-10-02 | first page ordered by time then id; older page failure said; rows say who, what, when |
| src/stores/__tests__/theRoomYouAreActuallyIn.test.ts | — |  |
| src/stores/__tests__/theSalonListIsWholeOrSaysSo.test.ts | 2026-10-01 | written with the salon-list fix |
| src/stores/__tests__/theSalonNameIsNotCutInSilence.test.ts | 2026-10-03 | read whole: the column's ceiling read from the snapshot |
| src/stores/__tests__/theStoreOpensOnEveryLaunch.test.ts | 2026-10-01 | written with the 16-byte key fix |
| src/stores/__tests__/theThrottleIsPerRoom.test.ts | — |  |
| src/stores/__tests__/theWallHearsWhatChanged.test.ts | 2026-10-03 | new: every write that can change a hanging piece asks for the wall again |
| src/stores/__tests__/vaultStore.test.ts | — |  |
| src/stores/__tests__/watchlistSlice.test.ts | 2026-10-03 | edited: the header names what the file tests |
| src/stores/auth.ts | 2026-10-04 | edited: the deadline race is raceDeadline (its timer was never cleared) |
| src/stores/blockStore.ts | 2026-10-02 | sign-out erases the leaving member's saved list |
| src/stores/createSelectors.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/stores/discover.ts | 2026-10-02 | Read whole (launch audit). Its comment said the Darkroom's results survive a restart; the films found are not persisted, only the mood, filters and search. |
| src/stores/dispatch.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/stores/dispatchTypes.ts | 2026-10-02 | Read whole (launch audit): row shapes match the live schema (body NOT NULL DEFAULT '', so an ended filing parses). Sound; left alone. |
| src/stores/domain/__tests__/aFilmAlreadyQueuedStaysQueued.test.ts | 2026-10-02 | a film already on the watchlist stays, and is said to be |
| src/stores/domain/__tests__/aLogsWordsAreCleanedEverywhere.test.ts | 2026-10-03 | edited: its hidden characters built from code points |
| src/stores/domain/__tests__/aShelfIsNeverHeldHostage.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/stores/domain/__tests__/aStackLosesOneFilmInOneWrite.test.ts | 2026-10-02 | a stack loses one film in one write |
| src/stores/domain/__tests__/cursorPagination.test.ts | — |  |
| src/stores/domain/__tests__/logOperations.pure.test.ts | — |  |
| src/stores/domain/__tests__/logReconciliation.test.ts | 2026-10-03 | rewritten whole: drives overlayQueuedLogs and oneOfEachLog |
| src/stores/domain/__tests__/theDiaryPagesWithoutGaps.test.ts | 2026-10-02 | the log list orders as its cursor reads |
| src/stores/domain/archiveSlice.ts | 2026-10-03 | read whole: the shelf filing goes through ShelfService |
| src/stores/domain/helpers/promiseMutex.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/stores/domain/helpers/sessionGuard.ts | 2026-10-01 | true as written |
| src/stores/domain/interactionSlice.ts | 2026-10-03 | read whole: a certification made before the answer is kept (index and list) |
| src/stores/domain/listSlice.ts | 2026-10-02 | a film leaves a stack in one write |
| src/stores/domain/logSlice.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/stores/domain/logSlice/helpers/logOperations.ts | 2026-10-03 | read whole: cleanLogWords on add and update |
| src/stores/domain/socialSlice.ts | 2026-10-02 | Read (launch audit). Cursor values are timestamps and uuids (no commas), safe unquoted. Sound. |
| src/stores/domain/watchlistSlice.ts | 2026-10-02 | a film already queued stays, and is said to be |
| src/stores/films.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/stores/followStore.ts | 2026-10-01 | comments cut to the why |
| src/stores/lounge.ts | 2026-10-04 | edited: one membership language (mine, membership_status); the pending-leave flag nothing read is gone; seatedIn/leftBehind say what the next read gives |
| src/stores/markCounts.ts | 2026-10-02 | read; sound |
| src/stores/mmkv-storage.ts | 2026-10-01 | storageReady added; opens with the 16 bytes recrypt took |
| src/stores/notificationStore.ts | 2026-10-02 | first page ordered by time then id; moreFailed |
| src/stores/offlineQueueStore.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/stores/reportStore.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/stores/resetAllStores.ts | 2026-10-02 | Read whole (launch audit). Failures were counted only in development: reported through logger.warn now. |
| src/stores/settings.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/stores/socialStore.ts | 2026-10-01 | the header says where the store lives |
| src/stores/tellMarks.ts | 2026-10-01 | true as written |
| src/stores/vaultStore.ts | 2026-10-03 | edited: the note is cleaned by its own cap on the live save |
| src/test-support/swallowedTypeError.ts | 2026-10-03 | read whole: sound |
| src/theme/__tests__/aPhotographIsNotLit.test.ts | — |  |
| src/theme/__tests__/aFlatSurfaceCastsNothing.test.ts | 2026-10-01 | written: the flat-but-elevated ratchet |
| src/theme/__tests__/everyStyleIsRead.guard.test.ts | 2026-10-02 | Written in the launch audit: every style a sheet defines is drawn by the app. |
| src/theme/__tests__/lightFloor.test.ts | — |  |
| src/theme/__tests__/nothingOvershoots.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/theme/__tests__/theGroundLadder.test.ts | — |  |
| src/theme/__tests__/theRoomIsLit.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/theme/__tests__/theTextBoxGrowsWithItsText.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/theme/__tests__/theTypeFloor.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/theme/__tests__/theVeilMeetsTheLight.test.ts | — |  |
| src/theme/__tests__/wordsAreNotMarks.test.ts | 2026-10-01 | true as written |
| src/theme/__tests__/wordsAreSolid.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/theme/authStyles.ts | 2026-10-01 | comments short and true |
| src/theme/brass.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/theme/faceAdvances.ts | 2026-10-03 | edited: the soft hyphen's key written as an escape |
| src/theme/light.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/theme/motion.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/theme/stamp.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/theme/theme.ts | 2026-10-02 | Read whole (launch audit). Dead tokens removed: typography, physics (springBouncy broke the no-bounce law), three metrics, three effects; type.caption 8.5 and type.badge 7.5 sat under the 10pt floor unused. theTypeFloor now reads the live scale. |
| src/types/film.types.ts | 2026-10-02 | Read whole (launch audit). VaultItem was used nowhere: removed. |
| src/types/index.ts | 2026-10-02 | Read whole (launch audit). ui.types (UIState: a paywall and handbook modal that do not exist) removed from the barrel and deleted. |
| src/types/moderation.ts | 2026-10-02 | Read whole (launch audit): content types match reports_content_type_check. BlockType, BlockRecordSchema and ActionMetaSchema were used nowhere: removed. |
| src/types/mutations.ts | 2026-10-03 | read whole: the dead endorse_film / endorse_review kinds removed |
| src/types/profile.types.ts | 2026-10-02 | Read (launch audit). Sound; left alone. |
| src/types/social.types.ts | 2026-10-03 | LoungeMember.created_at named a column that does not exist; it is joined_at |
| src/types/tmdb.types.ts | 2026-10-02 | Read whole (launch audit). TMDBReview was used nowhere: removed. |
| src/utils/__tests__/aCharacterIsNeverCut.test.ts | 2026-10-04 | edited: a mark of four raises no cap |
| src/utils/__tests__/aDraftIsKeptOffAnOpenDisk.test.ts | 2026-10-02 | Written in the launch audit: drafts stay off an unencrypted disk. |
| src/utils/__tests__/aHandleIsJudgedByItsWords.test.ts | 2026-10-02 | Written in the launch audit: the handle filter judged by words, one rule in apps and database. |
| src/utils/__tests__/aHiddenControlIsHiddenWhole.guard.test.ts | 2026-10-02 | a hidden pressable is hidden whole (no-hide-descendants) |
| src/utils/__tests__/aLetterIsTakenWhole.guard.test.ts | 2026-10-04 | new: no first letter is taken by hand |
| src/utils/__tests__/aMemberBackSoonIsBackWhereTheyWere.test.ts | 2026-10-01 | new |
| src/utils/__tests__/aMembersWordsAreCleaned.test.ts | 2026-10-03 | the profile excuses went with the INSERT grant that made those columns writable (20261003_07) |
| src/utils/__tests__/aNarrowedWriteMustSeeItsRefusal.test.ts | — |  |
| src/utils/__tests__/anExcerptNeverEndsInHalfAnEmoji.test.ts | — |  |
| src/utils/__tests__/appConfig.guard.test.ts | — |  |
| src/utils/__tests__/aReplayThatCannotReadKeepsItsWrite.test.ts | — |  |
| src/utils/__tests__/aSuspendedMembersWritesWait.test.ts | 2026-10-02 | Written in the launch audit: a suspended member's queued writes wait for the end. |
| src/utils/__tests__/aWithdrawnFilingKeepsNothing.test.ts | — |  |
| src/utils/__tests__/boundedCounts.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/calendarDates.test.ts | — |  |
| src/utils/__tests__/ciAlert.behaviour.test.ts | — |  |
| src/utils/__tests__/ciWorkflows.guard.test.ts | — |  |
| src/utils/__tests__/csv.test.ts | — |  |
| src/utils/__tests__/dispatchExecutors.test.ts | — |  |
| src/utils/__tests__/dispatchFieldCaps.test.ts | 2026-09-28 | Claimed to reconcile every live ceiling but read three old migrations, so subject_backdrop_ceiling had no cap. Reads the live snapshot now, and fails on any ceiling without an app cap or a stated reason. |
| src/utils/__tests__/dispatchMutationRegistry.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/dispatchOfflineParity.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/dossierPublishing.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/e2eTrace.test.ts | 2026-09-29 | new |
| src/utils/__tests__/edgeFunctions.guard.test.ts | — |  |
| src/utils/__tests__/endorsementGrouping.test.ts | — |  |
| src/utils/__tests__/everyBackHasAWayOut.guard.test.ts | — |  |
| src/utils/__tests__/everyCapAnswersToItsColumn.test.ts | 2026-10-03 | read whole: every new cap answers to its column or says why it is smaller |
| src/utils/__tests__/everyControlHasAName.guard.test.ts | 2026-09-29 | new |
| src/utils/__tests__/everyFileSurvivedTheShell.guard.test.ts | — |  |
| src/utils/__tests__/everyMemberKeyHasAnEraser.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/everyPullSaysWhatItReached.guard.test.ts | — |  |
| src/utils/__tests__/everyRouteHasItsOwnNet.guard.test.ts | — |  |
| src/utils/__tests__/feedInvalidation.guard.test.ts | — |  |
| src/utils/__tests__/filterContentByBlocks.pbt.test.ts | — |  |
| src/utils/__tests__/handleGuard.test.ts | 2026-10-03 | edited: the vectors written as escapes |
| src/utils/__tests__/handleGuard.wiring.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/handleHistory.test.ts | — |  |
| src/utils/__tests__/handleHistory.wiring.guard.test.ts | — |  |
| src/utils/__tests__/handleNotice.reader.guard.test.ts | — |  |
| src/utils/__tests__/handleNotice.test.ts | — |  |
| src/utils/__tests__/html.test.ts | — |  |
| src/utils/__tests__/inputTrustBoundary.test.ts | 2026-10-03 | edited: a pasted separator stays a break; hidden test characters written as escapes |
| src/utils/__tests__/keysetCursor.test.ts | — |  |
| src/utils/__tests__/logger.test.ts | — |  |
| src/utils/__tests__/logScreenPolish.guard.test.ts | — |  |
| src/utils/__tests__/lucideIconsAreBundled.guard.test.ts | — |  |
| src/utils/__tests__/maestroFlows.guard.test.ts | — |  |
| src/utils/__tests__/mappers.test.ts | — |  |
| src/utils/__tests__/markdownSafety.test.ts | — |  |
| src/utils/__tests__/memoryManager.test.ts | — |  |
| src/utils/__tests__/mutationExecutor.pbt.test.ts | 2026-10-03 | read whole: the remappable keys match the executor |
| src/utils/__tests__/mutationExecutor.test.ts | 2026-10-03 | payments pass: a failed rank sync carries its status |
| src/utils/__tests__/networkError.test.ts | — |  |
| src/utils/__tests__/noControlCharacters.guard.test.ts | 2026-10-03 | read whole: raw bidi, invisible and separator characters refused in source too (Trojan Source) |
| src/utils/__tests__/noMachinePaths.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/notificationColumns.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/offlineIsSaidOneWay.guard.test.ts | — |  |
| src/utils/__tests__/offlineQueue.integration.test.ts | — |  |
| src/utils/__tests__/offlineQueue.test.ts | — |  |
| src/utils/__tests__/profileCountsCache.test.ts | — |  |
| src/utils/__tests__/profileCountsCache.wiring.guard.test.ts | — |  |
| src/utils/__tests__/profileMappers.test.ts | — |  |
| src/utils/__tests__/prose-handlers.guard.test.ts | — |  |
| src/utils/__tests__/queryClient.test.ts | — |  |
| src/utils/__tests__/queueErrorClassification.test.ts | — |  |
| src/utils/__tests__/raceDeadline.test.ts | 2026-10-04 | written whole |
| src/utils/__tests__/recommendations.test.ts | — |  |
| src/utils/__tests__/requestReview.test.ts | — |  |
| src/utils/__tests__/revenuecatWebhookDecide.test.ts | 2026-10-03 | rewritten: whom an event concerns, what a record grants, applying it |
| src/utils/__tests__/roomFilters.test.ts | 2026-10-01 | written: one answer to is-this-room-narrowed |
| src/utils/__tests__/sanitisationCallSites.test.ts | 2026-10-03 | edited: the hostile samples written as escapes |
| src/utils/__tests__/sanitizeInput.test.ts | — |  |
| src/utils/__tests__/schemaSnapshot.guard.test.ts | — |  |
| src/utils/__tests__/searchFieldsDoNotAutocorrect.guard.test.ts | 2026-09-29 | new guard |
| src/utils/__tests__/searchPattern.test.ts | — |  |
| src/utils/__tests__/searchWiring.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/stackFilmCount.test.ts | — |  |
| src/utils/__tests__/theCharacterRuleIsUnicodes.test.ts | 2026-10-04 | edited: softBreak asks each place once, only where a run needs a break |
| src/utils/__tests__/theDatabaseCleansAsTheAppDoes.test.ts | 2026-10-03 | Written with 20261003_05: the corpus holds every character the cleaning acts on, with cleanForStorage's answer. |
| src/utils/__tests__/theDeadLetterIsNobodyElsesToKeep.test.ts | — |  |
| src/utils/__tests__/theDraftIsYours.test.ts | — |  |
| src/utils/__tests__/theFrontDeskAnswers.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/theFunnelHasOneSeam.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/theRecordingsTravel.test.ts | — |  |
| src/utils/__tests__/theSocietyOpensOverYou.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/theTappedNoticeOpensIt.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/tier.test.ts | — |  |
| src/utils/__tests__/tier.warning.test.ts | — |  |
| src/utils/__tests__/validateUsername.test.ts | — |  |
| src/utils/__tests__/validateWithTelemetry.test.ts | — |  |
| src/utils/__tests__/withAbortSignal.test.ts | — |  |
| src/utils/__tests__/withRetry.test.ts | — |  |
| src/utils/__tests__/withTimeout.test.ts | — |  |
| src/utils/AppError.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/utils/csv.ts | 2026-10-02 | read; sound |
| src/utils/deviceRegion.ts | 2026-10-01 | new |
| src/utils/draftSync.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/utils/e2eTrace.ts | 2026-10-02 | Read whole in the launch audit: sound. |
| src/utils/endorsementGroupKey.ts | 2026-10-02 | Read whole (launch audit). A certified-log group opened the FILM, on the belief that no log page existed (app/log/[id] does), and went nowhere without a film id: it opens the log. |
| src/utils/enter.ts | 2026-10-02 | read; sound |
| src/utils/filterContentByBlocks.ts | 2026-10-01 | true as written |
| src/utils/gateTelemetry.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/graphemeTable.ts | 2026-10-04 | regenerated: names its Unicode version |
| src/utils/groupNotifications.ts | 2026-10-02 | history comments trimmed |
| src/utils/handleGuard.ts | 2026-10-02 | Read whole (launch audit). Still rejects both joiners in a handle (the full class). Sound. |
| src/utils/handleHistory.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/handleNotice.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/housePages.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/html.ts | 2026-10-01 | ticket numbers out of the header |
| src/utils/imagePrefetcher.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/keysetCursor.ts | 2026-10-02 | quotes escaped with a backslash, as PostgREST reads them (measured 2026-10-02) |
| src/utils/lastTab.ts | 2026-10-01 | new: back within the half hour, back on the tab |
| src/utils/linking.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/logger.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/mappers.ts | 2026-10-02 | dead mappers removed (dossier, lounge message, watchlist, archive) |
| src/utils/markdownSafety.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/utils/memberDrafts.ts | 2026-10-02 | read; sound (drafts go to storage unencrypted on a keystore failure: a trade-off, listed) |
| src/utils/memoryManager.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/mutationExecutor.ts | 2026-10-03 | payments pass: a failed rank sync carries its status (kept and retried, not dead-lettered); the reply nobody read is gone |
| src/utils/networkError.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/noticeRoute.ts | 2026-10-02 | Read whole (launch audit). Follows groupRoute's one argument. |
| src/utils/offlineQueue.ts | 2026-10-03 | read whole: its kind union matches the executor |
| src/utils/openNoticeFromPush.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/openSociety.ts | 2026-10-02 | Read whole (launch audit). URLSearchParams.set is implemented in RN 0.81's polyfill (checked). Sound. |
| src/utils/profileCountsCache.ts | 2026-10-02 | read; sound |
| src/utils/raceDeadline.ts | 2026-10-04 | written whole: the one deadline race; its timer cleared when the race is decided |
| src/utils/recommendations.ts | 2026-10-01 | the shelf's own name |
| src/utils/reelToast.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/requestReview.ts | 2026-10-01 | never more than 3 in any 365 days, as it claimed |
| src/utils/roomFilters.ts | 2026-10-01 | new |
| src/utils/sanitizeInput.ts | 2026-10-03 | read whole: U+2028/U+2029 kept as the breaks they are, not stripped |
| src/utils/searchPattern.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/utils/softBreak.ts | 2026-10-04 | edited: one place asked per character, the flag count stopping at the run’s start; a joint breaks only between characters |
| src/utils/standing.ts | 2026-10-02 | Written in the launch audit: the member's standing, read with the profile and on refusal. |
| src/utils/svgId.ts | 2026-10-03 | new: the one paint id (the Lobby’s and the room light’s) |
| src/utils/TactileEngine.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/__tests__/everyDoorGoesThroughNav.test.ts | 2026-10-01 | written: the raw-router ratchet |
| src/utils/authSignals.ts | 2026-10-01 | written: the sign-in rules every door reads alike |
| src/utils/text.ts | 2026-10-04 | edited: isCharacterBoundary takes where a flag count may stop; characterEnd walks a text once; a drop cap raises only a short mark |
| src/utils/tier.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/tierDoor.ts | 2026-10-01 | the server sentence as a door |
| src/utils/tierRefusal.ts | 2026-10-01 | by the sentence, not the code |
| src/utils/timeAgo.ts | 2026-10-02 | Read whole (launch audit). formatTMDBDate had two branches returning the same value: one. |
| src/utils/toastBus.ts | 2026-10-02 | a toast stays long enough to read |
| src/utils/typedRouter.ts | 2026-10-02 | read; sound |
| src/utils/validateUsername.ts | 2026-10-02 | Read whole (launch audit). The profanity patterns refuse film names (moby_dick, philipkdick): listed for the owner, a policy call. |
| src/utils/validateWithTelemetry.ts | 2026-10-01 | docs cut to what the types do not say |
| src/utils/withAbortSignal.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/withRetry.ts | 2026-10-02 | read; sound |
| src/utils/withTimeout.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| supabase/diagnostics/apply.cjs | 2026-10-03 | Applies one migration file to production as a single transaction; the database URL is read from .env.local and never printed. |
| supabase/functions/fetch-rss/index.ts | 2026-09-29 | the header said it serves the Dispatch tab; no current source calls it (kept for installed builds, per backend-contract); audit tags and the relay's history dropped |
| supabase/functions/notify-push/index.ts | 2026-10-03 | v4: the sender is named whenever there is one; an accepted request has its title; a house notice is The Lounge only about a salon |
| supabase/functions/_shared/storeRecord.ts | 2026-10-03 | new: the one home for "apply what RevenueCat says a member holds", read whole record, grace included |
| supabase/functions/revenuecat-webhook/decide.ts | 2026-10-03 | rewritten: an event names whom to read again (both sides of a transfer), never what they hold |
| supabase/functions/revenuecat-webhook/index.ts | 2026-10-03 | rewritten: each named account re-read and granted through storeRecord; 500 to retry, 404 member acknowledged |
| supabase/functions/sync-entitlement/index.ts | 2026-10-03 | rewritten onto storeRecord; answers the rank in force; a store not read is 502 |
| test-utils/__tests__/aFileEndsWithNoTimerWaiting.test.ts | 2026-10-04 | written whole: runs jest on the three fixtures |
| test-utils/__tests__/everyCommentIsTrue.test.ts | — |  |
| test-utils/__tests__/everySourceReaderIsLedgered.test.ts | — |  |
| test-utils/__tests__/everyTestClientKeepsTheHouseRules.test.ts | 2026-10-04 | written whole: new QueryClient( in the two builders only |
| test-utils/__tests__/oneCommentStripper.test.ts | 2026-10-03 | written whole: the guard that no file strips comments with its own regex |
| test-utils/__tests__/readCode.test.ts | 2026-10-03 | read whole: adds the generic-arrow case TSX misreads |
| test-utils/__tests__/timerFixtures/leavesATimer.fixture.ts | 2026-10-04 | written whole |
| test-utils/__tests__/timerFixtures/leavesATimerAfterFakeOnes.fixture.ts | 2026-10-04 | written whole |
| test-utils/__tests__/timerFixtures/leavesNothing.fixture.ts | 2026-10-04 | written whole |
| test-utils/contractEnv.ts | 2026-10-03 | read whole: sound; "all 5,000 tests" is every unit test |
| test-utils/react-native-testing-library.js | 2026-10-04 | edited: every render's client is testQueryClient(); the comment says what that keeps |
| test-utils/readCode.ts | 2026-10-03 | read whole: re-exports the one stripper (stripComments.js) |
| test-utils/SOURCE-READING-TESTS.md | 2026-10-03 | read whole: rows for the new source readers |
| test-utils/stripComments.js | 2026-10-03 | written whole: the one comment stripper, shared by tests and node tools |
| test-utils/testQueryClient.ts | 2026-10-04 | written whole: the one client a test builds — the app's rules, no collection timer, errors heard |
| test-utils/timerCheckingEnvironment.js | 2026-10-04 | written whole: the environment that fails a file ending with a timer still waiting |
| types/react-test-renderer.d.ts | 2026-09-29 | history reduced to the reason |
