# mockups — the app's screens, drawn and measured

Nothing here is a drawing of the app. Every screen is **mounted from the app's own
code** in a test, its resolved React Native tree is converted to HTML
(`src/components/profile/__tests__/zz-render.lib.ts`), and the HTML is laid on a
390pt phone with the app's own font files to be measured. A design is judged on
the screen itself.

Commands below are for PowerShell (the Bash form is the same without `$env:`).

## 1 · Draw the screens

```powershell
$env:MOCKUPS=1; npx jest "zz-.*\.gen"
```

Writes `mockups/out/screens/<name>.html` (ignored by git). One generator per area:

| generator | draws |
|---|---|
| `mockups/tabs/__tests__/zz-{lobby,reel,dispatch,rooms,settings}.gen` | the five tabs |
| `app/log/__tests__/zz-log.gen` | a log, its states |
| `app/person/__tests__/zz-person.gen` | a person page |
| `app/stacks/__tests__/zz-stacks.gen` | a stack |
| `src/components/film/__tests__/zz-film.gen` | the film page, eleven states |
| `src/components/profile/__tests__/zz-memberfile.gen`, `zz-mockup.gen` | the profile and its rooms |
| `mockups/paper/__tests__/zz-*.gen` | the Dispatch plates → `mockups/paper/out/`. These run in EVERY test run (no `MOCKUPS` needed): they are also render tests, with assertions of their own |

Sample films and art live in `mockups/fixtures/` (committed): the TMDB key is
server-side only, so a fixture cannot be re-fetched here.

A screen whose layout reads the text size (`useTextScale` / `useLineScale`) is
also drawn at `@1.35` (iOS), `@android-1.35` and `@android-2` — see `LAYOUTS` in
`paths.ts`. The tools open those automatically.

## 2 · Draw every screen the unit tests build

```powershell
$env:MOCKUPS_CAPTURE=1; $env:RNTL_SKIP_AUTO_CLEANUP='true'; npx jest <tests>
```

The last thing each test rendered is written to `mockups/out/captured/`, laid out
on a phone (see `capture.ts`). Hundreds of states — sheets, errors, empties —
that no generator was written for. Words only: no art is loaded.

A capture is LAID OUT at the default text size. A screen that adapts its layout
to the text size (anything using `useTextScale` / `useLineScale` — the profile's
name, the cast rail, grid and stack captions) is therefore shown at larger sizes
without its adaptation, and may report a fault there that the phone does not
have. Those screens' large sizes are the generators' job (§1).
To find the tests for some files: `npx jest --listTests --findRelatedTests <files>`.

## 3 · Measure

```powershell
node mockups/tools/layout.cjs                       # the generator screens
node mockups/tools/layout.cjs --src mockups/paper/out --skip r2-ratio-1x1,r3-ratio-5x4
node mockups/tools/layout.cjs --src mockups/out/captured
```

Every text, in four passes — iOS at 1× and 1.35×, Android at 1.35× and 2× — each
grown exactly as React Native 0.81 grows it on that platform (`harness.cjs`,
`GROWTH`). Reports **CUT** (clipped, or a line under a box too short for it),
**OFF** (off the phone), **CLASH** (over another text), **RUN** (a word wider than
its line — the phone would break it mid-letter). `--shorts` also lists text the
phone shortens with "…" or a clamp (not a fault). Exits 1 on any fault.

`node mockups/tools/selftest.cjs` proves the tool can say **no**: it plants each
fault in a small screen, plus a clean one, and fails unless every fault — and
nothing else — is reported. Run it after changing the tool.

## Other tools

- `shoot.cjs --only <names> [--factor 1.35] [--platform android] [--clip x,y,w,h] [--full]` — PNGs to
  `mockups/out/shots/`. It shrinks labels exactly as the audit does (`harness.shrinkToFit`): a photo
  that skipped it showed "Max von May…" where the phone draws the whole name a little smaller.
- `advances.cjs` — measures Rye's letter widths from the font file into
  `src/theme/ryeAdvances.ts` (the profile uses it to fit a name as words).

## What the phone does that a browser does not (and the harness corrects)

- A box's width includes its padding; a text is measured against the width its
  parent gives it (`RN_RULES`).
- Font size AND line height grow with the text setting, to each text's own
  ceiling; iOS never grows letter spacing, and Android's is brought to iOS's by
  `src/providers/androidTracking.ts`. Android grows a set line height past any
  ceiling.
- A horizontal ScrollView lays its content in a row.
- A label that may shrink is shrunk as the phone shrinks it — until it truly fits its width and
  its line limit, never below its floor — by ONE function both the audit and the camera use.
