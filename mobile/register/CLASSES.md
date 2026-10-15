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
| CI-check-only-in-ci | tooling | code | OPEN | 1 | A check CI runs that no local gate runs, so a push meets it only in red |
| SALON-channel | lounge | serious | OPEN | 1 | open in production |
| DB-function-grants | database | serious | OPEN | 71 | open in production |
| DB-extension-reach | database | serious | OPEN | 1 | open in production |
| DB-row-edited-past-its-gates | database | serious | OPEN | 14 | open in production |
| CODE-promise-not-awaited | code | behaviour | OPEN | 589 | A promise nobody waits for, so its failure goes unheard and what follows may run first |
| CODE-index-read-unchecked | code | behaviour | OPEN | 1517 | A value read by index or key used as if it is always there |
| EDGE-function-static-fault | server | code | OPEN | 4 | An edge function's type error or lint finding, where no gate read the functions |
