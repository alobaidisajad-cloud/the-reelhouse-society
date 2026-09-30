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
With `MOCKUPS=1` as well, the generators run too and their final screens are
captured with the rest — how the CI `captures` job measures touch (§5).

## 3 · Measure

```powershell
node mockups/tools/layout.cjs                       # the generator screens
node mockups/tools/layout.cjs --src mockups/paper/out --skip r2-ratio-1x1,r3-ratio-5x4
node mockups/tools/layout.cjs --src mockups/out/captured
```

Every text, in five passes — iOS at 1×, 1.35× and 3.1× (its largest accessibility
size), Android at 1.35× and 2× — each grown exactly as React Native 0.81 grows it
on that platform (`harness.cjs`, `GROWTH`). A text with a ceiling of its own stops
there; a text with NONE grows to the system's largest size, because that is what a
phone does (the app's Text in `src/components/text` gives every text the house
1.35, so one with none escaped it). Reports **CUT** (clipped, a line under a box too short for it,
or a shrink-to-fit label still cut short at its floor), **OFF** (off the phone),
**CLASH** (over another text), **RUN** (a word wider than
its line — the phone would break it mid-letter), **HANG** (a mark's count beside
its icon — `MarkFigure` — that crowds the icon at rest, runs past its reach, is
cut short, or was shrunk under 10pt), **UNDER** (a line a docked bar covers at
every scroll position). Every control: **STEAL** (its touch area — box plus
hitSlop — overlaps a neighbour's; both platforms give the overlap to the later
one), **NAMELESS** (a screen reader can call it only "button"). Every view, when
drawn with `MOCKUPS_YOGA=1`: **SHADOW** (an iOS shadow asked of a view that
clips — iOS draws none). `--kinds A,B` limits the report; `--shorts` also lists
text the phone shortens with "…" or a clamp (not a fault). Exits 1 on any fault.

A shrink-to-fit label cut short even at its floor is a CUT — for the house's own
copy that is a defect. Content of any length (a film's title) may end in "…" by
design: those are named, with the reason, in `mockups/shortened-on-purpose.txt`
(`--allow-short`; CI passes it). Text inside a scroller is never cut by what
holds the scroller — past its edge is scrolled to.

**Other devices.** Every width the app is drawn at is in `devices.json` — 320 (the
narrowest phone iOS 15.1 runs on) to 1024 (iPad Pro 13, since `supportsTablet` is
on), each with its own height. Draw AT a width, then measure there:

```powershell
$env:MOCKUPS=1; $env:MOCKUPS_WIDTH=320; npx jest "zz-.*\.gen"     # → mockups/out/screens-320
node mockups/tools/layout.cjs --src mockups/out/screens-320 --width 320
```

Drawn at the width, a box a screen sizes in code from the window is sized for that
device, and the measurement is honest. (Measuring a 390 render at 320 reported a
poster rail and a stack grid running off a phone they were never laid out for.)
A flex item that may shrink goes as far as Yoga lets it — to zero, unless it sets
a minWidth — so a name shortens beside its date as on the phone (`zz-render.lib.ts`).

`node mockups/tools/selftest.cjs` proves the tool can say **no**: it plants each
fault in a small screen, plus a clean one, and fails unless every fault — and
nothing else — is reported. Run it after changing the tool.

## 4 · Is the drawing where the phone would put it?

Everything above measures a BROWSER's layout. `yoga-parity.cjs` lays every render
out again with **Yoga** — the `yoga-layout` package, React Native's own C++ engine
compiled to WebAssembly, with RN's own settings (all of Yoga's errata on) — and
reports every box the two placed apart by more than a quarter of a point. Yoga's
snapping to the pixel grid is switched OFF, so both engines give exact
coordinates (the phone's own snapping moves a box by at most a sixth of a point,
which a browser cannot copy). Draw with the styles on, then compare:

