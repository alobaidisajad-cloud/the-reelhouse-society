# Performance: what is measured, and what the phones must show

## Measured on every change (CI)

| What | Where | Fails when |
|---|---|---|
| The phone bundle's size (Hermes bytecode, iOS and Android) | `npm run bundle:size`, CI job "The app's code only gets smaller", record in `.bundle-size.json` | either bundle grows without `--accept "reason"` |
| The icons in the bundle | `lucideIconsAreBundled.guard.test.ts` | an icon is imported but not listed (`npm run icons`) |
| What a change redraws in the lounge room | `aKeystrokeRedrawsNoMessage.test.tsx` | a keystroke, a typist or someone present redraws any message; a new message or a reaction redraws more than its own |
| What a change redraws in the Dispatch | `feedScreen.test.tsx`, "a render budget" | a certify or a save redraws more than its filing; new paper arriving redraws any |
| Each screen's time until its content is in, on the emulator | the sealed E2E run: `screen.ready` lines in the device log | (a reading, not a gate: emulators vary) |

## Measured on members' phones (Sentry, production builds)

`src/lib/sentry.ts` and `src/hooks/useScreenReady.tsx`:

- **App start**, cold and warm: from the process to the first screen drawn (`markAppLoaded`, when the splash goes).
- **Each screen**: time to its first frame (TTID, automatic) and to its content (TTFD, `useScreenReady`) on the lobby, welcome, film, member, reader, Dispatch, Darkroom, lounges, lounge room and the Reel.
- **Slow frames** (over 16 ms), **frozen frames** (over 700 ms) and **JS stalls**, per screen.

Only screen templates (`/user/[username]`), never a name, a link or a message, reach Sentry (`sendDefaultPii: false`; `Sentry.wrap` is never used, since its touch recorder reads accessibility labels, and a lounge message's label is the message: `sentryMeasures.test.ts`).

## On a phone, before launch (the device pass)

A release build, not a development one (development is several times slower). One mid-range Android and one iPhone. Each measured three times, cold (the app swiped away first):

1. **Cold start** to the lobby showing its hero film. Goal: under 2 s on the Android, under 1.5 s on the iPhone. Read it in Sentry (Performance, app start) as well as by eye.
2. **Warm start** (home, then back into the app). Goal: under 1 s.
3. **The Dispatch**: open, scroll fast through 50 filings, certify three. Goal: no frame frozen, slow frames under 5 % in Sentry.
4. **The Darkroom**: type a title; the suggestions appear while typing, and the grid scrolls smoothly after.
5. **A lounge room** with 100+ messages: type a sentence; the keyboard never lags a letter.
6. **The Reel**: scroll fast; posters arrive without the list stuttering.
7. **Largest text size** (Settings → Accessibility): repeat 3 and 5.

Write the numbers down beside this list. A goal missed is a finding for the next build, not a note.
