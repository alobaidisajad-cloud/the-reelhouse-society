# The register of classes

Generated from `classes.yaml` by `mobile/scripts/register.cjs`; do not edit by hand. A class still open in
production shows only its id, area, seriousness and count here.

| Class | Area | Seriousness | Status | Count | What it is |
|---|---|---|---|---|---|
| MOTION-empty-config-key | motion | serious | OPEN | 0 | An animation config key holding no value replaces Reanimated's default with nothing |
| RUNTIME-api-missing-on-phone | runtime | serious | OPEN | 0 | A JavaScript API Node has and the phone's runtime lacks is called, passing in jest and throwing on the phone |
| E2E-soft-crash-unseen | tests | serious | OPEN | 0 | React destroyed with no crash dialog passes a run whose flows relaunched over it |
| RN-react-destroyed-on-mount | navigation | serious | OPEN | 0 | React Navigation's tab icon is drawn twice and its wrappers' flattening swapped; Android's Fabric loses a re-make and React is destroyed |
| SEC-secret-committed | security | serious | OPEN | 21 | open in production |
| BUILD-upload-carries-ignored-files | release | serious | OPEN | 0 | An EAS build's upload carries files git keeps out |
| DB-breaking-change-unexplained | database | serious | OPEN | 0 | A database change narrows what a shipped client relies on, with no reason why it is safe |
| DB-apply-not-one-unit | database | serious | OPEN | 0 | A migration that cannot apply as one unit under the time limits |
| DB-change-without-undo | database | behaviour | OPEN | 0 | A pending migration with no tested undo |
| WEB-change-unapproved | website | behaviour | OPEN | 0 | A change to the website's files reaches members without the user's approval |
| E2E-scroll-leaves-target-under-bar | tests | code | OPEN | 0 | A flow's scroll stops with its target under the tab bar, and the next tap lands on a tab |
| E2E-open-overlay-drawn-by-animation-alone | tests | behaviour | OPEN | 0 | An open overlay whose resting state is drawn only by its animated style, so an animated style not applied leaves it open and invisible |
| NET-request-without-time-limit | runtime | behaviour | OPEN | 1 | A request to the server with no time limit of its own, so one caught by a change of network holds it, and the queued writes behind it, for as long as Android's connection waits |
| EDGE-function-unexercised | server | behaviour | OPEN | 0 | A deployed edge function no test serves and asks, so its refusals, its failures and the calls it makes out are known only from production |
| FN-the-house-failing-told-as-theirs | server | behaviour | OPEN | 2 | open in production |
| AUTH-sign-in-counted-together | security | serious | OPEN | 1 | open in production |
| TEST-event-not-awaited | tests | code | OPEN | 0 | A fireEvent, act or renderHook nobody waits for (all three are async in Testing Library 14), so what the test checks next can be the screen from before the event, and a negative passes on a stale tree (TST-08) |
| TEST-press-inside-the-debounce | tests | code | OPEN | 0 | A test presses the same control twice inside its 400 ms debounce (PressableScale reads Date.now; jest's clock and a test's real one both stay inside it), so the second press never reaches the screen and a check that nothing happened passes for that alone (TST-14) |
| TEST-absence-unanchored | tests | code | OPEN | 0 | A test finds things absent on a screen it never shows drawn, so a blank screen, a crash caught upstream or a list still loading passes it as well as the right one (TST-09) |
| TEST-rehearsal-holds-without-its-migration | tests | behaviour | OPEN | 0 | A migration's rehearsal that would hold without the migration (an identity that never took, a table with nothing to ask, a case that cannot fail), so its passing proves nothing of the migration (TST-25) |
| TEST-mutant-unproven | tests | code | OPEN | 0 | A mutant that never applied read as caught, or one judged against a baseline that already answered wrong, so the guard it measures is taken as able to fail when nothing showed it (TST-19) |
| TEST-mock-accepts-anything | tests | behaviour | OPEN | 128 | A test's hand-made Supabase client answers what production refuses (a missing column, an rpc argument its function does not take, [] to every read, no error from .single() with no row, more than 1,000 rows, fixtures not in a table's shape) (TST-05, TST-06, TST-10) |
| E2E-ceiling-not-measured | tests | code | OPEN | 1 | A time limit of the sealed E2E (a screen's ceiling, a shard's flows) set from too few runs, so the shared emulator's spread reads as the app's |
| CI-check-only-in-ci | tooling | code | OPEN | 1 | A check CI runs that no local gate runs, so a push meets it only in red |
| SALON-channel | lounge | serious | OPEN | 1 | open in production |
| DB-function-grants | database | serious | OPEN | 0 | A public function any login the database has may run, because PUBLIC kept EXECUTE on it |
| DB-extension-reach | database | serious | OPEN | 1 | open in production |
| DB-row-edited-past-its-gates | database | serious | OPEN | 0 | A member's own row passed its gates when written, then was edited past them (gates on INSERT only; an UPDATE changed its kind, parties, place or time) |
| DB-rule-kept-on-one-path | database | behaviour | OPEN | 10 | open in production |
| DB-row-reaches-past-its-reader | database | behaviour | OPEN | 8 | open in production |
| DB-standing-stands-in-the-way-out | database | behaviour | OPEN | 1 | open in production |
| DB-applied-bytes-differ | database | code | OPEN | 0 | The train applied a migration with the line ends of the checkout it ran from, so production held other bytes than CI rehearsed |
| CODE-promise-not-awaited | code | behaviour | OPEN | 310 | A promise nobody waits for, so its failure goes unheard and what follows may run first |
| CODE-index-read-unchecked | code | behaviour | OPEN | 1472 | A value read by index or key used as if it is always there |
| EDGE-function-static-fault | server | code | OPEN | 4 | An edge function's type error or lint finding, where no gate read the functions |