```powershell
$env:MOCKUPS=1; $env:MOCKUPS_YOGA=1; $env:MOCKUPS_OUT='mockups/out/screens-yoga'; npx jest "zz-.*\.gen"
node mockups/tools/yoga-parity.cjs --src mockups/out/screens-yoga             # add --why to see where a difference begins
node mockups/tools/yoga-parity.cjs --src mockups/out/screens-yoga --platform android --factor 2
```

A difference is either the drawing being wrong (fix `zz-render.lib.ts`, the
harness or a mock) or the PHONE doing something nobody meant (fix the app). It
has found both. In the app: a Pulse card whose name column the phone stretched
across the whole header, pushing the report button into the card's margin; the
error screen's details box grown to 120pt around two lines; the rank ticket's
top line set 3pt high. In the drawing: every correction in the list below marked
*(Yoga)*. CI runs it, and `layout.cjs`, at every width and text size (the
`mockups` job in `god_tier_ci.yml`).

It also runs over the screens the unit tests build (§2): capture with
`MOCKUPS_YOGA=1` and point `--src` at the captures. There, use `--tolerance 1`:
Yoga has one quirk a browser cannot follow (it can reuse a flex basis measured
earlier in the same pass), which moves an ornament by half a point.

`--dump '<part of a style>'` prints a box and its children as each engine laid
them out — the quickest way to see which sibling took the space.

Not compared: a box under a transform (a transform moves the drawing, not the
box). Texts are handed to Yoga at the size the browser laid them out, so this
checks how boxes are laid out around text, not how a font is measured.

Style keys the converter does not draw are listed with
`MOCKUPS_UNREAD=<file>` (see `DRAWN_ELSEWHERE` in `zz-render.lib.ts`).

## 5 · Touch: measured, and held to it

