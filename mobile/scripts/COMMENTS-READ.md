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
| __tests__/InteractionService.test.ts | 2026-10-01 | reads the service's own schema |
| __tests__/interpolateMock.test.ts | — |  |
| __tests__/moderationActs.test.ts | — |  |
| __tests__/notificationsMockCoverage.test.ts | — |  |
| __tests__/schemaLengthCaps.test.ts | — |  |
| __tests__/searchPathHardening.test.ts | — |  |
| __tests__/store.test.ts | — |  |
| __tests__/stores/archiveSlice.test.ts | — |  |
| __tests__/stores/filmStore.test.ts | — |  |
| __tests__/stores/listSlice.test.ts | — |  |
| __tests__/stores/socialSlice.test.ts | — |  |
| __tests__/tmdbMockCoverage.test.ts | — |  |
| __tests__/utils/mappers.test.ts | — |  |
| __tests__/utils/mutationExecutor.test.ts | — |  |
| __tests__/utils/offlineQueue.test.ts | — |  |
| ../.github/workflows/ci-alert.yml | 2026-09-29 | history reduced to the rule each step keeps |
| ../.github/workflows/ci.yml | 2026-09-29 | history reduced to the rule each step keeps |
| ../.github/workflows/db-integration.yml | 2026-09-29 | history reduced to the rule each step keeps |
| ../.github/workflows/e2e.yml | 2026-09-29 | history reduced to the rule each step keeps |
| ../.github/workflows/god_tier_ci.yml | 2026-10-01 | a route check added (the script claimed CI ran it); the story of each step reduced to what it guards; flow lint --strict (its warnings went unread) |
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
| ANDROID_LAUNCH.md | — |  |
| app.config.js | — |  |
| app/__tests__/boot-structure.test.tsx | — |  |
| app/_layout.tsx | — |  |
| app/(admin)/__tests__/tribunal.test.tsx | — |  |
| app/(admin)/__tests__/tribunalNeverLiesEmpty.guard.test.ts | — |  |
| app/(admin)/_layout.tsx | — |  |
| app/(admin)/tribunal.tsx | — |  |
| app/(modals)/__tests__/list-modal.curate.test.tsx | — |  |
| app/(modals)/__tests__/social-modal.telemetry.test.tsx | — |  |
| app/(modals)/cover-picker.tsx | 2026-10-01 |  |
| app/(modals)/list-modal.tsx | 2026-09-29 | histories -> rules; orphan style comments removed; header named the web port and wrong labels |
| app/(modals)/log-modal.tsx | 2026-10-01 | Arrive; the scroll needs no Animated |
| app/(modals)/login.tsx | 2026-10-01 | the terms open; every comment short and true |
| app/(modals)/membership.tsx | — |  |
| app/(modals)/notifications-modal.tsx | — |  |
| app/(modals)/search-modal.tsx | — |  |
| app/(modals)/social-modal.tsx | 2026-10-01 | a failed read said in place, never an empty circle; the circle pages past fifty; no ticket history |
| app/(tabs)/_layout.tsx | — |  |
| app/(tabs)/darkroom.tsx | — |  |
| app/(tabs)/dispatch.tsx | 2026-09-29 | 12 fixed; NewsService history and the pill-fix story cut |
| app/(tabs)/index.tsx | 2026-10-01 | the front door arrives; nav; a failed pull says so |
| app/(tabs)/lounge.tsx | 2026-10-01 | the corridor in the present tense; the gate is for visitors only |
| app/(tabs)/profile.tsx | 2026-10-01 | nav; a named door; the header says what it is |
| app/(tabs)/reels.tsx | 2026-10-01 | every comment short and true; the door's reason lives in its test |
| app/+not-found.tsx | — |  |
| app/auth-callback.tsx | 2026-10-01 | a link with no code verifies nothing; comments short |
| app/dispatch/[id].tsx | 2026-09-29 | 26 fixed; 'SAVE THE CARD offered for a dossier' was false (the sheet never gets card); history of 3 fixes cut |
| app/dispatch/archive.tsx | 2026-09-29 | history removed; margin label now said as a day (was '28 certified') |
| app/dispatch/compose.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| app/dispatch/room/[username].tsx | 2026-09-29 | 6 fixed; history of the byline fix cut |
| app/dispatch/rules.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| app/dispatch/series/[id].tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| app/dossier/[id].tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| app/edit-profile.tsx | 2026-10-01 |  |
| app/film-reviews/__tests__/theArchiveSaysWhenItCouldNotRead.test.tsx | — |  |
| app/film-reviews/[id].tsx | 2026-10-01 | paged by cursor, never by offset; a failed page says so |
| app/film/[id].tsx | 2026-10-01 | doors through nav; the critiques' failure carried down; the footage named |
| app/log/__tests__/aCritiqueIsSaidAsOnAStack.test.tsx | 2026-09-30 | written with the log page's critiques matched to the stack's |
| app/log/__tests__/theLogPageMovesEveryCard.test.tsx | — |  |
| app/log/__tests__/theRecordReadsTrue.test.tsx | — |  |
| app/log/__tests__/zz-log.gen.test.tsx | — |  |
| app/log/[id].tsx | 2026-10-01 | a failed read and a missing log said apart; nav; Arrive |
| app/lounge.tsx | 2026-10-01 | true as written |
| app/lounge/[id].tsx | 2026-09-29 | standing unknown until the roster is read; messages spoken + actions; unnamed controls; histories to rules |
| app/person/__tests__/thePersonFileReadsTrue.test.tsx | — |  |
| app/person/__tests__/zz-person.gen.test.tsx | — |  |
| app/person/[id].tsx | 2026-10-01 | the not-found way out says where it goes; histories to the present |
| app/reset-password.tsx | 2026-10-01 | navigates through nav; comments short |
| app/settings.tsx | — |  |
| app/stacks/__tests__/stack-detail.redesign.test.tsx | 2026-09-29 | 13 fixed + test that runs the real queryFn |
| app/stacks/__tests__/stack-detail.telemetry.test.tsx | — |  |
| app/stacks/__tests__/zz-stacks.gen.test.tsx | — |  |
| app/stacks/[id].tsx | 2026-09-29 | 24 fixed; FOUND: critique count dropped by the screen's hand-copied mapping (never shown on a phone); now the payload whole, tested, mutation-killed; a FALSE 'length threshold' fold note |
| app/user/[username].tsx | 2026-09-29 | 33 fixed + ~15 unflagged history notes; commented-out CinematicMap import removed; '72 seconds' was 36 |
| app/year-in-cinema.tsx | 2026-10-01 | nav; a single reel says so far, not the year is young |
| ARCHITECTURE.md | — |  |
| audit/batch6/tier_mirror.mjs | 2026-09-29 | true as written: its transcription still matches src/utils/tier.ts |
| CONTRIBUTING.md | — |  |
| e2e/__tests__/flowScreens.test.ts | 2026-09-29 | read with the Darkroom focus fix / E2E probe |
| e2e/__tests__/keyboardRoom.test.ts | 2026-10-01 | written with the keyboard probe |
| e2e/annotate.mjs | 2026-09-29 | true; one line narrowed |
| e2e/db/bootstrap.mjs | 2026-09-28 | 7 findings; stale function count and 'how this was found' asides dropped |
| e2e/db/seed.mjs | 2026-09-29 | true as written |
| e2e/db/verify-functions.mjs | 2026-09-29 | true as written |
| e2e/db/verify-writes.mjs | 2026-09-29 | true as written |
| e2e/flow-screens.mjs | 2026-09-29 | read with the Darkroom focus fix / E2E probe |
| e2e/keyboard-room.mjs | 2026-10-01 | written with the keyboard probe |
| e2e/plugins/withCleartextTraffic.js | 2026-09-29 | true; one line narrowed |
| e2e/run-flows.sh | 2026-10-01 | the keyboard's room added after the flows |
| e2e/screen.mjs | 2026-09-29 | true; one line narrowed |
| e2e/supabase/functions/tmdb-proxy/index.ts | 2026-09-29 | history reduced to the rule |
| e2e/supabase/functions/tmdb-proxy/normalize.mjs | 2026-09-29 | true as written |
| e2e/tmdb/record.mjs | 2026-09-29 | true as written |
| eslint.config.js | 2026-09-29 | 3 findings; the crash and logo stories reduced to the rule each enforces |
| jest.afterEnv.ts | — |  |
| jest.config.js | — |  |
| jest.setup.ts | 2026-09-29 | 15 findings; each mock's discovery story cut to the rule it keeps |
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
| mockups/tabs/__tests__/zz-rooms.gen.test.tsx | 2026-09-29 | true as written |
| mockups/tabs/__tests__/zz-settings.gen.test.tsx | 2026-09-29 | true as written |
| mockups/tabs/flashListMock.tsx | 2026-10-01 | rows handed extraData, as FlashList does |
| mockups/tools/advances.cjs | 2026-09-29 | true as written |
| mockups/tools/drawn.cjs | 2026-09-29 | 1 finding |
| mockups/tools/harness.cjs | 2026-09-28 | 5 findings; the header's middle sentence was garbled by an insertion; open() said 1.35 was the most a word grows (uncapped grows to 3.1) |
| mockups/tools/layout.cjs | 2026-09-28 | 12 findings; the header said it measured 'x1 and x1.35' (it runs five passes, iOS to 3.1 and Android to 2) and left SMALL, SHORT and LOST unlisted; two stacked JSDocs merged |
| mockups/tools/contrast.cjs | 2026-09-30 | new: every word against the pixels under it |
| mockups/tools/lobby-advances.cjs | 2026-09-30 | new: the faces' advance tables, measured in Chromium |
| mockups/tools/quote-ink.cjs | 2026-09-30 | new: the quote marks' outline, read from the font file |
| mockups/tools/selftest.cjs | 2026-09-28 | 19 findings; the bordered-pair note sat over scaledbeside, moved to its case |
| mockups/tools/shoot.cjs | 2026-09-29 | true as written |
| mockups/tools/yoga-parity.cjs | 2026-09-28 | 3 findings; the header claimed an iPhone point grid while the code sets none (setPointScaleFactor 0); the build() JSDoc sat above the config |
| README.md | — |  |
| scripts/bundle-size.js | — |  |
| scripts/check-app-routes.js | 2026-09-29 | claimed to fail CI, but no workflow ran it: CI now runs it (proved to fail on a planted non-route) |
| scripts/check-backend-live.mjs | 2026-09-28 | 13 findings; section numbers ran 1-5,9,10,8,6,7,8 and the admin-RPC note sat above the TRUNCATE block — renumbering dropped, each note moved over its own code; '#24' output replaced with what it means |
| scripts/comment-truth.js | 2026-09-29 | 8 fixed (its own examples tripped it); TODO now exempt in backticks; npm run comments:check added |
| scripts/coverage-ratchet.js | 2026-09-29 | the header's why-stories reduced to the rule |
| scripts/edge-functions.cjs | 2026-09-29 | fetch-rss 'read by visitors' was stale (installed builds call it); history dropped |
| scripts/functions-check.mjs | 2026-09-29 | now tells a comment-only difference (a note) from a code difference (a failure), by the compiler's tokens; a one-letter code change fails it |
| scripts/gates-check.js | 2026-09-28 | 5 findings plus 4 unflagged incident stories; passes against production after |
| scripts/lucide-icons.js | — |  |
| scripts/schema-snapshot.mjs | 2026-09-28 | 5 findings; an orphan note trailed its code; the case for the snapshot kept, the incident counts dropped |
| scripts/secret-shapes.cjs | 2026-09-29 | true as written |
| scripts/surface-jest-failure.sh | — |  |
| scripts/test-timezones.js | 2026-09-29 | the batch story reduced to the fact it guards |
| src/assets/logo/reelhouse-logo-data.ts | — |  |
| src/components/Arrive.tsx | 2026-10-01 | written: useArrival as a view |
| src/components/__tests__/ActionDeck.test.tsx | 2026-10-01 | rendered: owner, certify, save, stranger |
| src/components/__tests__/animation-parking.test.ts | — |  |
| src/components/__tests__/aRatingCanBeGivenWithoutSight.test.tsx | — |  |
| src/components/__tests__/aScreenThatFailsLetsYouLeave.test.tsx | — |  |
| src/components/__tests__/authRouting.test.ts | — |  |
| src/components/__tests__/ControlledInput.test.tsx | — |  |
| src/components/__tests__/EmptyStates.test.tsx | — |  |
| src/components/__tests__/ErrorBoundary.test.tsx | — |  |
| src/components/__tests__/OfflineBanner.test.tsx | — |  |
| src/components/__tests__/oneRankMark.test.ts | — |  |
| src/components/__tests__/overlayElevation.test.ts | — |  |
| src/components/__tests__/PressableScale.hitSlop.test.tsx | — |  |
| src/components/__tests__/SectionErrorBoundary.test.tsx | — |  |
| src/components/__tests__/SpoilerVeil.test.tsx | 2026-10-01 | records every frame |
| src/components/__tests__/stackedRowHitSlop.test.ts | 2026-09-29 | histories → rules; FALSE: '15pt on EVERY side' (PressableScale drops it on an axis ≥48pt); iOS source cited is Fabric's RCTViewComponentView; BUG: mapSpans treated a backtick string as code ('\'' twice) — fixed |
| src/components/__tests__/textContrast.test.ts | — |  |
| src/components/__tests__/theCountHangsBesideItsMark.test.tsx | — |  |
| src/components/__tests__/theDoorCanBeReadAndPressed.test.tsx | — |  |
| src/components/__tests__/theRankBadgeIsReadable.test.ts | — |  |
| src/components/__tests__/theShareSheetSaysWhenTheSalonsAreAway.test.tsx | 2026-10-01 | salons, selection, closed cost, crash copy |
| src/components/__tests__/theToastHasOneHome.test.tsx | — |  |
| src/components/__tests__/theToastIsDrawnOnTop.test.ts | — |  |
| src/components/atmosphere/__tests__/useSharedImage.test.tsx | — |  |
| src/components/atmosphere/RoomBloom.tsx | — |  |
| src/components/atmosphere/RoomLight.tsx | — |  |
| src/components/atmosphere/useSharedImage.ts | — |  |
| src/components/auth/AuthChrome.tsx | 2026-10-01 | true as written |
| src/components/auth/EmailConfirmationScreen.tsx | 2026-10-01 | true as written |
| src/components/auth/PasswordRecoveryModal.tsx | 2026-10-01 | says reset or confirm, one sheet |
| src/components/auth/PasswordStrengthMeter.tsx | 2026-10-01 | true as written |
| src/components/auth/SocietySeal.tsx | 2026-10-01 | true as written |
| src/components/AutopsyGauge.tsx | 2026-10-01 | true as written |
| src/components/Buster.tsx | 2026-10-01 | true as written |
| src/components/CinematicOverlays.tsx | 2026-10-01 | the dead film grain gone |
| src/components/clearance/__tests__/oneRopeNotThree.test.tsx | — |  |
| src/components/clearance/Clearance.tsx | 2026-10-01 | show it, locked; a second copy lives in the log (carried forward) |
| src/components/ContentSkeleton.tsx | — |  |
| src/components/ControlledInput.tsx | 2026-10-01 | comments in plain words |
| src/components/critique/__tests__/aCritiqueIsWithdrawnOrReported.test.tsx | 2026-10-01 | new |
| src/components/critique/__tests__/oneCritiqueRow.guard.test.ts | 2026-09-30 | written with the shared critique row |
| src/components/critique/CritiqueRow.tsx | 2026-10-01 | a nameless author is never linked |
| src/components/critique/withdraw.ts | 2026-10-01 | new: the one question before a critique comes off the page |
| src/components/darkroom/__tests__/aYearTypedOnAnIPhoneIsApplied.test.tsx | 2026-09-29 | new |
| src/components/darkroom/__tests__/theSuggestionsComeBack.test.tsx | 2026-09-29 | read with the Darkroom focus fix / E2E probe |
| src/components/darkroom/__tests__/theTraySaysWhenTheCatalogueIsAway.test.tsx | — |  |
| src/components/darkroom/constants.ts | — |  |
| src/components/darkroom/DarkroomCards.tsx | — |  |
| src/components/darkroom/DarkroomFilterPanel.tsx | 2026-09-29 | year applied on end of editing (iPhone number pad has no return); named fields |
| src/components/darkroom/DarkroomHeader.tsx | 2026-09-29 | read with the Darkroom focus fix / E2E probe |
| src/components/darkroom/DarkroomHero.tsx | 2026-09-29 | read with the Darkroom focus fix / E2E probe |
| src/components/darkroom/DarkroomMoodBar.tsx | — |  |
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
| src/components/dispatch/__tests__/essayBody.test.tsx | — |  |
| src/components/dispatch/__tests__/everyCardSaysSomething.test.tsx | — |  |
| src/components/dispatch/__tests__/everyLeadInIsAccountedFor.test.ts | — |  |
| src/components/dispatch/__tests__/everyRuleIsTrue.test.ts | — |  |
| src/components/dispatch/__tests__/everyTextHasACeiling.test.ts | — |  |
| src/components/dispatch/__tests__/excerpt.test.ts | — |  |
| src/components/dispatch/__tests__/feedRowIsRecyclable.test.ts | — |  |
| src/components/dispatch/__tests__/feedScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/motionLaws.test.tsx | — |  |
| src/components/dispatch/__tests__/noIntlInTheDispatch.test.ts | — |  |
| src/components/dispatch/__tests__/nothingIsLostQuietly.test.tsx | — |  |
| src/components/dispatch/__tests__/nothingLivesOnlyInTheMockups.test.ts | — |  |
| src/components/dispatch/__tests__/oneCapNotThree.test.ts | — |  |
| src/components/dispatch/__tests__/oneWordNamesOneThing.test.ts | — |  |
| src/components/dispatch/__tests__/paperTextLogic.test.ts | — |  |
| src/components/dispatch/__tests__/readerScreen.test.tsx | 2026-09-29 | 25 fixed; FOUND a \u-eaten regex (Arabic never matched) |
| src/components/dispatch/__tests__/roomScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/rulesScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/seriesScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/signedOutHasNoInertControls.test.tsx | — |  |
| src/components/dispatch/__tests__/spokenAloud.test.tsx | — |  |
| src/components/dispatch/__tests__/theBallotAndTheCount.test.tsx | — |  |
| src/components/dispatch/__tests__/theDispatchAtItsLimits.test.tsx | — |  |
| src/components/dispatch/__tests__/theDispatchSaysEssay.test.ts | — |  |
| src/components/dispatch/__tests__/theDoorIsShown.test.tsx | — |  |
| src/components/dispatch/__tests__/theDraftIsTheWholePiece.test.tsx | — |  |
| src/components/dispatch/__tests__/theEssayAtLargeType.test.tsx | — |  |
| src/components/dispatch/__tests__/theHardcodedWidthIsHarmless.test.ts | — |  |
| src/components/dispatch/__tests__/theInvitationHasAnAddress.test.tsx | — |  |
| src/components/dispatch/__tests__/theMarginSaysWhatItCounts.test.tsx | 2026-09-29 | new |
| src/components/dispatch/__tests__/theNumberIsAMembershipFact.test.tsx | — |  |
| src/components/dispatch/__tests__/theParagraphKnowsItsDirection.test.tsx | — |  |
| src/components/dispatch/__tests__/thePreviewIsThePage.test.tsx | — |  |
| src/components/dispatch/__tests__/theSeriesSheet.test.tsx | 2026-10-01 | written: the series sheet says what it read |
| src/components/dispatch/__tests__/theRailFitsOneScreen.test.ts | — |  |
| src/components/dispatch/__tests__/theReaderAtFullLength.test.tsx | — |  |
| src/components/dispatch/__tests__/theRoomOnScreenDecidesTheGate.test.ts | — |  |
| src/components/dispatch/__tests__/theRoomSaysWhatItHolds.test.tsx | — |  |
| src/components/dispatch/__tests__/theSetOfTheType.test.tsx | — |  |
| src/components/dispatch/__tests__/theWritingRoomExplainsItself.test.ts | — |  |
| src/components/dispatch/__tests__/wireCarriesItsSource.test.tsx | — |  |
| src/components/dispatch/__tests__/yourOwnRankOnYourOwnByline.test.ts | — |  |
| src/components/dispatch/ComposeDesks.tsx | 2026-09-29 | 16 fixed; 'FILE IT unlit until the film is named' was false (it waits for the SOURCE) |
| src/components/dispatch/dayLabel.ts | 2026-09-29 | 24-hour reason moved here from paperMetrics; 'margin never scales' was false (displayTextProps 1.2) |
| src/components/dispatch/EssayBody.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/excerpt.ts | 2026-10-01 | true as written |
| src/components/dispatch/FilingRow.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperBallot.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperComposer.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperCritiques.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperDesk.tsx | 2026-09-29 | CLOSES made a working control; handler-less controls disabled; 7 dead styles; histories to rules |
| src/components/dispatch/paper/PaperDeskDoc.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperEssay.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperFill.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperFrame.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperKeyWell.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/paperMetrics.ts | 2026-09-29 | 33 fixed: stale names (NewsService, volumeNumber, chromeHeight, plate styles, noRawKindOnThePage) gone; measure example 375->318 corrected; formatCount branch comment was wrong |
| src/components/dispatch/paper/PaperMore.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/paperMotion.ts | — |  |
| src/components/dispatch/paper/paperPerf.ts | — |  |
| src/components/dispatch/paper/PaperPost.tsx | 2026-09-29 | 17 fixed; 3 FALSE: 'the counts leave' (they sit by the icons), 'there is no kind label' (every kind leads with one), 'rule material set by tier' misread; pending/dimmed never wired (logged) |
| src/components/dispatch/paper/PaperStrike.tsx | — |  |
| src/components/dispatch/paper/paperStyles.ts | 2026-09-28 | Rewritten to the rule. Seven comments contradicted their values (16 vs 16.5, 9/1.1 vs 10/0.9, tracking 1.2 vs 0.9, a serial number where a monogram is drawn, a speck poster that is drawn); two blocks disagreed on what the rule carries; history removed. |
| src/components/dispatch/paper/paperText.ts | — |  |
| src/components/dispatch/readTime.ts | 2026-10-01 | true as written |
| src/components/dispatch/roomLink.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/SeriesPicker.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/EmptyStates.tsx | 2026-10-01 | the offline state arrives through Arrive |
| src/components/ErrorBoundary.tsx | — |  |
| src/components/feed/__tests__/theKeyLeadsWhereItSays.test.tsx | 2026-10-01 | true as written |
| src/components/feed/ActionDeck.tsx | 2026-10-01 | owner by id; nav; comments cut to the why |
| src/components/feed/ActivityCard.tsx | 2026-10-01 | lies flat unless an Auteur's; comments made true |
| src/components/feed/AutopsyView.tsx | 2026-10-01 | each score read whole |
| src/components/feed/PosterFrame.tsx | 2026-10-01 | the poster says its film |
| src/components/feed/ReviewContent.tsx | 2026-10-01 | comments cut to the why |
| src/components/feed/UserAttributionRow.tsx | 2026-10-01 | comments cut to the why |
| src/components/film/__tests__/castRailFits.test.ts | — |  |
| src/components/film/__tests__/FilmActionTray.test.tsx | — |  |
| src/components/film/__tests__/filmDossier.test.tsx | — |  |
| src/components/film/__tests__/filmPageWiring.test.ts | — |  |
| src/components/film/__tests__/FilmStub.test.tsx | — |  |
| src/components/film/__tests__/filmStubMetrics.test.ts | — |  |
| src/components/film/__tests__/filmVerdict.test.tsx | — |  |
| src/components/film/__tests__/footageRailFits.test.ts | — |  |
| src/components/film/__tests__/oneBrass.test.ts | — |  |
| src/components/film/__tests__/pickCertificate.test.ts | — |  |
| src/components/film/__tests__/stubFits.test.ts | — |  |
| src/components/film/__tests__/trayActsFire.test.tsx | — |  |
| src/components/film/__tests__/whatAFilmPageNames.test.tsx | 2026-10-01 | written: where it plays, what a video is, what a file sends |
| src/components/film/__tests__/zz-film.gen.test.tsx | — |  |
| src/components/film/__tests__/whatTheFilmPageCouldNotRead.test.tsx | 2026-10-01 | written: the critiques' failure reaches the page; an unread verdict is unknown |
| src/components/film/CastCarousel.tsx | 2026-10-01 | named for a screen reader; histories to the present |
| src/components/film/FilmActionTray.tsx | 2026-10-01 | histories to the present |
| src/components/film/FilmDetailLayout.tsx | 2026-10-01 | histories to the present; the not-found way out named |
| src/components/film/FilmDossier.tsx | 2026-10-01 | what it holds, not what it absorbed |
| src/components/film/FilmHero.tsx | 2026-10-01 | an unknown verdict claims nothing; histories to the present |
| src/components/film/FilmHeroSkeleton.tsx | 2026-10-01 | the promise, not its history |
| src/components/film/FilmMediaCarousel.tsx | 2026-10-01 | hands the whole video on; named |
| src/components/film/FilmReviews.tsx | 2026-10-01 | a failed read says so; no throw; flat card |
| src/components/film/FilmScrollHeader.tsx | 2026-10-01 | the fault it fixes, said as what it does |
| src/components/film/FilmSectionHeader.tsx | 2026-10-01 | true as written |
| src/components/film/FilmSimilar.tsx | 2026-10-01 | nav; named for a screen reader |
| src/components/film/FilmStub.tsx | 2026-10-01 | histories to the present; rated of 5 |
| src/components/film/filmStubMetrics.ts | 2026-10-01 | true as written, one history line |
| src/components/film/LogShareCard.tsx | 2026-10-01 | the unused modal mode gone; the card alone |
| src/components/film/NitrateFileCard.tsx | 2026-10-01 | every word frozen, as its header promised |
| src/components/film/pickCertificate.ts | 2026-10-01 | the member's own region is real now |
| src/components/film/ShareCardModal.tsx | 2026-10-01 | a failed share says so and stays |
| src/components/film/ShareCardTypes.ts | — |  |
| src/components/film/TrailerModal.tsx | 2026-10-01 | names what it plays |
| src/components/film/WatchProviders.tsx | 2026-10-01 | named for what it costs, for one named country |
| src/components/HapticTab.tsx | — |  |
| src/components/home/ProjectorBeam.tsx | 2026-10-01 | true as written |
| src/components/home/types.ts | 2026-10-01 | true as written |
| src/components/home/VelvetRopeCTA.tsx | 2026-10-01 | nav; the shimmer note made true |
| src/components/InitiationModal.tsx | — |  |
| src/components/KeyboardRoom.tsx | 2026-10-01 | written: the keyboard's room on Android |
| src/components/layout/__tests__/aSectionIsAHeading.test.tsx | 2026-10-01 | written: a section title is a heading |
| src/components/layout/__tests__/ConciergeButton.test.tsx | — |  |
| src/components/layout/__tests__/everyListChoosesItsAnchor.guard.test.ts | 2026-09-29 | new |
| src/components/layout/__tests__/flashListKeyboard.test.tsx | 2026-09-29 | anchor tests |
| src/components/layout/__tests__/theThumbStaysInItsTrack.test.ts | 2026-10-01 | runs the real maths |
| src/components/layout/__tests__/TopNavBar.test.tsx | — |  |
| src/components/layout/CinematicFlashList.tsx | 2026-09-29 | NOT_ANCHORED default (header race) |
| src/components/layout/CinematicScrollbar.tsx | 2026-10-01 | the thumb maths in one place |
| src/components/layout/CinematicScrollView.tsx | 2026-10-01 | true as written |
| src/components/layout/ConciergeButton.tsx | — |  |
| src/components/layout/FrozenTab.tsx | 2026-10-01 | says it passes through; freezing carried to performance |
| src/components/layout/navMetrics.ts | — |  |
| src/components/layout/SectionCards.tsx | 2026-10-01 | a section title is a heading |
| src/components/layout/TopNavBar.tsx | — |  |
| src/components/lobby/__tests__/theWallHasNoDeadEnds.test.tsx | 2026-09-30 | new: doors, names, states, counts, every line's room |
| src/components/lobby/__tests__/theHonourStays.test.tsx | 2026-09-30 | new |
| src/components/lobby/__tests__/theLobbyScreenHangsTheWall.test.tsx | 2026-10-01 | both doors, every pull |
| src/components/lobby/__tests__/theWallIsMeasured.test.ts | 2026-09-30 | new |
| src/components/lobby/__tests__/theWallIsRead.test.ts | 2026-09-30 | new |
| src/components/lobby/faceAdvances.ts | 2026-09-30 | generated; header only |
| src/components/lobby/FeatureRow.tsx | 2026-09-30 | new |
| src/components/lobby/FilingsBill.tsx | 2026-09-30 | new; the byline moved out of the filing's door |
| src/components/lobby/KeepOff.tsx | 2026-09-30 | new |
| src/components/lobby/LobbyHonour.tsx | 2026-09-30 | new |
| src/components/lobby/LobbyWall.tsx | 2026-09-30 | new |
| src/components/lobby/Masthead.tsx | 2026-09-30 | new |
| src/components/lobby/measure.ts | 2026-09-30 | new |
| src/components/lobby/PairBills.tsx | 2026-09-30 | new; "of one height" held only side by side |
| src/components/lobby/parts.tsx | 2026-09-30 | new |
| src/components/lobby/RankBill.tsx | 2026-09-30 | new |
| src/components/lobby/wallRead.ts | 2026-09-30 | new |
| src/components/lobby/words.ts | 2026-09-30 | new; named a test that did not exist |
| src/components/log/__tests__/editorialDesk.test.tsx | — |  |
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
| src/components/log/__tests__/theComposerKeepsItsWord.test.tsx | — |  |
| src/components/log/__tests__/theLapsedMemberReadsTheirNote.test.tsx | — |  |
| src/components/log/__tests__/theNoteSheetOffersOnlyWhatIsReal.test.tsx | — |  |
| src/components/log/__tests__/theVaultBelongsToItsViewing.test.tsx | — |  |
| src/components/log/__tests__/theVaultSaysWhenItCouldNotOpen.test.tsx | 2026-10-01 | written: the Vault on the record, when it could not open |
| src/components/log/__tests__/zz-composer.gen.test.tsx | — |  |
| src/components/log/AuteurToolkit.tsx | 2026-10-01 | histories to the present |
| src/components/log/EditorialDesk.tsx | 2026-10-01 | stills named as buttons; histories to the present |
| src/components/log/LogActionDeck.tsx | 2026-10-01 | the autopsy toggle named; Arrive; a dead prop gone |
| src/components/log/LogAtmosphere.tsx | 2026-10-01 | the film behind the composer, said as why |
| src/components/log/LogChronicle.tsx | 2026-10-01 | the typed card, said as why |
| src/components/log/LogClearanceGate.tsx | 2026-10-01 | the rope said as what it is |
| src/components/log/LogComments.tsx | 2026-10-01 | true as written |
| src/components/log/logDetailStyles.ts | 2026-10-01 | flat record card; the Vault's unread line |
| src/components/log/LogForm.tsx | 2026-10-01 | a private stack wears its lock; histories to the present |
| src/components/log/LogFormBody.tsx | 2026-10-01 | true as written |
| src/components/log/LogHero.tsx | 2026-10-01 | the filing mark in the present tense |
| src/components/log/LogIndexEntry.tsx | 2026-10-01 | a held-but-unshown entry said as holding something |
| src/components/log/LogModalStyles.ts | 2026-10-01 | flat sheet and delete box; histories to the present |
| src/components/log/logRecord.ts | 2026-10-01 | histories to the present |
| src/components/log/LogReviewBody.tsx | 2026-10-01 | a Vault that could not open says so |
| src/components/log/LogSealBar.tsx | 2026-10-01 | histories to the present |
| src/components/log/LogSearchEngine.tsx | 2026-10-01 | TMDB named, never a bare star; rows named |
| src/components/log/LogVerdict.tsx | 2026-10-01 | histories to the present |
| src/components/log/NoteSheet.tsx | 2026-10-01 | true as written |
| src/components/log/VaultNote.tsx | 2026-10-01 | true as written |
| src/components/lounge/__tests__/aKeystrokeRedrawsNoMessage.test.tsx | — |  |
| src/components/lounge/__tests__/aMessageCanBeHeardAndActedOn.test.ts | 2026-09-29 | new |
| src/components/lounge/__tests__/MemberFaceStack.model.test.ts | — |  |
| src/components/lounge/__tests__/roomGate.test.ts | 2026-09-29 | new |
| src/components/lounge/__tests__/aRefusedLeaveStaysInTheRoom.test.tsx | 2026-10-01 | written: the salon panel leaves only on success |
| src/components/lounge/__tests__/theCorridorIsOpen.test.ts | — |  |
| src/components/lounge/__tests__/theDoorAdmits.test.tsx | 2026-10-01 | written: the host's panel, mounted |
| src/components/lounge/__tests__/theDoorIsAName.test.tsx | — |  |
| src/components/lounge/__tests__/theDoorWaitsForTheGuestList.test.tsx | 2026-09-29 | new |
| src/components/lounge/__tests__/thePollRunsWhileWatched.test.ts | — |  |
| src/components/lounge/__tests__/theRoomSaysWhenItCouldNotBeReached.test.tsx | — |  |
| src/components/lounge/__tests__/theRopeWaitsForTheSheet.test.tsx | — |  |
| src/components/lounge/__tests__/theSalonsSayWhenTheyCouldNotBeRead.test.tsx | — |  |
| src/components/lounge/ActionSheet.tsx | 2026-10-01 | true as written |
| src/components/lounge/AtTheDoorPanel.tsx | 2026-10-01 | true as written |
| src/components/lounge/CreateLoungeSheet.tsx | 2026-10-01 | the rope and the counter say why, not what they were |
| src/components/lounge/EmptyMyLounges.tsx | 2026-10-01 | contrast history to its reason |
| src/components/lounge/JoinedLoungeCard.tsx | 2026-10-01 | true as written |
| src/components/lounge/LoungeGate.tsx | 2026-10-01 | the door names membership, without its history |
| src/components/lounge/LoungeSettingsPanel.tsx | 2026-10-01 | contrast history dropped |
| src/components/lounge/LoungeStyles.ts | 2026-10-01 | true as written |
| src/components/lounge/loungeTabStyles.ts | 2026-10-01 | contrast history to its reasons |
| src/components/lounge/MemberFaceStack.tsx | 2026-10-01 | the faces are fixed, not the words; no "today's card" |
| src/components/lounge/PublicLoungeCard.tsx | 2026-10-01 | true as written |
| src/components/lounge/reactions.tsx | 2026-10-01 | true as written |
| src/components/lounge/roomGate.ts | 2026-09-29 | new |
| src/components/MarkFigure.tsx | — |  |
| src/components/MasterLogo.tsx | — |  |
| src/components/moderation/__tests__/ContentActionSheet.mute.test.tsx | — |  |
| src/components/moderation/__tests__/ReportSheet.test.tsx | — |  |
| src/components/moderation/__tests__/reportSheetDimensions.guard.test.ts | — |  |
| src/components/moderation/ContentActionSheet.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/moderation/ReportSheet.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/NitrateCalendar.tsx | 2026-10-01 | the header without a stale line count |
| src/components/OfflineBanner.tsx | — |  |
| src/components/person/canon.ts | 2026-10-01 | the order, not the sort it replaced |
| src/components/person/PersonBio.tsx | 2026-10-01 | READ MORE named and its state said |
| src/components/person/PersonDefining.tsx | 2026-10-01 | histories to the present |
| src/components/person/PersonFilmography.tsx | 2026-10-01 | one FILM; histories to the present |
| src/components/person/PersonHero.tsx | 2026-10-01 | histories to the present |
| src/components/person/PersonOrnaments.tsx | 2026-10-01 | the rarity mark in the present tense |
| src/components/person/personStyles.ts | 2026-10-01 | histories to the present |
| src/components/Preloader.tsx | — |  |
| src/components/PressableScale.tsx | 2026-09-29 | accessible / actions pass through; hitSlop comment condensed |
| src/components/profile/__tests__/anEmptyLedgerSaysSo.test.tsx | 2026-10-01 | written: an empty ledger is said as one |
| src/components/profile/__tests__/anHonourIsNeverBroken.test.tsx | — |  |
| src/components/profile/__tests__/aRoomKeepsWhatTheServerFound.test.ts | 2026-10-01 | written: a room's search on the phone is the server's |
| src/components/profile/__tests__/aRoomReadsOneAnswer.test.tsx | 2026-10-01 | written: rows, paging and failure from one answer |
| src/components/profile/__tests__/aSearchKeepsItsBox.test.tsx | 2026-10-01 | written: every searchable room, searched to nothing |
| src/components/profile/__tests__/aStandingIsSharedAsWhoseItIs.test.tsx | 2026-10-01 | written: a standing is shared as whose it is |
| src/components/profile/__tests__/computeDailyStreak.test.ts | — |  |
| src/components/profile/__tests__/decadeCounts.test.ts | — |  |
| src/components/profile/__tests__/heroNameSize.test.ts | — |  |
| src/components/profile/__tests__/hideStatsRemoved.guard.test.ts | — |  |
| src/components/profile/__tests__/holdingsFit.test.ts | — |  |
| src/components/profile/__tests__/memberFile.test.tsx | — |  |
| src/components/profile/__tests__/memberFileRooms.test.tsx | — |  |
| src/components/profile/__tests__/memberFileScreen.test.tsx | — |  |
| src/components/profile/__tests__/projectorRoom.test.tsx | — |  |
| src/components/profile/__tests__/railFits.test.ts | — |  |
| src/components/profile/__tests__/reconcileCount.test.ts | — |  |
| src/components/profile/__tests__/roomContrast.test.tsx | — |  |
| src/components/profile/__tests__/roomInset.test.ts | — |  |
| src/components/profile/__tests__/roomRail.test.tsx | — |  |
| src/components/profile/__tests__/rooms.test.tsx | — |  |
| src/components/profile/__tests__/roomSearch.test.tsx | — |  |
| src/components/profile/__tests__/roomSearchWiring.test.tsx | — |  |
| src/components/profile/__tests__/roomsRender.test.tsx | — |  |
| src/components/profile/__tests__/taste.test.tsx | — |  |
| src/components/profile/__tests__/theArchiveLockHolds.test.tsx | 2026-10-01 | written: the archive lock holds |
| src/components/profile/__tests__/theCalendarDrawsToday.test.tsx | 2026-10-01 | written: the calendar draws today and counts what it draws |
| src/components/profile/__tests__/theDnaCardReadsTheRecord.test.tsx | 2026-10-01 | written: the DNA card reads the record and always opens |
| src/components/profile/__tests__/theHonoursCountTheWholeRecord.test.tsx | 2026-10-01 | written: honours and stamps from the whole record |
| src/components/profile/__tests__/theOracleClosesClean.test.tsx | 2026-10-01 | written: the Oracle closes clean |
| src/components/profile/__tests__/theRestCouldNotBeReached.test.tsx | 2026-10-01 | written: a failed "more" is said in every room |
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
| src/components/profile/CinemaDNACard.tsx | 2026-10-01 | the record only; the house ladder; always opens and closes; no invented serial |
| src/components/profile/CinematicInsights.tsx | 2026-10-01 | says retrieving or failed; whose-words; no history comments |
| src/components/profile/favourites.ts | 2026-10-01 | comments say what is true now |
| src/components/profile/FollowRequestsPanel.tsx | — |  |
| src/components/profile/heroNameSize.ts | 2026-10-01 |  |
| src/components/profile/NitrateCalendarGrid.tsx | 2026-10-01 | today drawn; counts what it draws, "in the past year"; the app date helper; nav |
| src/components/profile/NoirPassport.tsx | 2026-10-01 | stamps from the whole record only; labels broken between words; said while unread or failed |
| src/components/profile/ProfileArchiveTab.tsx | 2026-10-01 | nav; IMPORT lands on the import panel; comments say what is true now |
| src/components/profile/ProfileBackdrop.tsx | — |  |
| src/components/profile/profileComputed.ts | 2026-09-29 | 24 fixed; T3 ticket notes, 'until the migration lands', histories cut |
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
| src/components/profile/roomStyles.ts | 2026-09-29 | 26 fixed; chip-halo note was stranded 100 lines from chipSlop; 'the Vault' renamed Physical Archive in prose |
| src/components/profile/TasteDNA.tsx | 2026-10-01 | says retrieving, failed, too few or still reading — never a heading over nothing; whose-words |
| src/components/profile/TasteDNAExportCanvas.tsx | — |  |
| src/components/profile/TasteMatch.tsx | 2026-10-01 |  |
| src/components/profile/WatchlistRoulette.tsx | 2026-10-01 | a mid-spin close stops the spin; opens filmId; nav |
| src/components/RankBadge.tsx | — |  |
| src/components/RatingLegend.tsx | — |  |
| src/components/ReelEyeIcon.tsx | — |  |
| src/components/reels/__tests__/MemberRegistry.select.test.ts | 2026-10-01 | no comments |
| src/components/reels/__tests__/theReelIsTheAdvertisement.test.ts | 2026-10-01 | carries the door's reason |
| src/components/reels/__tests__/theReelSaysWhenItCouldNotRead.test.tsx | — |  |
| src/components/reels/MemberRegistry.tsx | 2026-10-01 | nav; comments cut to the why |
| src/components/reels/ReelsCards.tsx | 2026-10-01 | chips share no tap; comments cut to the why |
| src/components/reels/ReelsFeedList.tsx | 2026-10-01 | stale contrast note gone |
| src/components/reels/ReelsHeader.tsx | 2026-10-01 | comments cut to the why |
| src/components/reels/ReelsStackList.tsx | 2026-10-01 | true as written |
| src/components/reels/types.ts | 2026-10-01 | true as written |
| src/components/RouteErrorBoundary.tsx | — |  |
| src/components/search/SearchResultRow.tsx | — |  |
| src/components/search/SearchUnreachable.tsx | 2026-10-01 | true as written |
| src/components/SectionErrorBoundary.tsx | 2026-10-01 | retries; comments made true |
| src/components/ShareToLoungeModal.tsx | 2026-10-01 | only salons it may speak in; subscribes only when open |
| src/components/SkeletonPulse.tsx | — |  |
| src/components/SkeletonShimmer.tsx | — |  |
| src/components/society/__tests__/theSocietySellsWhatItSays.test.tsx | — |  |
| src/components/society/BillingSwitch.tsx | — |  |
| src/components/society/FoundingCertificate.tsx | — |  |
| src/components/society/GeneralAdmission.tsx | — |  |
| src/components/society/PrivilegeLedger.tsx | — |  |
| src/components/society/PurchaseDock.tsx | — |  |
| src/components/society/purchaseStop.ts | 2026-09-30 | written with the purchase-stop fix |
| src/components/society/RankTicket.tsx | — |  |
| src/components/society/SmallPrint.tsx | 2026-10-01 | its link shared with the sign-in footer |
| src/components/society/SocietyPoster.tsx | — |  |
| src/components/society/societyPricing.ts | — |  |
| src/components/SpoilerVeil.tsx | 2026-10-01 | veiled from the first frame |
| src/components/text/__tests__/theTextKeepsItsPromises.test.tsx | — |  |
| src/components/text/AnimatedText.tsx | — |  |
| src/components/text/index.tsx | 2026-10-01 | the fourth promise: a word stops at the floor |
| src/components/theme/CrestGlow.tsx | 2026-10-01 | the leak note to what it does |
| src/components/theme/DiamondDivider.tsx | 2026-10-01 |  |
| src/components/theme/OrnamentalRule.tsx | 2026-10-01 | no comments |
| src/components/ToastHost.tsx | — |  |
| src/components/Toggle.tsx | 2026-10-01 | comments say what is true now |
| src/components/TryAgain.tsx | — |  |
| src/components/__tests__/aLabelIsSpoken.test.ts | 2026-10-01 | written: a label on a View is spoken |
| src/components/__tests__/theKeyboardHasRoom.test.tsx | 2026-10-01 | written with the keyboard's room |
| src/components/reels/__tests__/theReelSaysWhatEachControlIs.test.tsx | 2026-10-01 | written with the Reel's controls |
| src/components/ui/NotificationBadge.tsx | — |  |
| src/constants/__tests__/aRankIsSoldEnforcedAndExplained.test.ts | — |  |
| src/constants/__tests__/deepLinks.test.ts | — |  |
| src/constants/__tests__/standing.test.ts | — |  |
| src/constants/__tests__/taste.test.ts | — |  |
| src/constants/__tests__/theRanksAreWellFormed.test.ts | — |  |
| src/constants/__tests__/theVaultIsThePrivateNotes.test.ts | — |  |
| src/constants/cacheKeys.ts | — |  |
| src/constants/deepLinks.ts | 2026-10-01 | true as written |
| src/constants/formats.ts | 2026-10-01 | the shelf is the Physical Archive, not the Vault; no ticket tag |
| src/constants/gatedFeatures.ts | — |  |
| src/constants/membership.ts | 2026-10-01 | one list; checked against production |
| src/constants/modalRoutes.ts | — |  |
| src/constants/standing.ts | — |  |
| src/constants/support.ts | — |  |
| src/constants/taste.ts | 2026-10-01 | coverageNote says your or their |
| src/constants/textScaling.ts | — |  |
| src/features/archive/__tests__/anImportMergesIntoTheStackItFinds.test.ts | — |  |
| src/features/archive/__tests__/anImportNeverDropsWhatItCouldNotAsk.test.ts | — |  |
| src/features/archive/__tests__/archiveImport.test.ts | — |  |
| src/features/archive/__tests__/undoImport.test.ts | — |  |
| src/features/archive/archiveImport.ts | 2026-09-28 | Three doc comments sat on a constant instead of the function they describe (upsertCounted, fetchAllListItems, isHeaderRow) and one on the wrong type; normalizeDate's doc sat on isRealDate. 'Zero competitor names' was false. Audit tags (FEAT-1/2) and history removed; every reason kept, shortened. |
| src/features/archive/importReceipt.ts | — |  |
| src/features/archive/undoImport.ts | — |  |
| src/features/profile/__tests__/aLinkSaysWhyBeforeItVanishes.test.tsx | 2026-10-01 | written: a link says why before it vanishes |
| src/features/profile/__tests__/linksEditor.test.tsx | — |  |
| src/features/profile/__tests__/theDossierSealIsSpoken.test.tsx | — |  |
| src/features/profile/__tests__/theEditDeskSaysWhatWentWrong.test.tsx | 2026-10-01 | written: the edit desk says what went wrong |
| src/features/profile/EditProfileScreen.tsx | 2026-10-01 | a refused backdrop said; the photo line is true; history comments trimmed |
| src/features/profile/LinksEditor.tsx | 2026-10-01 | no handle that does not drag; ADD LINK stops at the cap; title errors shown |
| src/features/profile/profile.styles.ts | 2026-10-01 | 19 styles nothing read, removed |
| src/features/settings/__tests__/settings.redesign.test.tsx | — |  |
| src/features/settings/__tests__/anExportIsWhole.test.ts | 2026-10-01 | written: an export holds every row once |
| src/features/settings/DataVault.tsx | — |  |
| src/features/settings/readAllRows.ts | 2026-10-01 | written: the export's ordered paging, out of the screen |
| src/features/settings/settings.styles.ts | — |  |
| src/features/settings/SettingsScreen.tsx | — |  |
| src/features/settings/SettingsSections.tsx | — |  |
| src/generated/lucideIcons.js | — |  |
| src/hooks/__tests__/aFollowThatThrowsIsSaid.test.tsx | 2026-10-01 | written: a follow that throws is said and rolled back |
| src/hooks/__tests__/aMemberFilePullSaysWhatItReached.test.tsx | — |  |
| src/hooks/__tests__/aNewMemberStartsUnfiltered.test.tsx | 2026-10-01 | written: every filter wiped for a new member |
| src/hooks/__tests__/aReadIsStoppedOnlyByWhatMakesItStale.test.tsx | 2026-10-01 | written: each read cancelled only by what makes it stale |
| src/hooks/__tests__/aRoomSaysItCouldNotBeRead.test.tsx | — |  |
| src/hooks/__tests__/aSheetComesAndGoesOnce.test.tsx | 2026-10-01 | written with useSheetPresence |
| src/hooks/__tests__/aSheetStaysAboveTheKeyboard.test.tsx | 2026-10-01 | written with useKeyboardLift |
| src/hooks/__tests__/anArrivalAlwaysArrives.test.tsx | 2026-10-01 | the ratchet is exact |
| src/hooks/__tests__/signingInTellsTheTruth.test.tsx | — |  |
| src/hooks/__tests__/theArchiveDoesNotRepeatItself.test.tsx | — |  |
| src/hooks/__tests__/theRoomDoesNotRepeatItself.test.tsx | 2026-10-01 | written: the room pages on what the server gave |
| src/hooks/__tests__/theArchivePagesOnWhatTheServerGave.test.ts | — |  |
| src/hooks/__tests__/theCalendarReadsItsOwnYear.test.ts | — |  |
| src/hooks/__tests__/theNoteWaitsForItsViewing.test.tsx | — |  |
| src/hooks/__tests__/theSealLeavesWithTheScreen.test.tsx | — |  |
| src/hooks/__tests__/theSearchKnowsWhichSourceWasDown.test.tsx | — |  |
| src/hooks/__tests__/useAuthFlow.validation.test.ts | — |  |
| src/hooks/__tests__/useAuthThrottle.pbt.test.ts | 2026-10-01 | the countdown keeps the rule |
| src/hooks/__tests__/useBanCheck.test.ts | — |  |
| src/hooks/__tests__/useEditProfile.logic.test.ts | — |  |
| src/hooks/__tests__/useFeeds.test.ts | 2026-10-01 | rewritten: drives the real hooks |
| src/hooks/__tests__/useInitiation.test.ts | — |  |
| src/hooks/__tests__/useLogFlow.payload.test.ts | — |  |
| src/hooks/__tests__/useLogFlow.telemetry.test.tsx | — |  |
| src/hooks/__tests__/useLogFlow.validation.test.ts | — |  |
| src/hooks/__tests__/useOfflineAware.test.ts | — |  |
| src/hooks/__tests__/useProfileController.logic.test.ts | — |  |
| src/hooks/__tests__/useProfileData.reducer.test.ts | — |  |
| src/hooks/__tests__/useScreenReady.test.tsx | — |  |
| src/hooks/useAmbientGlow.ts | 2026-10-01 |  |
| src/hooks/useAnalytics.ts | — |  |
| src/hooks/useArrival.ts | 2026-10-01 | written: an arrival that cannot stay invisible |
| src/hooks/useAuthFlow.ts | 2026-10-01 | one sheet for reset or confirm; comments short |
| src/hooks/useAuthThrottle.ts | 2026-10-01 | a lifted lock keeps the rule |
| src/hooks/useBanCheck.ts | — |  |
| src/hooks/useCatalogueSearch.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/hooks/useKeyboardLift.ts | 2026-10-01 | written: a sheet over a screen rises with the keyboard |
| src/hooks/useClearance.ts | 2026-10-01 | one answer for every gate |
| src/hooks/useDeviceThrottling.ts | — |  |
| src/hooks/useDispatchArchive.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/hooks/useDoor.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/hooks/useEditProfile.ts | 2026-10-01 | links said field by field; the cap; SAVE refused says so; a stored handle never held to today's rules |
| src/hooks/useFeeds.ts | 2026-10-01 | one cursor rule; the fallback note gone with the fallback |
| src/hooks/useFilmAnimations.ts | 2026-10-01 | each loop only while seen |
| src/hooks/useFilmDetail.ts | 2026-10-01 | an unread verdict is null, never silence |
| src/hooks/useFollowRequests.ts | — |  |
| src/hooks/useInitiation.ts | — |  |
| src/hooks/useLogFlow.ts | 2026-09-29 | 22 fixed; line refs (:351-352, logOperations.ts:574) and a 30-line history of the erase bug cut to the rule |
| src/hooks/useMemberRoom.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/hooks/useMembershipPricing.ts | — |  |
| src/hooks/useModalKeyboardPadding.ts | — |  |
| src/hooks/useNotableMembers.ts | 2026-10-01 | true as written |
| src/hooks/useOfflineAware.ts | 2026-10-01 | one subscription, no clock |
| src/hooks/useProfileController.ts | 2026-10-01 | one isNarrowed for refresh and filters; a follow that throws is said; dead ref gone; no ticket history |
| src/hooks/useProfileData.ts | 2026-10-01 | each read cancelled only by what makes it stale; failures wiped with the member; comments say what is true now |
| src/hooks/useReportUser.ts | — |  |
| src/hooks/useScreenReady.tsx | 2026-10-01 | true as written |
| src/hooks/useSheetPresence.ts | 2026-10-01 | written: five sheets' rise and fall, once |
| src/hooks/useTextScale.ts | — |  |
| src/hooks/useUniversalSearch.ts | — |  |
| src/hooks/useUpdateUser.ts | — |  |
| src/hooks/useVault.ts | 2026-10-01 | reload, for a Vault that could not open |
| src/lib/__tests__/aRankEndsOnlyWhenTheStoreSaysSo.test.ts | — |  |
| src/lib/__tests__/aRankIsOnlyTakenOnAnAnswer.test.ts | — |  |
| src/lib/__tests__/aResolvedErrorIsRead.test.ts | 2026-10-01 | written: the unread-error sweep, both shapes |
| src/lib/__tests__/defensiveParse.test.ts | — |  |
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
| src/lib/defensiveParse.ts | — |  |
| src/lib/gateMetricsSink.ts | — |  |
| src/lib/nativeOnly/revenuecatWebStub.js | — |  |
| src/lib/pushNotifications.ts | — |  |
| src/lib/pushPrimer.ts | 2026-10-01 | new: the house asks to send word at a moment that wants it |
| src/lib/queryClient.ts | — |  |
| src/lib/revenueCat.ts | 2026-09-29 | 17 fixed; FALSE: 'syncs the tier to profiles.role' (the server re-reads RevenueCat and ignores the tier); setup notes with prices; ticket tags |
| src/lib/scrollBridge.ts | — |  |
| src/lib/sentry.ts | — |  |
| src/lib/supabase.ts | 2026-10-01 | the session kept by authSessionStorage; comments short |
| src/lib/tmdb.ts | — |  |
| src/lib/tmdbErrors.ts | — |  |
| src/lore/fragments.ts | — |  |
| src/providers/__tests__/androidTracking.test.ts | — |  |
| src/providers/androidTracking.ts | — |  |
| src/providers/AppBootstrapper.tsx | — |  |
| src/providers/FilmDetailProvider.tsx | 2026-10-01 | reviewsFailed and playVideo, said |
| src/schemas/__tests__/aFeedRowWithANullIsStillDrawn.test.ts | 2026-10-01 | written with the null-status fix |
| src/schemas/__tests__/schemas.test.ts | — |  |
| src/schemas/feed.schema.ts | 2026-10-01 | film id strict; a null status is watched |
| src/schemas/film.schema.ts | 2026-10-01 | the unused DomainLog mirror gone; no invented date or author |
| src/schemas/profile.schema.ts | — |  |
| src/schemas/settings.ts | — |  |
| src/schemas/user.ts | — |  |
| src/services/__tests__/aMemberTakesBackOnlyTheirOwnStackCritique.test.ts | 2026-09-30 | written with the stack critique delete |
| src/services/__tests__/aMissingLogIsAnAnswer.test.tsx | 2026-10-01 | written: a missing log is null; a nameless author is never unknown |
| src/services/__tests__/aReportIsFiledThroughOneDoor.test.ts | 2026-10-01 | written with 20261001_03 |
| src/services/__tests__/aVisitorReadsWhatTheAppAsksFor.contract.test.ts | — |  |
| src/services/__tests__/aYearIsReadToTheLast.test.ts | 2026-10-01 | written: a year is read to the last row |
| src/services/__tests__/certifyCountAuthority.test.ts | — |  |
| src/services/__tests__/everyNameAClientCallsExists.test.ts | — |  |
| src/services/__tests__/FeedService.test.ts | 2026-10-01 | cursor note made true |
| src/services/__tests__/getFilmVerdict.test.ts | — |  |
| src/services/__tests__/loungeEmbeds.contract.test.ts | — |  |
| src/services/__tests__/loungeSharePayloads.test.ts | — |  |
| src/services/__tests__/ProfileDataService.test.ts | — |  |
| src/services/__tests__/profileRoomFilters.test.ts | 2026-10-01 | the guard follows the one room-filters memo both reads send |
| src/services/__tests__/profileService.test.ts | — |  |
| src/services/__tests__/servicesBatch1.test.ts | — |  |
| src/services/__tests__/servicesBatch2.test.ts | — |  |
| src/services/__tests__/servicesBatch3.test.ts | — |  |
| src/services/__tests__/theDoorCursorCarriesATiebreaker.test.ts | — |  |
| src/services/__tests__/theRegistryRetriesAFailedRead.test.ts | 2026-09-29 | failed read throws; false RLS claim fixed |
| src/services/__tests__/theStackKnowsYourMark.test.ts | — |  |
| src/services/__tests__/theTribunalReadsTheWholeRecord.test.tsx | — |  |
| src/services/__tests__/tmdbProxyAllowsEveryPath.test.ts | — |  |
| src/services/__tests__/VaultService.test.ts | — |  |
| src/services/__tests__/yearInCinema.test.ts | — |  |
| src/services/AuthService.ts | 2026-10-01 | true as written |
| src/services/FeedService.ts | 2026-10-01 | the cursor note made true: RPC arguments |
| src/services/FilmService.ts | 2026-10-01 | a failed verdict read is thrown; histories to the present |
| src/services/FollowRequestService.ts | — |  |
| src/services/InteractionService.ts | 2026-10-01 | its schema is what its test reads |
| src/services/logCounts.ts | 2026-10-01 | true as written |
| src/services/LogService.ts | 2026-10-01 | a missing log is null; histories to the present |
| src/services/LoungeService.ts | 2026-10-01 | true as written |
| src/services/MemberDiscoveryService.ts | 2026-09-29 | failed read throws; false RLS claim fixed |
| src/services/ModerationService.ts | — |  |
| src/services/ProfileDataService.ts | 2026-09-29 | 24 fixed; 'Sentry breadcrumb' was dev-only logger.info (logged for step 6); a dead file ref; ticket tags |
| src/services/ProfileWriteService.ts | — |  |
| src/services/StackService.ts | 2026-09-30 | the delete's comment said a refusal "is seen" and never read it; made true |
| src/services/VaultService.ts | — |  |
| src/services/YearInCinemaService.ts | 2026-10-01 | every page of a year, not the first 1,000 |
| src/services/__tests__/aCountNotReadIsNotZero.test.ts | 2026-10-01 | written with the counts fix |
| src/stores/__tests__/aFailedLoadKeepsWhoYouFollow.test.ts | 2026-09-29 | follow-list wipe fixed; comments read |
| src/stores/__tests__/aFailedReadIsSaid.test.ts | 2026-10-01 | written: a failed read is answered as failed |
| src/stores/__tests__/aFailedSettingStaysUndone.test.ts | 2026-09-29 | new |
| src/stores/__tests__/aFollowMadeOfflineIsKept.test.ts | — |  |
| src/stores/__tests__/aMarkReadThatFailedIsHeard.test.ts | 2026-10-01 | written with the marks fix |
| src/stores/__tests__/aNoticeIsNarrowedToItsOwner.test.ts | — |  |
| src/stores/__tests__/aProfileChangeIsNeverDropped.test.ts | — |  |
| src/stores/__tests__/aReactionIsOneOfFive.test.ts | — |  |
| src/stores/__tests__/aRefusedWriteIsNotSuccess.test.ts | — |  |
| src/stores/__tests__/aSalonKeepsItsCoverAndItsDoor.test.ts | 2026-10-01 | written: the corridor reads covers; a rank refusal is a door |
| src/stores/__tests__/aStackIsSavedWhole.test.ts | — |  |
| src/stores/__tests__/auth.test.ts | — |  |
| src/stores/__tests__/blockEnforcement.test.ts | — |  |
| src/stores/__tests__/blockStore.pbt.test.ts | — |  |
| src/stores/__tests__/dispatchActs.test.ts | — |  |
| src/stores/__tests__/dispatchCritiquePaging.test.ts | — |  |
| src/stores/__tests__/dispatchGuards.test.ts | 2026-09-28 | Shortened; a test added for the essay's cover. |
| src/stores/__tests__/dispatchReads.test.ts | — |  |
| src/stores/__tests__/dispatchRefusals.test.ts | — |  |
| src/stores/__tests__/dispatchWrites.test.ts | — |  |
| src/stores/__tests__/encryptionAtRest.guard.test.ts | — |  |
| src/stores/__tests__/films.test.ts | — |  |
| src/stores/__tests__/followGraph.wiring.guard.test.ts | 2026-09-29 | follow-list wipe fixed; comments read |
| src/stores/__tests__/interactionSlice.test.ts | — |  |
| src/stores/__tests__/logoutBeatsTheRollback.test.ts | — |  |
| src/stores/__tests__/logoutClearsEveryModuleCache.test.ts | — |  |
| src/stores/__tests__/logoutLeavesNoTrace.guard.test.ts | — |  |
| src/stores/__tests__/logSlice.test.ts | — |  |
| src/stores/__tests__/lounge.test.ts | — |  |
| src/stores/__tests__/loungeActs.test.ts | 2026-10-01 | a stale line count dropped |
| src/stores/__tests__/loungeErrors.guard.test.ts | — |  |
| src/stores/__tests__/markCounts.test.ts | — |  |
| src/stores/__tests__/notificationCap.test.ts | — |  |
| src/stores/__tests__/reportStore.pbt.test.ts | — |  |
| src/stores/__tests__/socialSlice.hydrationReconcile.test.ts | — |  |
| src/stores/__tests__/socialSlice.unfollow.test.ts | — |  |
| src/stores/__tests__/staleWriteGuard.test.ts | — |  |
| src/stores/__tests__/telemetryGating.test.ts | — |  |
| src/stores/__tests__/theBoardSaysWhenItCouldNotBeRead.test.tsx | — |  |
| src/stores/__tests__/theCursorCarriesATiebreaker.test.ts | — |  |
| src/stores/__tests__/theHouseSaysWhy.test.ts | — |  |
| src/stores/__tests__/theLiveWireKnowsTheRoom.test.ts | — |  |
| src/stores/__tests__/theLogSaysWhatHappened.test.ts | — |  |
| src/stores/__tests__/theRoomYouAreActuallyIn.test.ts | — |  |
| src/stores/__tests__/theSalonListIsWholeOrSaysSo.test.ts | 2026-10-01 | written with the salon-list fix |
| src/stores/__tests__/theSalonNameIsNotCutInSilence.test.ts | — |  |
| src/stores/__tests__/theStoreOpensOnEveryLaunch.test.ts | 2026-10-01 | written with the 16-byte key fix |
| src/stores/__tests__/theThrottleIsPerRoom.test.ts | — |  |
| src/stores/__tests__/vaultStore.test.ts | — |  |
| src/stores/__tests__/watchlistSlice.test.ts | — |  |
| src/stores/auth.ts | 2026-10-01 | username sign-in says what failed; comments short |
| src/stores/blockStore.ts | — |  |
| src/stores/createSelectors.ts | — |  |
| src/stores/discover.ts | — |  |
| src/stores/dispatch.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/stores/dispatchTypes.ts | — |  |
| src/stores/domain/__tests__/aShelfIsNeverHeldHostage.test.ts | — |  |
| src/stores/domain/__tests__/cursorPagination.test.ts | — |  |
| src/stores/domain/__tests__/logOperations.pure.test.ts | — |  |
| src/stores/domain/__tests__/logReconciliation.test.ts | — |  |
| src/stores/domain/archiveSlice.ts | — |  |
| src/stores/domain/helpers/promiseMutex.ts | — |  |
| src/stores/domain/helpers/sessionGuard.ts | 2026-10-01 | true as written |
| src/stores/domain/interactionSlice.ts | — |  |
| src/stores/domain/listSlice.ts | — |  |
| src/stores/domain/logSlice.ts | — |  |
| src/stores/domain/logSlice/helpers/logOperations.ts | — |  |
| src/stores/domain/socialSlice.ts | 2026-09-29 | follow-list wipe fixed; comments read |
| src/stores/domain/watchlistSlice.ts | — |  |
| src/stores/films.ts | — |  |
| src/stores/followStore.ts | 2026-10-01 | comments cut to the why |
| src/stores/lounge.ts | 2026-09-28 | 38 findings fixed; stale 'created rooms' reason corrected (create_lounge adds the member row); loadOlderMessages→loadMoreMessages; 12 repeated sessionGuard notes dropped |
| src/stores/markCounts.ts | — |  |
| src/stores/mmkv-storage.ts | 2026-10-01 | storageReady added; opens with the 16 bytes recrypt took |
| src/stores/notificationStore.ts | 2026-09-29 | 28 fixed; ticket tags (#51,#73,NOTIF-1,FLAW-08,LIB-5,WS-9,L234) and bug histories cut; checked the reset's MMKV delete hits the same store (it does) |
| src/stores/offlineQueueStore.ts | — |  |
| src/stores/reportStore.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/stores/resetAllStores.ts | — |  |
| src/stores/settings.ts | — |  |
| src/stores/socialStore.ts | 2026-10-01 | the header says where the store lives |
| src/stores/tellMarks.ts | 2026-10-01 | true as written |
| src/stores/vaultStore.ts | — |  |
| src/test-support/swallowedTypeError.ts | — |  |
| src/theme/__tests__/aPhotographIsNotLit.test.ts | — |  |
| src/theme/__tests__/aFlatSurfaceCastsNothing.test.ts | 2026-10-01 | written: the flat-but-elevated ratchet |
| src/theme/__tests__/lightFloor.test.ts | — |  |
| src/theme/__tests__/nothingOvershoots.guard.test.ts | — |  |
| src/theme/__tests__/theGroundLadder.test.ts | — |  |
| src/theme/__tests__/theRoomIsLit.test.ts | — |  |
| src/theme/__tests__/theTextBoxGrowsWithItsText.test.ts | — |  |
| src/theme/__tests__/theTypeFloor.test.ts | — |  |
| src/theme/__tests__/theVeilMeetsTheLight.test.ts | — |  |
| src/theme/__tests__/wordsAreNotMarks.test.ts | 2026-10-01 | true as written |
| src/theme/__tests__/wordsAreSolid.test.ts | — |  |
| src/theme/authStyles.ts | 2026-10-01 | comments short and true |
| src/theme/brass.ts | — |  |
| src/theme/light.ts | — |  |
| src/theme/motion.ts | — |  |
| src/theme/ryeAdvances.ts | 2026-10-01 |  |
| src/theme/shaders.ts | — |  |
| src/theme/stamp.ts | — |  |
| src/theme/theme.ts | 2026-09-28 | 31 findings; header claimed an 'exact port of the web CSS' (false); the ladder, the see-through rule and every measured ratio kept; a stray comment about tarnishDeep sat under onBrassQuiet — moved to its token |
| src/types/film.types.ts | — |  |
| src/types/index.ts | — |  |
| src/types/moderation.ts | — |  |
| src/types/mutations.ts | — |  |
| src/types/profile.types.ts | — |  |
| src/types/social.types.ts | — |  |
| src/types/tmdb.types.ts | — |  |
| src/types/ui.types.ts | — |  |
| src/utils/__tests__/aMemberBackSoonIsBackWhereTheyWere.test.ts | 2026-10-01 | new |
| src/utils/__tests__/aNarrowedWriteMustSeeItsRefusal.test.ts | — |  |
| src/utils/__tests__/anExcerptNeverEndsInHalfAnEmoji.test.ts | — |  |
| src/utils/__tests__/appConfig.guard.test.ts | — |  |
| src/utils/__tests__/aReplayThatCannotReadKeepsItsWrite.test.ts | — |  |
| src/utils/__tests__/aWithdrawnFilingKeepsNothing.test.ts | — |  |
| src/utils/__tests__/boundedCounts.guard.test.ts | — |  |
| src/utils/__tests__/calendarDates.test.ts | — |  |
| src/utils/__tests__/ciAlert.behaviour.test.ts | — |  |
| src/utils/__tests__/ciWorkflows.guard.test.ts | — |  |
| src/utils/__tests__/csv.test.ts | — |  |
| src/utils/__tests__/dispatchExecutors.test.ts | — |  |
| src/utils/__tests__/dispatchFieldCaps.test.ts | 2026-09-28 | Claimed to reconcile every live ceiling but read three old migrations, so subject_backdrop_ceiling had no cap. Reads the live snapshot now, and fails on any ceiling without an app cap or a stated reason. |
| src/utils/__tests__/dispatchMutationRegistry.test.ts | — |  |
| src/utils/__tests__/dispatchOfflineParity.test.ts | — |  |
| src/utils/__tests__/dossierPublishing.guard.test.ts | — |  |
| src/utils/__tests__/e2eTrace.test.ts | 2026-09-29 | new |
| src/utils/__tests__/edgeFunctions.guard.test.ts | — |  |
| src/utils/__tests__/endorsementGrouping.test.ts | — |  |
| src/utils/__tests__/everyBackHasAWayOut.guard.test.ts | — |  |
| src/utils/__tests__/everyControlHasAName.guard.test.ts | 2026-09-29 | new |
| src/utils/__tests__/everyFileSurvivedTheShell.guard.test.ts | — |  |
| src/utils/__tests__/everyMemberKeyHasAnEraser.test.ts | — |  |
| src/utils/__tests__/everyPullSaysWhatItReached.guard.test.ts | — |  |
| src/utils/__tests__/everyRouteHasItsOwnNet.guard.test.ts | — |  |
| src/utils/__tests__/feedInvalidation.guard.test.ts | — |  |
| src/utils/__tests__/filterContentByBlocks.pbt.test.ts | — |  |
| src/utils/__tests__/handleGuard.test.ts | — |  |
| src/utils/__tests__/handleGuard.wiring.guard.test.ts | — |  |
| src/utils/__tests__/handleHistory.test.ts | — |  |
| src/utils/__tests__/handleHistory.wiring.guard.test.ts | — |  |
| src/utils/__tests__/handleNotice.reader.guard.test.ts | — |  |
| src/utils/__tests__/handleNotice.test.ts | — |  |
| src/utils/__tests__/html.test.ts | — |  |
| src/utils/__tests__/inputTrustBoundary.test.ts | — |  |
| src/utils/__tests__/keysetCursor.test.ts | — |  |
| src/utils/__tests__/logger.test.ts | — |  |
| src/utils/__tests__/logScreenPolish.guard.test.ts | — |  |
| src/utils/__tests__/lucideIconsAreBundled.guard.test.ts | — |  |
| src/utils/__tests__/maestroFlows.guard.test.ts | — |  |
| src/utils/__tests__/mappers.test.ts | — |  |
| src/utils/__tests__/markdownSafety.test.ts | — |  |
| src/utils/__tests__/memoryManager.test.ts | — |  |
| src/utils/__tests__/mutationExecutor.pbt.test.ts | — |  |
| src/utils/__tests__/mutationExecutor.test.ts | — |  |
| src/utils/__tests__/networkError.test.ts | — |  |
| src/utils/__tests__/noControlCharacters.guard.test.ts | 2026-09-29 | extended: a \u eaten from a char class; red on the one damaged line, then green |
| src/utils/__tests__/noMachinePaths.guard.test.ts | — |  |
| src/utils/__tests__/notificationColumns.guard.test.ts | — |  |
| src/utils/__tests__/offlineIsSaidOneWay.guard.test.ts | — |  |
| src/utils/__tests__/offlineQueue.integration.test.ts | — |  |
| src/utils/__tests__/offlineQueue.test.ts | — |  |
| src/utils/__tests__/profileCountsCache.test.ts | — |  |
| src/utils/__tests__/profileCountsCache.wiring.guard.test.ts | — |  |
| src/utils/__tests__/profileMappers.test.ts | — |  |
| src/utils/__tests__/prose-handlers.guard.test.ts | — |  |
| src/utils/__tests__/queryClient.test.ts | — |  |
| src/utils/__tests__/queueErrorClassification.test.ts | — |  |
| src/utils/__tests__/recommendations.test.ts | — |  |
| src/utils/__tests__/requestReview.test.ts | — |  |
| src/utils/__tests__/revenuecatWebhookDecide.test.ts | — |  |
| src/utils/__tests__/roomFilters.test.ts | 2026-10-01 | written: one answer to is-this-room-narrowed |
| src/utils/__tests__/sanitisationCallSites.test.ts | — |  |
| src/utils/__tests__/sanitize.test.ts | — |  |
| src/utils/__tests__/sanitizeInput.test.ts | — |  |
| src/utils/__tests__/schemaSnapshot.guard.test.ts | — |  |
| src/utils/__tests__/searchFieldsDoNotAutocorrect.guard.test.ts | 2026-09-29 | new guard |
| src/utils/__tests__/searchPattern.test.ts | — |  |
| src/utils/__tests__/searchWiring.guard.test.ts | — |  |
| src/utils/__tests__/stackFilmCount.test.ts | — |  |
| src/utils/__tests__/theDeadLetterIsNobodyElsesToKeep.test.ts | — |  |
| src/utils/__tests__/theDraftIsYours.test.ts | — |  |
| src/utils/__tests__/theFrontDeskAnswers.test.ts | — |  |
| src/utils/__tests__/theFunnelHasOneSeam.test.ts | — |  |
| src/utils/__tests__/theRecordingsTravel.test.ts | — |  |
| src/utils/__tests__/theSocietyOpensOverYou.test.ts | — |  |
| src/utils/__tests__/theTappedNoticeOpensIt.test.ts | — |  |
| src/utils/__tests__/tier.test.ts | — |  |
| src/utils/__tests__/tier.warning.test.ts | — |  |
| src/utils/__tests__/validateUsername.test.ts | — |  |
| src/utils/__tests__/validateWithTelemetry.test.ts | — |  |
| src/utils/__tests__/withAbortSignal.test.ts | — |  |
| src/utils/__tests__/withRetry.test.ts | — |  |
| src/utils/__tests__/withTimeout.test.ts | — |  |
| src/utils/AppError.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/utils/critiquePayload.ts | — |  |
| src/utils/csv.ts | — |  |
| src/utils/deviceRegion.ts | 2026-10-01 | new |
| src/utils/draftSync.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/utils/e2eTrace.ts | 2026-09-29 | new |
| src/utils/endorsementGroupKey.ts | — |  |
| src/utils/enter.ts | — |  |
| src/utils/filterContentByBlocks.ts | 2026-10-01 | true as written |
| src/utils/gateTelemetry.ts | — |  |
| src/utils/groupNotifications.ts | — |  |
| src/utils/handleGuard.ts | — |  |
| src/utils/handleHistory.ts | — |  |
| src/utils/handleNotice.ts | — |  |
| src/utils/housePages.ts | — |  |
| src/utils/html.ts | 2026-10-01 | ticket numbers out of the header |
| src/utils/imagePrefetcher.ts | — |  |
| src/utils/keysetCursor.ts | — |  |
| src/utils/lastTab.ts | 2026-10-01 | new: back within the half hour, back on the tab |
| src/utils/linking.ts | — |  |
| src/utils/logger.ts | — |  |
| src/utils/mappers.ts | — |  |
| src/utils/markdownSafety.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/utils/memberDrafts.ts | — |  |
| src/utils/memoryManager.ts | — |  |
| src/utils/mutationExecutor.ts | 2026-09-28 | The header said the queue pauses 100ms between mutations: it pauses 0ms. The subject_backdrop cap added (offline gate). Audit tags and history removed; each replay's reason kept, shortened. |
| src/utils/networkError.ts | — |  |
| src/utils/noticeRoute.ts | — |  |
| src/utils/offlineQueue.ts | 2026-09-29 | histories (#77, #82, OFFQ-2) → rules; FALSE: 'reactive UI binding' store (nothing subscribes, no screen reads it); FALSE: schema branch 'MUST come before' duplicate (errorClass is one value; the order lives in classifyQueueError) |
| src/utils/openNoticeFromPush.ts | — |  |
| src/utils/openSociety.ts | — |  |
| src/utils/profileCountsCache.ts | — |  |
| src/utils/recommendations.ts | 2026-10-01 | the shelf's own name |
| src/utils/reelToast.ts | — |  |
| src/utils/requestReview.ts | 2026-10-01 | never more than 3 in any 365 days, as it claimed |
| src/utils/roomFilters.ts | 2026-10-01 | new |
| src/utils/sanitize.ts | — |  |
| src/utils/sanitizeInput.ts | 2026-09-28 | subjectBackdrop cap added. A literal escape sequence in a comment, two docs stacked on the wrong declarations, and a stale plan ('retires in step 3') removed; the reasons for each fence kept. |
| src/utils/searchPattern.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/utils/softBreak.ts | — |  |
| src/utils/storyExporter.ts | — |  |
| src/utils/TactileEngine.ts | — |  |
| src/utils/__tests__/everyDoorGoesThroughNav.test.ts | 2026-10-01 | written: the raw-router ratchet |
| src/utils/authSignals.ts | 2026-10-01 | written: the sign-in rules every door reads alike |
| src/utils/text.ts | — |  |
| src/utils/tier.ts | — |  |
| src/utils/tierDoor.ts | 2026-10-01 | the server sentence as a door |
| src/utils/tierRefusal.ts | 2026-10-01 | by the sentence, not the code |
| src/utils/timeAgo.ts | — |  |
| src/utils/toastBus.ts | — |  |
| src/utils/typedRouter.ts | — |  |
| src/utils/validateUsername.ts | — |  |
| src/utils/validateWithTelemetry.ts | 2026-10-01 | docs cut to what the types do not say |
| src/utils/withAbortSignal.ts | — |  |
| src/utils/withRetry.ts | — |  |
| src/utils/withTimeout.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| supabase/functions/fetch-rss/index.ts | 2026-09-29 | the header said it serves the Dispatch tab; no current source calls it (kept for installed builds, per backend-contract); audit tags and the relay's history dropped |
| supabase/functions/notify-push/index.ts | — |  |
| supabase/functions/revenuecat-webhook/decide.ts | 2026-09-28 | 6 findings; the rules kept, shortened |
| supabase/functions/revenuecat-webhook/index.ts | 2026-09-28 | the auth note claimed a length check stops timing leaks; the compare is a plain !== (reported); header moved above the imports |
| supabase/functions/sync-entitlement/index.ts | 2026-09-28 | the header described a flow the code does not have (client sends a tier, which is validated); it trusts only RevenueCat's record. 'cryptographically verified' dropped (it is an HTTPS fetch) |
| test-utils/__tests__/everyCommentIsTrue.test.ts | — |  |
| test-utils/__tests__/everySourceReaderIsLedgered.test.ts | — |  |
| test-utils/__tests__/readCode.test.ts | — |  |
| test-utils/contractEnv.ts | — |  |
| test-utils/react-native-testing-library.js | — |  |
| test-utils/readCode.ts | — |  |
| test-utils/SOURCE-READING-TESTS.md | — |  |
| types/react-test-renderer.d.ts | 2026-09-29 | history reduced to the reason |
