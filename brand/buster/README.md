# Buster — the house's resident

An old sheet with two holes cut in it, and something in the dark looking out.
Buster Keaton's hat, worn every night since 1924. One patch, where the armrest
of seat F9 wore through. He is not a ghost. He is a permanent resident.

This folder is the master. Everything of him, in the app and in marketing, is
made from `drawing.mjs`.

## The files

| File | What it is |
|---|---|
| `drawing.mjs` | The drawing itself, as code that writes SVG. The one source. |
| `render.mjs` | Makes every picture from the drawing (see *Remaking* below). |
| `art/buster-<mood>.png` | Each mood, 1600 px wide, transparent background. |
| `art/buster-<mood>.svg` | The same, as vector: sharp at any size. Opens in any browser and in Inkscape (it uses SVG filters for the cloth and felt, which some design tools ignore). |
| `art/buster-with-shadow.*` | Unimpressed, with his floor shadow, for placing on a scene. |
| `art/buster-seated.*` | In the back row, behind the seat backs. |
| `art/buster-stamp-brass.*` | The one-colour brass press stamp, hat included. |
| `art/buster-stamp-ink.*` | The same in ink, cut against ticket paper (`#E9DFC8`). |
| `art/buster-small.*` | The small mark: the same character in fewer, bolder lines, for 48 px and under. |

## The moods

| Mood | When | Body language |
|---|---|---|
| unimpressed | his resting stare; the default | still, upright |
| suspicious | something is not where it should be | leans in, lids low, hat pulled down |
| moved | it was the film | slumps; the ink runs as a tear |
| proud | a rare honour | taller, eyes lit, the hat lifting off |
| dimmed | the house has gone dark | sinks and folds in; eyes out |
| startled | a shock | the sheet puffs out, the hat leaves first |

## The rules

- **Only Buster wears the hat.** Never put the hat on anyone or anything else.
- **No hands, no mouth, one patch.** Never add them, and never a second patch.
- **Two eyes, always cut holes, brass inside.** Never one eye, never cartoon pupils.
- **Not cute, not scary.** No blush, no grin, no teeth, no glowing red.
- **On dark grounds first.** He was drawn for the booth's black (`#0D0B09`) and the
  card (`#1E1914`). He holds on light paper too, but the brass reads best in the dark.
- **Don't recolour him.** For one colour, use the stamp (brass or ink), never a tinted copy.
- **Don't stretch or squash him.** Scale him evenly, or use the small mark when tiny.

## The palette

| Name | Hex | Where |
|---|---|---|
| sheet | `#E0D4BA` | the cloth |
| lit | `#F2EBD9` | where light falls on it |
| ink | `#0D0B09` | every line |
| hole | `#050403` | the dark behind the eyes |
| brass | `#C4961A` | his eyes; the stamp |
| bulb | `#F6E3A0` | the catch of light on the brass |
| hat | `#221B15` | the felt |
| patch | `#D8CAAC` | the mended square |

## Remaking

From the repo root (it needs the root's Playwright and sharp):

```
node brand/buster/render.mjs           # the app's pictures, into mobile/assets/buster, and their data
node brand/buster/render.mjs --brand   # this folder's art/
```

The app's pictures are drawn four times over and brought down with a Lanczos
filter to the exact pixels each screen density needs (1x to 4x), so no phone
ever stretches one. Their brass points are left out and measured, because the
app draws them live: they blink and glance aside. `mobile/src/components/busterArt.ts`
is written by the same run and should never be edited by hand. In the app, the
test `busterRegister.test.ts` holds where he may appear and checks every
picture's pixels.

The approved design pages are `mobile/design/buster-final.html` (the design)
and `mobile/design/buster-in-app.html` (as the phone draws him).