A drawing run (`MOCKUPS=1` or `MOCKUPS_CAPTURE=1`) marks every `PressableScale`
and every `Text` with the file and line of the JSX that made it (`data-src`, from
React's own record of where each element was created — `mockups/srcMark.ts`). So
a finding names its source line, and the tool can say what it MEASURED:

```powershell
# every test and generator screen, with sites (the CI `captures` job)
$env:MOCKUPS=1; $env:MOCKUPS_OUT='mockups/out/cap-gens'; $env:MOCKUPS_CAPTURE=1; $env:RNTL_SKIP_AUTO_CLEANUP='true'; $env:MOCKUPS_YOGA=1; $env:MOCKUPS_CAPTURED_OUT='mockups/out/captured'; npx jest
Copy-Item mockups/out/cap-gens/*.html mockups/out/captured/
node mockups/tools/layout.cjs --src mockups/out/captured --passes ios@1 --kinds STEAL,NAMELESS,UNDER,SHADOW --sites mockups/out/sites.txt --require mockups/touch-measured.txt
```

- `--sites OUT` writes every control site (`file:line`) measured beside a
  neighbour — within 30pt, near enough for two halos to meet.
- `--require FILE` fails for each file listed there (`mockups/touch-measured.txt`)
  that has no control measured beside a neighbour. The touch rules that used to be
  typed out by hand (`stackedRowHitSlop.test.ts`) became this list; a test that
  stops drawing a control is a failure, not a check that quietly stopped.
  Regenerate it from `--sites` (strip the `:line`) when a file is added on purpose.
- **SMALL** (only when asked: `--kinds SMALL`) reports a control whose own box is
  under 48 on either side — a halo is invisible to both platforms' accessibility
  layers. `--allow mockups/touch-small-exceptions.txt` names the exceptions, each
  as `file [/label/] [@/source line/] — why`, and refuses one without a real
  reason (or whose `@/…/` names no line). CI holds the log composer to it at every
  width; app-wide it is a known class, not yet a gate.
- Texts carry their site too, so `--allow-short` can name the ONE element it
  excuses: `@/act\.film\?\.title/` matches the source line the text was written
  on, however the file moves around it.
- `drawn.cjs --src DIR --prefix composer FILE…` fails naming any `PressableScale`
  in those files that no screen draws — measured by nothing. The answer is a
  generator state that reaches it.

React records where an element was created for only its first 10,000 elements
per second; tests render faster, so drawing runs pin that count at zero
(`jest.setup.ts`) — without it, every control after a file's first few states
lost its site.

## Other tools

- `shoot.cjs --only <names> [--factor 1.35] [--platform android] [--clip x,y,w,h] [--full]` — PNGs to
  `mockups/out/shots/`. It shrinks labels exactly as the audit does (`harness.shrinkToFit`): a photo
  that skipped it showed "Max von May…" where the phone draws the whole name a little smaller.
- `advances.cjs` — measures Rye's letter widths from the font file into
  `src/theme/ryeAdvances.ts` (the profile uses it to fit a name as words).
- `lobby-advances.cjs` — the same for the four faces the Lobby wall is set in, into
  `src/components/lobby/faceAdvances.ts`.
- `quote-ink.cjs` — the outline of Spectral Italic's quote marks, read from the font file
  (the Lobby draws its great “ from it, in a box the size of its ink).
- `contrast.cjs --only <names> [--width W] [--passes ios@1,android@2]` — every word scored
  against the pixels really under it (art, sunbursts, halftone), not a colour pair; 4.5:1,
  or 3:1 at display size. CI holds the Lobby's states to it at every width.

## What the phone does that a browser does not (and the harness corrects)

- A box's width includes its padding; a text is measured against the width its
  parent gives it (`RN_RULES`).
- Font size AND line height grow with the text setting, to each text's own
  ceiling; iOS never grows letter spacing, and Android's is brought to iOS's by
  the app's Text (`src/components/text`, using `androidTracking.ts`) — for a text
  that escaped it, Android spaces it × the setting. Android grows a set line
  height past any ceiling.
- A horizontal ScrollView lays its content in a row; every ScrollView grows and
  shrinks (flexGrow and flexShrink 1, ScrollView's own base style) *(Yoga)*.
- The phone is a window of exactly its height that lays its screen out as a flex
  column, so a screen's `flex: 1` fills it *(Yoga)*.
- A box in a column is at most the column's width LESS its own side margins, so a
  rule pulled to both edges by negative margins is as wide as on the phone *(Yoga)*.
- A border that is not a whole number of points (a 0.5pt hairline, a 1.5pt frame)
  keeps its exact width: a browser snaps borders to whole pixels, so it is laid out
  as padding and drawn as an inset shadow *(Yoga)*.
- An absolute box: its percentages are of the parent LESS its padding, and an axis
  with no inset is placed by the parent's justify/align from its border, not its
  padding — both are Yoga errata React Native keeps on *(Yoga)*.
- FlashList is drawn as the scroll view it is (`mockups/tabs/flashListMock.tsx`, and
  the global mock in `jest.setup.ts`): drawn as a plain View, each `flex: 1` cell of
  a grid collapsed to its padding *(Yoga)*.
- `SafeAreaProvider` is `flex: 1`, as the real one is *(Yoga)*.
- A Modal is a window of its own: lifted out of the page and drawn over the whole
  phone, in RN's `flex: 1` container *(Yoga)*.
- A box with an aspect ratio holds it whatever is inside (no CSS content minimum);
  a wrapping box's lines sit at the top (`alignContent: flex-start`); `flex: 1`
  never shrinks (Yoga's rule, not the web's) *(Yoga)*.
- Underline, `transformOrigin`, an image's own fit and `tintColor` are drawn.
- A label that may shrink is shrunk as the phone shrinks it — until it truly fits its width and
  its line limit, never below its floor — by ONE function both the audit and the camera use.
  It measures the glyphs UNROUNDED (a browser's scrollWidth is whole pixels, and read `999K` at
  23.4pt in a 23.3pt box as fitting while drawing "99…"), and it tries the floor itself last,
  as the phone reaches it.
