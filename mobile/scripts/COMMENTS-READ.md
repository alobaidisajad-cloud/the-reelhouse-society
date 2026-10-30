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
| __tests__/animationMockCoverage.test.ts | 2026-10-22 | edited: every name the app imports from Reanimated is in the mock, hooks and all; the entrances are Arrive's own values; the layout transitions remain |
| __tests__/backendContract.test.ts | 2026-10-16 | edited: the tables and buckets read from the code, those passed through the export's and the import's helpers included |
| __tests__/colorLock.test.ts | 2026-10-27 | edited: TMDB's wordmark on the artwork list, its pigments as published; edited: the drawn eye's file left the exempt list with the file |
| __tests__/components/feed/ActivityCard.test.tsx | 2026-10-25 | edited: the card is drawn as flat paper: an opaque ground, nothing seen through an opacity, no edge light under it |
| __tests__/deletionIntegrity.test.ts | — |  |
| __tests__/integration/errorBoundaryRecovery.test.tsx | — |  |
| __tests__/integration/feedFlow.test.ts | 2026-10-01 | one path, refusals raised |
| __tests__/integration/helpers.ts | — |  |
| __tests__/integration/notificationPagination.test.ts | — |  |
| __tests__/integration/offlineQueueFlush.test.ts | 2026-10-15 | edited: clears the queue as its member signs out |
| __tests__/integration/setup.test.ts | — |  |
| __tests__/integration/setup.ts | — |  |
| __tests__/integration/socialRollback.test.ts | — |  |
| __tests__/InteractionService.test.ts | 2026-10-03 | rewritten whole: only the two kinds that exist |
| __tests__/interpolateMock.test.ts | — |  |
| __tests__/moderationActs.test.ts | — |  |
| __tests__/notificationsMockCoverage.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| __tests__/schemaLengthCaps.test.ts | 2026-10-15 | edited: reads both migration trees; a CHECK under any name that bounds the length counts |
| __tests__/searchPathHardening.test.ts | 2026-10-15 | edited: reads both migration trees, the root one the CLI applies included |
| __tests__/store.test.ts | — |  |
| __tests__/stores/archiveSlice.test.ts | 2026-10-03 | edited: a shelf filing sends no note or condition; the server's formats win |
| __tests__/stores/filmStore.test.ts | — |  |
| __tests__/stores/listSlice.test.ts | 2026-10-15 | edited: a stack's posters fetched ahead in one call, to disk |
| __tests__/stores/socialSlice.test.ts | — |  |
| __tests__/tmdbMockCoverage.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| __tests__/utils/mappers.test.ts | — |  |
| __tests__/utils/mutationExecutor.test.ts | 2026-10-03 | edited: the duplicate merge is a server rewatch under the device viewing id; the insert keeps it |
| __tests__/utils/offlineQueue.test.ts | 2026-10-27 | edited: the cap lets the oldest marks go; logged films are queued over it; edited: a member is signed in; the clear names who leaves |
| ../.github/workflows/ci-alert.yml | 2026-10-22 | edited: watches the nightly and the speed lab too |
| ../.github/workflows/ci.yml | 2026-09-29 | history reduced to the rule each step keeps |
| ../.github/workflows/db-integration.yml | 2026-10-22 | read whole: its time and the mutants' time as the runs take them; the weekly run's reason; a heartbeat when the schedule ran |
| ../.github/workflows/e2e-old-clients.yml | 2026-10-22 | read whole: the train refuses until this run is green on its files |
| ../.github/workflows/e2e.yml | 2026-10-22 | read whole: four jobs; the seal's name refused in every container with a shell, its addresses to all; the proxy's and the renderer's reasons beside their own lines; the verdict reads any run's three flow machines; a heartbeat when the schedule ran |
| ../.github/workflows/god_tier_ci.yml | 2026-10-22 | read whole: the alert proved by the fire drill, not by the nightly; every frozen count named; the mutants' job and the add-only job each under its own head; every measuring tool named; a heartbeat when the schedule ran |
| ../.github/workflows/ios-launch.yml | 2026-10-25 | edited: the simulator named by e2e/ios-simulator.sh; edited: on macos-26 with Xcode 26.6 named, the store build's (EAS sdk-57); on macos-15's Xcode 16.4 the SDK 57 app's Swift did not compile; read whole: then, on the same simulator, the flows that need no server (e2e/ios-flows.json) by Maestro, their records kept (P0.89); a run is cancelled only by a newer run of its own kind |
| ../.github/workflows/load.yml | 2026-10-22 | read whole: the pending train run on the full house, its locks timed, its report kept, the train left applied for the reads; the change under measurement and the reads timed whatever the locks said; a heartbeat when the schedule ran |
| ../.github/workflows/nightly.yml | 2026-10-22 | read whole: a variant's machines as it runs them; a heartbeat when the schedule ran |
| .claude/hooks/no-backslash-through-shell.cjs | 2026-09-29 | history reduced to the rule; its own test still passes |
| .claude/hooks/no-backslash-through-shell.test.cjs | 2026-09-29 | 1 finding |
| .maestro/auth_deep_link.yaml | 2026-10-24 | edited: on iOS the sitemap link is handed to the app running, its home seen: the simulator gives up a link that must launch the app at ten seconds |
| .maestro/auth_flow.yaml | 2026-09-29 | true as written |
| .maestro/boot_verification.yaml | 2026-10-01 | header narrowed to what it proves; wrapped to 80 |
| .maestro/browse_vault.yaml | 2026-09-29 | true as written |
| .maestro/config.yaml | 2026-09-29 | true as written |
| .maestro/darkroom_search.yaml | 2026-09-29 | true as written |
| .maestro/error_recovery.yaml | 2026-10-22 | edited: the crash screen asserted absent by its new title, The Projector Stopped |
| .maestro/faults/house_unreachable.yaml | 2026-10-16 | new: the house unreachable after sign-in, each room's failure in its words, then TRY AGAIN |
| .maestro/faults/slow_link.yaml | 2026-10-16 | new: the plan's EDGE after sign-in, each room's content, never a failure |
| .maestro/film_log.yaml | 2026-09-29 | true as written |
| .maestro/flow_critical_path.yaml | 2026-09-29 | true as written |
| .maestro/keyboard/log.tap.yaml | 2026-10-01 | written with the keyboard probe |
| .maestro/keyboard/log.yaml | 2026-10-15 | edited: the Darkroom's own films waited for before the search is typed |
| .maestro/keyboard/stack.tap.yaml | 2026-10-01 | written with the keyboard probe: the stack form, reachable by a new member |
| .maestro/keyboard/stack.yaml | 2026-10-15 | edited: the Reel's log and the seed's stack waited for |
| .maestro/lifecycle/backup_restore.yaml | 2026-10-17 | new: signed in, backed up, uninstalled, installed afresh, restored: the marker back, the app open signed out (the session's key never travels), sign-in working, the tabs loading |
| .maestro/lifecycle/dont_keep_activities.yaml | 2026-10-17 | new: "don't keep activities" on, Edit Profile half-edited, home and back: the words kept |
| .maestro/lifecycle/killed_in_background.yaml | 2026-10-17 | new: Edit Profile half-edited, home, the app killed by the system: back where they were, the words kept |
| .maestro/lifecycle/killed_mid_write.yaml | 2026-10-17 | new: the app stopped dead while a log is on its way over a slow link; reopened, the log is the member's, exactly once |
| .maestro/lifecycle/live_config.yaml | 2026-10-17 | new: the text size, then the density, changed under a half-edited Edit Profile: the same screen, the words kept |
| .maestro/lifecycle/upgrade.yaml | 2026-10-17 | new: the build in members' hands queues a write offline; this build installed over it sends it, exactly once; the member still signed in |
| .maestro/admin_second_key.yaml | 2026-10-21 | new: the seeded admin registers a key, gives its code, and the Tribunal opens; relaunched, it opens with no code |
| .maestro/log_film_flow.yaml | 2026-10-15 | edited: the Darkroom's own films waited for before the search is typed |
| .maestro/login_flow.yaml | 2026-09-29 | true as written |
| .maestro/lounge_flow.yaml | 2026-09-29 | true as written |
| .maestro/offline_resilience.yaml | 2026-09-29 | true as written |
| .maestro/README.md | 2026-10-15 | edited: auth_deep_link also opens reelhouse://_sitemap cold, to not-found |
| .maestro/lobby_wall_flow.yaml | 2026-10-16 | edited: the wall the house read is scrolled to before the sign-off; the sign-off is scrolled to for as long as the wall above it |
| .maestro/session_survives_restart.yaml | 2026-10-01 | written with the session kept on the device |
| .maestro/subflows/backup.js | 2026-10-17 | new: one step of the backup through the fault proxy's /backup; a step not taken stops the flow |
| .maestro/subflows/backup.yaml | 2026-10-17 | new: one step of the backup and restore, for the lifecycle flows alone |
| .maestro/subflows/fault.js | 2026-10-16 | new: the faults by name, set or cleared on the proxy's control port at localhost (Maestro runs it on the runner) |
| .maestro/subflows/fault.yaml | 2026-10-16 | new |
| .maestro/subflows/open_a_film.yaml | 2026-10-23 | edited: the search emptied by its own clear mark; edited: the Darkroom's own films waited for before the search is typed |
| .maestro/subflows/open_the_stub.yaml | 2026-09-30 | written with the stub's single tap |
| .maestro/subflows/phone.js | 2026-10-17 | new: the phone changed through the fault proxy's /phone; a refusal stops the flow |
| .maestro/subflows/phone.yaml | 2026-10-17 | new: the phone changed mid-flow, for the lifecycle flows alone |
| .maestro/subflows/sign_in.yaml | 2026-10-15 | edited: the account is new, only its profile dated back |
| .maestro/subflows/upgrade.js | 2026-10-17 | new: one step of the upgrade through the fault proxy's /upgrade; a step not taken stops the flow |
| .maestro/subflows/totp.js | 2026-10-21 | new: the code the key on the screen shows now, from the fault proxy's /totp |
| .maestro/subflows/upgrade.yaml | 2026-10-17 | new: one step of the upgrade, for the lifecycle flows alone |
| ANDROID_LAUNCH.md | 2026-10-04 | the splash leaving as Android's own added to the device checks, with the system exit's real timings |
| app.config.js | 2026-10-22 | edited: LAB=1 beside E2E=1: extra.lab, the lab's frame record; names every workflow that builds with E2E=1; the development profile gets back the dev client's scheme and iOS local networking; every other build is app.json |
| app/__tests__/boot-structure.test.tsx | — |  |
| app/__tests__/yourFileWaitsForYourHandle.test.tsx | 2026-10-03 | new: the Profile tab never calls you a stranger |
| app/_layout.tsx | 2026-10-29 | edited: Reanimated told Reduce Motion as it is now (MotionFollowsTheSetting); edited: the app is told of Increase Contrast once (MoreContrastProvider); edited: the app told of Bold Text through one provider; the whole house drawn behind FloorGate; edited: the whole house drawn behind FloorGate; the layout callback ends the splash, then marks the app loaded; edited: a build under the floor draws PleaseUpdate alone; edited: Sentry started with its release and dist (releaseName.ts); edited: a store come back without its key is told to the member at launch; edited: a silent keystore is told to the member at launch; edited: the saved cache is restored only under the build and update that wrote it; edited: an owed sign-out settled at launch, before the session is restored; edited: the lab's frame record mounted behind LAB_BUILD alone; PathTracker moved out, and now tells nav too |
| app/(admin)/__tests__/tribunal.test.tsx | 2026-10-29 | edited: its plain stand-in for the gradient gone, so its screens are drawn on the gradient the suite draws; edited: a control found by the name it now says, its shown words first;  |
| app/(admin)/__tests__/tribunalNeverLiesEmpty.guard.test.ts | 2026-10-23 | edited: each docket rebuilt from its read during the render that brings it, never an effect after; read whole: reads source through readCode; no regex stripper |
| app/(admin)/_layout.tsx | 2026-10-02 | read; sound |
| app/(admin)/tribunal.tsx | 2026-10-30 | edited: a verdict, the docket's tabs and its toolbar are 48 by their own box; edited: a verdict is 48 tall by its own box, 8 from the next; its controls a slip on costs carry their weight; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: the view on show underlined as well as lit; edited: Enter in the hours goes on to the reason; edited: a control named by the words it shows, first (label in name); edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: the suspension's hours hold HOURS_DIGITS; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: both dockets rebuilt during the render that brings their read: no frame of "The docket is clear" over an answered read; header top from usePushedHeaderTop; foot from useContentBottom, the sheet's from useSheetBottom |
| app/(modals)/__tests__/list-modal.curate.test.tsx | 2026-10-28 | edited: a stack with no name, pressed: the reason under the title, said with it, focused; edited: a control found by the name it now says, its shown words first; edited: the rest of a stack read, then its films moved and sent whole; edited: the form's member signed in for each case and the sample stack theirs; a tap takes a film up and its arrows move it; signed out, asked in; edited: signed out, asked in; signed in as curator, the stack opens to amend; edited: the stand-in client hears the app return too; edited: a new stack half-built: it opens on what was left, and goes once filed; edited: a stack named by a link: another member's is not offered, one's own opens; the query stand-in has onlineManager; edited: the bar's foot and the scroll above it read from navMetrics |
| app/(modals)/__tests__/social-modal.telemetry.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: a control found by the name it now says, its shown words first; edited: the share route without the rank shows the rope, reads no salons; a follower list is never roped;  |
| app/(modals)/__tests__/yourCircleIsSaidToYou.test.tsx | 2026-10-03 | new: your own circle is said to you |
| app/(modals)/cover-picker.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the way out's prop is belowAnAct; edited: a stranger is asked in, never told a salon is not theirs; edited: the picker the host's alone; anyone else told NOT YOURS TO CHANGE (P4.4); top from useModalTop |
| app/(modals)/list-modal.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: a stack with no name is said under the title, with it, and focused there (useFieldRefusal), not toasted; edited: a control named by the words it shows, first (label in name); edited: the film search holds SEARCH_MAX; edited: a stack opened with its first page alone has the rest read, then its films may be moved and are sent whole; edited: the way out's prop is belowAnAct; edited: a tap takes a film up and its arrows move it a step, the drag's twin for a member who cannot hold and drag; a stranger is asked in; edited: a stranger is asked in, never told a stack is not theirs; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: a new stack half-built kept as a draft, taken up as the sheet renders, gone once filed; edited: a stack cached from another member's page is never theirs to amend: NOT YOURS TO AMEND, no form (P4.4); edited: the last number shown during a drag held as state; edited: the unready bar is hollow (UNREADY); CLOSE centred on the title's first line; the large-stack notice in sentences |
| app/(modals)/log-modal.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a control named by the words it shows, first (label in name); edited: an edit waiting for its record says so (retrieving, unreachable, No Such Record), never a blank form; the film's atmosphere hangs only over the docket |
| app/(modals)/login.tsx | 2026-10-30 | edited: SHOW and the forgot link grow to 48, their halos gone on the grown axis; the way out carries its weight; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the submit plate and the mode switch named by their own words first; SHOW, the link and the plate share their gaps by halves; edited: a refused press draws its reason under its field, says it with the field, and focuses it; edited: its frosted glass drawn through HouseBlur; edited: the lore line picked once, as state; header top from useModalTop; the page stops at the edge (useBottomEdge) |
| app/(modals)/membership.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a control named by the words it shows, first (label in name); edited: the member's rank read again as the page opens; edited: the billing shown is the year whenever no monthly price is sold, derived, not reset by an effect; nav top from useModalTop; ends above the window and its fade, or at useContentBottom |
| app/(modals)/notifications-modal.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a stranger is asked in, never shown a board of no notices; edited: pictures through Picture; a grouped notice of a film with no poster draws the star box the single one does; edited: online but not live, the board says so at its head; edited: a notice's time, drawn and spoken, from the shared clock; handle's top from useModalTop; foot from useContentBottom |
| app/(modals)/search-modal.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the search's ledger line in the ink that reads; edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its frosted glass drawn through HouseBlur; edited: the search box holds SEARCH_MAX; edited: the held silence adjusted as it renders, React's own way to keep a value from a render before; header top from useModalTop; foot from useContentBottom |
| app/(modals)/social-modal.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a control named by the words it shows, first (label in name); edited: its frosted glass drawn through HouseBlur; edited: the share modes read lounge-speaking: without the rank, the rope, never the salons, which are not read; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the read split from its showing (readSocial, showRead, showFailure), wired by the effect's then; loading from the first frame when there is something to read; the wait's timeout cleared with its timer; handle's top from useModalTop; foot from useContentBottom |
| app/(tabs)/_layout.tsx | 2026-10-28 | edited: its frosted glass drawn through HouseBlur; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: where the member stands written after each commit; edited: the Lobby tab wears the house's eye, the logo's small cut on a clear ground, tinted as the other tabs are |
| app/(tabs)/darkroom.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); edited: a failed next batch held with the search it failed for: a new search has nothing failed, with no effect to reset it; edited: the empty room's line in the house italic face, its note above the colour it explains |
| app/(tabs)/dispatch.tsx | 2026-10-29 | edited: the new-filings pill is built first, as it is drawn first from the top; edited: new filings counted on the pill as the app comes back to the front; edited: the paper's date turns at the member's midnight; edited: the screen says its read failed; ends above the tab bar (useTabContentBottom) |
| app/(tabs)/index.tsx | 2026-10-24 | edited: the welcome's hairline row runs across the page, as the phone lays it |
| app/(tabs)/lounge.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: reading until the salons have answered once (loungesRead): its first frame came before its read began; the corridor reads the salons' own flag (loungesLoading), not one a room's read lowered; the screen says its read failed; ends above the tab bar (useTabContentBottom) |
| app/(tabs)/profile.tsx | 2026-10-27 | edited: the way in is the house's one IdentifyYourself; edited: the handle read on mount sets nothing until it answers; TRY AGAIN clears the failure, then reads; centred states in a CentredRoom: between the bars, and scrolled when taller; the bar clear on arrival before the file |
| app/(tabs)/reels.tsx | 2026-10-28 | edited: the stacks search holds SEARCH_MAX; edited: each list's feeds fetched again on return or reconnect only at its top; edited: the shown section written after each commit, for the scroll to top; edited: the crossfade settled per section: a new section is mid-crossfade in the render it is chosen; edited: the page's wash kept as a texture while the Reel is in front; following nobody only of a list read: an unread follow list spools, a failed one says so and reads it again (both reels); the screen says its read failed; ends above the tab bar (useTabContentBottom) |
| app/+not-found.tsx | 2026-10-15 | the page in a CentredRoom: between the edges, and scrolled when taller |
| app/auth-callback.tsx | 2026-10-27 | edited: a refused email link is reported by kind; edited: the link verified first (verify), then the success or the failure shown; edited: the mount effect placed after handleCallback, the function it calls; edited: a spent link raised in Supabase's own words, so the member reads the house's sentence |
| app/dispatch/[id].tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the reading (head, page, dock) is held in one View, hidden from screen readers while the share sheet is up; edited: a control named by the words it shows, first (label in name); edited: a rank found held at the rope opens the salon list; edited: TO THE LOUNGE reads lounge-speaking: without the rank it opens the rope; edited: a ballot's closing and the critiques' times from the shared clock: one that closes while read is drawn CLOSED; edited: each filing opens on its own critique draft or none, taken up as it renders; edited: the next part held with the series part it was found after: another filing has none until its own is read; edited: the film's id and the member's read before the callbacks that use them (the draft's key named as the member's id); the share card is exported at SHARE_CARD_WIDTH |
| app/dispatch/archive.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); foot from useContentBottom |
| app/dispatch/compose.tsx | 2026-10-29 | edited: the film and series slots are 48pt form rows, a hairline between; its controls too small for a finger have room, its steps a slip on costs their weight; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the essay's page held in an UnderSheet while the film or series picker is up; edited: an essay over its limit is said under the writing, with it, and focused there (useFieldRefusal), not toasted; edited: a control named by the words it shows, first (label in name); edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its frosted glass drawn through HouseBlur; edited: the proof's date from the shared clock; edited: the flush's four mirrors written after each commit; edited: the essay's and the amend's drafts taken up as the room renders; the series part asked fresh in an effect; header and door from useModalTop; feet from navMetrics; the essay's footer never on the edge |
| app/dispatch/room/[username].tsx | 2026-10-15 | foot from useContentBottom, scrollbar from useBottomEdge |
| app/dispatch/rules.tsx | 2026-10-15 | foot from useContentBottom |
| app/dispatch/series/[id].tsx | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); foot from useContentBottom |
| app/dossier/[id].tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| app/edit-profile.tsx | 2026-10-01 |  |
| app/film-reviews/__tests__/theArchiveSaysWhenItCouldNotRead.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first;  |
| app/film-reviews/[id].tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a control named by the words it shows, first (label in name); edited: a page is read (readPage) and then shown (showPage); the first page read once, the screen opening loading; header top from usePushedHeaderTop; foot from useContentBottom |
| app/film/[id].tsx | 2026-10-23 | edited: marksUnknown from the ledger, and the ledger asked for when it never was |
| app/log/__tests__/aCritiqueIsSaidAsOnAStack.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; written with the log page's critiques matched to the stack's |
| app/log/__tests__/theLogPageMovesEveryCard.test.tsx | 2026-10-28 | edited: the rope stand-in takes its act too; edited: LOUNGE opens the rope for a free and a lapsed member, the salons for an Archivist;  |
| app/log/__tests__/theRecordReadsTrue.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; the share captured only once the card is whole; the 20 s limit |
| app/log/__tests__/zz-log.gen.test.tsx | — |  |
| app/log/[id].tsx | 2026-10-30 | edited: share reaches none of the gap to more, which grows to 48 across it; its ways back carry their weight; edited: share and more have room to 48; its ways back carry their weight; edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a rank found held at the rope opens the salon list; edited: LOUNGE reads lounge-speaking: without the rank it opens the rope; edited: a critique or removal is claimed offline only when the queue kept it; one not kept comes off the page; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the log's time from the shared clock; edited: certifiedKnown from the log's read (drawn from the phone, the heart is uninked and a press asks again); the film's bookmark known once the ledger is held |
| app/lounge.tsx | 2026-10-01 | true as written |
| app/lounge/[id].tsx | 2026-10-30 | edited: a reaction is 24 by its own box, the accessibility minimum; a message answers a long press with named actions (mockups/touch-small-exceptions.txt); the salon's settings have room; edited: a message and its reactions keep their size until the owner chooses (mockups/touch-small-exceptions.txt); the salon's settings have room; edited: a reaction, a message and the salon's settings have room to 48; its ways back and send carry their weight; edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the composer's edge in the ink that reads; edited: the speaking rope says its own words, Ascend the ranks, before what it opens; edited: a message reaches no further than its words (its 15pt default ran 11pt into the reaction chips); a rank found held at the seat's rope takes the seat; edited: a rank found held at the seat's rope takes the seat; edited: speaking and reacting follow the rank: the rope where the composer was, chips read-only but one's own, no picker or REPLY; counts said alone; held words drawn failed; edited: pictures through Picture; a shared film with no poster draws the house mark; edited: online but not live, the room says so in its offline line's place; edited: TODAY and YESTERDAY turn at the member's midnight; edited: the shown room written after each commit; edited: a new room or another try starts from what the list knows of it as it renders; the roster shown in its read's then; edited: the seat bar while the rank is read: a guest, asked again, nothing sold |
| app/person/__tests__/thePersonFileReadsTrue.test.tsx | 2026-10-29 | edited: the way back places the circle and grows around it to 48 (its touch weight); the circle is drawn by the box inside it; edited: the way back places the circle and grows around it to 48 (its touch weight); the circle is drawn by the box inside it; edited: its navigation mock stands on the one base (test-utils/navigationMock); a portrait without a photograph carries the whole first letter, unspoken |
| app/person/__tests__/zz-person.gen.test.tsx | — |  |
| app/person/[id].tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a rank found held at the rope shares at once; edited: the share rope's words from ropeSpoken; edited: today and this year from the shared clock, for the canon, the Hunt and the career span; edited: the auteur hunt counted only over the ledger held whole; the share label while the rank is read |
| app/reset-password.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the fields' ledger line in the ink that reads; edited: RESET PASSWORD named by its own words first; edited: a refused press says why under its field, with it, and goes there (useFieldRefusal), not in a toast; edited: both new-password fields tell the phone they hold a new password: it offers a strong one and saves it; edited: Back over an abandoned reset ends the session through endSessionHere; back and form from usePushedHeaderTop; foot from useContentBottom |
| app/settings.tsx | 2026-10-02 | read; sound |
| app/stacks/__tests__/stack-detail.redesign.test.tsx | 2026-10-29 | edited: while the critiques are up the page beneath is out of a screen reader reach; edited: a control found by the name it now says, its shown words first; edited: a control found by the name it now says, its shown words first; edited: the rope stand-in takes its act too; edited: LOUNGE opens the rope for a free and a lapsed member, the salons for an Archivist; the 501-film case given its measured time; edited: LOUNGE opens the rope for a free and a lapsed member, the salons for an Archivist; edited: a 501-film stack drawn whole as it is scrolled, in rank order, read once; edited: the tmdb stand-in answers no address for no path, as the real helper does; edited: the critiques' back read as useBackCloses; edited: the critiques sheet reading, then empty only once read; the router mock answers useFocusEffect as jest.setup.ts's does; each event waited for; the close inside the keyboard's moment is the sheet's own, each press shown to land |
| app/stacks/__tests__/stack-detail.telemetry.test.tsx | 2026-10-29 | edited: its plain stand-in for the gradient gone, so its screens are drawn on the gradient the suite draws; edited: the stand-in client hears the app return too; edited: the router mock answers useFocusEffect as jest.setup.ts's does;  |
| app/stacks/__tests__/zz-stacks.gen.test.tsx | — |  |
| app/stacks/[id].tsx | 2026-10-29 | edited: read more / fold has room to 48; a film with no poster shows the house's mark; its steps a slip on costs carry their weight; edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a film with no poster shows the house's mark (PosterMark), not an ash star that could not be seen (1.10:1); edited: the delete bin and the certify heart in the crimson that reads; edited: under the critiques the page and its bar are unspoken, the sheet a modal region to VoiceOver; edited: a control named by the words it shows, first (label in name); edited: CRITIQUE named Critique, as it reads; edited: its frosted glass drawn through HouseBlur; edited: a rank found held at the rope opens the salon list; edited: LOUNGE reads lounge-speaking: the key and the rope without the rank; edited: the films past the first page read as the page is scrolled: a stack of any size drawn whole; edited: a critique or removal is claimed offline only when the queue kept it; one not kept comes off the page; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the critiques close on Android's back through useBackCloses; edited: the sheet's page size: a ref for the query, state for what is drawn; edited: certifiedKnown from the stack's read; drawn from the phone, the heart is uninked, its count unknown, and a press asks again; seen ticks from the ledger whole |
| app/user/[username].tsx | 2026-10-29 | edited: a rated entry and an open link have room to 48; its ways back and follow request carry their weight; edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; edited: a control named by the words it shows, first (label in name); edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: LATELY's times from the shared clock; edited: the developing plate's beats rest on plain styles once developed; edited: sealed only when the follow list says they do not follow; while it is read, the rooms are retrieved and the follow button is hollow, READING or ASK AGAIN |
| app/year-in-cinema.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: this year from the shared clock; edited: the year read is handed its member; the effect and TRY AGAIN ask only with one, no member said as the error; edited: no member is said as the error, derived; the year read shown in its then; TRY AGAIN shows loading, then reads; edited: a plain paging ScrollView for the six slides, the note saying why not a list |
| ARCHITECTURE.md | 2026-10-15 | edited: Image Caching is true now that every picture states memory-disk, and names the guard that holds it |
| audit/batch6/tier_mirror.mjs | 2026-09-29 | true as written: its transcription still matches src/utils/tier.ts |
| CONTRIBUTING.md | 2026-10-03 | read against the code: a <Modal> needs no accessibilityViewIsModal (an in-screen overlay does, plus the Android half); a toast is already spoken, so only a toast-less write announces |
| e2e/__tests__/cutTextJudges.test.ts | 2026-10-17 | new |
| e2e/__tests__/faultJudges.test.ts | 2026-10-16 | new |
| e2e/__tests__/flowHistory.test.ts | 2026-10-16 | new: a shard's logs read (new and older shapes, retries summed, a part the budget stopped left out) and every file it reads uploaded, the map a history makes, the committed map equal to it and inside the workflow's limits |
| e2e/__tests__/faultProxy.test.ts | 2026-10-27 | edited: the clock moved on by fixed commands of a checked value; an instant written as toybox date sets one; new |
| e2e/__tests__/flowScreens.test.ts | 2026-10-04 | QueryController no longer counted; Android 14 names what animated; Maestro's JUnit reason, the no-record flow, the decision line |
| e2e/__tests__/attempt.test.ts | 2026-10-15 | edited: a shipped client's own crash is run again once, then not judged; with no --own, or beside another crash, final as ever |
| e2e/__tests__/appCrashes.test.ts | 2026-10-15 | edited: build 41's own crash and its aftermath reported apart and passed (cut from 38679641286); another crash, a late or foreign aftermath, no --own: fail |
| e2e/__tests__/animationWaits.test.ts | 2026-10-04 | written with animation-waits.mjs: each wait on its flow, Android 14's named container |
| e2e/__tests__/advisers.test.ts | 2026-10-15 | new: the advisers' verdict on saved answers: names and counts only, a refused finding, a stale entry, a sha256 entry, production-only lints, a malformed list, an unreadable answer |
| e2e/__tests__/advisories.test.ts | 2026-10-15 | new: a phone advisory held or refused, the rest listed, stale entries, the functions' imports read offline, the source map's package folders |
| e2e/__tests__/anonKey.test.ts | 2026-10-15 | new: the key made without a stack is the CLI's published one (by its sha256), from claims that never change; a config that sets the secret says no |
| e2e/__tests__/attack.test.ts | 2026-10-28 | edited: the written table covers the tables a pending migration makes too; edited: the mutants' run passes only on a green baseline, with none living unjudged, none unmade and no judgement stale |
| e2e/__tests__/functionsWorld.test.ts | 2026-10-16 | edited: every function deployed or written is served or named with why not; every host a function could call is sealed; the payments replay's coverage; the House's emails sent as production does, the code's letter holding the code and no link |
| e2e/__tests__/glideLogLevel.test.ts | 2026-10-08 | written with glide-log-level.mjs, on dexdump lines in the shape of runs 37628665206 and 37674283540 |
| e2e/__tests__/groundsJudges.test.ts | 2026-10-17 | new |
| e2e/__tests__/iosLaunch.test.ts | 2026-10-15 | the iPhone launch verdict shown saying no to each way a launch fails |
| e2e/__tests__/keyboardRoom.test.ts | 2026-10-01 | written with the keyboard probe; its files come from the shared file list (test-utils/universe.js) |
| e2e/__tests__/oldClients.test.ts | 2026-10-15 | new |
| e2e/__tests__/passwordNeverLeaves.test.ts | 2026-10-04 | written with scrub.mjs and the annotate redaction |
| e2e/__tests__/prefetchDownloadOnly.test.ts | 2026-10-15 | new: written with prefetch-download-only.mjs, on dexdump lines in the glide check's shape |
| e2e/__tests__/routeJudges.test.ts | 2026-10-17 | new |
| e2e/__tests__/routes.test.ts | 2026-10-17 | new |
| e2e/__tests__/runFlows.rehearsal.test.ts | 2026-10-28 | edited: a variant settled at the first look is read by its one load read, not the runner's clock; edited: the fake phone's app process starts with a launch or a flow and ends with a stop or a clear, as a phone's does |
| e2e/__tests__/runtimeDump.test.ts | 2026-10-15 | new: the runtime's parts joined per launch, held to the copy, and every way it says no |
| e2e/__tests__/screenTimes.test.ts | 2026-10-22 | edited: a learning screen reported, not judged; a stale or ceilinged entry fails; the committed list holds; its files come from the shared file list (test-utils/universe.js); edited: the ceilings file is what ceilingsFrom derives from the history |
| e2e/__tests__/shardVerdict.test.ts | 2026-10-15 | new: says no to a ceiling no shard reported, a missing or unfinished shard, a flow run twice or never; the verdict job fails with a failed shard |
| e2e/__tests__/shards.test.ts | 2026-10-16 | edited: a shard's minutes are a whole number above 0, and printed for run-flows.sh |
| e2e/__tests__/seed.rehearsal.test.ts | 2026-10-17 | edited: the walk's world too: two people with their own sessions, the rank grant, the Lounge read by a signed-in member alone |
| e2e/__tests__/splashHandoff.test.ts | 2026-10-04 | written with splash-handoff.mjs, on run 37201431874's own lines |
| e2e/__tests__/coldStart.test.ts | 2026-10-21 | written with cold-start.mjs, on run 39625257830's admin shard's own lines |
| e2e/__tests__/startStack.test.ts | 2026-10-15 | edited: the ports reserved and waited for, against a fake kernel |
| e2e/__tests__/iosSimulator.test.ts | 2026-10-25 | new: the script against a stand-in xcrun listing macos-26's simulators, and one with no iPhone 17 Pro; both jobs choose by it |
| e2e/__tests__/theRunKeepsWhatItWrites.test.ts | 2026-10-17 | new |
| e2e/__tests__/variants.test.ts | 2026-10-17 | new |
| e2e/__tests__/verifyWrites.test.ts | 2026-10-15 | edited: one shard's list of flows is what is checked, every flow without one |
| e2e/__tests__/walkRoutes.test.ts | 2026-10-17 | new |
| e2e/__tests__/whatTheAppAsked.test.ts | 2026-10-16 | new |
| e2e/__tests__/fixtures/judges/shard-verdict/flows/a_flow.yaml | 2026-10-16 | new: a flow the shard judge's good logs name |
| e2e/__tests__/fixtures/judges/shard-verdict/flows/b_flow.yaml | 2026-10-16 | new: a flow the shard judge's good logs name |
| e2e/__tests__/fixtures/judges/shard-verdict/flows/c_flow.yaml | 2026-10-16 | new: a flow the shard judge's good logs name |
| e2e/__tests__/fixtures/judges/shard-verdict/flows/config.yaml | 2026-10-16 | new: a flow the shard judge's good logs name |
| e2e/advisories.mjs | 2026-10-15 | new: the phone's packages from the bundles' source maps; npm audit for the app and website, OSV for the functions' imports; the verdict against the allowlist |
| e2e/anon-key.mjs | 2026-10-15 | new: the local stack's anon key as the Supabase CLI makes it, read against its apikeys.go |
| e2e/annotate.mjs | 2026-10-04 | the password hidden at the one door out; a summary-only level for past ten notices |
| e2e/animation-waits.mjs | 2026-10-04 | the probes come first now; true as written |
| e2e/app-crashes.mjs | 2026-10-15 | edited: --own sets a shipped client's own crashes and their aftermath apart, failing nothing; each soft report keeps its lines |
| e2e/attempt.mjs | 2026-10-15 | edited: a shipped client's own crash is run again once within the limits, else not judged (exit 3) |
| e2e/cut-text-judges.mjs | 2026-10-17 | new: every cut the app said fails the variant's run unless the judged list names it for that variant |
| e2e/db/attack/attack.mjs | 2026-10-16 | new: every table and view, tried by every kind of member on their own rows and four others', against matrix.json; each function a visitor or member may run, called as each kind of member, judged by its refusal, its answer and the rows it left; the avatars bucket's table, written as the Storage API writes; each live channel heard or spoken on as Realtime asks; a write that names no row reaches no other owner's; --mutants weakens each rule, gate trigger and column grant in turn and names the first try that notices; an update or delete is judged by the row it left; what is covered is read from the database attacked; --self-test plants an open read; mutantsPass: the mutants' run passes only on a green baseline |
| e2e/db/advisers.mjs | 2026-10-15 | new: supabase db advisors on the sealed copy with the API's schemas set, judged against the allowlist, names and counts only; --self-test plants a table without row security |
| e2e/db/bootstrap.mjs | 2026-10-15 | edited: a default naming no schema is changed by its own role, supabase_admin's in 4c |
| e2e/db/old-clients.mjs | 2026-10-15 | new; edited: only its schema tests can say a client breaks; one not set up is unchecked, by step; its install tried twice |
| e2e/db/rehearsals.mjs | 2026-10-16 | edited: --without, each pending migration's rehearsal run with its migration taken away, and every one applied again |
| e2e/db/seal.sh | 2026-10-03 | Written in the tooling audit: the seal e2e.yml and load.yml each carried, in one place for three workflows. |
| e2e/db/seed.mjs | 2026-10-17 | edited: with E2E_SEED_WALK, a writer at the Auteur rank (grant_entitlement) whose open Lounge and essay in a series give the walk's rooms an id; edited: each read back as the member the walk opens it as |
| e2e/db/up-down-up.mjs | 2026-10-22 | read whole: a CONCURRENTLY file and its undo run alone, outside any transaction, as the migration lint names their kind; apply exported, so the rehearsals take it |
| e2e/db/verify-cleaning.mjs | 2026-10-03 | Written with 20261003_05: the sealed world's database answers the member-text corpus as the app does, a member's words are kept cleaned, and no API role can call the cleaning. |
| e2e/db/verify-functions.mjs | 2026-09-29 | true as written |
| e2e/db/verify-writes.mjs | 2026-10-17 | edited: on one shard, only the flows run-flows.sh listed; edited: the lifecycle flow killed mid-write, its log exactly once |
| e2e/fault-judges.mjs | 2026-10-16 | new: the fault runs' judges (P0.76): no failure drawn empty, a fault that failed nothing proves nothing, no false failure on a slow link, no wait past 20 s or left at a flow's end |
| e2e/flow-screens.mjs | 2026-10-04 | Maestro's JUnit reason, a report for a flow with no step record, the decision line, the named animation; QueryController dropped (logged on every key of fast runs) |
| e2e/functions/mail.mjs | 2026-10-16 | new: every email the House's Auth sends, caught by the stack's Mailpit and used: the sign-up link confirms, the reset link opens a session, the code is the House's letter with 6 digits and no link, accepted once, a wrong one refused |
| e2e/functions/payments.mjs | 2026-10-16 | new: the payments replay: each store event through the served webhook or the app's own call, the record RevenueCat answers after it, the rank, source and seats checked after each |
| e2e/functions/place.mjs | 2026-10-16 | edited: serves send-email too (SERVED_UNDEPLOYED), names paytabs-handler with why not (NOT_SERVED); Resend's address and the Expo access token set; Auth mail as production's (withMail: confirmations, 300 an hour, the House's templates) |
| e2e/functions/seal-vendors.sh | 2026-10-16 | new: the services the functions call go nowhere from any container, after the functions are loaded |
| e2e/functions/stand-ins.mjs | 2026-10-16 | edited: Resend and Sentry stood in for; Expo refuses a push without the access token |
| e2e/functions/suites.mjs | 2026-10-16 | edited: its means from world.mjs; send-email asked; Auth stopped (the same 503 for a known and an unknown handle); no key at all against the public key alone, as production's gateway answers; the push trigger changed in its address alone |
| e2e/functions/warm.mjs | 2026-10-16 | edited: send-email loaded too; the CDN named as e2e.yml names it |
| e2e/functions/world.mjs | 2026-10-16 | new: the means suites.mjs and payments.mjs share: a call as callers make it, a statement as the house, the stand-ins steered and read back, a member made, each check said and the verdict |
| e2e/glide-log-level.mjs | 2026-10-08 | written: the APK hands Glide level 6 (ERROR), once, as a constant |
| e2e/grounds-judges.mjs | 2026-10-17 | edited: the dark walk read against the plain walk, whose emulator is light; a ground moved either way |
| e2e/ios-crash.mjs | 2026-10-15 | new |
| e2e/ios-launch.cjs | 2026-10-15 | true as written |
| e2e/ios-simulator.sh | 2026-10-25 | new: the iPhone 17 Pro on the newest iOS, or the iPhones there are and a failure; read against the macos-26 image's simulators (no iPhone 16 Pro) and the iPhone launch check on PR #128 |
| e2e/keyboard-room.mjs | 2026-10-01 | written with the keyboard probe |
| e2e/load/probe.mjs | 2026-10-16 | edited: psql's error is shown beside a plan it could not make |
| e2e/plugins/withCleartextTraffic.js | 2026-09-29 | true; one line narrowed |
| e2e/old-client-tree.mjs | 2026-10-16 | edited: after the patches, each of the client's flows waits at least as long as this checkout's same flow |
| e2e/old-clients.cjs | 2026-10-16 | edited: waitsIn reads each waiting command's target and time; raiseWaits gives a shipped client's flow at least this checkout's time for the same wait, never less |
| e2e/png.mjs | 2026-10-17 | new: a capture's pixels, Node's zlib alone; what it cannot read, refused by name |
| e2e/prefetch-download-only.mjs | 2026-10-15 | new: the APK's prefetch on CachePolicy.DISK calls downloadOnly; not run for a shipped client |
| e2e/route-judges.mjs | 2026-10-17 | new: every route the walk planned, captured as a picture; a plan of no route is unread; edited: a capture found at any depth of Maestro's output folder |
| e2e/run-flows.sh | 2026-10-27 | edited: the clock put back before every lifecycle flow: the runner's now, network time on; edited: Android's error dialogs hidden by the shared no-error-dialogs.sh; the speed gate reads the learning file beside the ceilings; a fault run clears the fault before each flow and is judged by fault-judges.mjs; E2E_FLOWS=none runs no flows; with E2E_WALK, the route walk after the flows, judged by route-judges.mjs, its screens not held to the flows' ceilings; edited: the whole run on the phone as E2E_VARIANT has it, set before the run's log begins, waited for, put back at its end |
| e2e/runtime-dump.mjs | 2026-10-25 | edited: a global a native module installs when it starts, named with what installs it, held to no moment (INSTALLED_LATE); new 2026-10-15: the phone's runtime from the device log, held to the committed copy |
| e2e/screen-times.mjs | 2026-10-22 | edited: --learning: a new screen reported for LEARNING_DAYS, its entry failing past them or beside a ceiling; --record writes one shard's screens and leaves the never-reported rule to shard-verdict.mjs; edited: two ceilings a screen, derived by ceilingsFrom from e2e/screen-history.json |
| e2e/shard-verdict.mjs | 2026-10-15 | new: every shard finished, every flow ran once, every ceiling's screen reported somewhere |
| e2e/flow-history.mjs | 2026-10-16 | edited: a shard with no logs is said; any other download failure ends the run in gh's words |
| e2e/fault-proxy.mjs | 2026-10-27 | edited: the phone's clock moved on, whole minutes, as root in UTC, its network time off (clock_ahead); new: the network between the app and the house, a fault on command, a part stopped, the DNS blocked, every request logged; a slow link holds every piece in flight at once, one latency per reply |
| e2e/shards.mjs | 2026-10-16 | edited: a shard's minutes, checked and printed for run-flows.sh |
| e2e/start-stack.sh | 2026-10-15 | edited: the stack's ports reserved from the machine's own connections, and waited for |
| e2e/variants.mjs | 2026-10-17 | new: each variant's commands to read, set, wait for and put back the phone, and whether it runs every flow; an unknown variant, a reset with nothing, or a read that answered no word the variant allows, refused |
| e2e/walk-routes.mjs | 2026-10-17 | new: the route walk's plan and flow: every route of routes.json, its ids read from the seeded world by name, guests first, each opened cold and captured; edited: each capture a name inside Maestro's output folder, which refuses any other |
| plugins/__tests__/theScannerStaysInDebug.test.ts | 2026-10-25 | new: the installed expo-dev-launcher 57 asks for the code scanner in its debug manifest, not its main one (the plugin that removed it gone); the release guard still refuses it |
| plugins/__tests__/withSplashWithoutHandoff.test.ts | 2026-10-04 | written: on the real generated MainActivity, through withMainActivity; no setOptions re-arms it; its files come from the shared file list (test-utils/universe.js) |
| plugins/__tests__/withLinkDuringLaunch.test.ts | 2026-10-21 | written: on the real generated MainActivity, through withMainActivity, with the splash plugin either side of it |
| plugins/__tests__/withOneNdk.test.ts | 2026-10-25 | new: on the real generated root build.gradle, through withProjectBuildGradle; the block once, at the end, after expo-root-project; CRLF kept; an unreadable file refused; the app runs it, and builds with one NDK |
| plugins/__tests__/withGwpAsanOff.test.ts | 2026-10-25 | new: on the real generated AndroidManifest.xml, through the parser prebuild uses; gwpAsanMode never set and nothing else changed; a manifest with no application refused; the app runs it; read again once React Native reaches 0.88 |
| plugins/withOneNdk.js | 2026-10-25 | new: every Android library builds its native code with the project's one NDK; read against expo-updates 57's CMakeLists.txt build, ExpoRootProjectPlugin's ndkVersion and Sealed E2E run 40226076302 |
| plugins/withGwpAsanOff.js | 2026-10-25 | new: the app runs without Android's sampled GWP-ASan, which crashes Hermes; read against Sealed E2E run 40232504480's tombstone (gwp_asan's frame-pointer chase off a Hermes stack at hoost_make_fcontext) and facebook/hermes 1873, 2225 |
| plugins/withSplashWithoutHandoff.js | 2026-10-04 | written: the app never takes Android's splash over; read against expo-splash-screen 31.0.13, androidx core-splashscreen and Android 14's ActivityRecord |
| plugins/withLinkDuringLaunch.js | 2026-10-21 | written: a link that reaches the app as it starts is the one it opens; read against React Native 0.81.5's ReactHostImpl.onNewIntent and IntentModule.getInitialURL |
| e2e/screen.mjs | 2026-09-29 | true; one line narrowed |
| e2e/splash-handoff.mjs | 2026-10-04 | written: no launch takes the splash over, scoped to the app's own processes; no launch, no pass |
| e2e/cold-start.mjs | 2026-10-21 | written: a row for every launch of the app in the log, every cell a value or why not; the measured launch found by its line; no launch, no table |
| e2e/scrub.mjs | 2026-10-04 | written: the password out of the kept logs, byte for byte |
| e2e/what-the-app-asked.mjs | 2026-10-16 | new: every request the gateway saw, held to the list the reading of the code made |
| e2e/supabase/functions/tmdb-proxy/index.ts | 2026-09-29 | history reduced to the rule |
| e2e/supabase/functions/tmdb-proxy/normalize.mjs | 2026-09-29 | true as written |
| e2e/tmdb/record.mjs | 2026-09-29 | true as written |
| eslint.config.js | 2026-10-27 | edited: expo-image's Image and React Native's refused outside Picture, each exception with its reason; edited: the React Compiler's globals rule on (a test's probe takes its hook in an effect); its preserve-manual-memoization rule on (each memo's inputs read before it); its immutability rule on (every shared value written by set), the rest off until their places are right; 3 findings; the crash and logo stories reduced to the rule each enforces |
| jest.afterEnv.ts | 2026-10-03 | read whole: the mock-gap comment now sits on the check it explains; no count that drifts |
| jest.config.js | 2026-10-29 | edited: decode-uri-component is transformed: 0.5.1 is an ES module; edited: Stryker's sandbox (.stryker-tmp) is never read as tests or modules |
| jest.setup.ts | 2026-10-29 | edited: a control given room is marked and grown as a weighted one is; edited: a capture run's PressableScale says a weighted control's weight and the axes it may grow on; edited: ReducedMotionConfig stood in for; edited: isDarkerSystemColorsEnabled and isHighTextContrastEnabled, read by the house Text; edited: getRecommendedTimeoutMillis, the toast clock's Android answer; edited: AccessibilityInfo stands in Reduce Transparency too; edited: the mock client has its rest half, where supabase.ts turns retries off; edited: the Sentry stand-in answers nativeCrash and close; edited: the storage stand-in answers that no key was lost; edited: the storage stand-in answers the keystore's deadline at once; edited: Sentry's scope stand-in has setTag; edited: Sentry's stand-in has setTag, which boot calls; edited: the drawings draw every arrival and ignition at rest; edited: the shared value's mock has get and set as Reanimated's (set takes a value or an updater); edited: React Native's Text stand-in tells the Texts inside it they are nested, as the real one does |
| jest.stryker.config.js | 2026-10-16 | new: the tests' config in Stryker's own process, its environment by its whole path |
| metro.config.js | 2026-09-29 | true as written (the ../public watch folder feeds Decorative's rating images) |
| mockups/capture.ts | 2026-09-29 | true as written |
| mockups/paper/__tests__/zz-badge.gen.test.tsx | 2026-09-29 | described the real badge as it was at one commit (brass ramp); now says A is whatever RankBadge is |
| mockups/paper/__tests__/zz-choices.gen.test.tsx | 2026-09-29 | a kept proposal: its 'recommendation' was not what shipped, and 'today' described a desk since replaced; both now say so; stale hex values dropped |
| mockups/paper/__tests__/zz-cover.gen.test.tsx | 2026-10-24 | edited: its plates written through writeScreen, measured with the screens |
| mockups/paper/__tests__/zz-drafts.gen.test.tsx | 2026-10-24 | edited: its plates written through writeScreen, measured with the screens |
| mockups/paper/__tests__/zz-final.gen.test.tsx | 2026-09-29 | called itself 'the final look' but draws the design before it shipped (RankBadge's wash differs); the paywall line it argued against is long gone |
| mockups/paper/__tests__/zz-memberroom.gen.test.tsx | 2026-10-24 | edited: its plate written through writeScreen, measured with the screens |
| mockups/paper/__tests__/zz-paper.gen.test.tsx | 2026-10-24 | edited: its plates written through writeScreen; the share card drawn at its own width; the picker and the stranger's empty page drawn as the app shows them |
| mockups/paper/__tests__/zz-proposals.gen.test.tsx | 2026-09-29 | a design record: its present-tense claims about the app were true only when drawn; now said as such |
| mockups/paper/__tests__/zz-rank.gen.test.tsx | 2026-09-29 | a design record: its present-tense claims about the app were true only when drawn; now said as such |
| mockups/paper/__tests__/zz-room.gen.test.tsx | 2026-10-24 | edited: its plate written through writeScreen, measured with the screens |
| mockups/paths.ts | 2026-10-24 | edited: writeScreen writes only when a drawing was asked for |
| mockups/README.md | 2026-10-15 | edited: CI splits the capture run in three, and keeps --require over the three together |
| mockups/srcMark.ts | 2026-10-29 | edited: a mark carries what its component's props say (a weighted control's weight and axes); an example path that names no file reworded |
| mockups/tabs/__tests__/zz-dispatch.gen.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); true as written |
| mockups/tabs/__tests__/zz-lobby.gen.test.tsx | 2026-10-24 | edited: the welcome drawn, nobody signed in; every state drawn again once settled |
| mockups/tabs/__tests__/zz-reel.gen.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); true as written |
| mockups/tabs/__tests__/zz-rooms.gen.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); the salons' flag by its own name; the Lounge drawn from rooms in the store's own shape, two doors side by side |
| mockups/tabs/__tests__/zz-settings.gen.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); true as written |
| mockups/tabs/flashListMock.tsx | 2026-10-01 | rows handed extraData, as FlashList does |
| mockups/tools/drawn.cjs | 2026-10-03 | read whole: controls counted through stripComments.js |
| mockups/tools/face-advances.cjs | 2026-10-03 | edited: writes a hidden key as its escape |
| mockups/tools/harness.cjs | 2026-10-29 | edited: a grown control's halo goes on the grown axis, and what it grew by is recorded (data-grown); edited: a weighted control's minimum and maximum move with its growth; edited: a weighted control is grown after layout as the phone grows it once measured (growTouches); settle: false draws the style as written; edited: a text is held to its parent less its own margins |
| mockups/tools/layout.cjs | 2026-10-30 | edited: the halo's probe is free of the page's column cap (a halo past its control's width was cut to it); a finding names what cut a reach; edited: SMALL measures at rest (transforms flattened), and a clipping box that holds a scroller clips a control's reach only across the way it scrolls; edited: a scroller clips a control's reach only across the way it scrolls; a grown control is judged set on another by the box it draws; edited: SMALL skips a control drawn without its marks (judged where the app draws it marked); edited: SMALL by weight: a weighted control under 48, any other under 24 or with a reach under 48, the halo cut to its ancestors as the phone delivers it; edited: BENEATH skips a layer drawn at no opacity; edited: BENEATH counts only what paints over a stop; COLOUR reads a fill turned dark to light (3:1) as a cue in any colour vision; edited: COLOUR (opt-in): a chosen control that differs from its unchosen sibling in nothing but colour; edited: BENEATH (opt-in): a stop a screen reader reaches under a layer drawn over half the screen; edited: ORDER (opt-in): a stop a member sees, read after one drawn wholly below it, the two stacked; only stops on the phone's frame and not under a bar are compared; edited: UNSAID reads a Roman numeral as its number and MIN as minutes; edited: UNSAID (opt-in), a control showing six words or fewer whose name does not hold each of them, with its source site; edited: UNDER walks the scroll and judges each line; a line is hidden only if no position shows it |
| mockups/tools/contrast.cjs | 2026-10-29 | edited: the page is photographed in overlapping bands, so a screen too tall for one picture is measured, not lost; edited: the phone is never shrunk below its height, a pixel is read where a point falls (floor), and what lies off the photographed page is said, not measured; edited: a field with no edge of its own is measured by the box that has one; listed writing surfaces are not; a dashed edge is read by its ink; edited: --controls: a field's edge and an icon-only control's icon against their ground at 3:1; edited: a screen that drew no words is passed over, not photographed at no height |
| mockups/tools/quote-ink.cjs | 2026-10-15 | new: the quote marks' outline, read from the font file; exports its marks; theQuoteMarkIsTheFontsOwn holds the Lobby's copy to them |
| mockups/tools/required.cjs | 2026-10-15 | new: the --require promise, one definition for layout.cjs and jest-shards.cjs |
| mockups/tools/selftest.cjs | 2026-10-30 | edited: columnsteal: a column's halo past its own width is measured whole (the probe was once capped at the control); edited: a glow's negative margin widens its line (glowline); a paragraph taller than its window (scrolltall) and a line read between the scroll's ends (scrollpast) are not UNDER; a text's floor breaks a wrapping line in Yoga (yogawrapfloor) |
| mockups/tools/shoot.cjs | 2026-10-24 | edited: --width, so a shot shows the width that was measured |
| mockups/tools/yoga-parity.cjs | 2026-10-29 | edited: compares the style as written (no touch growth); edited: a leaf keeps its width and height limits in Yoga; a minWidth is what breaks a wrapping line |
| modules/room-cover/index.ts | 2026-10-27 | new: a locked room covered while the app is away, natively (iOS: the house's ink as the app resigns active; Android 13+: kept out of Recents, the secure flag below 13) |
| README.md | 2026-10-03 | read against the code: the stack table and the folder notes said CQRS and 'pure, stateless', which the code is not; now true |
| register/classes.yaml | 2026-10-16 | edited: the E2E judges' classes, each with the test that refuses its bad log; the store call's limit among the request class's tests |
| register/mutants.yaml | 2026-10-16 | new: every mutant, past, new-shape and judge, each with its class and the test that must fail on it |
| register/stryker-equivalents.yaml | 2026-10-16 | new: the survivors no test can tell apart, each by its file, line, column, mutator and replacement, with why |
| register/stryker.yaml | 2026-10-16 | new: the logic files Stryker scores, each with its own tests, at a floor of 90% |
| scripts/__tests__/commit.test.ts | 2026-10-16 | edited: an ignored path refused with the index as it was |
| scripts/__tests__/androidPackages.test.ts | 2026-10-16 | new: a package counts as installed only with its package.xml |
| scripts/__tests__/contractsRan.test.ts | 2026-10-16 | new |
| scripts/__tests__/flakeHistory.test.ts | 2026-10-16 | new |
| scripts/__tests__/jestShards.test.ts | 2026-10-16 | new: a zone's record holds that zone's files |
| scripts/__tests__/mergeCoverage.test.ts | 2026-10-15 | new: read against jest's CoverageReporter, which it runs whole and in parts |
| scripts/__tests__/privateSettings.test.ts | 2026-10-16 | new |
| scripts/absence-only.cjs | 2026-10-16 | new: the finder of TST-09, a rendering test whose every check finds the screen without something, with nothing shown drawn |
| scripts/add-only.cjs | 2026-10-15 | new; a migration by its kind (test-utils/universe.js); SQL no rule names is refused |
| scripts/android-packages.cjs | 2026-10-16 | new: read against React Native's libs.versions.toml, Expo's root project plugin and the Reanimated and Worklets build files; --installed asks the disk for each package's package.xml, as sdkmanager does |
| scripts/await-events.cjs | 2026-10-16 | new: the finder of TST-08, a fireEvent, act or renderHook nobody waits for, in every test file; --fix waits for each where the code can, making the function async |
| scripts/bundle-size.js | 2026-10-22 | edited: each line says its exact bytes, so a record copied from CI is exact |
| scripts/check-app-routes.js | 2026-09-29 | claimed to fail CI, but no workflow ran it: CI now runs it (proved to fail on a planted non-route); its files come from the shared file list (test-utils/universe.js) |
| scripts/check-backend-live.mjs | 2026-10-16 | edited: the supabase CLI's failure told by its own reason (why), a failed fetch by its cause |
| scripts/comment-truth.js | 2026-09-29 | 8 fixed (its own examples tripped it); TODO now exempt in backticks; npm run comments:check added; its files come from the shared file list (test-utils/universe.js) |
| scripts/commit.cjs | 2026-10-16 | edited: a git add that fails partway has what it staged unstaged again |
| scripts/contracts-ran.cjs | 2026-10-16 | new: read against jest --json's record and contractEnv.ts's skip |
| scripts/coverage-ratchet.js | 2026-10-15 | edited: in CI it reads the summary merge-coverage.cjs writes for the parts together |
| scripts/dump-production.cjs | 2026-10-15 | new |
| scripts/eas-build-preflight.cjs | 2026-10-15 | edited: no build while the app names what production lacks |
| scripts/edge-functions.cjs | 2026-10-03 | paytabs-handler NOT_DEPLOYED, with why (it granted any rank to a posted "paid" message) |
| scripts/flake-history.cjs | 2026-10-16 | new: read against Maestro's JUnit reports (run 38824884948's) and jest --json's record |
| scripts/frozen-counts.cjs | 2026-10-16 | edited: a hand-made house's client handed over without the shared fake is planted for the mock finder |
| scripts/functions-check.mjs | 2026-10-03 | compares every file a deploy bundles, _shared included, each function in its own folder; a listed exception is reported once |
| scripts/gates-check.js | 2026-10-16 | edited: a failed read of the database ends the check with psql's reason, the address hidden |
| scripts/grapheme-table.js | 2026-10-04 | edited: the table records its Unicode version, not the ICU patch |
| scripts/hooks/commit-msg.cjs | 2026-10-15 | new |
| scripts/hooks/pre-commit.cjs | 2026-10-16 | edited: refuses while a stopped mutants run left a mutant in place |
| scripts/hooks/pre-push.cjs | 2026-10-16 | edited: every source-reading test, not only those an import reaches, its paths in batches that fit a Windows command line (the related tests' too); refuses while a mutant is in place; the mutants standing on what changed, last; Stryker's sandbox left out |
| scripts/hooks-ran.cjs | 2026-10-15 | new |
| scripts/jest-shards.cjs | 2026-10-16 | new: read against jest --json's record and --listTests, and layout.cjs's --sites; each zone's record is held to that zone's files |
| scripts/install-hooks.cjs | 2026-10-15 | new |
| scripts/lucide-icons.js | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| scripts/merge-coverage.cjs | 2026-10-15 | new: read against @jest/reporters 29.7's CoverageReporter (onTestResult, onRunComplete, _checkThreshold) and jest-config's readConfig |
| scripts/migration-lint.cjs | 2026-10-15 | edited: reads a file by its kind (test-utils/universe.js); the archive is not read; SQL no rule names is refused |
| scripts/mutants.cjs | 2026-10-22 | edited: a YAML change parses document by document (a flow is two); each mutant applied by the code around it and judged by the kill rules; a judge fed a bad log; those a change stands on, a part of all, the parts read together; the mutant in place recorded first and put back by the next run; an unknown option refused |
| scripts/press-again.cjs | 2026-10-16 | new: the finder of TST-14, a second press of the same control in a test with no timer advanced and no real wait between |
| scripts/private-settings.cjs | 2026-10-16 | edited: once a value is read, an error nobody catches is printed with every value read hidden; a rejection reaches the same handler |
| scripts/register.cjs | 2026-10-15 | new |
| scripts/release-guard.cjs | 2026-10-16 | edited: the fault proxy's port among the E2E world's addresses |
| scripts/resume.cjs | 2026-10-16 | edited: says why gh could not be asked |
| scripts/schema-snapshot.mjs | 2026-10-15 | edited: the address from the private settings file; default privileges that name no schema |
| scripts/secret-shapes.cjs | 2026-09-29 | true as written |
| scripts/secrets-planted.cjs | 2026-10-16 | edited: gitleaks writing no report ends it in gitleaks's words |
| scripts/stryker-files.cjs | 2026-10-16 | new: Stryker file by file, on the console as it goes, in a zone behind UTC; each report judged against the floor and the equivalents; an unknown option refused |
| scripts/surface-jest-failure.sh | 2026-10-03 | read whole: sound |
| scripts/test-timezones.js | 2026-10-16 | edited: ZONES and each zone's record name exported, the one list CI reads; ONLY_IN_UTC: the tooling's tests run in UTC alone, the app's in all six zones |
| scripts/website-freeze.cjs | 2026-10-15 | new |
| src/components/__tests__/aComponentHasOneName.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/__tests__/aRoomSaysWhetherItIsEmptyOrFailed.test.tsx | 2026-10-16 | new |
| src/components/__tests__/aSuspensionIsSaid.test.tsx | 2026-10-02 | Written in the launch audit: a silenced or suspended member is told, and told when it ends. |
| src/components/__tests__/aTabDrawsItsIconOnce.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/__tests__/aTabIsTouchedWhereItIs.test.tsx | 2026-10-02 | Written 2026-10-02 (launch audit): a tab reaches no further than its own edges. |
| src/components/__tests__/Buster.test.tsx | 2026-10-04 | edited: the lids lie beside the picture, outside the points’ layer, over the whole figure; the still one shows whole |
| src/components/__tests__/busterRegister.test.ts | 2026-10-27 | edited: MembersOnly's empty state carries Buster; edited: the two not-yours notices registered (the stack editor, the cover picker); edited: the salon's Buster also says its words being read, or not read; its files come from the shared file list (test-utils/universe.js) |
| src/components/__tests__/theHouseSignsWithItsLogo.test.tsx | 2026-10-27 | edited: the Lobby tab's eye is an AssetImage; edited: the Lobby tab wears the logo's small cut, on a clear ground (read by e2e/png.mjs); no stand-in eye is kept there |
| src/components/__tests__/theInitiationLeavesAfterItsFade.test.tsx | 2026-10-15 | new: a beat and the door leave after their fade |
| src/components/__tests__/theInitiationTellsTheTruth.test.tsx | 2026-10-02 | Written 2026-10-02 (launch audit): the induction promises only what a new member has. |
| src/components/Arrive.tsx | 2026-10-22 | edited: passes a view's own props; its style may move too; rise's sign said |
| src/components/admin/SecondKeyDoor.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the code's ledger line in the ink that reads; edited: a control named by the words it shows, first (label in name); new: the Tribunal's door: checking, failed, register a key, give its code |
| src/components/admin/__tests__/theTribunalAsksForASecondKey.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; new: each room of the door against the strict second factors |
| src/components/__tests__/ActionDeck.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; rendered: owner, certify, save, stranger |
| src/components/__tests__/animation-parking.test.ts | 2026-10-15 | edited: the whole app, its hooks included; a focus flag handed to a hook parks a loop |
| src/components/__tests__/aRatingCanBeGivenWithoutSight.test.tsx | — |  |
| src/components/__tests__/aScreenThatFailsLetsYouLeave.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first;  |
| src/components/__tests__/authRouting.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/__tests__/ControlledInput.test.tsx | 2026-10-29 | edited: the field is drawn in the edit-profile style it wears on the screen, so its capture is the field members see; edited: each field given its limit; edited: the counter reads the bio's cap |
| src/components/__tests__/EmptyStates.test.tsx | — |  |
| src/components/__tests__/ErrorBoundary.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first;  |
| src/components/__tests__/OfflineBanner.test.tsx | 2026-10-29 | edited: its own stand-in for PressableScale gone, so the banner is drawn as the app draws it, marks and all; edited: a control found by the name it now says, its shown words first; the frame in the safe-area mock; the banner leaves after its rise |
| src/components/__tests__/oneRankMark.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/__tests__/overlayElevation.test.ts | 2026-10-15 | edited: the whole app, src/features and src/hooks included |
| src/components/__tests__/PressableScale.hitSlop.test.tsx | — |  |
| src/components/__tests__/SectionErrorBoundary.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first;  |
| src/components/__tests__/SpoilerVeil.test.tsx | 2026-10-01 | records every frame |
| src/components/__tests__/stackedRowHitSlop.test.ts | 2026-10-30 | edited: the top bar's cluster gap is 10, its icons' halo 5; edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/__tests__/textContrast.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/__tests__/theCountHangsBesideItsMark.test.tsx | 2026-10-28 | edited: the deck given its lounge clearance; edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/__tests__/theDoorCanBeReadAndPressed.test.tsx | — |  |
| src/components/__tests__/theRankBadgeIsReadable.test.ts | — |  |
| src/components/__tests__/theShareSheetSaysWhenTheSalonsAreAway.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: salons never asked for are being read, not "no seat yet"; the salons' flag by its own name; salons, selection, closed cost, crash copy |
| src/components/__tests__/theToastHasOneHome.test.tsx | — |  |
| src/components/__tests__/theToastIsDrawnOnTop.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/atmosphere/__tests__/useSharedImage.test.tsx | — |  |
| src/components/atmosphere/RoomBloom.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/atmosphere/RoomLight.tsx | 2026-10-23 | edited: the room's light kept as a texture while its screen is in front (useScreenSeen), let go behind; heldLift: the veil's light moves back only while any of it can show, and an unchanged lift writes nothing, so the canvas is not drawn on every frame of the page below; the room drawn as one native background (roomLightImage); no SVG |
| src/components/atmosphere/__tests__/theLightRestsOutOfSight.test.ts | 2026-10-23 | edited: the room's light kept while in front, let go behind, kept outside any navigator; whether a screen is seen, with no navigator and behind another; the veil's light rests once the hem is out of sight: heldLift, and the veil drawn with its reaction run per frame |
| src/components/atmosphere/useSharedImage.ts | 2026-10-26 | edited: the picture held with the address it was read for: a new address shows nothing until its own comes; Read whole (launch audit). Sound; left alone. |
| src/components/auth/AuthChrome.tsx | 2026-10-08 | the candlelight halo a native gradient; written as an ellipse (RN misreads circle <r> at) |
| src/components/auth/EmailConfirmationScreen.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; close from useModalTop |
| src/components/auth/PasswordRecoveryModal.tsx | 2026-10-29 | edited: its field's ledger line in the ink that reads, full brass while focused; edited: the card in a CentredCard, its scroll above the keyboard |
| src/components/auth/PasswordStrengthMeter.tsx | 2026-10-03 | read whole: one answer for a new password; says when it is too long for the lock |
| src/components/auth/SocietySeal.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the mark ignites through useIgnition and rests on a plain style; the halo moves with it; true as written |
| src/components/AutopsyGauge.tsx | 2026-10-01 | true as written |
| src/components/Buster.tsx | 2026-10-29 | edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: figure and eyes, shown, rest on SHOWN; edited: the still one shows whole or not at all, and anyway once the wait runs out |
| src/components/busterArt.ts | 2026-10-04 | regenerated: a picture with points carries the layer over them |
| src/components/CinematicOverlays.tsx | 2026-10-08 | the vignette a native gradient, not a full-screen SVG bitmap |
| src/components/clearance/__tests__/oneRopeNotThree.test.tsx | — |  |
| src/components/clearance/Clearance.tsx | 2026-10-28 | edited: the rope names its own act (Ascend the ranks, Resume your standing); edited: ropeSpoken, what a control roped by its rank says aloud; edited: Standing gains reading; the rope says [ YOUR RANK, BEING READ ] / ASK AGAIN in fog, and sells nothing |
| src/components/ControlledInput.tsx | 2026-10-29 | edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: each field carries its own error: drawn under it, its hint, and the ref react-hook-form focuses (useField); edited: a field's props require its limit; the bio's is its own unless named; edited: the bio's default limit is the bio's cap |
| src/components/critique/__tests__/aCritiqueIsWithdrawnOrReported.test.tsx | 2026-10-01 | new |
| src/components/critique/__tests__/oneCritiqueRow.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/critique/CritiqueRow.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the letter is initialOf, whole |
| src/components/critique/withdraw.ts | 2026-10-01 | new: the one question before a critique comes off the page |
| src/components/darkroom/__tests__/aYearTypedOnAnIPhoneIsApplied.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); new |
| src/components/darkroom/__tests__/theFiltersSayWhatTheyHold.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: its navigation mock stands on the one base (test-utils/navigationMock); Written 2026-10-02 (launch audit): the filter toggle and CLEAR speak. |
| src/components/darkroom/__tests__/theNextBatchSaysWhenItCouldNotBeDeveloped.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: its navigation mock stands on the one base (test-utils/navigationMock); the next batch says it could not be developed; moods are buttons with state and keys |
| src/components/darkroom/__tests__/theSuggestionsComeBack.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); read with the Darkroom focus fix / E2E probe |
| src/components/darkroom/__tests__/theSuggestionsSayWhenTheCatalogueIsAway.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); new |
| src/components/darkroom/__tests__/theTraySaysWhenTheCatalogueIsAway.test.tsx | 2026-10-27 | edited: the tray opens on the films build 41 kept, the catalogue away;  |
| src/components/darkroom/constants.ts | 2026-10-02 | read; sound |
| src/components/darkroom/DarkroomCards.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; edited: a control named by the words it shows, first (label in name); edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the quick save uninked while the ledger is not held |
| src/components/darkroom/DarkroomFilterPanel.tsx | 2026-10-30 | edited: wrapped chip rows stand 19 apart, so each chip grows to 48 and meets the next row; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); enters and leaves as a PresenceView |
| src/components/darkroom/DarkroomHeader.tsx | 2026-10-30 | edited: a chosen chip's words are underlined: its colour alone does not say it; its halo is half the gap beside it, and up and down it grows; edited: a chip's halo is half the gap beside it; up and down it grows to 48; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: a control named by the words it shows, first (label in name), or its initial left unspoken; the filter panel is held through its exit |
| src/components/darkroom/DarkroomHero.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: the search's ledger line in the ink that reads; edited: the small hours told as they come; the title's glow has room inside the box a phone cuts it at |
| src/components/darkroom/DarkroomMoodBar.tsx | 2026-10-02 | keys; selected as a state; meaning spoken |
| src/components/Decorative.tsx | 2026-10-15 | reelsWidth: a rating's drawn width, for the Lobby's arithmetic |
| src/components/dispatch/__tests__/aMarkUnreadIsNotOff.test.tsx | 2026-10-23 | a member's mark not yet read: the card's stamps and the reader's dock unpressed, said to be reading, never selected; signed out, members only as before (P0.112) |
| src/components/dispatch/__tests__/aBallotsClosingTimes.test.ts | 2026-09-29 | new |
| src/components/dispatch/__tests__/aControlsNameCanBeRead.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/dispatch/__tests__/aDeskControlNeverAnswersWithNothing.test.tsx | 2026-09-29 | new |
| src/components/dispatch/__tests__/aDossierHasACover.test.tsx | — |  |
| src/components/dispatch/__tests__/aDraftSurvivesThePhone.test.tsx | — |  |
| src/components/dispatch/__tests__/aFilingReachesTheRoom.test.tsx | — |  |
| src/components/dispatch/__tests__/aNewerOneWasWrittenElsewhere.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first;  |
| src/components/dispatch/__tests__/archiveScreen.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first;  |
| src/components/dispatch/__tests__/aSeriesIsReadInOrder.test.ts | — |  |
| src/components/dispatch/__tests__/ballotDesk.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: a ballot draft as build 41 saved it opens with its question, films and closing; edited: a ballot draft as build 41 saved it opens with its question, films and closing;  |
| src/components/dispatch/__tests__/composeScreen.test.tsx | 2026-10-28 | edited: the over-length refusal is under the writing and in its hint, not a toast; edited: a control found by the name it now says, its shown words first; edited: an amend as build 41 kept it opens over the published words;  |
| src/components/dispatch/__tests__/dayLabel.test.ts | — |  |
| src/components/dispatch/__tests__/dispatchNoDeadControls.test.ts | 2026-10-15 | edited: every Dispatch component and screen, from the shared file list |
| src/components/dispatch/__tests__/duplicateRows.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first;  |
| src/components/dispatch/__tests__/essayBody.test.tsx | 2026-10-04 | edited: a right-to-left opening raises no letter |
| src/components/dispatch/__tests__/everyCardSaysSomething.test.tsx | — |  |
| src/components/dispatch/__tests__/everyLeadInIsAccountedFor.test.ts | — |  |
| src/components/dispatch/__tests__/everyRuleIsTrue.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/dispatch/__tests__/everyTextHasACeiling.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/dispatch/__tests__/excerpt.test.ts | — |  |
| src/components/dispatch/__tests__/feedRowIsRecyclable.test.ts | 2026-10-27 | edited: a paper export is matched by its whole name (TMDB is not TMDB_NOTICE); edited: the row's pictures are RemoteImage, each with its recycling key; edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/dispatch/__tests__/feedScreen.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: a control found by the name it now says, its shown words first; edited: the rank read a moment ago; edited: back in the app, the new filings are counted on the pill and no row moves; edited: the member's marks, read, redraw each filing's bar and none of its words, counted by the words' door; the marks put are read unless a test says not; a mark still being read is drawn unknown, unpressed, then the member's; its navigation mock stands on the one base (test-utils/navigationMock); a failed page tells the E2E so, and shows no filing for a flow to find |
| src/components/dispatch/__tests__/motionLaws.test.tsx | 2026-10-29 | edited: every animation asks the live hook about reduced motion; edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/dispatch/__tests__/noIntlInTheDispatch.test.ts | — |  |
| src/components/dispatch/__tests__/nothingIsLostQuietly.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/nothingLivesOnlyInTheMockups.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/dispatch/__tests__/oneCapNotThree.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/dispatch/__tests__/oneWordNamesOneThing.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/dispatch/__tests__/paperTextLogic.test.ts | 2026-10-03 | edited: hidden characters written as escapes |
| src/components/dispatch/__tests__/readerScreen.test.tsx | 2026-10-29 | edited: while the share sheet is up the reading beneath is out of a screen reader reach; edited: a control found by the name it now says, its shown words first; edited: the rope stand-in takes its act too; edited: TO THE LOUNGE without the rank holds the key and opens the rope; edited: a critique draft as build 41 saved it opens in its box; edited: a ballot that closes while it is read is drawn CLOSED on return; edited: the marks once, in the dock, on a ballot and a short filing |
| src/components/dispatch/__tests__/roomScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/rulesScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/seriesScreen.test.tsx | — |  |
| src/components/dispatch/__tests__/signedOutHasNoInertControls.test.tsx | — |  |
| src/components/dispatch/__tests__/spokenAloud.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first;  |
| src/components/dispatch/__tests__/theBallotAndTheCount.test.tsx | 2026-10-28 | edited: 'opens' is a verb, never a plural; edited: a ballot whose mark is still being read: locked, said so, marking none; the reader passes whether it is read; its files come from the shared file list (test-utils/universe.js) |
| src/components/dispatch/__tests__/theDeskCountsAsTheReaderDoes.test.tsx | 2026-10-03 | new: the desk's minutes are readTime's |
| src/components/dispatch/__tests__/theDispatchAtItsLimits.test.tsx | 2026-10-03 | edited: hidden characters written as escapes |
| src/components/dispatch/__tests__/theDispatchSaysEssay.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/dispatch/__tests__/theDoorIsShown.test.tsx | — |  |
| src/components/dispatch/__tests__/theDraftIsTheWholePiece.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: an essay draft as build 41 saved it opens with its film and series;  |
| src/components/dispatch/__tests__/theEssayAtLargeType.test.tsx | — |  |
| src/components/dispatch/__tests__/theHardcodedWidthIsHarmless.test.ts | — |  |
| src/components/dispatch/__tests__/theInvitationHasAnAddress.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/theIssueIsTheCalendarDay.test.ts | 2026-10-02 | Written in the launch audit: the issue number counted in calendar days, every hour of two years. |
| src/components/dispatch/__tests__/theMarginSaysWhatItCounts.test.tsx | 2026-09-29 | new |
| src/components/dispatch/__tests__/theNumberIsAMembershipFact.test.tsx | 2026-10-04 | edited: initialOf comes from utils/text |
| src/components/dispatch/__tests__/thePaperIsMeasuredAndCounted.test.ts | 2026-10-16 | new |
| src/components/dispatch/__tests__/theParagraphKnowsItsDirection.test.tsx | 2026-10-03 | edited: hidden characters written as escapes |
| src/components/dispatch/__tests__/thePreviewIsThePage.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/theSeriesSheet.test.tsx | 2026-10-29 | edited: Enter in a new series name sets it; edited: a control found by the name it now says, its shown words first; written: the series sheet says what it read |
| src/components/dispatch/__tests__/theRailFitsOneScreen.test.ts | — |  |
| src/components/dispatch/__tests__/theReaderAtFullLength.test.tsx | — |  |
| src/components/dispatch/__tests__/theRoomOnScreenDecidesTheGate.test.ts | 2026-10-28 | edited: the header counts through counted(); read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/theRoomSaysWhatItHolds.test.tsx | — |  |
| src/components/dispatch/__tests__/theSetOfTheType.test.tsx | 2026-10-04 | edited: an opening quote rides up with the raised initial |
| src/components/dispatch/__tests__/theWritingRoomExplainsItself.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/dispatch/__tests__/wireCarriesItsSource.test.tsx | — |  |
| src/components/dispatch/__tests__/yourOwnRankOnYourOwnByline.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/dispatch/ComposeDesks.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the take's and the ballot's desks held in an UnderSheet while the film picker is up; edited: the filing's hour from the shared clock, the desk drawn again only as the hour turns; edited: the ballot's draft taken up as the desk renders, once per member; edited: the search field emptied on close as it renders; the pickers stand on the edge (useBottomEdge) |
| src/components/dispatch/dayLabel.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/dispatch/EssayBody.tsx | 2026-10-04 | edited: no letter is raised from a right-to-left opening |
| src/components/dispatch/excerpt.ts | 2026-10-01 | true as written |
| src/components/dispatch/FilingRow.tsx | 2026-10-25 | edited: its handlers kept across redraws, so a mark being read redraws the bar and not the words; whether the member's certify and save on its filing are read, from the store; read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperBallot.tsx | 2026-10-28 | edited: an option is said with the year and director it shows; edited: pictures through Picture; a film with no poster draws the house mark in its frame, never an empty box; edited: voteKnown: unread, its boxes unlinked and its options locked; the stamps' known passed on; docked, the ballot draws no row of marks of its own |
| src/components/dispatch/paper/PaperComposer.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the wire's source on its ledger line; edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the words go under the lead-in where three would not fit beside it; the rail's count at its right end |
| src/components/dispatch/paper/PaperCritiques.tsx | 2026-10-30 | edited: the order links grow up and down into the head's 19, sideways half the 8 between them; edited: the bar's title has no sideways halo toward MORE, which grows to 48; the order links grow both ways; edited: the order links grow both ways; its controls a slip on costs carry their weight; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: every certify heart in the crimson that reads (the pigment was 2.78:1); edited: a control named by the words it shows, first (label in name); edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: a critique's heart, its mark unread: uninked, said to be reading, not pressable |
| src/components/dispatch/paper/PaperDesk.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the question and the film search on their ledger lines; edited: the chosen closing time underlined as well as inked; edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: the desk's film search holds SEARCH_MAX; edited: ShareSheet's lounge clearance: the key, its reason and the rope's words; edited: pictures through Picture; a film with no poster draws the house mark in its frame; edited: the ballot's question as the composer's words; the rails' counts at their right ends |
| src/components/dispatch/paper/PaperDeskDoc.tsx | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperEssay.tsx | 2026-10-30 | edited: the series line is 48 by its own box, as the byline below it; edited: the series line keeps its size until the owner chooses the head's density (mockups/touch-small-exceptions.txt); edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: a control named by the words it shows, first (label in name); edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the raised initial is extractDropCap’s |
| src/components/dispatch/paper/PaperFill.tsx | 2026-10-29 | edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperFrame.tsx | 2026-10-30 | edited: the departments grow to 48 both ways (room), the strip and its index 48 where they clip; the bookmark and the sort have room; edited: the departments' strip grows invisibly to 48 where it clips; its departments, the bookmark and the sort have room; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/paper/PaperKeyWell.tsx | 2026-10-15 | keeps the home indicator's edge while the keyboard is down |
| src/components/dispatch/paper/paperMetrics.ts | 2026-10-24 | edited: SHARE_CARD_WIDTH, the width the share card is set and exported at |
| src/components/dispatch/paper/PaperMore.tsx | 2026-10-30 | edited: the house rules row is 48 by its own box; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; edited: the new-filings pill keeps its place over the list by zIndex; edited: a control named by the words it shows, first (label in name); edited: an ended filing named by what it says; edited: the film search holds SEARCH_MAX; edited: pictures through Picture; a film with no poster draws the house mark; a byline with no portrait, the empty disc; edited: a salon card has no halo; the share card has one shape and its own room (the unused ratios and max gone); the story frame takes the card's width |
| src/components/dispatch/paper/paperMotion.ts | 2026-10-29 | edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; Read whole (launch audit). Sound; left alone. |
| src/components/dispatch/paper/paperPerf.ts | 2026-10-15 | edited: memory-disk on every image, held by its guard; no image sets a priority, so the backdrop rule is gone |
| src/components/dispatch/paper/PaperPost.tsx | 2026-10-30 | edited: the byline, the writing and the film credit are each 48 by their own box (the owner's choice, 2026-10-30); edited: the byline, the writing and the film credit keep their size until the owner chooses the post's density (mockups/touch-small-exceptions.txt); edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the certify heart in the crimson that reads; edited: a control named by the words it shows, first (label in name); edited: a filing named by its kind and its writing, not "Open this filing" alone; edited: pictures through Picture; an answer's film with no poster draws the house mark in its frame; edited: a filing's words drawn in PostWords, a memo of their own that takes none of the marks; the stamp's lift from a host that does not clip; the answer signed under the whole letter, the stamp on its own line where the byline's is full; a short name takes no floor; with no facts, the rank takes the next line where name and rank will not fit one |
| src/components/dispatch/paper/PaperStrike.tsx | 2026-10-29 | edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; Read whole (launch audit). Sound; left alone. |
| src/components/dispatch/paper/paperStyles.ts | 2026-10-30 | edited: a department's dot stands 4 either side, so each department grows to 48 wide and meets the next; edited: the post's byline and film credit are 48pt rows and its writing at least 48 (the owner's choice, 2026-10-30); the critiques head 19 above and below; edited: the critiques head stands 19 above and below, where its order links grow to 48; edited: the critiques bar's MORE stands 4 from the title; its way back 5; edited: the departments' strip and its index are 48 where they clip; the masthead line a 48pt band; the critiques bar's way back 5 from its title; edited: the departments' strip is 48 where it clips (chromeScroll); the masthead line a 48pt band clear of it, its bookmark 18 from the sort word; edited: fieldLine, a one-line field on the paper on its ledger line; edited: the docked critique line on its ledger line; edited: reading, the reader's held body; the chosen critique order underlined as well as lit; edited: the stamp's host and plate; the answer's foot; a byline's words wrap when it has no facts; a short byline name; the rail wraps its count; a desk's lead-in row, broken by the words' floor |
| src/components/dispatch/paper/paperText.ts | 2026-10-22 | edited: counted() now lives in src/utils/counted.ts; this file passes it on |
| src/components/dispatch/readTime.ts | 2026-10-01 | true as written |
| src/components/dispatch/roomLink.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/components/dispatch/SeriesPicker.tsx | 2026-10-30 | edited: every row of the series sheet is 48 by its own box, the could-not-read row too; edited: every row of the series sheet is 48 by its own box; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the new series' name has its ledger line in the ink that reads; edited: Enter in a new series' name sets it, as SET THE SERIES does; edited: a control named by the words it shows, first (label in name); read whole in the Dispatch audit; comments checked true |
| src/components/EmptyStates.tsx | 2026-10-29 | edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; edited: the way out's prop is belowAnAct; edited: StateWords, the state's words still, shared with the crash nets; its title a header |
| src/components/ErrorBoundary.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); edited: the whole app's crash in the failure family (StateWords, the house TRY AGAIN, RESTART THE APP in its plate); the tries left and the reference as quiet facts |
| src/components/feed/__tests__/theKeyLeadsWhereItSays.test.tsx | 2026-10-28 | edited: the rank read a moment ago; the person page's rope handed its share; read whole: reads source through readCode; no regex stripper |
| src/components/feed/ActionDeck.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the certify heart in the crimson that reads; edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: a rank found held at the rope opens the share sheet; edited: the share rope's words from ropeSpoken; edited: the share key's label, reading: said, asked again |
| src/components/feed/ActivityCard.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the card's time from the shared clock, not held by a useMemo; edited: the card's paper drawn flat (flatPaper), its glows at the wash's strength in their colours, no edge light under it |
| src/components/feed/AutopsyView.tsx | 2026-10-30 | edited: the turn-over bar is 48 by its own box; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: a control named by the words it shows, first (label in name); each score read whole |
| src/components/feed/PosterFrame.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; the poster says its film |
| src/components/feed/ReviewContent.tsx | 2026-10-30 | edited: the review's door stands 8 lower, growing to 48 clear of the poster; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: the door is named by the writing it shows; the veil stands before it, not inside; edited: the review and the pull quote each take their own direction |
| src/components/feed/UserAttributionRow.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the letter is initialOf, whole |
| src/components/film/__tests__/aFileIsSharedWhole.test.tsx | 2026-10-15 | written: nothing is captured before every picture on the file is drawn; edited: the preview fills the room less the measured frame |
| src/components/film/__tests__/castRailFits.test.ts | — |  |
| src/components/film/__tests__/FilmActionTray.test.tsx | 2026-10-16 | edited: risen, the tray is drawn with plain styles, and falls on its animated ones |
| src/components/film/__tests__/filmDossier.test.tsx | — |  |
| src/components/film/__tests__/filmPageWiring.test.ts | 2026-10-23 | edited: the two placements of the house, each only once the critiques are read; the waiting dock and the stub stand on the same edge (bottomEdge) |
| src/components/film/__tests__/FilmStub.test.tsx | — |  |
| src/components/film/__tests__/filmStubMetrics.test.ts | 2026-10-15 | edited: the dock stands on bottomEdge |
| src/components/film/__tests__/filmVerdict.test.tsx | — |  |
| src/components/film/__tests__/footageRailFits.test.ts | — |  |
| src/components/film/__tests__/oneBrass.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/film/__tests__/pickCertificate.test.ts | — |  |
| src/components/film/__tests__/stubFits.test.ts | — |  |
| src/components/film/__tests__/trayActsFire.test.tsx | — |  |
| src/components/film/__tests__/whatAFilmPageNames.test.tsx | 2026-10-22 | edited: a country by its name; a right-to-left critique whole after its mark |
| src/components/film/__tests__/zz-film.gen.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first;  |
| src/components/film/__tests__/whatTheFilmPageCouldNotRead.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); the critiques unread while the page is drawn from the warm catalogue; written: the critiques' failure reaches the page; an unread verdict is unknown |
| src/components/film/CastCarousel.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: an actor without a photograph is drawn by initialOf |
| src/components/film/FilmActionTray.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: Android's back through useBackCloses; edited: an act may be uninked |
| src/components/film/FilmDetailLayout.tsx | 2026-10-29 | edited: the way back fills its circle's inside and grows a known 7 each side to 48; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the tray is built before the stub it rises from: read from its head down, then the stub that closes it; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: this year from the shared clock; edited: the log and watchlist rows of a film the ledger does not hold ask for the ledger, never file |
| src/components/film/FilmDossier.tsx | 2026-10-01 | what it holds, not what it absorbed |
| src/components/film/FilmHero.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; an unknown verdict claims nothing; histories to the present |
| src/components/film/FilmHeroSkeleton.tsx | 2026-10-15 | the waiting dock on the edge (bottomEdge) |
| src/components/film/FilmMediaCarousel.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; hands the whole video on; named |
| src/components/film/FilmReviews.tsx | 2026-10-28 | edited: the critique is named by its writing, then OPEN LOG; the veil stands before the door; edited: a critique's time from the shared clock; edited: no drop cap from right-to-left words |
| src/components/film/FilmScrollHeader.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; takes its top; back level with the floating one |
| src/components/film/FilmSectionHeader.tsx | 2026-10-01 | true as written |
| src/components/film/FilmSimilar.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; nav; named for a screen reader |
| src/components/film/FilmStub.tsx | 2026-10-23 | edited: a sixth state, not known yet (READING YOUR LEDGER, YOUR LEDGER UNREAD), the ticket uninked; never NOT YET SEEN |
| src/components/film/filmStubMetrics.ts | 2026-10-15 | the dock on bottomEdge; the scroll ends above it (scrollEndAbove) |
| src/components/film/LogShareCard.tsx | 2026-10-08 | passes the card's onReady through |
| src/components/film/NitrateFileCard.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: readiness told through an Effect Event; says when every picture is drawn (onReady); a failed poster turns to the no-poster face; the house's domain, not REELHOUSE.APP |
| src/components/film/pickCertificate.ts | 2026-10-01 | the member's own region is real now |
| src/components/film/ShareCardModal.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: no success after the share sheet, which cannot tell a share from a cancel; edited: the card in a CentredCard; its ground closes it; the preview sized to the room less its measured frame |
| src/components/film/TrailerModal.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; close from useOverlayTop |
| src/components/film/WatchProviders.tsx | 2026-10-29 | edited: a provider's logo grows to 48 both ways: the 10pt gaps give each 5; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the monogram takes each initial whole |
| src/components/HapticTab.tsx | 2026-10-15 | edited: given an icon, the button draws it once, chosen by aria-selected; why tabBarIcon is not used |
| src/components/home/ProjectorBeam.tsx | 2026-10-01 | true as written |
| src/components/home/types.ts | 2026-10-01 | true as written |
| src/components/home/VelvetRopeCTA.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; read whole: its sheen moved to theme/BrassSheen |
| src/components/InitiationModal.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its frosted glass drawn through HouseBlur; beats cross-fade and the door closes through Presence; the card in a CentredCard |
| src/components/KeyboardRoom.tsx | 2026-10-01 | written: the keyboard's room on Android |
| src/components/layout/__tests__/aCentredCardScrollsAtTheLargestText.test.tsx | 2026-10-23 | edited: its member's profile read (is_social_private), as a loaded member's is; its navigation mock stands on the one base (test-utils/navigationMock); new: every centred card in a Modal scrolls in one room at x3.1; every Modal named with its kind; each list read through one() or firstOf(), which say what they found; its files come from the shared file list (test-utils/universe.js) |
| src/components/layout/__tests__/aCentredPageScrollsAtTheLargestText.test.tsx | 2026-10-15 | new: every centred page scrolls in one room at x3.1 |
| src/components/layout/__tests__/aSectionIsAHeading.test.tsx | 2026-10-01 | written: a section title is a heading |
| src/components/layout/__tests__/aSwipeBackIsHeard.test.tsx | 2026-10-02 | nav's history hears the swipe back |
| src/components/layout/__tests__/ConciergeButton.test.tsx | 2026-10-29 | edited: the disc drawn on the real gradient, so its ＋ is measured on brass;  |
| src/components/layout/__tests__/everyListChoosesItsAnchor.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/layout/__tests__/everyModalAndOverlayStartsAtItsTop.test.tsx | 2026-10-28 | edited: the member's row can be read again; edited: the cover picker drawn for the salon's host; new: modals and overlays at three insets, both platforms |
| src/components/layout/__tests__/everyModalSheetAndOverlayEndsAboveItsFoot.test.tsx | 2026-10-28 | edited: the member's row can be read again; edited: the cover picker drawn for the salon's host; new: every modal, sheet and overlay foot, at 0, 21 and 34 |
| src/components/layout/__tests__/everyPushedHeaderStartsAtItsTop.test.tsx | 2026-10-23 | edited: its member's profile read (is_social_private), as a loaded member's is; its files come from the shared file list (test-utils/universe.js) |
| src/components/layout/__tests__/everyPushedScreenEndsAboveItsFoot.test.tsx | 2026-10-23 | edited: its member's profile read (is_social_private), as a loaded member's is; new: every pushed route's foot, at 0, 21 and 34 |
| src/components/layout/__tests__/everyTabEndsAboveTheTabBar.test.tsx | 2026-10-15 | new: every tab ends above the tab bar, at 0, 21 and 34 |
| src/components/layout/__tests__/everyTabStartsBelowTheBar.test.tsx | 2026-10-15 | new: every tab under the bar, built and measured; each sets the bar’s tint as it arrives |
| src/components/layout/__tests__/flashListKeyboard.test.tsx | 2026-09-29 | anchor tests |
| src/components/layout/__tests__/memberFileFixture.ts | 2026-10-23 | edited: its rooms answered, as a loaded file's are; new: a loaded member file |
| src/components/layout/__tests__/navMetrics.test.tsx | 2026-10-15 | new: helper values; the measure's redraws |
| src/components/layout/__tests__/theRouteIsMarkedForTheWalk.test.tsx | 2026-10-17 | new |
| src/components/layout/__tests__/theThumbStaysInItsTrack.test.ts | 2026-10-01 | runs the real maths |
| src/components/layout/__tests__/TopNavBar.test.tsx | 2026-10-29 | edited: its plain stand-in for the gradient gone, so its screens are drawn on the gradient the suite draws;  |
| src/components/layout/CentredCard.tsx | 2026-10-15 | new: a card centred in a Modal, the same room above and below, scrolled when taller |
| src/components/layout/CentredRoom.tsx | 2026-10-15 | new: a centred page between its edges, scrolled when taller |
| src/components/layout/CinematicFlashList.tsx | 2026-10-15 | edited: each scroll traced (useScrollTraceOf) |
| src/components/layout/CinematicScrollbar.tsx | 2026-10-01 | the thumb maths in one place |
| src/components/layout/CinematicScrollView.tsx | 2026-10-15 | edited: each scroll traced (useScrollTraceOf) |
| src/components/layout/ConciergeButton.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; edited: the Close disc is built before the card it sits above (read first), drawn over it by its zIndex; edited: its frosted glass drawn through HouseBlur; door through nav; the hint names all three doors |
| src/components/layout/E2ERouteMark.tsx | 2026-10-17 | new: the path the app stands on, as an unseen mark for the route walk, in the E2E build alone |
| src/components/layout/FrozenTab.tsx | 2026-10-01 | says it passes through; freezing carried to performance |
| src/components/layout/navMetrics.ts | 2026-10-15 | every page's top and foot: the bar's measure and the helpers; a centred card's room and its keyboard clearance |
| src/components/layout/PathTracker.tsx | 2026-10-02 | tells openSociety and nav the screen on every navigation |
| src/components/layout/SectionCards.tsx | 2026-10-01 | a section title is a heading |
| src/components/layout/TopNavBar.tsx | 2026-10-30 | edited: the bar's icons stand 10 apart with a halo of 5: 48 a finger each, and the brass plus meets the Lounge there; edited: its frosted glass drawn through HouseBlur; measures itself into navMetrics |
| src/components/lobby/__tests__/theQuoteMarkIsTheFontsOwn.test.ts | 2026-10-15 | new |
| src/components/lobby/__tests__/theWallHasNoDeadEnds.test.tsx | 2026-10-15 | edited: lobby-wall-hung only on a wall the house read, vacant too; its files come from the shared file list (test-utils/universe.js) |
| src/components/lobby/__tests__/theHonourStays.test.tsx | 2026-10-16 | edited: the record of editions is the strict fake's, rows in the table's shape: the query is shown picking the right day from decoys |
| src/components/lobby/__tests__/theLobbyScreenHangsTheWall.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); both doors, every pull |
| src/components/lobby/__tests__/theWallIsMeasured.test.ts | 2026-10-22 | edited: the foot never rises off its sheet, in the order it gives way; the snipe measured as the plan chose |
| src/components/lobby/__tests__/theWallIsRead.test.ts | 2026-09-30 | new |
| src/components/lobby/__tests__/theWallKeepsTheDay.test.tsx | 2026-10-03 | new: the clock reads on the hour and on return; a wall behind the day is asked again |
| src/components/lobby/FeatureRow.tsx | 2026-10-27 | edited: pictures through Picture; a bill with no poster draws the house mark; titled art lost prints the title in its place; edited: the one-sheet draws what the plan's foot kept; its shade a fixed ramp above the words, then 0.8 or more behind every line |
| src/components/lobby/FilingsBill.tsx | 2026-10-30 | edited: the byline is a 48pt row by its own box, flush under the filing's door, growing into neither; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: THE DISPATCH a paper plate at the slab's slant, inside its full-finger door |
| src/components/lobby/KeepOff.tsx | 2026-10-30 | edited: the switch is 48 by its own box, inside its row; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); draws its words in the lines planWall sets (two on a narrow credit strip) |
| src/components/lobby/LobbyHonour.tsx | 2026-10-27 | edited: the honour's year from the shared clock; its helpers are handed the time; new |
| src/components/lobby/LobbyWall.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); the log and the stack always side by side; lobby-wall-hung on a read wall |
| src/components/lobby/Masthead.tsx | 2026-10-15 | the Lobby's name: its glow has room inside the box a phone cuts it at |
| src/components/lobby/measure.ts | 2026-10-22 | edited: the one-sheet's foot fitted to the sheet's height as the phone grows its lines (foot, TITLE_FLOOR, FOOT_TOP); the snipe reads it |
| src/components/lobby/PairBills.tsx | 2026-10-30 | edited: an admin's switch line stands 14 under the name, so both grow to 48 and meet; edited: a control named by the words it shows, first (label in name); edited: pictures through Picture; a thumb with no poster draws the house mark; edited: vellum paper; the credit an ink block inside each bill; the vacant doors slanted plates |
| src/components/lobby/parts.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the letter is initialOf, whole; QUOTE_MARKS exported for its test |
| src/components/lobby/RankBill.tsx | 2026-10-24 | edited: "has seen your taste" said only once the member's ledger is read and holds a film; before, a line true of anyone |
| src/components/lobby/wallRead.ts | 2026-09-30 | new |
| src/components/lobby/words.ts | 2026-10-24 | edited: subUnseen, the rank bill's line for a member whose taste the house has not yet seen |
| src/components/log/__tests__/editorialDesk.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first;  |
| src/components/log/__tests__/everyCritiqueCanBeReached.test.tsx | 2026-10-02 | Written 2026-10-02 (launch audit): SHOW MORE asks for older critiques once the page runs out. |
| src/components/log/__tests__/logAtmosphere.test.tsx | — |  |
| src/components/log/__tests__/logComposer.test.ts | 2026-10-15 | edited: the seal's two reservations read navMetrics |
| src/components/log/__tests__/logComposerRender.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: a control found by the name it now says, its shown words first;  |
| src/components/log/__tests__/LogForm.fields.test.tsx | — |  |
| src/components/log/__tests__/logRender.test.tsx | — |  |
| src/components/log/__tests__/logSealBar.test.tsx | — |  |
| src/components/log/__tests__/logSearchEngine.test.tsx | — |  |
| src/components/log/__tests__/logStacksChips.test.tsx | — |  |
| src/components/log/__tests__/logSurfaces.test.ts | — |  |
| src/components/log/__tests__/logTouchTargets.test.ts | — |  |
| src/components/log/__tests__/theComposerKeepsItsWord.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: a control found by the name it now says, its shown words first; the five-page type sweep has its own 15 s limit (failed a busy full run at 5 s) |
| src/components/log/__tests__/theLapsedMemberReadsTheirNote.test.tsx | — |  |
| src/components/log/__tests__/theNoteSheetOffersOnlyWhatIsReal.test.tsx | — |  |
| src/components/log/__tests__/theVaultBelongsToItsViewing.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/log/__tests__/theVaultSaysWhenItCouldNotOpen.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; written: the Vault on the record, when it could not open |
| src/components/log/__tests__/zz-composer.gen.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: the signed-out page drawn once its entrance has played (arrived); read whole: the signed-out page is held to its own floor, its sentence and its door |
| src/components/log/AuteurToolkit.tsx | 2026-10-29 | edited: the filled notches in the crimson that reads (3.9:1 on the track), and the score capped bright, the needle at the end of the fill; histories to the present |
| src/components/log/EditorialDesk.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the pull quote names its cap |
| src/components/log/LogActionDeck.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the certify heart in the crimson that reads; edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: LOUNGE draws the key and says the rope without the rank; edited: certifyKnown and saveKnown: a heart or a bookmark not yet read is uninked; the heart said to be reading, the bookmark still pressable |
| src/components/log/LogAtmosphere.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; the film behind the composer, said as why |
| src/components/log/LogChronicle.tsx | 2026-10-01 | the typed card, said as why |
| src/components/log/LogClearanceGate.tsx | 2026-10-28 | edited: the rope names its own act (Ascend the ranks, Resume your standing); edited: the log's rope, reading: said, asked again, nothing sold |
| src/components/log/LogComments.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); true as written |
| src/components/log/logDetailStyles.ts | 2026-10-30 | edited: share is 48 wide whether it says SHARE or is still preparing; edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: deckKeyDim, the brass key in LOUNGE's place; the record's foot is set where it is drawn |
| src/components/log/LogForm.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a control named by the words it shows, first (label in name); edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: pictures through Picture; the poster and its alternates that could not be had draw the house mark; edited: TODAY and YESTERDAY turn at the member's midnight, with the composer open; edited: the review field says where it sits, in the E2E log |
| src/components/log/LogFormBody.tsx | 2026-10-01 | true as written |
| src/components/log/LogHero.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; the filing mark in the present tense |
| src/components/log/LogIndexEntry.tsx | 2026-10-01 | a held-but-unshown entry said as holding something |
| src/components/log/LogModalStyles.ts | 2026-10-29 | edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: editWait, the waiting words centred |
| src/components/log/logRecord.ts | 2026-10-01 | histories to the present |
| src/components/log/LogReviewBody.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); a Vault that could not open says so |
| src/components/log/LogSealBar.tsx | 2026-10-22 | edited: the unready seal is hollow (UNREADY); the note on why it still answers moved beside the press |
| src/components/log/LogSearchEngine.tsx | 2026-10-29 | edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: a control named by the words it shows, first (label in name); edited: pictures through Picture; a result with no poster keeps its column with the house mark: the rows no longer go ragged; foot from useContentBottom |
| src/components/log/LogVerdict.tsx | 2026-10-26 | edited: the verdict word ignites through useIgnition and rests on a plain style; edited: the word's lit box spans the slot, so Yoga and the browser measure it alike |
| src/components/log/NoteSheet.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: its frosted glass drawn through HouseBlur; foot from useSheetBottom |
| src/components/log/VaultNote.tsx | 2026-10-01 | true as written |
| src/components/lounge/__tests__/aKeystrokeRedrawsNoMessage.test.tsx | 2026-10-23 | edited: the store as it now is: the room open, its own flags; read whole: openRoom proves rows were drawn before counting redraws |
| src/components/lounge/__tests__/aMessageCanBeHeardAndActedOn.test.ts | 2026-09-29 | new |
| src/components/lounge/__tests__/aSeatLostLeavesTheChannel.test.tsx | 2026-10-23 | edited: the store as it now is: the room open, its own flags; new |
| src/components/lounge/__tests__/MemberFaceStack.model.test.ts | 2026-10-03 | read whole: sound |
| src/components/lounge/__tests__/roomGate.test.ts | 2026-09-29 | new |
| src/components/lounge/__tests__/aRefusedLeaveStaysInTheRoom.test.tsx | 2026-10-01 | written: the salon panel leaves only on success |
| src/components/lounge/__tests__/theCorridorIsOpen.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/lounge/__tests__/theDoorAdmits.test.tsx | 2026-10-01 | written: the host's panel, mounted |
| src/components/lounge/__tests__/theDoorIsAName.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/lounge/__tests__/theDoorWaitsForTheGuestList.test.tsx | 2026-09-29 | new |
| src/components/lounge/__tests__/thePollRunsWhileWatched.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/lounge/__tests__/theRoomSaysWhenItCouldNotBeReached.test.tsx | 2026-10-23 | edited: the transcript: reading while its words come, the house's failure with TRY AGAIN when they cannot, "be the first" only when read; the last room's words never drawn; read whole: sound |
| src/components/lounge/__tests__/theRopeWaitsForTheSheet.test.tsx | 2026-10-29 | edited: the corridor's opener is built before the sheet it opens; read whole: sound |
| src/components/lounge/__tests__/theSalonsSayWhenTheyCouldNotBeRead.test.tsx | 2026-10-28 | edited: the rank read a moment ago; edited: its navigation mock stands on the one base (test-utils/navigationMock); before the salons were ever asked for, the corridor reads; the salons' flag by its own name; read whole: sound |
| src/components/lounge/__tests__/theSealSaysWhatTheCountMeans.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; written whole: the unread seal seen and said at each count, and its limit against the SQL |
| src/components/lounge/__tests__/theSheetOffersOnlyWhatCanWork.test.tsx | 2026-10-28 | edited: REPLY and the picker only with the rank; Written in the launch audit: a departed member's message offers no report or block; a block always names who it blocks. |
| src/components/lounge/ActionSheet.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: its frosted glass drawn through HouseBlur; edited: REPLY only to a member who may speak; the picker only to one who may react; foot from useSheetBottom |
| src/components/lounge/AtTheDoorPanel.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: its frosted glass drawn through HouseBlur; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; slides away through Presence; foot from useSheetBottom |
| src/components/lounge/CreateLoungeSheet.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: Enter in the salon's name goes on to its description; edited: its frosted glass drawn through HouseBlur; edited: the society opened through an Effect Event; foot from useSheetBottom |
| src/components/lounge/EmptyMyLounges.tsx | 2026-10-01 | contrast history to its reason |
| src/components/lounge/JoinedLoungeCard.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; read whole: says "more than 99" where the server stops counting |
| src/components/lounge/LoungeGate.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; the gate's crest is the house's logo; in a CentredRoom: between the bars, and scrolled when taller |
| src/components/lounge/LoungeSettingsPanel.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its frosted glass drawn through HouseBlur; edited: pictures through Picture; a cover that could not be had draws the house mark; slides away through Presence; foot from useSheetBottom |
| src/components/lounge/LoungeStyles.ts | 2026-10-01 | true as written |
| src/components/lounge/loungeTabStyles.ts | 2026-10-29 | edited: the salon search's ledger line in the ink that reads; the list's foot is the tab's, set where it is drawn |
| src/components/lounge/MemberFaceStack.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: its own initialOf gone; the one in utils/text |
| src/components/lounge/PublicLoungeCard.tsx | 2026-10-28 | edited: the card says its members, never seats taken; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the door takes no halo (it reached 16pt into the next one); the key sits above the name, which a long word ran past beside it |
| src/components/lounge/reactions.tsx | 2026-10-01 | true as written |
| src/components/lounge/roomGate.ts | 2026-10-02 | Read whole (launch audit). A member banned from a PUBLIC room got the preview (TAKE A SEAT), which the house refuses: banned is decided before the preview now. Verified on the server: protect_lounge_member_status refuses any status change but the host's, so neither a muted nor a banned member can seat themselves. |
| src/components/MarkFigure.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/MasterLogo.tsx | 2026-10-02 | Read (launch audit): artwork. Left alone. |
| src/components/moderation/__tests__/ContentActionSheet.mute.test.tsx | — |  |
| src/components/moderation/__tests__/everyModerationRowActs.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/moderation/__tests__/ReportSheet.test.tsx | 2026-10-28 | edited: OTHER with no description: the reason under the details, said with them, focused; edited: a control found by the name it now says, its shown words first;  |
| src/components/moderation/__tests__/reportSheetDimensions.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/moderation/ContentActionSheet.tsx | 2026-10-29 | edited: every option (report, block, mute) and the close carry their touch weight; edited: its frosted glass drawn through HouseBlur; edited: reading from the frame the sheet opens on unread blocks: the refusal line never shows before the read begins; edited: block, mute and their undoing only over the member's blocks, read: one row reads them, or says they could not be read and asks again; foot from useSheetBottom |
| src/components/moderation/ReportSheet.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the details' ledger line in the ink that reads, full brass while focused; edited: OTHER with no description is said under the details, with them, and focused there (useFieldRefusal), not toasted; edited: a control named by the words it shows, first (label in name); edited: its frosted glass drawn through HouseBlur; foot from useSheetBottom |
| src/components/motion/__tests__/everyEntranceRests.guard.test.ts | 2026-10-26 | Written 2026-10-26: a view born invisible rests on a plain style, or is registered as hidden at rest. |
| src/components/motion/__tests__/fixtures/hiddenAtBirth.fixture.tsx | 2026-10-26 | Written 2026-10-26: one view born invisible, one born seen, for the guard. |
| src/components/motion/__tests__/exitingIsNeverUsed.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/motion/__tests__/fixtures/exiting.fixture.tsx | 2026-10-15 | new: the shapes the guard refuses and passes |
| src/components/motion/__tests__/Presence.test.tsx | 2026-10-15 | new: kept through its exit, removed after; reduced motion at once; frame, order, nesting |
| src/components/motion/Presence.tsx | 2026-10-29 | edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; edited: PresenceView: its latest props written after the commit, its pin the frame recorded at layout, as state; the ledger read as it renders on purpose, opted out of the compiler, says why; new: a view plays its exit and is removed by state; Reanimated `exiting` is never used |
| src/components/NitrateCalendar.tsx | 2026-10-27 | edited: today from the shared clock, and the month it opens on with it; the header without a stale line count |
| src/components/OfflineBanner.tsx | 2026-10-29 | edited: the check-again control has room: 48 though its words are 10pt; edited: named by the plate's own words, the minutes with them; edited: the offline time counted from the period's own start and cleared as it ends (the effect's cleanup); rises away through Presence; stands above the tab bar (useOverlayBottom) |
| src/components/person/canon.ts | 2026-10-01 | the order, not the sort it replaced |
| src/components/person/PersonBio.tsx | 2026-10-01 | READ MORE named and its state said |
| src/components/person/PersonDefining.tsx | 2026-10-28 | edited: a defining film is said with its obscurity word; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; histories to the present |
| src/components/person/PersonFilmography.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; one FILM; histories to the present |
| src/components/person/PersonHero.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the career span is handed this year; edited: the portrait letter is initialOf, unspoken |
| src/components/person/PersonOrnaments.tsx | 2026-10-29 | edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; edited: obscurityWord, the badge word for a score; the rarity mark in the present tense |
| src/components/person/personStyles.ts | 2026-10-01 | histories to the present |
| src/components/Preloader.tsx | 2026-10-29 | edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; a digit's glow is a still style with room inside its box, out of the animated style |
| src/components/PressableScale.tsx | 2026-10-29 | edited: `room` grows a control too small for a finger to 48 as a weight does; a size or minimum the style names grows with the padding; a measure that grows nothing draws nothing, and the layout its own growth caused is never measured again; edited: a control already 48 by its style, or with no axis it may grow on, is drawn as it was; one that draws nothing on its box grows in place; measured from its own box less its growth; edited: a `touch` weight grows a control a slip on costs something to 48 a side without moving a pixel (grownFor, touchAxes): the outer box places and grows, the inner box draws it as styled, the growth from the style's size or the inner box measured; Read whole (launch audit). A suspected dropped disabled state was disproved (RN's Pressable merges it). Sound; left alone. |
| src/components/profile/__tests__/aChosenChipKeepsItsRow.test.ts | 2026-10-26 | Written 2026-10-26: a chosen decade or format keeps the whole row of chips until it is let go. |
| src/components/profile/__tests__/aLockedRoomShutsWhenTheAppLeaves.test.tsx | 2026-10-27 | Written 2026-10-27: an opened locked room shuts when the app goes to the background, and is covered only while it stands open (P4.3). |
| src/components/profile/__tests__/aNameIsEarnedOnce.test.ts | 2026-10-02 | Written in the launch audit: no honour or stamp shares a name or borrows a rank's. |
| src/components/profile/__tests__/anEmptyLedgerSaysSo.test.tsx | 2026-10-01 | written: an empty ledger is said as one |
| src/components/profile/__tests__/anHonourIsNeverBroken.test.tsx | — |  |
| src/components/profile/__tests__/aRewatchShowsItsHalfLife.test.ts | 2026-10-02 | Written in the launch audit: a rewatch's half-life from the viewing history and the current rating. |
| src/components/profile/__tests__/aRoomKeepsWhatTheServerFound.test.ts | 2026-10-16 | edited: no search keeps every row; a backslash is itself |
| src/components/profile/__tests__/aRoomReadsOneAnswer.test.tsx | 2026-10-23 | edited: a room whose read is still out: your own holding nothing, a search with nothing yet, a search answered with nothing; written: rows, paging and failure from one answer |
| src/components/profile/__tests__/aSearchKeepsItsBox.test.tsx | 2026-10-01 | written: every searchable room, searched to nothing |
| src/components/profile/__tests__/aStandingIsSharedAsWhoseItIs.test.tsx | 2026-10-01 | written: a standing is shared as whose it is |
| src/components/profile/__tests__/aTasteMatchReadsBothRecords.test.tsx | 2026-10-03 | Written with the Taste Match client: the card compares both whole records (get_taste_match), says when they could not be compared, and draws nothing for a record the viewer may not read. |
| src/components/profile/__tests__/computeDailyStreak.test.ts | — |  |
| src/components/profile/__tests__/decadeCounts.test.ts | — |  |
| src/components/profile/__tests__/everyRatingHasAChip.test.tsx | 2026-10-28 | edited: the 4+ chip is found by its name and its count; Written in the launch audit: a half rating sits under the chip below it, in room, query and counts. |
| src/components/profile/__tests__/heroNameSize.test.ts | — |  |
| src/components/profile/__tests__/hideStatsRemoved.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/profile/__tests__/holdingsFit.test.ts | — |  |
| src/components/profile/__tests__/memberFile.test.tsx | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/profile/__tests__/memberFileRooms.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first;  |
| src/components/profile/__tests__/memberFileScreen.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: the rooms answered, as the screen is drawn; hidden characters written as escapes |
| src/components/profile/__tests__/portraitInitial.test.ts | 2026-10-04 | edited: both member-file screens ask it; scripts tested in aCharacterIsNeverCut |
| src/components/profile/__tests__/projectorRoom.test.tsx | — |  |
| src/components/profile/__tests__/railFits.test.ts | — |  |
| src/components/profile/__tests__/reconcileCount.test.ts | — |  |
| src/components/profile/__tests__/roomContrast.test.tsx | 2026-10-22 | edited: each room read once it has arrived, as a member sees it |
| src/components/profile/__tests__/roomInset.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/profile/__tests__/roomRail.test.tsx | — |  |
| src/components/profile/__tests__/rooms.test.tsx | 2026-10-03 | read whole: the repeat count is read past a nested call |
| src/components/profile/__tests__/roomSearch.test.tsx | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/profile/__tests__/roomSearchWiring.test.tsx | — |  |
| src/components/profile/__tests__/roomsRender.test.tsx | — |  |
| src/components/profile/__tests__/taste.test.tsx | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/components/profile/__tests__/theArchiveIsHeldWhereverItShows.test.tsx | 2026-10-23 | edited: the rooms answered, as the screen is drawn; Written in the launch audit: the Archive's lock holds every place the own file shows it. |
| src/components/profile/__tests__/theArchiveLockHolds.test.tsx | 2026-10-01 | written: the archive lock holds |
| src/components/profile/__tests__/theCalendarDrawsToday.test.tsx | 2026-10-01 | written: the calendar draws today and counts what it draws |
| src/components/profile/__tests__/theDnaCardReadsTheRecord.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; written: the DNA card reads the record and always opens |
| src/components/profile/__tests__/theDoorSaysWhatItCouldNotRead.test.tsx | 2026-10-23 | edited: the door opens reading, empty only once answered; a failed door is said; a failed count keeps the last; @handles; decline-all asks first |
| src/components/profile/__tests__/theFileLetsItsViewsLeave.test.tsx | 2026-10-23 | edited: the rooms answered, as the screen is drawn; new: the DNA card and the lock leave after their fade |
| src/components/profile/__tests__/theHonoursCountTheWholeRecord.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; written: honours and stamps from the whole record |
| src/components/profile/__tests__/theOracleClosesClean.test.tsx | 2026-10-01 | written: the Oracle closes clean |
| src/components/profile/__tests__/theProfileRedrawsForItsOwn.guard.test.ts | 2026-10-02 | Written 2026-10-02 (launch audit): the member page never takes the whole film store. |
| src/components/profile/__tests__/theRestCouldNotBeReached.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; written: a failed "more" is said in every room |
| src/components/profile/__tests__/theSharedCardIsAPicture.test.tsx | 2026-10-02 | the share card is unspoken and fixed-size |
| src/components/profile/__tests__/yearMarker.test.tsx | — |  |
| src/components/profile/__tests__/yourQueueOpensItsFilms.test.tsx | 2026-10-01 | written: your own queue's posters open their films |
| src/components/profile/__tests__/zz-art.gen.ts | — |  |
| src/components/profile/__tests__/zz-memberfile.gen.test.tsx | — |  |
| src/components/profile/__tests__/zz-mockup.gen.test.tsx | — |  |
| src/components/profile/__tests__/zz-render.lib.test.ts | 2026-10-24 | edited: a nested Text scales as its parent does |
| src/components/profile/__tests__/zz-render.lib.ts | 2026-10-29 | edited: a mark's touch weight and growable axes are written onto the control (data-touch, data-grow); edited: a scroll view carries its accessibility marks into the capture; edited: a control drawn with its chosen state (aria-selected, aria-checked); edited: a TextInput is drawn marked as a field, with its name; edited: a text carries its side margins (--mx); a nested Text is drawn with its parent's scaling, through source marks too |
| src/components/profile/Achievements.tsx | 2026-10-01 | every honour from the whole record; said while unread or failed |
| src/components/profile/ArchiveLock.tsx | 2026-10-26 | edited: the lock shuts again when the app goes to the background; while it stands open the room is covered when the app is away (modules/room-cover); edited: the phone's answer shown in its then; enters and leaves as a PresenceView |
| src/components/profile/AvatarCropSheet.tsx | 2026-10-30 | edited: the library's card, past 48 both ways, has no halo to reach the close above; edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: its frosted glass drawn through HouseBlur; edited: the library opens unasked (the system's picker needs no permission); only the camera asks; edited: a kept portrait prepared as the sheet opens, as if just picked; edited: Android's back closes the sheet, not Edit Profile beneath it; enters and leaves as a PresenceView; foot from useSheetBottom |
| src/components/profile/CinemaDNACard.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: Android's back closes the card, not the member's file beneath it; close from useOverlayTop |
| src/components/profile/CinematicInsights.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; says retrieving or failed; whose-words; no history comments |
| src/components/profile/favourites.ts | 2026-10-01 | comments say what is true now |
| src/components/profile/FollowRequestsPanel.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: its frosted glass drawn through HouseBlur; edited: the petitioners' search holds SEARCH_MAX; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: its spinner says it reads the door; rises and slides away through Presence; foot from useSheetBottom |
| src/components/profile/heroNameSize.ts | 2026-10-01 |  |
| src/components/profile/NitrateCalendarGrid.tsx | 2026-10-27 | edited: the grid ends on today, and moves on at midnight; today drawn; counts what it draws, "in the past year"; the app date helper; nav |
| src/components/profile/NoirPassport.tsx | 2026-10-01 | stamps from the whole record only; labels broken between words; said while unread or failed |
| src/components/profile/portraitInitial.ts | 2026-10-04 | rewritten: on initialOf |
| src/components/profile/ProfileArchiveTab.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; ends above its foot (scrollEndAbove) |
| src/components/profile/ProfileBackdrop.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; comments say what is true now; poster via tmdb.poster |
| src/components/profile/profileComputed.ts | 2026-10-26 | edited: a chosen decade or format holds the row as it stood when chosen, as state; Read (launch audit): date work is hand-built or ordering-only. Sound. |
| src/components/profile/ProfileHelpers.tsx | 2026-10-01 | comments say what is true now |
| src/components/profile/ProfileLedgerTab.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; ends above its foot (scrollEndAbove) |
| src/components/profile/ProfileListsTab.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; ends above its foot (scrollEndAbove) |
| src/components/profile/ProfilePhysicalTab.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); edited: a case's condition is spoken only as a grading word (spokenCondition); an import's other text stays unspoken; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; ends above its foot (scrollEndAbove) |
| src/components/profile/ProfilePosterCard.tsx | 2026-10-29 | edited: the abandoned mark in the crimson that reads (bloodReel was 1.67:1); edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; three modes no caller used, removed; nav; comments say what is true now |
| src/components/profile/profileStyles.ts | 2026-10-15 | edited: the name's shadow has room above and below; its sides are kept, the column whole |
| src/components/profile/ProfileTriptych.tsx | 2026-10-30 | edited: a plate's actions are 48 by their own box, stacked flush; the invite plus in marquee gold; edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the search on its ledger line; the empty mount's invite in the brightest brass (3.7:1); edited: the shelf's film search holds SEARCH_MAX; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: a wing's title gives up just enough size to stay whole, never under 10pt |
| src/components/profile/ProfileWatchlistTab.tsx | 2026-10-30 | edited: the Oracle's card, past 48 both ways, has no halo to reach the search below; edited: the any-era chip says ANY ERA first; ends above its foot (scrollEndAbove) |
| src/components/profile/ProjectorRoom.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); a visitor shares the standing as the member's; a failed share said plainly; comments say what is true now |
| src/components/profile/RadarChart.tsx | 2026-10-01 |  |
| src/components/profile/RoomParts.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a control named by the words it shows, first (label in name); edited: the room filter holds SEARCH_MAX; RoomMoreFailed; comments say what is true now |
| src/components/profile/roomStyles.ts | 2026-10-29 | edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); Read whole in the launch audit: sound. |
| src/components/profile/TasteDNA.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: each bar an Arrive on its beat; its tick on landing kept, on that beat |
| src/components/profile/TasteDNAExportCanvas.tsx | 2026-10-02 | unspoken; words fixed-size (it is a picture); history comments trimmed |
| src/components/profile/TasteMatch.tsx | 2026-10-15 | the percentage's glow has room inside the box a phone cuts it at |
| src/components/profile/tasteMatchRead.ts | 2026-10-03 | Written with the Taste Match client: the read of both members' whole-record shapes, and the comparison the card shows. |
| src/components/profile/WatchlistRoulette.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the plate reveals through useIgnition, keyed by each draw; a mid-spin close stops the spin; opens filmId; nav; the card in a CentredCard, its ground behind it |
| src/components/RankBadge.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/reels/sectionLayers.ts | 2026-10-16 | new: read against reels.tsx's two layers and the film tray's run 38790116312 |
| src/components/reels/__tests__/MemberRegistry.select.test.ts | 2026-10-01 | no comments |
| src/components/reels/__tests__/theReelIsTheAdvertisement.test.ts | 2026-10-27 | edited: the community feed is asked for whatever its return rules; read whole: reads source through readCode; no regex stripper |
| src/components/reels/__tests__/theReelSaysWhenItCouldNotRead.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); the following reel before the follow list is known: unread spools, failed says so and reads it again, read of nobody is quiet; the E2E is told a failed reel failed, and an empty one was read |
| src/components/reels/MemberRegistry.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; nav; comments cut to the why |
| src/components/reels/ReelsCards.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: a control named by the words it shows, first (label in name); edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the loader is his eyes; the flicker is gone |
| src/components/reels/ReelsFeedList.tsx | 2026-10-26 | edited: the viewability rule a module constant; its handler a stable callback; edited: each log row carries reel-log; each scroll traced |
| src/components/reels/ReelsHeader.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); the title's glow has room inside the box a phone cuts it at |
| src/components/reels/ReelsStackList.tsx | 2026-10-15 | edited: each stack cell carries reel-stack; each scroll traced |
| src/components/reels/types.ts | 2026-10-01 | true as written |
| src/components/RouteErrorBoundary.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); edited: a room's crash in the failure family; its acts grouped as on every failed room |
| src/components/search/SearchResultRow.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: arrives once, when the row is first made; a recycled row keeps its arrival |
| src/components/search/SearchUnreachable.tsx | 2026-10-30 | edited: the note's foot is 20, so its try-again grows to 48 above the first result; edited: a control named by the words it shows, first (label in name); edited: says failed (useStateSaid) |
| src/components/SectionErrorBoundary.tsx | 2026-10-28 | edited: a control named by the words it shows, first (label in name); edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); retries; comments made true |
| src/components/ShareToLoungeModal.tsx | 2026-10-30 | edited: a salon row is 48 by its own box, 6 from the next; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: a control named by the words it shows, first (label in name); edited: closing adjusted as it renders when the sheet opens; the effect keeps the timer that lets it slide away; edited: fetching until the salons have answered once; its spinner says it reads the salons; the salons' own flag (loungesLoading); the sheet's foot clears the home indicator (useSheetBottom) |
| src/components/society/__tests__/theSocietySellsWhatItSays.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: a rank bought elsewhere, read as the page opens, is held and never offered again; edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/society/BillingSwitch.tsx | 2026-10-02 | read; sound |
| src/components/society/FoundingCertificate.tsx | 2026-10-02 | read; sound |
| src/components/society/GeneralAdmission.tsx | 2026-10-02 | read; sound |
| src/components/society/PrivilegeLedger.tsx | 2026-10-02 | read; sound |
| src/components/society/PurchaseDock.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: named by its own words, then the price it is given; the window on the edge (bottomEdge); DOCK_REACH, its fade included |
| src/components/society/purchaseStop.ts | 2026-10-02 | Read whole in the launch audit: sound. |
| src/components/society/RankTicket.tsx | 2026-10-30 | edited: show its privileges is 48 by its own box, the 4 it takes from the space below; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: a control named by the words it shows, first (label in name); a ticket the store does not sell says so |
| src/components/society/SmallPrint.tsx | 2026-10-29 | edited: a wrapped line of links is 4 from the next, so each grows to 48 and meets it; edited: a button that restores or manages a purchase carries the commit weight, a link only room; both 48; edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; its link shared with the sign-in footer |
| src/components/society/SocietyPoster.tsx | 2026-10-27 | edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; read; sound |
| src/components/society/societyPricing.ts | 2026-10-02 | never a static dollar price for a product the store answered without |
| src/components/SpoilerVeil.tsx | 2026-10-28 | edited: takes the reach of the door it stands before; veiled from the first frame |
| src/components/StandingNotice.tsx | 2026-10-26 | edited: how long until it looks again, a named helper; stands above the offline plate (useOverlayBottom) |
| src/components/text/__tests__/aCutLabelIsHeard.test.tsx | 2026-10-17 | new |
| src/components/text/__tests__/theTextKeepsItsPromises.test.tsx | 2026-10-24 | edited: a nested text takes its parent's scaling; a nested label's spacing follows its parent |
| src/components/text/AnimatedText.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/components/text/index.tsx | 2026-10-29 | edited: a Text in a brighter ink, and at full strength, while Increase Contrast is on (heightened); edited: a Text in its face's heavier weight while Bold Text is on; at most four combining marks on any one character; edited: marksKept, at most four combining marks on any one character, in every Text's own strings; edited: a nested Text takes nothing of the house's and scales as its parent does; a frozen Text tells the Texts inside it |
| src/components/theme/__tests__/oneBrassSheen.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); written whole: the sheen sweeps only in front, and both plates draw it |
| src/components/theme/BrassSheen.tsx | 2026-10-29 | edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; written whole: the one sheen both brass plates draw; still behind another tab and under Reduce Motion |
| src/components/theme/CrestGlow.tsx | 2026-10-01 | the leak note to what it does |
| src/components/theme/DiamondDivider.tsx | 2026-10-01 |  |
| src/components/theme/OrnamentalRule.tsx | 2026-10-01 | no comments |
| src/components/ToastHost.tsx | 2026-10-29 | edited: Reduce Motion read live (useReduceMotion), not as it stood at launch; edited: answered, a toast goes; held, it offers DISMISS beside its act; pill from useOverlayTop; screens say if a sheet |
| src/components/Toggle.tsx | 2026-10-01 | comments say what is true now |
| src/components/TryAgain.tsx | 2026-10-30 | edited: ACTS_GAP 16: an act and the way out below each grow 8 toward the other and meet; edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: a retry is named by its shown words, then what it asks for again (spokenAs); edited: the way out sits ACTS_GAP below any act (belowAnAct), claiming half the gap; edited: a label for the act where it is more than asking again (RESTART THE APP) |
| src/components/__tests__/aLabelIsSpoken.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/components/__tests__/theKeyboardHasRoom.test.tsx | 2026-10-01 | written with the keyboard's room |
| src/components/reels/__tests__/theReelSaysWhatEachControlIs.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); written with the Reel's controls |
| src/components/ui/NotificationBadge.tsx | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/constants/__tests__/aMemberWhoLeftIsNamedOneWay.test.tsx | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/constants/__tests__/aRankIsSoldEnforcedAndExplained.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/constants/__tests__/deepLinks.test.ts | — |  |
| src/constants/__tests__/standing.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/constants/__tests__/taste.test.ts | — |  |
| src/constants/__tests__/theHouseLinksToItself.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/constants/__tests__/theRanksAreWellFormed.test.ts | — |  |
| src/constants/__tests__/theVaultIsThePrivateNotes.test.ts | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: its files come from the shared file list (test-utils/universe.js) |
| src/constants/cacheKeys.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/constants/deepLinks.ts | 2026-10-01 | true as written |
| src/constants/departed.ts | 2026-10-02 | Written in the launch audit: how the house names a member who has left, and one whose name it could not read: one phrase, no made-up handle. |
| src/constants/formats.ts | 2026-10-01 | the shelf is the Physical Archive, not the Vault; no ticket tag |
| src/constants/gatedFeatures.ts | 2026-10-28 | edited: lounge-speaking and lounge-reacting list the room and the share ropes; three comments made true; edited: no member may write the old essays table since 20261016_01; an open salon turned private is its own entry under Private Screening Rooms (gates:check found its trigger unlisted) |
| src/constants/inputLimits.ts | 2026-10-28 | edited: HOURS_DIGITS, a suspension's hours; written whole: the limits of boxes that write no column (email, search, year, email code) |
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
| src/features/profile/__tests__/aLinkSaysWhyBeforeItVanishes.test.tsx | 2026-10-28 | edited: the editor drawn in its form: a title's error under the title and in its hint; edited: the override written as an escape |
| src/features/profile/__tests__/linksEditor.test.tsx | 2026-10-29 | edited: the editor drawn in its form; edited: no errors prop;  |
| src/features/profile/__tests__/theDossierSealIsSpoken.test.tsx | 2026-10-28 | edited: the hook's stand-in returns no errors;  |
| src/features/profile/__tests__/theEditDeskSaysWhatWentWrong.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; edited: a refused photo permission never blocks a portrait; a refused camera offers Settings; edited: the leaving guard stood in for: the desk is drawn with no navigator; written: the edit desk says what went wrong |
| src/features/profile/EditProfileScreen.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the desk out of a screen reader's reach for the seal's one beat; edited: Enter in the username and display name goes on to the next field; edited: its fields draw their own errors; edited: its pictures drawn through Picture: a missing or failed one draws its fallback in its own box; edited: the crop sheet handed the kept portrait, and it is let go once used or closed; nav top from usePushedHeaderTop; foot from useContentBottom |
| src/features/profile/LinksEditor.tsx | 2026-10-29 | edited: its controls a slip on costs something (delete, file, close, go back) carry their touch weight; edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: Enter in a link's title goes on to its address; edited: its fields draw their own errors; no errors prop; edited: the link title and address name their caps |
| src/features/profile/profile.styles.ts | 2026-10-29 | edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: errorText gone: FieldError draws a field's error; the title's glow has room inside the box a phone cuts it at |
| src/features/settings/__tests__/settings.redesign.test.tsx | 2026-10-29 | edited: Enter in the emailed code verifies it; edited: two ciphers that differ are said under the confirmation and focused; edited: a control found by the name it now says, its shown words first; edited: the test crash found by its label as written; edited: the test crash offered to the admin alone, each choice its kind; Share Crash Reports in Privacy, on, obeyed; edited: the credit drawn, logo and sentence, and the wordmark path TMDB's own file's; edited: a profile not yet read: no form, retrieved, asked again on failure; a read one draws the form and asks nothing; its navigation mock stands on the one base (test-utils/navigationMock); the Auteur manages a membership, not a rank to choose |
| src/features/settings/__tests__/anExportIsWhole.test.ts | 2026-10-01 | written: an export holds every row once |
| src/features/settings/__tests__/theSignOutNamesWhatItErases.test.tsx | 2026-10-29 | edited: its plain stand-in for the gradient gone, so its screens are drawn on the gradient the suite draws; edited: its navigation mock stands on the one base (test-utils/navigationMock); written: the sign-out confirm counts unsent changes, drafts and failed words; online, the queue goes first |
| src/features/settings/DataVault.tsx | 2026-10-27 | edited: no success after either export's share sheet; edited: the undo receipt read as the vault is made and again for another member, not by an effect; no dead store subscriptions; mount re-armed; progress spoken; undo counts what is left |
| src/features/settings/readAllRows.ts | 2026-10-01 | written: the export's ordered paging, out of the screen |
| src/features/settings/settings.styles.ts | 2026-10-29 | edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); read; sound |
| src/features/settings/SettingsScreen.tsx | 2026-10-29 | edited: signing out, deleting the account, its way back and its code controls carry their touch weight; edited: Enter in the security code verifies it; the code's fault is its hint; edited: its frosted glass drawn through HouseBlur; edited: the test crash's label written as the release guard's one exception, "Send a test crash"; edited: SEND A TEST CRASH in Administration, the admin's alone: a reported error, a JavaScript crash, a native crash; edited: TMDB's credit at the foot, under the house's colophon; edited: a refused deletion code is reported by kind; edited: the email's code field tells the phone it holds a one-time code; edited: the copyright's year from the shared clock; edited: the save checked at the press; the section landed on at its layout; edited: a failed profile read held with the member it was for; the read sets nothing until it answers; edited: the form only over a read profile (profileRead): retrieved when not, said when it could not be, and no save without it; its ready mark (settings), ready at once: the lab's control page; nav top from usePushedHeaderTop; foot from useContentBottom; the code window in a CentredCard |
| src/features/settings/SettingsSections.tsx | 2026-10-29 | edited: ActionBtn passes a touch weight on; signing out of other devices carries one; edited: the field's ledger line in the ink that reads (colors.fieldEdge, 3:1 and more); edited: the password change's refusals say why under their fields, with them, and go there (useFieldRefusal); edited: a control named by the words it shows, first (label in name), or its initial left unspoken; edited: the current password holds PASSWORD_MAX_BYTES; edited: an action button draws its label in capitals itself; edited: Share Crash Reports, this phone's own row at the foot of Privacy, on by default and obeyed at once; edited: a refused current password is reported by kind; edited: the current password tells the phone it can be filled; edited: SIGN OUT OF OTHER DEVICES under the password, asked first, said either way; edited: a new password is judged by passwordIsAccepted |
| src/generated/lucideIcons.js | 2026-10-27 | edited: Radio, for the room not live; generated by scripts/lucide-icons.js; its --check guard holds it |
| src/hooks/__tests__/aFollowThatThrowsIsSaid.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); the rooms answered, as the hook hands them; written: a follow that throws is said and rolled back |
| src/hooks/__tests__/aMemberFilePullSaysWhatItReached.test.tsx | — |  |
| src/hooks/__tests__/aNewMemberStartsUnfiltered.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); the rooms answered, as the hook hands them; written: every filter wiped for a new member |
| src/hooks/__tests__/aReadIsStoppedOnlyByWhatMakesItStale.test.tsx | 2026-10-01 | written: each read cancelled only by what makes it stale |
| src/hooks/__tests__/aRestoredNoteIsSent.test.tsx | 2026-10-27 | edited: a log draft as build 41 saved it opens whole and is sealed as written; Written 2026-10-02 (launch audit): a draft's restored private note is sealed with the record. |
| src/hooks/__tests__/aRewatchIsFiledAsOne.test.tsx | 2026-10-26 | Written 2026-10-26: a logged film opens as a rewatch and stays one; a status the member chose stays theirs. |
| src/hooks/__tests__/aRoomSaysItCouldNotBeRead.test.tsx | — |  |
| src/hooks/__tests__/aScrollIsOneTransaction.test.tsx | 2026-10-15 | new |
| src/hooks/__tests__/aSheetComesAndGoesOnce.test.tsx | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/hooks/__tests__/aSheetStaysAboveTheKeyboard.test.tsx | 2026-10-22 | edited: the mock's plain style read through unknown (Reanimated 4.3 types an animated style as a handle) |
| src/hooks/__tests__/anArrivalAlwaysArrives.test.tsx | 2026-10-22 | edited: the ratchet at its end: no mount-time entrance left |
| src/hooks/__tests__/aSlowPhoneIsKnownAtOnce.test.tsx | 2026-10-02 | Written 2026-10-02 (launch audit): a throttled phone is known on the first render. |
| src/hooks/__tests__/everyMainScreenTracesItsScroll.guard.test.ts | 2026-10-15 | new |
| src/hooks/__tests__/signingInTellsTheTruth.test.tsx | 2026-10-29 | edited: the submit plate found by the name it now says; edited: a refused form points at its field; edited: a sign-in lands where the member-only screen asked, or the Lobby;  |
| src/hooks/__tests__/theArchiveDoesNotRepeatItself.test.tsx | — |  |
| src/hooks/__tests__/theRoomDoesNotRepeatItself.test.tsx | 2026-10-01 | written: the room pages on what the server gave |
| src/hooks/__tests__/theArchivePagesOnWhatTheServerGave.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/hooks/__tests__/theCalendarReadsItsOwnYear.test.ts | — |  |
| src/hooks/__tests__/theNoteWaitsForItsViewing.test.tsx | — |  |
| src/hooks/__tests__/theSealLeavesWithTheScreen.test.tsx | 2026-10-26 | edited: the probe takes its hook in an effect, which render runs before it returns;  |
| src/hooks/__tests__/theSearchFindsWhatWasAskedFor.test.tsx | 2026-10-02 | @handles, exact first, plain excerpts, half reels, named tabs, partial note, emptied box |
| src/hooks/__tests__/theSearchKnowsWhichSourceWasDown.test.tsx | — |  |
| src/hooks/__tests__/theWelcomeIsNotLostInTheBreath.test.tsx | 2026-10-26 | edited: the probe takes its hook in an effect, never during render; Written 2026-10-02 (launch audit): the welcome survives the user being replaced inside its 600ms breath. |
| src/hooks/__tests__/useAuthFlow.validation.test.ts | 2026-10-28 | edited: refusalOf: the field each reason is about;  |
| src/hooks/__tests__/useAuthThrottle.pbt.test.ts | 2026-10-01 | the countdown keeps the rule |
| src/hooks/__tests__/useBanCheck.test.ts | 2026-10-26 | edited: the hook rendered, as every hook is called;  |
| src/hooks/__tests__/useClearance.test.ts | 2026-10-28 | edited: the rope reads an old rank again: held opens the act, unheld the page, a silent read waits 1.5 s, a fresh one nothing; new |
| src/hooks/__tests__/useEditProfile.logic.test.ts | — |  |
| src/hooks/__tests__/useFeeds.test.ts | 2026-10-01 | rewritten: drives the real hooks |
| src/hooks/__tests__/useInitiation.test.ts | — |  |
| src/hooks/__tests__/useLater.test.tsx | 2026-10-04 | written whole |
| src/hooks/__tests__/useLogFlow.payload.test.ts | — |  |
| src/hooks/__tests__/useLogFlow.telemetry.test.tsx | 2026-10-26 | edited: the probe takes its hook in an effect, never during render;  |
| src/hooks/__tests__/useLogFlow.validation.test.ts | — |  |
| src/hooks/__tests__/useOfflineAware.test.ts | — |  |
| src/hooks/__tests__/useProfileController.logic.test.ts | — |  |
| src/hooks/__tests__/useProfileData.reducer.test.ts | — |  |
| src/hooks/__tests__/useScreenReady.test.tsx | 2026-10-15 | edited: a failed read writes screen.failed; the first screen writes the runtime |
| src/hooks/useAmbientGlow.ts | 2026-10-01 |  |
| src/hooks/useArrival.ts | 2026-10-26 | edited: useIgnition: the house's ignition, certain to arrive, resting on IGNITED; edited: the easing key only when one was given |
| src/hooks/useAuthFlow.ts | 2026-10-28 | edited: refusalOf names the field a reason is about; a field's reason is kept with the form it was made against (fieldError), not toasted; edited: a sign-in lands on the member-only screen that asked, held to returnAfterSignIn, or the Lobby; edited: the link's action applied as it renders, once per action, the first included; edited: joining refuses a password too long for the lock, first |
| src/hooks/useAuthThrottle.ts | 2026-10-26 | edited: the mount read placed after evaluateLockout, which calls itself by its own name; a lifted lock keeps the rule |
| src/hooks/useBanCheck.ts | 2026-10-02 | says what it guards, and that the server guards every write |
| src/hooks/useCatalogueSearch.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/hooks/useKeyboardLift.ts | 2026-10-01 | written: a sheet over a screen rises with the keyboard |
| src/hooks/useClearance.ts | 2026-10-28 | edited: a rank read over a minute ago is read again at the rope, a second and a half at most; held now, openOr's act opens instead; edited: a third standing, reading, while the member's profile is not read; then open() asks for the profile, never the Society |
| src/hooks/useDeviceThrottling.ts | 2026-10-02 | Read whole (launch audit). Answered in an effect, after the preloader had decided on the first render; known synchronously now. A settings override no screen ever wrote removed. |
| src/hooks/useDispatchArchive.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); read whole in the Dispatch audit; comments checked true |
| src/hooks/useDoor.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); edited: the door's answer held with the member it was read for and shown in the read's then; loading is the answer not yet come; the unused refresh gone; read whole in the Dispatch audit; comments checked true |
| src/hooks/useEditProfile.ts | 2026-10-28 | edited: no errors returned: each field reads its own; edited: a portrait picked while Android ended the app reopens the crop sheet holding it; edited: every way out asks while something is unsaved (useAskBeforeLeaving), a landed save leaving freely; edited: the save checked at the press; edited: the preview follows the stored portrait when it changes; a picture just chosen is kept through any other change; a refusal for the member's standing is not reported as a fault |
| src/hooks/useFeeds.ts | 2026-10-27 | edited: each feed takes its list's return and reconnect rules (useFeedTop); one cursor rule; the fallback note gone with the fallback |
| src/hooks/useFilmAnimations.ts | 2026-10-01 | each loop only while seen |
| src/hooks/useFilmDetail.ts | 2026-10-27 | edited: read again on return once older than it stays fresh; an unread verdict is null, never silence |
| src/hooks/useFollowRequests.ts | 2026-10-26 | edited: shut, it answers for nothing: adjusted as it renders; edited: answeredFor: the door is reading while the search on screen is not the one it answered; failed + moreFailed + retry; the count never below 0; decline-all restores paging |
| src/hooks/useInitiation.ts | 2026-10-02 | Read whole (launch audit). The breath was the effect's cleanup, so a user replaced inside it lost the welcome after the flag burned; a user without created_at was decided no for good. Both closed. |
| src/hooks/useLater.ts | 2026-10-04 | written whole: a component's timer, gone with the component |
| src/hooks/useLogFlow.ts | 2026-10-26 | edited: the record's read shown in its then; a new record, the record's fill, the note and the draft taken up as the form renders; a logged film defaults to rewatch, a chosen status stays; the record filled from is state; edited: an edit reads a record the phone does not hold by its id, fills the form once per record, and hands that record to the seal and the delete; the seal refuses until it is in |
| src/hooks/useMemberRoom.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); edited: a new member or another try starts from nothing as it renders; the effect only reads; read whole in the Dispatch audit; comments checked true |
| src/hooks/useMembershipPricing.ts | 2026-10-02 | read; sound |
| src/hooks/useModalKeyboardPadding.ts | 2026-10-15 | edited: the eased height is its own hook, for a centred card's scroll |
| src/hooks/useNotableMembers.ts | 2026-10-01 | true as written |
| src/hooks/useOfflineAware.ts | 2026-10-01 | one subscription, no clock |
| src/hooks/useProfileController.ts | 2026-10-26 | edited: the three latest reads made Effect Events; edited: the route's tab taken as it renders, once per tab; the handle repair begun in the render it is decided, ended by the member arriving or the four seconds; edited: followKnown and rereadFollows; a follow is never filed before the follow list is known |
| src/hooks/useProfileData.ts | 2026-10-27 | edited: the member's file read again on return once older than a read stays fresh, silently; edited: the shown member's id written after each commit; edited: a new member starts from nothing as it renders (your own file seeded there); the archive marks set in the logs read's then; edited: tabAnswered (a room's read came back, not asked) and answeredFilters (the filters a room's rows answer), both reset for a new member; a search overtaken lands neither its rows nor its filters nor lowers the newer one's flag; each read cancelled only by what makes it stale; failures wiped with the member; comments say what is true now |
| src/hooks/useScreenReady.tsx | 2026-10-26 | edited: the first wait read in a state first value as the screen first renders; a later one stamped as its frame commits; edited: takes the read state; a failed read is screen.failed; a wait's start is screen.reading |
| src/hooks/useScrollTrace.ts | 2026-10-15 | new: a scroll is one Sentry transaction, begin to rest |
| src/hooks/useSheetPresence.ts | 2026-10-26 | edited: the latest props written after each commit; edited: a visible sheet is a drawn one from the render that opens it; the effect keeps the motion; written: five sheets' rise and fall, once |
| src/hooks/useStateSaid.ts | 2026-10-16 | new: which state a room drew, empty or failed, to the E2E log |
| src/hooks/useSecondKey.ts | 2026-10-27 | edited: a wrong second-key code is reported by kind; edited: the door read on mount shown in its read's then; another member starts at checking as it renders; check stays the retry; new: the door read from the session each time; register; give a code |
| src/hooks/__tests__/theSecondKeyIsReadAsItIs.test.tsx | 2026-10-17 | new: each refusal the hook meets, handed back as what it is |
| src/hooks/__tests__/anEditOpensOnItsOwnRecord.test.tsx | 2026-10-23 | new: an edit over a record the phone has not paged in, against the strict fake |
| src/stores/__tests__/theLedgerIsKnownWhole.test.ts | 2026-10-23 | new: the ledger against the strict fake |
| src/stores/__tests__/aCritiqueMarkIsReadBeforeItIsDrawn.test.ts | 2026-10-24 | new: the critiques' marks against the strict fake |
| src/components/log/__tests__/theDeckSaysWhatItKnows.test.tsx | 2026-10-28 | edited: the deck given its lounge clearance; new: the log deck's unknown marks |
| src/components/darkroom/__tests__/aSaveNotYetReadIsUninked.test.tsx | 2026-10-24 | new: a Darkroom poster's save while the ledger is read |
| src/hooks/useTextScale.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/hooks/useUniversalSearch.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); @handle reads usernames; the exact handle asked for and put first; plain one-line excerpts |
| src/hooks/useUpdateUser.ts | 2026-10-02 | read; sound |
| src/hooks/useVault.ts | 2026-10-01 | reload, for a Vault that could not open |
| src/hooks/useScreenSeen.ts | 2026-10-26 | edited: read from the navigator by useSyncExternalStore, as React reads any store outside it: never a frame behind; useIsFocused at home outside a navigator: seen when nothing is in front of it; changes only on focus and blur |
| src/lib/__tests__/aRankBoughtOfflineIsKept.test.ts | 2026-10-03 | payments pass: queued for the store's account, with no network and no session |
| src/lib/__tests__/aRankEndsOnlyWhenTheStoreSaysSo.test.ts | 2026-10-03 | payments pass: a stand-in store drives every answer a configured one gives |
| src/lib/__tests__/aRankIsOnlyTakenOnAnAnswer.test.ts | 2026-10-03 | payments pass: the source pins went; the paths they guarded now run |
| src/lib/__tests__/aRequestEndsInItsTime.test.ts | 2026-10-27 | edited: a request given up at its limit ends as DeadlineExceeded; edited: an answer whose words never finish arriving is given up at its limit; an answer in time comes back whole (status, headers, words), one with no body with none; new: a request with no answer is given up at its limit as not reached (storage waits longer); a caller's own cancel stays the caller's; an answer in time comes back untouched with no timer left |
| src/lib/__tests__/aRequestIsWrittenToTheE2ELog.test.ts | 2026-10-27 | edited: a request given up at its limit is written as DeadlineExceeded; edited: its fake answers are Responses, read whole as the client now reads them; new |
| src/lib/__tests__/aResolvedErrorIsRead.test.ts | 2026-10-26 | edited: signOut is no longer a call whose answer may go unread; edited: a read handed on by .catch()/.then() is seen (Promise.resolve(supabase.rpc(…)).catch(…)), in the probe too; the salon's faces read judged by its new name; the queue's standing read is no longer judged; it reads its error |
| src/lib/__tests__/revenueCat.selectPackage.test.ts | — |  |
| src/lib/__tests__/sentryMeasures.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/lib/__tests__/signingOutSilencesOnlyThisDevice.test.ts | — |  |
| src/lib/__tests__/theCounterNamesNobody.test.ts | — |  |
| src/lib/__tests__/theHouseAsksToSendWordWhenItMeansSomething.test.ts | 2026-10-01 | new |
| src/lib/__tests__/thePriceIsTheStores.test.ts | — |  |
| src/lib/__tests__/theSessionIsKeptWhole.test.ts | 2026-10-27 | edited: its storage stand-in answers the keystore's deadline; written with the session store |
| src/lib/__tests__/theTokenMustNotSurviveLogout.test.ts | — |  |
| src/lib/__tests__/tmdb.test.ts | 2026-10-27 | edited: the stand-in answers as the phone's fetch does, a Response read once per call;  |
| src/lib/__tests__/whatSentryKeeps.test.ts | 2026-10-27 | edited: the release, dist, rates and sessions; the choice saved off starts nothing, never chosen starts, flipped closes and starts again; edited: a request past its deadline is kept as the allow-list hands it on; edited: drops no network and a member's cancel, keeps a request past its deadline; edited: its files come from the shared file list (test-utils/universe.js) |
| src/lib/authSessionStorage.ts | 2026-10-27 | edited: each keystore call within the launch's deadline; edited: the first session read stamps an older build's ownerless writes |
| src/lib/gateMetricsSink.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/lib/nativeOnly/revenuecatWebStub.js | 2026-10-03 | read whole: sound |
| src/lib/pushNotifications.ts | 2026-10-02 | the foreground handler is set as the module loads; comments say what is true |
| src/lib/pushPrimer.ts | 2026-10-01 | new: the house asks to send word at a moment that wants it |
| src/lib/queryClient.ts | 2026-10-27 | edited: React Query hears the app come back to the front (focusManager on AppState); edited: the rules live in queryPolicy.ts; the header still true |
| src/lib/queryPolicy.ts | 2026-10-04 | written whole: the rules moved out of queryClient.ts, word for word, so tests read them too |
| src/lib/refusalEvents.ts | 2026-10-02 | Written in the launch audit: every refusal's sentence, for whoever listens. |
| src/lib/revenueCat.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); payments pass: the SDK is required (Jest runs every store path); a rank is queued for the account the store sold to |
| src/lib/scrollBridge.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/lib/sentry.ts | 2026-10-27 | edited: initSentry takes its release and dist, states its rates, counts sessions; testCrash (the admin's three); crashReportsShared and shareCrashReports (P4.46): off, Sentry never starts and closes at once; edited: captureAuthRefusal, one report per refused sign-in, refresh or code, tagged by kind alone; edited: markBootComplete; the SDK no longer re-exported (its two direct users listed with why); edited: every event, breadcrumb and trace through sentryScrub; the native request record off; the member not named (tier alone); edited: captureDeadline tags host and path alone; beforeSend tells a deadline from a member's cancel by its name; edited: tracesSampler keeps every scroll and screen opening, keepTransaction thins the rest; MAIN_ROUTES; startScrollSpan |
| src/lib/supabase.ts | 2026-10-27 | edited: postgrest-js's own retries turned off on the client: one layer of retries, the app's own; edited: a request past its deadline ends as the house's DeadlineExceeded, coded ABORT_ERR so postgrest-js ends the whole call; one in ten told to Sentry by host and path; edited: the house's address and public key exported, for endSession's owed sign-out; edited: Expo's fetch settles with the headers on SDK 57: the answer read whole inside the limit, handed on as a Response made from it; edited: in the E2E build, each request and how it ended written to the device log |
| src/lib/tmdb.ts | 2026-10-28 | edited: the catalogue's search asks for a bounded phrase; edited: the catalogue's reads within the house's deadline; a deadline hit is not tried again; read; sound |
| src/lib/tmdbErrors.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/lore/fragments.ts | 2026-10-02 | Read whole in the launch audit: the false 'Ledger is encrypted' line replaced. |
| src/providers/__tests__/androidTracking.test.ts | — |  |
| src/providers/__tests__/theMissingSettingsAreNamed.test.ts | 2026-10-02 | Written in the launch audit: the missing-settings message, one line each. |
| src/providers/androidTracking.ts | 2026-10-24 | edited: a nested Text scales as its parent does, so its spacing is corrected as the parent grows |
| src/providers/AppBootstrapper.tsx | 2026-10-27 | edited: the boot tag through sentry.ts (markBootComplete); edited: the member's own row, their rank, read again on return once older than a read stays fresh; edited: an owed sign-out settled each time the network returns, whoever is signed in; edited: launch asks for the marks ledger beside the follow list |
| src/providers/FilmDetailProvider.tsx | 2026-10-23 | edited: marksUnknown and rereadMarks |
| src/schemas/__tests__/aFeedRowWithANullIsStillDrawn.test.ts | 2026-10-01 | written with the null-status fix |
| src/schemas/__tests__/schemas.test.ts | — |  |
| src/schemas/feed.schema.ts | 2026-10-01 | film id strict; a null status is watched |
| src/schemas/film.schema.ts | 2026-10-01 | the unused DomainLog mirror gone; no invented date or author |
| src/schemas/profile.schema.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/schemas/settings.ts | 2026-10-02 | read; sound |
| src/schemas/user.ts | 2026-10-03 | entitlement_source, read for the member alone |
| src/services/__tests__/aBuildNamesOnlyWhatProductionHas.release-test.ts | 2026-10-15 | true as written |
| src/services/__tests__/aMemberTakesBackOnlyTheirOwnStackCritique.test.ts | 2026-09-30 | written with the stack critique delete |
| src/services/__tests__/aMissingLogIsAnAnswer.test.tsx | 2026-10-01 | written: a missing log is null; a nameless author is never unknown |
| src/services/__tests__/aQueryAsksOnlyForWhatExists.test.ts | 2026-10-28 | edited: a query may name a table a pending migration makes; edited: the snapshot's reader comes from test-utils/schema, its one home |
| src/services/__tests__/aReportIsFiledThroughOneDoor.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/services/__tests__/aShelfEntryIsOnlyAddedTo.test.ts | 2026-10-03 | written whole: the shelf as a table that holds its rows; old replay payloads take nothing away |
| src/services/__tests__/aVisitorReadsWhatTheAppAsksFor.contract.test.ts | 2026-10-25 | edited: asks through houseFetch, Node's own fetch; read whole: sound; edited: given an address, an unreachable one fails |
| src/services/__tests__/aYearIsReadToTheLast.test.ts | 2026-10-01 | written: a year is read to the last row |
| src/services/__tests__/certifyCountAuthority.test.ts | 2026-10-03 | read whole: the migration loses its SQL (--) comments, not JS ones |
| src/services/__tests__/clientNames.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/services/__tests__/everyNameAClientCallsExists.test.ts | 2026-10-15 | edited: the app may name what a pending migration makes; the website never |
| src/services/__tests__/FeedService.test.ts | 2026-10-01 | cursor note made true |
| src/services/__tests__/getFilmVerdict.test.ts | 2026-10-03 | read whole: sound |
| src/services/__tests__/loungeEmbeds.contract.test.ts | 2026-10-25 | edited: asks through houseFetch, Node's own fetch; edited: the Dispatch's saved page joins it; the app's embeds, not the Lounge's alone; the salon's page checked as the store asks for it (MESSAGE_COLUMNS, its reactions embedded); read whole: sound (the FK names; columns are the query guard's); edited: given an address, an unreachable one fails; only 200 or 401 is an answer |
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
| src/services/__tests__/theTribunalReadsTheWholeRecord.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; read whole: sound |
| src/services/__tests__/theVaultHasOneDoor.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/services/__tests__/tmdbProxyAllowsEveryPath.test.ts | 2026-10-03 | read whole: sound |
| src/services/__tests__/VaultService.test.ts | 2026-10-03 | read whole: sound |
| src/services/__tests__/yearInCinema.test.ts | 2026-10-03 | read whole: sound |
| src/services/AuthService.ts | 2026-10-01 | true as written |
| src/services/FeedService.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); the cursor note made true: RPC arguments |
| src/services/FilmService.ts | 2026-10-01 | a failed verdict read is thrown; histories to the present |
| src/services/FollowRequestService.ts | 2026-10-02 | a failed read throws; a failed count is null; @ stripped |
| src/services/InteractionService.ts | 2026-10-03 | read whole: endorse_log / endorse_list only; the dead film/review kinds removed |
| src/services/logCounts.ts | 2026-10-01 | true as written |
| src/services/LogService.ts | 2026-10-01 | a missing log is null; histories to the present |
| src/services/LoungeService.ts | 2026-10-01 | true as written |
| src/services/MemberDiscoveryService.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/services/ModerationService.ts | 2026-10-02 | read; sound |
| src/services/ProfileDataService.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); Read whole in the launch audit: fetchHighestRated added; the rest sound. |
| src/services/ProfileWriteService.ts | 2026-10-02 | the circle's cursors through pgLiteral |
| src/services/ShelfService.ts | 2026-10-03 | written whole: a shelf filing adds formats, never rewrites the entry |
| src/services/StackService.ts | 2026-10-27 | edited: getStackItemsPage, a stack's films past the first page in its own order; STACK_ITEMS_LIMIT exported; edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); Read whole (launch audit). The sheet read the newest 50 critiques with the true count beside them and no way to the rest: getStackComments takes a limit (ordered by id too), and the sheet asks for earlier ones. |
| src/services/VaultService.ts | 2026-10-02 | Read whole (launch audit). Claimed to be the only door to the notes while the import wrote the table itself: restoreNotes added and used; the claim narrowed to writes (the export reads); theVaultHasOneDoor guards it. |
| src/services/YearInCinemaService.ts | 2026-10-01 | every page of a year, not the first 1,000 |
| src/services/__tests__/aCountNotReadIsNotZero.test.ts | 2026-10-01 | written with the counts fix |
| src/stores/__tests__/aBlockListLeavesWithItsMember.test.ts | 2026-10-02 | sign-out erases the saved block list |
| src/stores/__tests__/aRoomHoldsOnlyItsOwnWords.test.ts | 2026-10-27 | edited: a room read again that could not be keeps its words and says nothing over them; a room holds only its own words; the salons' and the room's flags apart; a page with its reactions in one request, the page above too; the salons in two waves (P0.112) |
| src/stores/__tests__/aFailedLoadKeepsWhoYouFollow.test.ts | 2026-09-29 | follow-list wipe fixed; comments read |
| src/stores/__tests__/aFailedReadIsSaid.test.ts | 2026-10-01 | written: a failed read is answered as failed |
| src/stores/__tests__/aFailedSettingStaysUndone.test.ts | 2026-09-29 | new |
| src/stores/__tests__/aFollowLandsOnlyForItsMember.test.ts | 2026-10-15 | new: a follow or unfollow answered after a sign-out or a switch writes, saves and queues nothing |
| src/stores/__tests__/aFollowMadeOfflineIsKept.test.ts | — |  |
| src/stores/__tests__/aMarkReadThatFailedIsHeard.test.ts | 2026-10-23 | edited: the kind whose read failed stays unknown, not "off"; written with the marks fix |
| src/stores/__tests__/aNoticeIsNarrowedToItsOwner.test.ts | 2026-10-03 | edited: a notice type the house sends |
| src/stores/__tests__/aProfileChangeIsNeverDropped.test.ts | — |  |
| src/stores/__tests__/aReactionIsOneOfFive.test.ts | 2026-10-03 | read whole: the five against the CHECK in the snapshot |
| src/stores/__tests__/aRefusedWriteIsNotSuccess.test.ts | — |  |
| src/stores/__tests__/aResetThatFailedIsHeard.test.ts | 2026-10-27 | edited: expects the fixed report line, its values after it (P4.44); Written 2026-10-02 (launch audit): a failed sign-out reset reaches the logger in production. |
| src/stores/__tests__/aSalonChannelFollowsTheSalon.test.ts | 2026-10-15 | new |
| src/stores/__tests__/aSalonKeepsItsCoverAndItsDoor.test.ts | 2026-10-01 | written: the corridor reads covers; a rank refusal is a door |
| src/stores/__tests__/aSeatReadsAsTheHouseWillRead.test.ts | 2026-10-23 | edited: the salons' flag by its own name; written whole: a seat taken or given up is drawn as the next read gives it |
| src/stores/__tests__/aSessionEndedElsewhereKeepsTheirWork.test.ts | 2026-10-27 | edited: its storage stand-in answers the keystore's deadline; written: a sign-out from elsewhere keeps the queue and drafts for their member alone |
| src/stores/__tests__/aStackIsSavedWhole.test.ts | — |  |
| src/stores/__tests__/auth.test.ts | 2026-10-15 | edited: the queue mock carries the hold and the release; storage lists its keys |
| src/stores/__tests__/blockEnforcement.test.ts | — |  |
| src/stores/__tests__/blockStore.pbt.test.ts | — |  |
| src/stores/__tests__/dispatchActs.test.ts | — |  |
| src/stores/__tests__/dispatchCritiquePaging.test.ts | — |  |
| src/stores/__tests__/dispatchGuards.test.ts | 2026-10-23 | edited: the marks are not waited for: the filing comes at once, its marks unknown until their read answers; Shortened; a test added for the essay's cover. |
| src/stores/__tests__/dispatchReads.test.ts | — |  |
| src/stores/__tests__/dispatchRefusals.test.ts | — |  |
| src/stores/__tests__/dispatchWrites.test.ts | — |  |
| src/stores/__tests__/encryptionAtRest.guard.test.ts | 2026-10-27 | edited: four paths raise the flag, each one that opened an encrypted store; edited: a queued write is never skipped; held in memory while the store is not encrypted; edited: every persisted store wherever it lives, from the shared file list |
| src/stores/__tests__/everyPersistedStoreWaitsForTheKey.guard.test.ts | 2026-10-15 | edited: every persisted store wherever it lives, from the shared file list |
| src/stores/__tests__/films.test.ts | — |  |
| src/stores/__tests__/followGraph.wiring.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/stores/__tests__/interactionSlice.test.ts | 2026-10-03 | read whole: a certification made before the answer survives |
| src/stores/__tests__/logoutBeatsTheRollback.test.ts | — |  |
| src/stores/__tests__/logoutClearsEveryModuleCache.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/stores/__tests__/logoutLeavesNoTrace.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/stores/__tests__/logSlice.test.ts | — |  |
| src/stores/__tests__/lounge.test.ts | — |  |
| src/stores/__tests__/loungeActs.test.ts | 2026-10-23 | edited: the room's flag by its own name; a stale line count dropped |
| src/stores/__tests__/loungeErrors.guard.test.ts | 2026-10-23 | edited: the seats asked in the first wave still throw; reactions come in the page, no read of their own; read whole: reads source through readCode; no regex stripper |
| src/stores/__tests__/markCounts.test.ts | — |  |
| src/stores/__tests__/notificationCap.test.ts | — |  |
| src/stores/__tests__/reportStore.pbt.test.ts | — |  |
| src/stores/__tests__/socialSlice.hydrationReconcile.test.ts | — |  |
| src/stores/__tests__/socialSlice.unfollow.test.ts | — |  |
| src/stores/__tests__/staleWriteGuard.test.ts | 2026-10-15 | edited: a store that registers a reset, wherever it lives, read as code |
| src/stores/__tests__/telemetryGating.test.ts | 2026-10-27 | edited: expects the fixed report line, its values after it (P4.44);  |
| src/stores/__tests__/theBoardSaysWhenItCouldNotBeRead.test.tsx | — |  |
| src/stores/__tests__/theCursorCarriesATiebreaker.test.ts | — |  |
| src/stores/__tests__/theFollowListIsReadOnce.test.ts | 2026-10-08 | written: one read per member; a read that outlived its member writes nothing |
| src/stores/__tests__/theFollowListSaysWhetherItIsKnown.test.ts | 2026-10-23 | the follow list unread, held once read (of nobody too), failed when its read fails and was never held, held through a later failure, unread again at sign-out (P0.112) |
| src/stores/__tests__/theHouseSaysWhy.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/stores/__tests__/theLiveWireKnowsTheRoom.test.ts | — |  |
| src/stores/__tests__/theLogSaysWhatHappened.test.ts | — |  |
| src/stores/__tests__/theNoticesSayWhatTheyCouldNotReach.test.tsx | 2026-10-23 | edited: its navigation mock stands on the one base (test-utils/navigationMock); first page ordered by time then id; older page failure said; rows say who, what, when |
| src/stores/__tests__/theRoomYouAreActuallyIn.test.ts | — |  |
| src/stores/__tests__/theSalonListIsWholeOrSaysSo.test.ts | 2026-10-23 | edited: the salons' flag by its own name; written with the salon-list fix |
| src/stores/__tests__/theSalonNameIsNotCutInSilence.test.ts | 2026-10-03 | read whole: the column's ceiling read from the snapshot |
| src/stores/__tests__/theStoreOpensOnEveryLaunch.test.ts | 2026-10-01 | written with the 16-byte key fix |
| src/stores/__tests__/theThrottleIsPerRoom.test.ts | — |  |
| src/stores/__tests__/theWallHearsWhatChanged.test.ts | 2026-10-03 | new: every write that can change a hanging piece asks for the wall again |
| src/stores/__tests__/vaultStore.test.ts | — |  |
| src/stores/__tests__/watchlistSlice.test.ts | 2026-10-03 | edited: the header names what the file tests |
| src/stores/__tests__/aProfileIsReadBeforeItIsSettings.test.ts | 2026-10-23 | profileRead tells a read profile from the auth user alone; rereadProfile lays a read on the member, says a failure, and lands nothing for a member gone (P0.112) |
| src/stores/__tests__/theBlocksAreReadAtSignIn.test.ts | 2026-10-23 | a sign-in reads the member's blocks: known, and a block a block; a failed read leaves them unknown; sign-out makes them unknown (P0.112) |
| src/stores/auth.ts | 2026-10-28 | edited: rankAge, how long ago the signed-in member's rank was read from the house; edited: a refused sign-in (not a network failure) is reported by kind; edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); edited: the edits and preferences not yet sent are read by readPendingProfile and readPendingPrefs, each named and exported; edited: every sign-out through endSessionHere: the abandoned reset and logout; logout owes the push token's row when step 7 failed; edited: a sign-in asks for the marks ledger, lazily (the film store is never loaded with the session) |
| src/stores/authEvents.ts | 2026-10-27 | edited: a session ended without the member's hand is reported as a refused refresh; written: the auth listener's answers, out of the component |
| src/stores/blockStore.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); edited: blocksKnown: the lists the member's, from a saved copy or a read; cleared at sign-out; sign-out erases the leaving member's saved list |
| src/stores/createSelectors.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/stores/discover.ts | 2026-10-27 | edited: names its version and migration (savedVersion.ts); Read whole (launch audit). Its comment said the Darkroom's results survive a restart; the films found are not persisted, only the mood, filters and search. |
| src/stores/dispatch.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); edited: a filing, amend, ending or critique is offline only when the queue kept it; else put back and thrown; edited: critiqueMarksKnown, the critiques whose certification the house answered (and one filed here); unknown is never not certified |
| src/stores/dispatchTypes.ts | 2026-10-02 | Read whole (launch audit): row shapes match the live schema (body NOT NULL DEFAULT '', so an ended filing parses). Sound; left alone. |
| src/stores/domain/__tests__/aFilmAlreadyQueuedStaysQueued.test.ts | 2026-10-02 | a film already on the watchlist stays, and is said to be |
| src/stores/domain/__tests__/aLogsWordsAreCleanedEverywhere.test.ts | 2026-10-03 | edited: its hidden characters built from code points |
| src/stores/domain/__tests__/aShelfIsNeverHeldHostage.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/stores/domain/__tests__/aStackLosesOneFilmInOneWrite.test.ts | 2026-10-02 | a stack loses one film in one write |
| src/stores/domain/__tests__/cursorPagination.test.ts | — |  |
| src/stores/domain/__tests__/logOperations.pure.test.ts | — |  |
| src/stores/domain/__tests__/logReconciliation.test.ts | 2026-10-03 | rewritten whole: drives overlayQueuedLogs and oneOfEachLog |
| src/stores/domain/__tests__/theDiaryPagesWithoutGaps.test.ts | 2026-10-02 | the log list orders as its cursor reads |
| src/stores/domain/archiveSlice.ts | 2026-10-27 | edited: saved offline only when the queue kept it; else put back; edited: a shelf write that throws is checked for its member before it queues or undoes |
| src/stores/domain/helpers/promiseMutex.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/stores/domain/helpers/sessionGuard.ts | 2026-10-01 | true as written |
| src/stores/domain/interactionSlice.ts | 2026-10-03 | read whole: a certification made before the answer is kept (index and list) |
| src/stores/domain/listSlice.ts | 2026-10-27 | edited: saved offline only when the queue kept it; else put back; edited: a stack's posters fetched ahead through prefetchPictures, to the disk cache; a stack write that throws is checked for its member before it queues or undoes |
| src/stores/domain/logSlice.ts | 2026-10-23 | edited: marksKnown and _ledger |
| src/stores/domain/logSlice/helpers/logOperations.ts | 2026-10-27 | edited: a log, amend or removal is offline only when the queue kept it; else thrown as it came; edited: heldLog never hands over a light record; a page laid over the ledger; each log write counted as a write of marks; QueuedWrite exported |
| src/stores/domain/marksDisk.ts | 2026-10-23 | new: the ledger as the phone keeps it, light, and read back |
| src/stores/domain/marksLedger.ts | 2026-10-23 | new: every log and save read whole, the queue and the pages laid over, read again once a write overlapped, failed never none |
| src/stores/domain/marksWrites.ts | 2026-10-23 | new: each write of marks counted |
| src/stores/domain/socialSlice.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); edited: its log lines say what happened without the member's handle; edited: a follow or unfollow saved offline only when the queue kept it; else undone; edited: the follow list held once read whole; a failed read of a list never held marks it failed; follow and unfollow write, save and queue only for the member who asked |
| src/stores/domain/watchlistSlice.ts | 2026-10-23 | edited: a page read laid over the ledger, never in its place; add and remove by the index, so a film saved before the pages comes off; each counted as a write of marks |
| src/stores/films.ts | 2026-10-27 | edited: names its version and migration (savedVersion.ts); edited: the marks ledger kept light once held, and read back as held at launch, beside the records kept |
| src/stores/followStore.ts | 2026-10-23 | edited: followingKnown: held, unread or failed; the phone's copy of a read is held; sign-out makes it unread; comments cut to the why |
| src/stores/lounge.ts | 2026-10-28 | edited: a held message's retry: sent, it leaves the queue; with no connection, it waits to be sent; edited: a message or withdrawal saved offline only when the queue kept it; edited: the room's channel watcher written as one expression, so the stale-write guard reads subscribeToLounge whole; edited: every read of an open room again is a catch-up merged into what is held (catchUpMessages); its channel heard by watchChannel (roomLive); edited: loungesRead: the salons answered once since sign-in; the salons' read and the room's keep their own flags; another room's words go when a room opens, a failed read is said by the room; a page and its reactions in one request (MESSAGE_COLUMNS, messagesOf), the page above with them too, ordered as the cursor; the salons read in two waves, not five; a salon read or send answered after its member left writes and queues nothing |
| src/stores/markCounts.ts | 2026-10-02 | read; sound |
| src/stores/mmkv-storage.ts | 2026-10-27 | edited: the encrypted mark kept in the boot store (bootStore.ts); edited: a mark in a store of its own that the member's store was encrypted here; a launch with the mark and no key clears the store, never recrypts it, begins a fresh one and says so (storeKeyWasLost, STORE_KEY_LOST_NOTICE); edited: KEYSTORE_DEADLINE_MS (measured, its run beside it), withinKeystoreDeadline, KeystoreSilent, keystoreWasSilent and the member's notice; the placeholder's queue and drafts carried into the encrypted store, the placeholder emptied (adoptThePlaceholder); storageReady added; opens with the 16 bytes recrypt took |
| src/stores/notificationStore.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); edited: names its version and migration (savedVersion.ts); edited: the notices' channel heard by watchChannel: read again after a drop, not live past a beat (noticesLive); edited: the notices channel joined privately; the notices heard live are counted |
| src/stores/offlineQueueStore.ts | 2026-10-28 | edited: useHeld and stillHeld, the writes held for their member; Read whole (launch audit). Sound; left alone. |
| src/stores/reportStore.ts | 2026-10-27 | edited: a report saved offline only when the queue kept it; else not filed, and not tried again; edited: a report answered after its reporter left is not kept, queued or blocked as the next member |
| src/stores/resetAllStores.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); Read whole (launch audit). Failures were counted only in development: reported through logger.warn now. |
| src/stores/settings.ts | 2026-10-27 | edited: names its version and migration (savedVersion.ts); Read whole (launch audit). Sound; left alone. |
| src/stores/socialStore.ts | 2026-10-01 | the header says where the store lives |
| src/stores/tellMarks.ts | 2026-10-01 | true as written |
| src/stores/vaultStore.ts | 2026-10-27 | edited: names its version and migration (savedVersion.ts); edited: the note is cleaned by its own cap on the live save |
| src/test-support/swallowedTypeError.ts | 2026-10-03 | read whole: sound |
| src/theme/__tests__/aGlowFadesInsideItsBox.guard.test.ts | 2026-10-15 | written: no radial glow keeps strength on an edge of its box that can show; the welcome seal no longer kept |
| src/theme/__tests__/aGradientIsNeverABitmap.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/theme/__tests__/aPhotographIsNotLit.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/theme/__tests__/aTextGlowHasRoom.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/theme/__tests__/aFlatSurfaceCastsNothing.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/theme/__tests__/everyStyleIsRead.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/theme/__tests__/lightFloor.test.ts | — |  |
| src/theme/__tests__/nothingOvershoots.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/theme/__tests__/theGroundLadder.test.ts | 2026-10-24 | edited: the drawn eye's file left the art list with the file |
| src/theme/__tests__/theLightIsReadable.test.ts | 2026-10-08 | written: every light gradient read back through React Native's own parser |
| src/theme/__tests__/theRoomIsLit.test.ts | 2026-10-28 | edited: the floor's frame is not a room; the app's frame is drawn inside FloorGate; edited: its files come from the shared file list (test-utils/universe.js) |
| src/theme/__tests__/theTextBoxGrowsWithItsText.test.ts | 2026-10-26 | edited: the two scale hooks rendered, not called bare; edited: its files come from the shared file list (test-utils/universe.js) |
| src/theme/__tests__/theTypeFloor.test.ts | 2026-10-22 | edited: no settled exemption; the profile's marks named; a size written as an attribute read; its floor test titled literally, so a proof can name it |
| src/theme/__tests__/theVeilMeetsTheLight.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/theme/__tests__/wordsAreNotMarks.test.ts | 2026-10-29 | edited: the stack tile's own star left the list: the tile draws the house's PosterMark now; edited: its files come from the shared file list (test-utils/universe.js) |
| src/theme/__tests__/wordsAreSolid.test.ts | 2026-10-27 | edited: the house mark of a poster there is none of is a named mark; edited: a style a <Text> wears is read as text though it sets no type; no dimmed-control exception left |
| src/theme/authStyles.ts | 2026-10-30 | edited: the forgot link stands 1 below the field, so it grows to 48 and meets SHOW; edited: the sign-in fields' ledger line in the ink that reads, full brass while focused; comments short and true |
| src/theme/brass.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/theme/faceAdvances.ts | 2026-10-03 | edited: the soft hyphen's key written as an escape |
| src/theme/light.ts | 2026-10-25 | edited: flatPaper composites a card's paper, the edge's face and the wash into one opaque gradient; seenAt draws a view's opacity into its colour |
| src/theme/motion.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/theme/stamp.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/theme/theme.ts | 2026-10-29 | edited: fieldEdge: a field's ledger line, 3.5:1 on the raised card and more on ink; Read whole (launch audit). Dead tokens removed: typography, physics (springBouncy broke the no-bounce law), three metrics, three effects; type.caption 8.5 and type.badge 7.5 sat under the 10pt floor unused. theTypeFloor now reads the live scale. |
| src/types/film.types.ts | 2026-10-23 | edited: light, the ledger's record |
| src/types/index.ts | 2026-10-02 | Read whole (launch audit). ui.types (UIState: a paywall and handbook modal that do not exist) removed from the barrel and deleted. |
| src/types/moderation.ts | 2026-10-02 | Read whole (launch audit): content types match reports_content_type_check. BlockType, BlockRecordSchema and ActionMetaSchema were used nowhere: removed. |
| src/types/mutations.ts | 2026-10-15 | edited: the ownership notes say the owner decides the session, not user_id |
| src/types/profile.types.ts | 2026-10-02 | Read (launch audit). Sound; left alone. |
| src/types/social.types.ts | 2026-10-03 | LoungeMember.created_at named a column that does not exist; it is joined_at |
| src/types/tmdb.types.ts | 2026-10-02 | Read whole (launch audit). TMDBReview was used nowhere: removed. |
| src/utils/__tests__/aCharacterIsNeverCut.test.ts | 2026-10-16 | edited: a capital past Georgian's letters, and Georgian's first and last |
| src/utils/__tests__/aCutWordIsSeen.test.ts | 2026-10-17 | new |
| src/utils/__tests__/aDateIsSaidInTheHouseVoice.test.ts | 2026-10-16 | new |
| src/utils/__tests__/addOnly.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/aDraftIsKeptOffAnOpenDisk.test.ts | 2026-10-02 | Written in the launch audit: drafts stay off an unencrypted disk. |
| src/utils/__tests__/aFailedToolSaysWhy.guard.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aFailureOfAnyShapeIsReadAndTold.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aFieldIsCleanedAndCappedToTheLetter.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aHandleIsJudgedByItsWords.test.ts | 2026-10-02 | Written in the launch audit: the handle filter judged by words, one rule in apps and database. |
| src/utils/__tests__/aHiddenControlIsHiddenWhole.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/airplaneModeIsAndroidsAlone.guard.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aJoinerIsKeptOnlyWhereItJoins.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aLetterIsTakenWhole.guard.test.ts | 2026-10-28 | edited: the spoken call to action moved to PurchaseDock; TryAgain's own words allowed; edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/aLogsHistoryKeepsEveryViewingOnce.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aMemberBackSoonIsBackWhereTheyWere.test.ts | 2026-10-01 | new |
| src/utils/__tests__/aMembersWordsAreCleaned.test.ts | 2026-10-03 | the profile excuses went with the INSERT grant that made those columns writable (20261003_07) |
| src/utils/__tests__/anAbsenceIsAnchored.guard.test.ts | 2026-10-16 | new: no test only finds absences on a screen it never shows drawn; each shape found or not as it should be |
| src/utils/__tests__/anAddressIsToldFromAHandle.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aNarrowedWriteMustSeeItsRefusal.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/anExcerptNeverEndsInHalfAnEmoji.test.ts | — |  |
| src/utils/__tests__/animationConfigsAreLiterals.guard.test.ts | 2026-10-15 | new |
| src/utils/__tests__/anOlderBuildsDossierStillLands.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aQueuedFilingIsCutToEachColumn.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aQueuedFollowFindsItsMember.test.ts | 2026-10-27 | edited: the line is said without the handle; edited: the rank sync's request through the shared fetch, here the test's own; new |
| src/utils/__tests__/aQueuedLogIsFiledAsTheMemberWroteIt.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aQueuedStackIsSavedAsTheMemberLeftIt.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aQueueSendsOnlyItsOwnMembersWrites.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aRankIsReadOneWay.test.ts | 2026-10-27 | edited: expects the fixed report line, its values after it (P4.44); new |
| src/utils/__tests__/aRankRefusalIsOnlyARanksRefusal.test.ts | 2026-10-16 | new: tierRefusal asked directly: each rank's sentence under 42501 is its door; a privacy refusal, the sentence without 42501, a cut or wrapped one, and no words are never a rank's |
| src/utils/__tests__/aRefusalForStandingIsKnownByItsWords.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aReviewIsCleanedOfItsMarkup.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aReviewIsCutAtAWord.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aReviewReadsInItsOwnDirection.test.ts | 2026-10-16 | new |
| src/utils/__tests__/aSecondPressWaitsOutTheDebounce.guard.test.ts | 2026-10-28 | edited: the retry's two presses now name their counts, so none is judged; new: no test presses a control again inside its debounce, but those judged; each shape found or not as it should be |
| src/utils/__tests__/aStoreActIsStoodInForThroughItsStore.guard.test.ts | 2026-10-21 | new: no test spies on a store act through the state it reads |
| src/utils/__tests__/aTestNeverShipsAsAScreen.guard.test.ts | 2026-10-16 | new: every test file under app/ is one Metro leaves out of the bundle, and no route file is |
| src/utils/__tests__/e2eRuntime.test.ts | 2026-10-15 | new: the runtime written once a launch by the E2E build alone, in lines the run can join |
| src/utils/__tests__/everyCheckRuns.guard.test.ts | 2026-10-16 | edited: every script file is run by a workflow, a hook, an npm script, another script or a test, or named as run by hand with why; every store build runs the preflight before it asks EAS |
| src/utils/__tests__/everyDoorLeadsToARoute.guard.test.ts | 2026-10-27 | edited: the sign-in landing named: returnAfterSignIn decides it; new |
| src/utils/__tests__/everyEventIsAwaited.guard.test.ts | 2026-10-16 | new: no test leaves a fireEvent, act or renderHook unwaited; each unwaited shape is found, each waited one is not; the fix makes the test async and leaves a helper to a hand |
| src/utils/__tests__/everyQueuedWriteHasItsKind.test.ts | 2026-10-27 | edited: every mark has its noun, and only marks; written: every enqueue call site's type has its kind in the map; its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/everySecretIsInventoried.test.ts | 2026-10-16 | new: every secret and setting the code reads is in register/secrets.json, with its holders and a secret's rotation; nothing listed that no code reads but the dashboard-held ones; never a value |
| src/utils/__tests__/fixtures/animationConfigs.fixture.ts | 2026-10-15 | new |
| src/utils/__tests__/fixtures/imageCache.fixture.tsx | 2026-10-15 | new: the shapes the guard refuses and passes |
| src/utils/__tests__/appConfig.guard.test.ts | 2026-10-27 | edited: the blocked permissions, the picker's microphone off, and each purpose string pinned (P4.25); edited: LAB=1 adds extra.lab beside E2E=1 and nothing alone; only the speed lab sets it; the root mounts the record behind it; the workflows that build with E2E=1 are those app.config.js names; the project, update feed, store ids and Sentry project as the services hold them; the maps written and their upload left on |
| src/utils/__tests__/aReplayThatCannotReadKeepsItsWrite.test.ts | — |  |
| src/utils/__tests__/aSuspendedMembersWritesWait.test.ts | 2026-10-27 | edited: expects the fixed report line, its values after it (P4.44); edited: a write refused for a suspension waits, the standing read failed or the suspension begun mid-send; a silenced one is given up |
| src/utils/__tests__/aWithdrawnFilingKeepsNothing.test.ts | — |  |
| src/utils/__tests__/boundedCounts.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/calendarDates.test.ts | — |  |
| src/utils/__tests__/ciAlert.behaviour.test.ts | — |  |
| src/utils/__tests__/ciWorkflows.guard.test.ts | 2026-10-22 | edited: every apt install waits for the lock a try cut short leaves, and reads only Ubuntu's own sources first; the speed lab named as run by hand, with why; every workflow watched and started by hand; no E2E run cancelled by a later push; a scheduled install has its limit and one retry of that step alone; the advisers run on every push in their count-only mode; the push judges the phone's packages, the nightly the website's and the functions' too; an E2E group shared across commits counts as cancelling; its files come from the shared file list (test-utils/universe.js); every action a scheduled workflow uses is judged, one that downloads is an install, and the emulator's packages are installed before it; jest and the captures run in parts that their read-together jobs count alike, and jest in every zone of test-timezones.js; no job runs one command twice; every Gradle run finds its Android packages installed and downloads none; every Android install asks the disk; a TMDB miss fails the E2E run; the other zones leave the tooling's tests out; production is asked by the nightly contracts alone; the cache actions judged; the night's rounds, random order and history held; every gate runs on a push to main or on a schedule, or is named with why; a step let fail is a download tried once more by the step after it |
| src/utils/__tests__/csv.test.ts | — |  |
| src/utils/__tests__/dispatchExecutors.test.ts | — |  |
| src/utils/__tests__/dispatchFieldCaps.test.ts | 2026-09-28 | Claimed to reconcile every live ceiling but read three old migrations, so subject_backdrop_ceiling had no cap. Reads the live snapshot now, and fails on any ceiling without an app cap or a stated reason. |
| src/utils/__tests__/dispatchMutationRegistry.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/dispatchOfflineParity.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/dossierPublishing.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/easUpload.guard.test.ts | 2026-10-15 | new |
| src/utils/__tests__/expoImagePatch.guard.test.ts | 2026-10-29 | edited: every patch held to one standard (named for the installed version, applied on install, LF, shipped with EAS, comes off cleanly); query-string's decodes with the fixed decoder; new: the patch comes off the installed copy, one version three ways, LF, in the EAS upload |
| src/utils/__tests__/e2eTrace.test.ts | 2026-09-29 | new |
| src/utils/__tests__/edgeFunctions.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/endorsementGrouping.test.ts | — |  |
| src/utils/__tests__/everyBackHasAWayOut.guard.test.ts | 2026-10-22 | read whole: every back through nav.back() or behind canGoBack(); its files come from the shared file list; the cold-link check moved to theLobbyIsTheTabsHome.test.tsx, which renders it |
| src/utils/__tests__/everyCapAnswersToItsColumn.test.ts | 2026-10-03 | read whole: every new cap answers to its column or says why it is smaller |
| src/utils/__tests__/everyChannelIsPrivate.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/everyClassIsAccountedFor.test.ts | 2026-10-15 | new |
| src/utils/__tests__/everyMutantIsSound.guard.test.ts | 2026-10-22 | edited: a two-document flow parses; a broken document of it does not; new |
| src/utils/__tests__/everyControlHasAName.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/everyFileSurvivedTheShell.guard.test.ts | 2026-10-15 | edited: everything a person edits, from the shared file list: flows, workflows and both supabase/ trees included |
| src/utils/__tests__/everyMemberKeyHasAnEraser.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/everyPullSaysWhatItReached.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/everyRouteHasItsOwnNet.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/feedInvalidation.guard.test.ts | — |  |
| src/utils/__tests__/frozenCounts.guard.test.ts | 2026-10-16 | edited: the hand-made mocks and the guards reached only through callers are app checks, and their finders count what is planted for them |
| src/utils/__tests__/filterContentByBlocks.pbt.test.ts | — |  |
| src/utils/__tests__/handleGuard.test.ts | 2026-10-03 | edited: the vectors written as escapes |
| src/utils/__tests__/handleGuard.wiring.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/handleHistory.test.ts | — |  |
| src/utils/__tests__/handleHistory.wiring.guard.test.ts | — |  |
| src/utils/__tests__/handleNotice.reader.guard.test.ts | — |  |
| src/utils/__tests__/handleNotice.test.ts | — |  |
| src/utils/__tests__/hooks.guard.test.ts | 2026-10-16 | edited: Stryker's sandbox left out like the worktrees; a mutant in place refused; the paths in batches that fit |
| src/utils/__tests__/html.test.ts | — |  |
| src/utils/__tests__/everyPictureStatesItsCache.guard.test.ts | 2026-10-27 | edited: counts RemoteImage and AssetImage, memory-disk by Picture's own default, which it reads and holds; edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/imagePrefetchSites.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/inputTrustBoundary.test.ts | 2026-10-03 | edited: a pasted separator stays a break; hidden test characters written as escapes |
| src/utils/__tests__/keysetCursor.test.ts | 2026-10-16 | edited: a missing primary or id is built empty |
| src/utils/__tests__/logger.test.ts | 2026-10-27 | edited: a server error is reported as its line and code, never its message;  |
| src/utils/__tests__/logScreenPolish.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/lucideIconsAreBundled.guard.test.ts | — |  |
| src/utils/__tests__/maestroFlows.guard.test.ts | 2026-10-16 | edited: a flow's steps include those inside an inline runFlow |
| src/utils/__tests__/mappers.test.ts | — |  |
| src/utils/__tests__/markdownSafety.test.ts | — |  |
| src/utils/__tests__/memoryManager.test.ts | — |  |
| src/utils/__tests__/migrationSafety.guard.test.ts | 2026-10-22 | read whole: its pieces named, the train among them; the train builds an index first, alone, drops and rebuilds one not whole, and touches production only once its four workflows passed on its files; a shipped client's flows wait as long as this checkout's |
| src/utils/__tests__/mutationExecutor.pbt.test.ts | 2026-10-03 | read whole: the remappable keys match the executor |
| src/utils/__tests__/mutationExecutor.test.ts | 2026-10-27 | edited: the rank sync's request through the shared fetch, here the test's own; payments pass: a failed rank sync carries its status |
| src/utils/__tests__/networkError.test.ts | — |  |
| src/utils/__tests__/noControlCharacters.guard.test.ts | 2026-10-15 | edited: every text file a person writes, from the shared file list |
| src/utils/__tests__/noMachinePaths.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/noPageAddsToTheInset.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/notificationColumns.guard.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/offlineIsSaidOneWay.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/offlineQueue.integration.test.ts | 2026-10-27 | edited: the cap's title says marks; edited: its house answers the standing read every send makes |
| src/utils/__tests__/offlineQueue.test.ts | 2026-10-15 | edited: a queued write carries its member |
| src/utils/__tests__/profileCountsCache.test.ts | — |  |
| src/utils/__tests__/profileCountsCache.wiring.guard.test.ts | — |  |
| src/utils/__tests__/profileMappers.test.ts | — |  |
| src/utils/__tests__/prefetchPictures.test.ts | 2026-10-15 | new: Android to disk only; iOS skips what is on disk |
| src/utils/__tests__/prose-handlers.guard.test.ts | — |  |
| src/utils/__tests__/queryClient.test.ts | 2026-10-27 | edited: a whale's 3 MB cache over a saved one leaves nothing, and the next start reads afresh; edited: a cache saved by another build or update is never painted; the root hands its mark to the provider; edited: React Query hears the app leave and return; edited: the exact freshness, keeping and retry waits; a retry made after the connection left fails, never pauses |
| src/utils/__tests__/queueErrorClassification.test.ts | — |  |
| src/utils/__tests__/raceDeadline.test.ts | 2026-10-04 | written whole |
| src/utils/__tests__/recommendations.test.ts | — |  |
| src/utils/__tests__/rehearsalsRunInCi.guard.test.ts | 2026-10-22 | read whole: no row picked by a helper's call itself, said no to on a planted case and held for every rehearsal; the rules said no to first; the kit, the seed and CI's order |
| src/utils/__tests__/releaseGuard.guard.test.ts | 2026-10-24 | edited: Android's sitemap link opened closed, iOS's closed or handed to the app running in that one shape |
| src/utils/__tests__/requestReview.test.ts | — |  |
| src/utils/__tests__/resumeSaysWhereTheWorkStands.test.ts | 2026-10-16 | new: the next class is the one that matters most, a journal keeps what was written in it, every worktree finds the same journals, the next train is the pending migrations |
| src/utils/__tests__/revenuecatWebhookDecide.test.ts | 2026-10-25 | edited: AbortSignal.timeout stood in for, as Deno has it (the test setup no longer takes it away); the store is asked at the address the settings name, always with a time limit, and gives up before the app does |
| src/utils/__tests__/roomFilters.test.ts | 2026-10-01 | written: one answer to is-this-room-narrowed |
| src/utils/__tests__/runtimeDump.contract.test.ts | 2026-10-15 | edited: runtimeNames read from its file (coverage-safe); says NO past global and declare global |
| src/utils/__tests__/runtimeLacks.guard.test.ts | 2026-10-25 | edited: on SDK 57 the phone has AbortSignal.timeout and any: the finder says NO to AbortSignal.abort and Object.groupBy, the list's own entries now; new: no line uses an API the phone lacks; jest takes away exactly the list |
| src/utils/__tests__/sanitisationCallSites.test.ts | 2026-10-15 | edited: the report is sent by the member signed in, as the sheet sends it |
| src/utils/__tests__/sanitizeInput.test.ts | — |  |
| src/utils/__tests__/schemaSnapshot.guard.test.ts | — |  |
| src/utils/__tests__/searchFieldsDoNotAutocorrect.guard.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/searchPattern.test.ts | — |  |
| src/utils/__tests__/searchWiring.guard.test.ts | 2026-10-27 | edited: expects the fixed report line, its values after it (P4.44); edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/secondKey.test.ts | 2026-10-17 | new: the door's stages and a code's digits |
| src/utils/__tests__/stackFilmCount.test.ts | — |  |
| src/utils/__tests__/strykerFilesAreListed.guard.test.ts | 2026-10-16 | new |
| src/utils/__tests__/theCharacterRuleHoldsForEveryShortString.test.ts | 2026-10-16 | new |
| src/utils/__tests__/theCharacterRuleIsUnicodes.test.ts | 2026-10-16 | edited: the search stops at twenty disagreements |
| src/utils/__tests__/theDatabaseCleansAsTheAppDoes.test.ts | 2026-10-03 | Written with 20261003_05: the corpus holds every character the cleaning acts on, with cleanForStorage's answer. |
| src/utils/__tests__/theLobbyIsTheTabsHome.test.tsx | 2026-10-22 | new: the real tabs in their order, rendered through expo-router; a cold link, then every other tab, then Back |
| src/utils/__tests__/theLineEndsChangeNoFunction.guard.test.ts | 2026-10-16 | new: read against the snapshot's 144 bodies (96 with CRLF, one JSON literal holding it) and up-down-up.mjs's comparison |
| src/utils/__tests__/theDeadLetterIsNobodyElsesToKeep.test.ts | 2026-10-15 | edited: another member's held and failed writes stay at this one's sign-out |
| src/utils/__tests__/theDraftIsYours.test.ts | — |  |
| src/utils/__tests__/theFrontDeskAnswers.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/theFunnelHasOneSeam.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/theQueueAtEveryTurn.test.ts | 2026-10-27 | edited: expects the fixed report line, its values after it (P4.44); edited: a full queue lets marks go, never a critique or a log; with no mark, queues over the cap; new |
| src/utils/__tests__/theQueueAtLaunch.test.ts | 2026-10-16 | new |
| src/utils/__tests__/theRecordingsTravel.test.ts | — |  |
| src/utils/__tests__/theSendAsksWhoIsSendingFirst.test.ts | 2026-10-16 | new |
| src/utils/__tests__/theSocietyOpensOverYou.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/theStandingIsReadAgainWhenRefused.test.ts | 2026-10-16 | new |
| src/utils/__tests__/theStoreIsReadToTheLetter.test.ts | 2026-10-16 | new |
| src/utils/__tests__/theTappedNoticeOpensIt.test.ts | 2026-10-03 | read whole: reads source through readCode; no regex stripper |
| src/utils/__tests__/theWallHearsEachReplayThatMovesAPiece.test.ts | 2026-10-16 | new |
| src/utils/__tests__/tier.test.ts | — |  |
| src/utils/__tests__/tier.warning.test.ts | 2026-10-27 | edited: expects the fixed report line, its values after it (P4.44);  |
| src/utils/__tests__/validateUsername.test.ts | — |  |
| src/utils/__tests__/validateWithTelemetry.test.ts | 2026-10-27 | edited: expects the fixed report line, its values after it (P4.44);  |
| src/utils/__tests__/websiteFreeze.guard.test.ts | 2026-10-15 | new |
| src/utils/__tests__/whatTheQueueKeepsAndForHowLong.test.ts | 2026-10-16 | new |
| src/utils/__tests__/whatThisPhoneHoldsIsSaid.test.ts | 2026-10-16 | new: keptOnThisPhone's words asked directly: nothing said of nothing, 'it' of one and 'all of them' of more, uncounted drafts said so, kinds named at the return |
| src/utils/__tests__/withAbortSignal.test.ts | — |  |
| src/utils/__tests__/withRetry.test.ts | — |  |
| src/utils/__tests__/withTimeout.test.ts | 2026-10-25 | edited: AbortSignal.timeout taken away by the test itself, as build 41's phone lacked it (the SDK 57 phone has it); the timeout case names withTimeout's own timer |
| src/utils/AppError.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/utils/csv.ts | 2026-10-02 | read; sound |
| src/utils/cutText.ts | 2026-10-17 | new: whether a Text's laid-out lines lost its words, ran out of its box or were clipped by it |
| src/utils/deviceRegion.ts | 2026-10-01 | new |
| src/utils/draftSync.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); read whole in the Dispatch audit; comments checked true |
| src/utils/e2eRuntime.ts | 2026-10-15 | new: the phone's runtime written once a launch, in parts, by the E2E build |
| src/utils/e2eTrace.ts | 2026-10-22 | edited: LAB_BUILD, the speed lab's builds alone; e2eTraceAt, where a view sits on screen, in the E2E build alone |
| src/utils/endorsementGroupKey.ts | 2026-10-02 | Read whole (launch audit). A certified-log group opened the FILM, on the belief that no log page existed (app/log/[id] does), and went nowhere without a film id: it opens the log. |
| src/utils/enter.ts | 2026-10-02 | read; sound |
| src/utils/filterContentByBlocks.ts | 2026-10-01 | true as written |
| src/utils/gateTelemetry.ts | 2026-10-23 | edited: a gate event's standing is the rope's own type (a rank being read is never recorded) |
| src/utils/graphemeTable.ts | 2026-10-04 | regenerated: names its Unicode version |
| src/utils/groupNotifications.ts | 2026-10-02 | history comments trimmed |
| src/utils/handleGuard.ts | 2026-10-02 | Read whole (launch audit). Still rejects both joiners in a handle (the full class). Sound. |
| src/utils/handleHistory.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/handleNotice.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/housePages.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/html.ts | 2026-10-01 | ticket numbers out of the header |
| src/utils/keptOnThisPhone.ts | 2026-10-15 | written: what the phone holds for a member, and the words for it |
| src/utils/keysetCursor.ts | 2026-10-02 | quotes escaped with a backslash, as PostgREST reads them (measured 2026-10-02) |
| src/utils/lastTab.ts | 2026-10-22 | edited: TABS_HOME, the Lobby as the tab navigator's first tab and its Back |
| src/utils/linking.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); edited: a link the device cannot open is logged without the link; Read whole (launch audit). Sound; left alone. |
| src/utils/logger.ts | 2026-10-27 | edited: a line forwarded as its leading message and a server error's code alone, never the values after it; Read whole (launch audit). Sound; left alone. |
| src/utils/mappers.ts | 2026-10-02 | dead mappers removed (dossier, lounge message, watchlist, archive) |
| src/utils/markdownSafety.ts | 2026-10-01 | read whole in the Dispatch audit; comments checked true |
| src/utils/memberDrafts.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); edited: a draft that could not be adopted is logged without its key; edited: a stack is a kind of draft; edited: countDrafts; drafts are erased only at the member's own sign-out |
| src/utils/memoryManager.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/mutationExecutor.ts | 2026-10-27 | edited: a follow that finds no member is logged without the handle; edited: the rank sync within the house's deadline; edited: an empty place in a queued history is dropped, not sorted (it threw); a log's decade and genres and a Lounge message's username, columns neither table has, are never written; a rewatch's conflict reads the log's id alone |
| src/utils/networkError.ts | 2026-10-27 | edited: a deadline is not reached, thrown by its name or resolved by its message; Read whole (launch audit). Sound; left alone. |
| src/utils/noticeRoute.ts | 2026-10-02 | Read whole (launch audit). Follows groupRoute's one argument. |
| src/utils/offlineQueue.ts | 2026-10-28 | edited: a salon message refused for the rank is held for its member, never resent or aged out; letHeldGo, sendHeldAgain; edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); edited: enqueueMutation answers whether the write was kept, and tells the member when the phone had no room (NOT_KEPT); edited: a full queue lets only its oldest marks go, named; never words or records; every list through writeList; edited: a write refused for a suspension waits with the rest (the standing read failed, or the suspension began mid-send); the standing read's error is read (its catch could never run); at sign-out another member's writes stay wherever they are |
| src/utils/openNoticeFromPush.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/openSociety.ts | 2026-10-02 | Read whole (launch audit). URLSearchParams.set is implemented in RN 0.81's polyfill (checked). Sound. |
| src/utils/prefetchPictures.ts | 2026-10-15 | new: the one caller of expo-image's prefetch |
| src/utils/profileCountsCache.ts | 2026-10-02 | read; sound |
| src/utils/queueOwnership.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); edited: a list that could not be read or written is logged without its key (a member's id); edited: writeQueue answers whether it kept the queue; NOT_KEPT; edited: in memory alone while the store is not encrypted (queueKeys, readList, writeList, writeQueue); MARK_NOUN and marksLetGo; held writes through writeList; written: the typed kind map, the owner-keyed hold and release, the older build's stamp |
| src/utils/raceDeadline.ts | 2026-10-04 | written whole: the one deadline race; its timer cleared when the race is decided |
| src/utils/recommendations.ts | 2026-10-01 | the shelf's own name |
| src/utils/reelToast.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/refusedForStanding.ts | 2026-10-16 | new: the server's two refusals for standing, and which ends; imports nothing, so the queue and the standing reader both ask it |
| src/utils/requestReview.ts | 2026-10-01 | never more than 3 in any 365 days, as it claimed |
| src/utils/roomFilters.ts | 2026-10-01 | new |
| src/utils/sanitizeInput.ts | 2026-10-03 | read whole: U+2028/U+2029 kept as the breaks they are, not stripped |
| src/utils/secondKey.ts | 2026-10-17 | new: where the door stands; a code's digits; a secret in fours |
| src/utils/searchPattern.ts | 2026-10-28 | edited: boundedSearch, a search cut to SEARCH_MAX where a character ends; the pattern and the room's filter both take it; read whole in the Dispatch audit; comments checked true |
| src/utils/softBreak.ts | 2026-10-04 | edited: one place asked per character, the flag count stopping at the run’s start; a joint breaks only between characters |
| src/utils/standing.ts | 2026-10-16 | edited: its two sentences come from refusedForStanding |
| src/utils/svgId.ts | 2026-10-03 | new: the one paint id (the Lobby’s and the room light’s) |
| src/utils/TactileEngine.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/__tests__/everyDoorGoesThroughNav.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| src/utils/__tests__/secretsScan.guard.test.ts | 2026-10-15 | new |
| src/utils/authSignals.ts | 2026-10-01 | written: the sign-in rules every door reads alike |
| src/utils/text.ts | 2026-10-28 | edited: spokenExcerpt: the writing a card shows, said as sentences; edited: the &amp; entry the decoder never read is gone |
| src/utils/tier.ts | 2026-10-27 | edited: an unknown rank is reported as a fixed line, the value after it; edited: no rank is read once, the free rank's spellings by the switch |
| src/utils/tierDoor.ts | 2026-10-01 | the server sentence as a door |
| src/utils/tierRefusal.ts | 2026-10-01 | by the sentence, not the code |
| src/utils/timeAgo.ts | 2026-10-27 | edited: timeAgo, timeUntil and localCalendarDate take the instant they measure to, which a drawn label has from the shared clock; edited: toParts answers the parts alone (the kind was never read); a minute's two equal phrasings are one |
| src/utils/toastBus.ts | 2026-10-28 | edited: a toast that asks for a response is held while a screen reader is on (held, readerChanged), Android keeps the member's time to take action (startClock), dismissToast; a toast stays long enough to read |
| src/utils/typedRouter.ts | 2026-10-02 | read; sound |
| src/utils/validateUsername.ts | 2026-10-02 | Read whole (launch audit). The profanity patterns refuse film names (moby_dick, philipkdick): listed for the owner, a policy call. |
| src/utils/validateWithTelemetry.ts | 2026-10-27 | edited: a fixed line and typed counts; no sample of what failed (a message can echo a value); docs cut to what the types do not say |
| src/utils/withAbortSignal.ts | 2026-10-02 | Read whole (launch audit). Sound; left alone. |
| src/utils/withRetry.ts | 2026-10-02 | read; sound |
| src/utils/withTimeout.ts | 2026-10-27 | edited: its report lines are fixed text, the values after them, kept on the phone (P4.44); edited: its own timer, since Hermes has no AbortSignal.timeout |
| stryker.config.mjs | 2026-10-16 | new: one listed file at a time, against its own tests alone, every mutant run fresh, its progress printed |
| supabase/diagnostics/apply.cjs | 2026-10-15 | rewritten: lints first, runs under the time limits, --no-transaction for a CONCURRENTLY file alone; the address from the private settings file |
| supabase/diagnostics/read-only.cjs | 2026-10-15 | true as written |
| supabase/diagnostics/rehearse.cjs | 2026-10-15 | new |
| supabase/diagnostics/train.cjs | 2026-10-22 | edited: each index built CONCURRENTLY first, alone, outside any transaction; one left not whole dropped and built once more; probed by its rehearsal of its name before any rehearsal; CI passed on these exact database files first (MUST_PASS, read with gh) |
| supabase/functions/fetch-rss/index.ts | 2026-10-16 | edited: the limit holds until the body is read; the house named as it is; the per-address count bounded; the stand-in's address can be named by the settings |
| supabase/functions/notify-push/index.ts | 2026-10-16 | edited: Expo's address can be named by the settings; each chunk sent within a time limit; a prune that failed is said, not counted |
| supabase/functions/_shared/storeRecord.ts | 2026-10-16 | edited: the store's address can be named by the settings (RevenueCat's own by default); its whole answer read within a time limit |
| supabase/functions/revenuecat-webhook/decide.ts | 2026-10-03 | rewritten: an event names whom to read again (both sides of a transfer), never what they hold |
| supabase/functions/revenuecat-webhook/index.ts | 2026-10-16 | edited: the store's address from the settings |
| supabase/functions/sync-entitlement/index.ts | 2026-10-16 | edited: the store's address from the settings |
| test-utils/__tests__/aFileEndsWithNoTimerWaiting.test.ts | 2026-10-16 | edited: the worktrees inside this checkout are left out of its own jest run; edited: only the timers Node starts are left out |
| test-utils/__tests__/aSweepAsksTheUniverse.test.ts | 2026-10-16 | edited: the mutant runner's judge logs and parts, and the registry guard's question to git, named with why |
| test-utils/__tests__/everyCommentIsTrue.test.ts | — |  |
| test-utils/__tests__/everySourceReaderIsLedgered.test.ts | 2026-10-15 | edited: every test in mobile/, from the shared file list |
| test-utils/__tests__/everyTestClientKeepsTheHouseRules.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| test-utils/__tests__/oneCommentStripper.test.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| test-utils/__tests__/readCode.test.ts | 2026-10-03 | read whole: adds the generic-arrow case TSX misreads |
| test-utils/__tests__/theFakeIsAsStrictAsTheHouse.test.ts | 2026-10-23 | edited: embeds: a key that joins nothing or two, a column the embedded table lacks, refused; one row or a list from what it holds; an or() on a table the test answers; an empty body's answer |
| test-utils/__tests__/theUniverseNamesEveryFile.test.ts | 2026-10-16 | new: every file is in a universe or named as unread; every supabase/ file has a kind; the routes are what expo-router loads, and what else its pattern takes is a test, which Metro leaves out |
| test-utils/__tests__/theUniverseSeesANewFolder.test.ts | 2026-10-15 | new: a file planted in a new folder is seen by each universe; the migration checks refuse SQL no rule names |
| test-utils/__tests__/timerFixtures/leavesATimer.fixture.ts | 2026-10-04 | written whole |
| test-utils/__tests__/timerFixtures/leavesATimerAfterFakeOnes.fixture.ts | 2026-10-04 | written whole |
| test-utils/__tests__/timerFixtures/leavesNothing.fixture.ts | 2026-10-04 | written whole |
| test-utils/asOnThePhone.ts | 2026-10-15 | new: takes away in jest what the phone lacks |
| test-utils/bottomEdge.ts | 2026-10-15 | new: where a drawn page puts its foot |
| test-utils/__tests__/aContractAsksTheServer.test.ts | 2026-10-25 | new: a contract's request reaches the server: houseFetch fails at a closed port, which the global (Expo's, stubbed) answers with no status |
| test-utils/contractEnv.ts | 2026-10-25 | edited: houseFetch: Node's own fetch, which reaches the server; the global one is Expo's, stubbed under jest; read whole: sound; "all 5,000 tests" is every unit test; edited: the address comes from CONTRACT_SUPABASE_* alone, never the app's .env; each connection closes with its answer |
| test-utils/react-native-testing-library.js | 2026-10-04 | edited: every render's client is testQueryClient(); the comment says what that keeps |
| test-utils/readCode.ts | 2026-10-03 | read whole: re-exports the one stripper (stripComments.js) |
| test-utils/runtimeLacks.ts | 2026-10-15 | edited: its files come from the shared file list (test-utils/universe.js) |
| test-utils/schema.ts | 2026-10-28 | edited: PENDING_SQL, every migration production has not had yet; edited: readForeignKeys: the keys PostgREST embeds by; new: production's tables, columns with their types, views and functions, read from the snapshot: the one reader for the query check and the fake |
| test-utils/SOURCE-READING-TESTS.md | 2026-10-23 | edited: theNavigationMockHasOneBase listed; every test in mobile/ is ledgered; the readers in __tests__/, e2e/ and plugins/, listed |
| test-utils/stripComments.js | 2026-10-03 | written whole: the one comment stripper, shared by tests and node tools |
| test-utils/supabaseFake.ts | 2026-10-28 | edited: knows the tables a pending migration makes; whose session the phone holds; edited: whose session the phone holds (auth.getSession), refused unless the test says; edited: an or() filter's text is recorded for a test that answers the table itself; edited: embeds resolved by their keys as PostgREST does (PGRST200/201 thrown), answered from what the test holds; or()/contains() taken on a table the test answers, as its header said; silent, an answer with an empty body (no data and no error), as postgrest-js reads one |
| test-utils/testQueryClient.ts | 2026-10-04 | written whole: the one client a test builds — the app's rules, no collection timer, errors heard |
| test-utils/timerCheckingEnvironment.js | 2026-10-25 | edited: keeps Node's own fetch for the contracts before the setup replaces the global with Expo's; written whole: the environment that fails a file ending with a timer still waiting; edited: timers Node starts for itself (startedByNode) are not counted |
| test-utils/topEdge.ts | 2026-10-15 | new: where a drawn page puts its top |
| test-utils/universe.js | 2026-10-27 | edited: a local native module's config files named as read by autolinking, not swept; new: the one list of the files each sweep reads, the route closure, and what each supabase/ file is; the scripts a flow runs (flowScripts) |
| types/react-test-renderer.d.ts | 2026-09-29 | history reduced to the reason |
| plugins/__tests__/withHouseDialogs.test.ts | 2026-10-22 | written: on a real styles.xml and colors.xml, the dialog theme and accents set beside what the app theme had |
| plugins/withHouseDialogs.js | 2026-10-22 | written: Android's own dialogs in the house's card, parchment and brass; read against AppCompat's AlertDialog theme attributes |
| src/utils/__tests__/aCountSaysItsWord.guard.test.ts | 2026-10-27 | edited: expects the fixed report line, its values after it (P4.44); written: every count before a plural word goes through counted() or is listed with why it is never one |
| src/utils/__tests__/anItalicIsTheHouseItalic.guard.test.ts | 2026-10-22 | written: no slant asked of a face; the italic faces the theme names are the ones loaded before the first screen |
| src/utils/counted.ts | 2026-10-22 | written: the Dispatch's counter, moved for the whole app with its note |
| src/theme/unready.ts | 2026-10-23 | edited: UNINKED, the outline before the ink, for every mark not yet read |
| src/theme/__tests__/anUnreadyControlIsHollow.guard.test.ts | 2026-10-22 | edited: reads whole style objects across lines; a state style that recolours is refused too |
| src/utils/countryName.ts | 2026-10-22 | written: a country's name from its code; the house's own list (Hermes has no region names), the code where it has none |
| src/utils/__tests__/countryName.test.ts | 2026-10-22 | written: in a sentence and as a label; an unknown code said as it came; every TMDB region named |
| src/utils/__tests__/theMountOrderGuardIsInstalled.guard.test.ts | 2026-10-22 | written: Android writes a frame's opacity and transform straight to the view (the removal side, E2E 39763329848); the installed Reanimated keeps only mounted views and does not throw on one being made; the manifest is past the SDK pin |
| e2e/load/train-locks.mjs | 2026-10-22 | written: the pending train run as production runs it on 100,000 members: each index built alone first, each rehearsal, each file applied; every lock timed by a second connection and every statement by psql; a blocking lock on a member's relation held over a second fails; each run's three slowest statements named (P0.6) |
| e2e/__tests__/trainLocks.test.ts | 2026-10-22 | written: on saved samples, a lock timed first sight to last, blamed on the statement that took it; which holds fail; each statement timed from psql's own output |
| scripts/heartbeat.mjs | 2026-10-22 | written: a scheduled workflow checks in with a Sentry cron monitor; without its address, a warning that lets the checks run; the address never printed (P0.38) |
| src/utils/__tests__/heartbeatsAreKept.test.ts | 2026-10-22 | written: every scheduled workflow has its heartbeat on its own schedule, checking in only when the schedule fired; the check-in's refusals |
| scripts/batch-report.cjs | 2026-10-22 | written: a batch's report from the register, a line to answer for every class closed by a process; never written over (P0.58) |
| src/utils/__tests__/theBatchReportIsAnswered.test.ts | 2026-10-22 | written: the report's lines, only those classes; the latest here leaves no answer empty |
| e2e/lab/arm.mjs | 2026-10-30 | edited: RPs takes PressableScale's style line as it now reads (a weighted control's grown outer box); edited: the no-posters arm hands the stack card's picture no address, as Picture has it; edited: Xc, the React Compiler on, timed against the app as it is; edited: Jt times the client's read of each whole answer, where fetchWithinLimit now reads it; edited: the Reel's cards part by part, in two runs of four; the Dispatch's posts part by part (Ea, Eb, Er, Es, E0: P named the spotlight's arms already); the salon's own opening (Lc, Lr, Lp, Lb, Ls0), the Lobby arms gone with the Lobby that waits to be seen; the lit edge by part (Kx, Kg, K0); the card's paper painted natively (Cb) and as the face's own background (Cn); the boot's background reads begun later (Bd), after a profiled build (Pr) found release Hermes has no sampling profiler; the query cache never written (Qp) or never read back (Qr); React's own render times written by the profiling renderer (Rf); the thread's held stretches, each answer's body read and each slow parse written (Jt), and so timed with the boot's parts begun later (JBr, JBt, JBd, JBa); both timings (RJ), with every pressable plain (RPs) or the post's icons gone (RPi); a stack's page by part (Sv, Sd, Sk, Sp) |
| e2e/lab/proofs.mjs | 2026-10-22 | written: each scene's shots judged: still, present against no light, main against SVG within the study's bar; a signed luma grid against none (P0.103) |
| e2e/lab/analyze.mjs | 2026-10-22 | written: the timed starts per build; each against A by a permutation test, called at Holm's p under 0.01; the A/A pair must call nothing; the log read by cold-start.mjs (P0.104) |
| e2e/lab/lab.sh | 2026-10-22 | written: one emulator boot, settled; the shots in two rounds of opposite order; the timed starts, each measured by one shell call; a trace per timed build (P0.104) |
| ../.github/workflows/speed-lab.yml | 2026-10-25 | edited: the iOS shots' simulator named by e2e/ios-simulator.sh; edited: scroll_arms defaults to none, A alone; the iOS job on macos-26 with Xcode 26.6 named, as the iPhone launch check; the salon among the arms' screens |
| .maestro/lifecycle/time_moved_on.yaml | 2026-10-27 | edited: the profile tab waits for what only a loaded profile carries before it reads LATELY; new: a day passes with the app in the background: TODAY becomes YESTERDAY in LATELY, the member still signed in (P4.7) |
| e2e/__tests__/speedLab.test.ts | 2026-10-25 | edited: names by default, in each input, only arms that exist (a dispatch given an empty input takes the default); the seed's counts as the seed now fills them |
| e2e/db/lab-seed.mjs | 2026-10-25 | edited: the member's first log holds 60 critiques, each a few sentences long: the page shows twelve, then SHOW MORE, and twelve of a line each were three screen heights, the scroll judge's edge |
| e2e/lab/scrolls.mjs | 2026-10-25 | edited: afterDataOf, each screen's time from its last answer to its ready, shown beside the budget, not judged; memOf, the App Summary's graphics and whole share in MB, two more measures a build is called on; costs() reads the arms' screen from arms/screen.txt, by its own ready mark; UNMEASURED: the JS lines shown, not judged, and why (Android timers fire on the UI frame); the Reel table without them; budgetOf: each busy screen held to e2e/lab/budget.json against the control; jsLongSplitOf at the scroll mark; the slow-UI count; the control exempt from three heights; rankDiff (ranks decide p: the lab's values tie); jsLongOf, the frame record's long JavaScript tasks; costs(): the Reel per build and arm against A (opened, frames, p50, p90; not the janky share, 100% on the lab's GPU), Holm; each screen's scroll judged: moved on each of the first five swipes (three screen heights) or failed by name; Android's own frame counts, this runner's, never a phone's (P0.104) |
| e2e/lab/scrolls.sh | 2026-10-25 | edited: the salon as the arms' screen, read upward as the screens part reads it; a stack as the arms' screen |
| e2e/lab/sign-in.yaml | 2026-10-22 | written: the seeded member signed in once from a cleared app, by the flows' own subflow |
| e2e/__tests__/iosFlows.test.ts | 2026-10-24 | edited: the iOS sitemap link handed to the app running |
| e2e/no-keyboard.sh | 2026-10-22 | moved whole from run-flows.sh: the phone with no keyboard apps, no input method and no autofill, sourced by run-flows.sh and the speed lab's scrolls.sh; a keyboard left stops the run |
| .maestro/subflows/open_link_on_ios.yaml | 2026-10-22 | written: iOS's own "Open in ...?" before a link opens the app, answered as a member does; nothing if it never came |
| app/(modals)/__tests__/theCoverIsTheHostsToChoose.test.tsx | 2026-10-27 | edited: signed out, asked in; signed in as host, the picker drawn; Written 2026-10-27: the cover picker drawn for the host alone; anyone else, or a salon not known, told plainly (P4.4) |
| app/__tests__/aNewPasswordSaysWhichField.test.tsx | 2026-10-28 | new: setting a new password: a refusal under its field, said with it, focused; mended, gone |
| scripts/kept-debs.sh | 2026-10-22 | new: the kept packages by dpkg alone, those installed left, its exit tells the caller to let apt fetch |
| scripts/__tests__/keptDebs.test.ts | 2026-10-22 | new: run against stand-in dpkg tools |
| src/components/lobby/__tests__/theBillsArePrintedOnPaper.guard.test.ts | 2026-10-22 | new: no parchment ground in the Lobby; the three bills on the paper token |
| src/components/layout/LabFrameLog.tsx | 2026-10-23 | edited: its js counts late animation frames, which on Android are the UI thread's late frames; the lab's frame record: long JavaScript tasks, the UI thread's slow frames, per page, in the lab's builds alone |
| src/components/layout/__tests__/labFrameLog.test.tsx | 2026-10-22 | new: a task long only past a frame and 50 ms, a frame slow past 25 ms, a quiet second unsaid, each page counted from its start |
| test-utils/expoRouterMock.ts | 2026-10-22 | new: expo-router as every test meets it, the base of every mock of it |
| test-utils/__tests__/theRouterMockHasOneBase.guard.test.ts | 2026-10-22 | new: every mock of expo-router spreads the base or the real module; jest.setup.ts uses the base |
| test-utils/__tests__/theNavigationMockHasOneBase.guard.test.ts | 2026-10-23 | every mock of @react-navigation/native spreads the one base or the real module; jest.setup.ts uses it |
| test-utils/navigationMock.ts | 2026-10-23 | @react-navigation/native as every test meets it: the real module, focus answered outside a navigator; the one base every mock spreads |
| e2e/no-error-dialogs.sh | 2026-10-23 | new: Android's error dialogs hidden and closed, for the flows and the lab alike |
| mockups/tools/touch-weights.cjs | 2026-10-29 | new: every control site with its label as written and its touch weight, read with the TypeScript parser; writes mockups/touch-weighted.txt |
| plugins/__tests__/theStoreIsNeverBackedUp.test.ts | 2026-10-27 | Written 2026-10-27: the backup rules expo-secure-store ships, and this app keeping them: the store is in no backup (P4.14) |
| src/components/FieldError.tsx | 2026-10-28 | new: what is wrong with a field, drawn under it and said with it; focusField sends the keyboard and a screen reader there; useFieldRefusal keeps a refusal with the form it was made against |
| src/components/HouseBlur.tsx | 2026-10-28 | new: the house's one frosted glass, solid ink while Reduce Transparency is on |
| src/components/MembersOnly.tsx | 2026-10-29 | edited: a control too small for a finger, or in a row too short for its reach, is given room to 48 (DECISIONS 4 tier B); edited: the way in and Close share ACTS_GAP, each reaching half of it; new: a member-only screen opened signed out says so, offers the way in carrying where it was, and a sign-in returns there (returnAfterSignIn: three shapes, else the Lobby) |
| src/components/Picture.tsx | 2026-10-27 | new: the one place a picture is drawn: RemoteImage (a missing or failed picture draws its fallback in its own box; offline failures tried once more online, a 404 never), AssetImage (bundled art), PosterMark (the house mark for no poster) |
| src/components/PleaseUpdate.tsx | 2026-10-28 | new: please update and nothing else, and FloorGate, the root behind the floor; laid out from the overlay top and the home indicator edge; edited: new: please update and nothing else, laid out from the overlay top and the home indicator edge; its one act the store page; new: 'please update' and nothing else; its one act the app's page in the store |
| src/components/TmdbCredit.tsx | 2026-10-27 | new: TMDB's required credit, its short wordmark as published (path from assets/images/tmdb-short.svg) and its notice (P4.47) |
| src/components/__tests__/PressableScale.touch.test.tsx | 2026-10-30 | edited: room one way grows that way only and drops the halo there; its logo says what it shows; edited: room one way grows that way only, and drops the halo there alone; new: the weight's sum (sized, measured, at the floor, a ground kept inner) and the axes it may not grow on |
| src/components/__tests__/aPictureThatCannotBeHadLeavesNoHole.test.tsx | 2026-10-27 | Written 2026-10-27: no address and a failed load draw the same fallback; offline, tried once more online and no more; a 404 never; a new address tried afresh; a card told of the failure (P4.10) |
| src/components/__tests__/aRetrySaysTryAgain.test.tsx | 2026-10-28 | new: a retry is named by the words it shows, first |
| src/components/__tests__/aSlipThatCostsHasItsRoom.test.ts | 2026-10-29 | new: a control named for a step a slip on costs carries its weight, and the weighted list is the code's |
| src/components/__tests__/aStrangerIsAskedInAndBroughtBack.test.tsx | 2026-10-27 | Written 2026-10-27: a sign-in lands on the member-only screen that asked and nowhere a link could choose; the door carries where it was (P4.19) |
| src/components/__tests__/aToastWaitsForItsAnswer.test.tsx | 2026-10-28 | new: a toast that asks for a response is not a race: held for a screen reader, gone when answered, Android's time to take action |
| src/components/__tests__/everyBlurFollowsTheSetting.guard.test.tsx | 2026-10-28 | new: every blur drawn through HouseBlur; the glass frosted, solid and frosted again as the setting changes |
| src/components/__tests__/everyDragHasATap.guard.test.ts | 2026-10-27 | Written 2026-10-27: the register: every hold-drag and pan has a visible single tap that does the same, a new one fails until added (P4.36) |
| src/components/__tests__/theFieldSaysWhatIsWrong.test.tsx | 2026-10-29 | new: FieldError, focusField and useFieldRefusal held to their word on their own |
| src/components/feed/__tests__/aReelCardKeepsItsTime.test.tsx | 2026-10-27 | Written 2026-10-27: a Reel card drawn MOMENTS AGO says a day, back in the app a day later with the same rows (P4.7) |
| src/components/feed/__tests__/aReviewIsHeard.test.tsx | 2026-10-28 | new: the writing a card shows is the writing a screen reader hears; the veil is reached first |
| src/components/layout/UnderSheet.tsx | 2026-10-29 | new: a page with a sheet that is not a Modal drawn over it, out of a screen reader's reach while it is |
| src/components/layout/__tests__/aPageUnderASheetIsUnspoken.test.tsx | 2026-10-29 | new: UnderSheet hides the page on both platforms while open, and gives it back closed |
| src/components/lounge/__tests__/aSalonCountsItsMembers.test.tsx | 2026-10-28 | new: the card and the door say 0, 1 and 51 members alone, never a limit |
| src/components/lounge/__tests__/speakingIsTheArchivists.test.tsx | 2026-10-28 | new: a free, a lapsed and an Archivist member in the room; held words stay failed after a remount |
| src/utils/__tests__/aReadIsKeyedOnWhoNotTheObject.guard.test.ts | 2026-10-29 | edited: the report handler's listed line names refuse; edited: the stack's share handler judged with its rope; new: every hook keyed on the auth user object judged no read; a new one fails |
| src/utils/profileRead.ts | 2026-10-23 | whether the member's profile has been read: its own columns on the user, never the auth user alone |
| src/components/lounge/__tests__/theRoomIsAskedForOnce.test.tsx | 2026-10-23 | edited: the store as it now is: the room open, its own flags; new: the room and roster asked once while the session settles, again for another member |
| src/components/person/__tests__/theObscurityWord.test.tsx | 2026-10-28 | new: the word a film's obscurity is shown as, and said as |
| src/components/text/__tests__/aPileOfMarksIsKeptToFour.test.tsx | 2026-10-28 | new: Arabic, Hebrew, Vietnamese and Thai drawn exactly as written; a pile of thirty kept to four |
| src/components/text/__tests__/boldTextIsFollowed.test.tsx | 2026-10-28 | new: every face named; off, on at once, each heavier face as it loads, off again |
| src/components/text/__tests__/moreContrastIsFollowed.test.tsx | 2026-10-29 | new: Increase Contrast is followed: each quiet ink a step brighter, a dimmed word at full strength, and back as written when it is off |
| src/components/text/__tests__/theTextSizeChangesLive.test.tsx | 2026-10-29 | new: the text size changed with the app open is followed at once, and back |
| src/constants/__tests__/everyWayIntoASalonIsRoped.guard.test.ts | 2026-10-28 | new: every salon list and share-mode push is a listed lounge-speaking rope |
| src/features/profile/__tests__/aPortraitPickedAsAndroidLeftComesBack.test.tsx | 2026-10-27 | Written 2026-10-27: on Android, Edit Profile opens the crop sheet holding the portrait the system kept, and the sheet prepares it (P4.12) |
| src/features/settings/__tests__/everyOtherDeviceSignsOut.test.tsx | 2026-10-28 | edited: a control found by the name it now says, its shown words first; Written 2026-10-27: Settings signs every other device out, asked first, the answer said either way |
| src/hooks/__tests__/aDrawnTimeKeepsTime.test.tsx | 2026-10-27 | Written 2026-10-27: a drawn time keeps time as it passes and on return, is drawn again only when its words change, and leaves no timer or listener behind (P4.7) |
| src/hooks/__tests__/aFeedMovesOnlyAtItsTop.test.tsx | 2026-10-27 | Written 2026-10-27: at the top a return or reconnect draws the new row; below it nothing is fetched or moved, and back at the top the feed is fetched once (P4.7) |
| src/hooks/__tests__/aPageIsCurrentOnReturn.test.tsx | 2026-10-27 | Written 2026-10-27: a film page and a member's file are read again on return once older than a read stays fresh; a glance away reads nothing (P4.7) |
| src/hooks/__tests__/backClosesTheOverlay.test.tsx | 2026-10-27 | Written 2026-10-27: the hook, newest first, and the crop sheet and Cinema DNA card closing on back (P4.12) |
| src/hooks/__tests__/everyDrawnTimeReadsTheClock.guard.test.ts | 2026-10-27 | Written 2026-10-27: the finder: timeAgo and timeUntil from the clock alone; every read of the time where a screen draws is through the clock, an act's own moment, or registered with its reason (P4.7) |
| src/hooks/__tests__/everyEffectTearsDownWhatItStarts.guard.test.ts | 2026-10-27 | Written 2026-10-27: every effect's listeners and timers followed to a cleanup that names them (P4.41) |
| src/hooks/__tests__/reduceMotionIsFollowedLive.test.tsx | 2026-10-29 | new: Reduce Motion changed with the app open is followed both ways, and nothing reads the launch-only value |
| src/hooks/__tests__/unsavedWorkAsksBeforeLeaving.test.tsx | 2026-10-27 | Written 2026-10-27: through a real router, a pop over unsaved work is stopped and asks; Cancel stays, Discard leaves (P4.12) |
| src/hooks/useAskBeforeLeaving.ts | 2026-10-27 | new: a screen holding unsaved work asks before any way out (usePreventRemove): stay, or discard and leave |
| src/hooks/useBackCloses.ts | 2026-10-27 | new: Android's back closes an overlay drawn inside its screen, not the screen beneath; newest first |
| src/hooks/useBelowFloor.ts | 2026-10-28 | new: answered at once from the kept floor; read after the first screen and on every return |
| src/hooks/useBoldText.ts | 2026-10-28 | new: the phone's Bold Text, followed: each house face and its heavier one, the faces cut in one weight named, the heavier faces loaded only when asked |
| src/hooks/useClock.ts | 2026-10-27 | new: the one clock every drawn time reads; read again on return and every half minute in front, a screen drawn again only when its words change; one timer, resting in the background |
| src/hooks/useFeedTop.ts | 2026-10-27 | new: a feed read again on return or reconnect only while its list stands at its top; a fetch missed below the top runs once when the member reaches it |
| src/hooks/useMoreContrast.ts | 2026-10-29 | new: the phone's Increase Contrast (iOS) and high-contrast text (Android), followed: each quiet ink a step brighter (BRIGHTER), one listener for the app |
| src/hooks/useReduceMotion.tsx | 2026-10-29 | new: Reduce Motion followed as it changes: from the setting at launch, each reported change after wins; MotionFollowsTheSetting tells Reanimated |
| src/lib/__tests__/aBuildUnderTheFloorIsTurnedAway.test.tsx | 2026-10-28 | new: the floor per platform; kept, offline, unread, raised on return; the gate both ways; the screen and its store page; new: the floor per platform; kept, offline, unread, raised on return; the screen and its store page |
| src/lib/__tests__/aChannelSaysWhenItIsNotLive.test.ts | 2026-10-27 | Written 2026-10-27: back after a drop the missed is read; a short drop says nothing; down past a beat, not live and read on the interval until it answers; offline, nothing read (P4.8, P4.10) |
| src/lib/__tests__/aHostileLinkDecodesFast.test.ts | 2026-10-29 | new: query-string reads with the fixed decode-uri-component (GHSA-qr28-fpjm-wq7f): an ordinary query as before, a crafted one of 20,000 runs in a fraction of a second |
| src/lib/__tests__/aRequestEndsAtItsDeadline.test.ts | 2026-10-27 | edited: a read, a function call and a 503 are each asked once; Written 2026-10-27: a request that never answers ends at its deadline as DeadlineExceeded; a read and a write over the real client end once and are not reached; one in ten told by host and path, never the query (P4.6) |
| src/lib/__tests__/aSignOutWithNoNetworkStillSignsOut.test.ts | 2026-10-26 | edited: the unmock below the imports; the owed half named as settled apart; Written 2026-10-27: the real client signs out over a dead network and the session is gone; the owed half settles once, apart from this phone's session (P4.1) |
| src/lib/__tests__/everyChannelHearsItsStatus.guard.test.ts | 2026-10-27 | Written 2026-10-27: the finder: every supabase.channel(...).subscribe( hands its status to watchChannel, found through the syntax tree (P4.8) |
| src/lib/__tests__/everyReportLineIsFixed.guard.test.ts | 2026-10-27 | Written 2026-10-27: every report line fixed, every context key listed and typed, the SDK called through sentry.ts (P4.44) |
| src/lib/__tests__/everyRequestHasItsDeadline.guard.test.ts | 2026-10-27 | Written 2026-10-27: the finder: fetch( is called in the shared fetch alone, found through the syntax tree (P4.6) |
| src/lib/__tests__/everySignOutEndsTheSessionHere.test.ts | 2026-10-26 | Written 2026-10-27: no file but endSession calls signOut |
| src/lib/__tests__/nothingAMemberWroteReachesSentry.test.ts | 2026-10-27 | edited: each auth refusal one report tagged by kind; a session ended elsewhere reported as a refused refresh; Written 2026-10-27: an essay, an email and a handle planted in every place a report carried them, and none of it sent (P4.44) |
| src/lib/bootStore.ts | 2026-10-27 | new: the install's own plain store, read before the member's: the encrypted mark and the crash-report choice |
| src/lib/cacheBuster.ts | 2026-10-27 | new: CACHE_BUSTER, the platform, store build and running update a saved cache was written by; read by the root layout alone |
| src/lib/endSession.ts | 2026-10-26 | new: every sign-out ends the session on the phone, the server reached or not; the server's half owed and settled in three plain requests |
| src/lib/houseFloor.ts | 2026-10-28 | new: the house's floor, kept on the phone, read in the background; a build under it is turned away, never when either is unknown |
| src/lib/releaseName.ts | 2026-10-27 | new: the release (app id, version, store build) and dist (the running update, else the build) a report is filed under (P4.45) |
| src/lib/sentryScrub.ts | 2026-10-27 | edited: the auth_refused tag on the list, its three kinds alone; new: the allow-list of what may leave the phone in a report or a trace; addresses cut to scheme, host and path; a check failure's row and any email cut (P4.44) |
| src/lib/watchChannel.ts | 2026-10-27 | new: what a live channel's status means for its screen: back after a drop, read what was missed; down past a beat, not live, read again on a fixed interval until it answers; nothing offline |
| src/providers/__tests__/aRankGainedElsewhereIsSeen.test.tsx | 2026-10-27 | Written 2026-10-27: back in the app once the member's row is older than a read stays fresh, their rank is read again; a glance away reads nothing (P4.7, P4.17) |
| src/stores/__tests__/aSalonCatchesUpWithoutLosingAWord.test.ts | 2026-10-27 | Written 2026-10-27: 250 held and a failed send, 150 new on the house: all 400 in order and the bubble kept; the held read again light; nothing offline; a failure says nothing (P4.8) |
| src/stores/__tests__/aSilentKeystoreNeverHoldsTheLaunch.test.ts | 2026-10-27 | edited: a store come back without its key: cleared, never recrypted, a fresh store, the member told; a first launch still encrypts in place; Written 2026-10-27: the keystore's deadline on the real module (silent, just inside, an error), and the placeholder's leftovers carried in (P4.14) |
| src/stores/__tests__/everyChannelReadsWhatItMissed.test.ts | 2026-10-27 | Written 2026-10-27: per channel, SUBSCRIBED, CHANNEL_ERROR, SUBSCRIBED reads its data again (P4.8) |
| src/stores/__tests__/savedStoresAreVersioned.guard.test.ts | 2026-10-27 | Written 2026-10-27: the finder (version, migrate, a last-release fixture for every persist), and each store opening build 41's saved shape (P4.11) |
| src/stores/savedVersion.ts | 2026-10-27 | new: every saved store's version, and the step that carries the last release's unversioned shape forward |
| src/utils/__tests__/everyDrawingIsMeasured.guard.test.ts | 2026-10-24 | written: every drawing of the app lands where CI measures it |
| src/theme/__tests__/paperIsFlattened.test.ts | 2026-10-25 | written: the flat paper is the colour its three layers made, at every height |
| src/types/__tests__/everyWritingHasAReportDoor.guard.test.ts | 2026-10-27 | Written 2026-10-28: every reportable kind has a door or a reason, every table of cleaned member text a kind or a reason it reaches no other member (P4.50) |
| src/utils/__tests__/aCancelledShareSaysNothing.guard.test.ts | 2026-10-27 | Written 2026-10-27: every function opening a share sheet, and no claim of success in it (P4.43) |
| src/utils/__tests__/aPushCarriesNoPrivateWords.guard.test.ts | 2026-10-27 | Written 2026-10-27: every writer of a notice's message read from the schema snapshot, each value in it judged for a lock screen (P4.5) |
| src/utils/__tests__/aTimeIsTheHouses.guard.test.ts | 2026-10-28 | new: every write that sends an _at from the phone's clock is one the house dates itself, its trigger in 20261028_02 |
| src/utils/__tests__/enterAnswersEveryField.guard.test.ts | 2026-10-29 | new: every one-line field says what Enter does, or is listed with why it only puts the keyboard away |
| src/utils/__tests__/everyBoxIsBounded.guard.test.ts | 2026-10-28 | new: every TextInput holds a maxLength or is listed with why; a 20,000-character paste asks for SEARCH_MAX, cut whole |
| src/utils/__tests__/everyPasswordFieldSaysWhatItHolds.guard.test.ts | 2026-10-27 | Written 2026-10-27: the finder: every secure field names its content and autofill, every code field the one-time-code pair (P4.37) |
| src/utils/__tests__/nothingSaysQueuedUnlessItWas.guard.test.ts | 2026-10-27 | Written 2026-10-27: the finder (no claim of saving after a bare enqueueMutation) and the queue on a full phone (P4.14) |
| src/utils/__tests__/savedJsonOpensWhole.guard.test.ts | 2026-10-27 | edited: each file parsed by its extension; Written 2026-10-27: the finder (every JSON write in one family, each family with build 41's fixture and its opener), and each family opened by its own reader (P4.11) |
| src/utils/__tests__/theQueueStaysOffAnOpenDisk.test.ts | 2026-10-27 | Written 2026-10-27: the queue, its dead letter and held writes in memory while the store is not encrypted, and still sent (P4.14) |
| src/utils/__tests__/wordsRefusedForTheRankAreKept.test.ts | 2026-10-28 | new: held, never resent, holds back nothing, the door once; the member's retry |
