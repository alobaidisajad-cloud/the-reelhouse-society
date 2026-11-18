#!/usr/bin/env bash
# films.sh — the speed lab's thirty films, opened in a row as the member, on one emulator boot (round 13).
#
#   bash mobile/e2e/lab/films.sh
#
# The app as it is ($RUNNER_TEMP/apks/A.apk), the seeded member signed in once (sign-in.yaml), as
# scrolls.sh does. Then the device log emptied, and each of the thirty films of films.mjs opened by
# its link, one after another in the same run of the app (no force-stop between: the query cache
# grows as a member's does), FILM_SECONDS apart. Then the app is given time for its idle write and
# sent to the back, which writes what is held at once, and the device log is kept as films.log.
# films.mjs judges it: the films read, the cache's writes (their size, and the ms each held the JS
# thread). Everything lands in $RUNNER_TEMP/lab/films.
set -u
PKG=com.reelhouse.society
OUT="$RUNNER_TEMP/lab/films"
MAESTRO=${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}
FILM_SECONDS=4
mkdir -p "$OUT"
: > "$OUT/anomalies.txt"

adb root > /dev/null 2>&1
sleep 3
adb wait-for-device
adb shell settings put global airplane_mode_on 0
for s in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb shell settings put global "$s" 0
done
. "$(dirname "$0")/../no-error-dialogs.sh"
. "$(dirname "$0")/../no-keyboard.sh"
load1() { adb shell cat /proc/loadavg | cut -d' ' -f1 | tr -d '\r'; }
for i in $(seq 1 96); do awk -v l="$(load1)" 'BEGIN { exit !(l < 1.0) }' && break; sleep 5; done
echo "settled at load $(load1); screen $(adb shell wm size | tr -d '\r')" > "$OUT/device.txt"

adb install -r "$RUNNER_TEMP/apks/A.apk" > "$OUT/install.txt" 2>&1 || { echo "install failed: $(tail -n 2 "$OUT/install.txt")" >> "$OUT/anomalies.txt"; exit 0; }
adb shell cmd package compile -f -m verify "$PKG" > /dev/null 2>&1
"$MAESTRO" test -e E2E_MEMBER_EMAIL="$E2E_MEMBER_EMAIL" -e E2E_MEMBER_PASSWORD="$E2E_MEMBER_PASSWORD" \
  mobile/e2e/lab/sign-in.yaml > "$OUT/sign-in.txt" 2>&1 < /dev/null
signed=$?
# Maestro's record holds the password as typed: out at once.
node mobile/e2e/scrub.mjs "$OUT/sign-in.txt" > /dev/null
if [ $signed -ne 0 ]; then
  { echo "the member could not be signed in:"; tail -n 20 "$OUT/sign-in.txt"; } >> "$OUT/anomalies.txt"
  exit 0
fi

node mobile/e2e/lab/films.mjs ids > "$OUT/ids.txt"
adb logcat -c
while read -r id; do
  [ -n "$id" ] || continue
  timeout 60 adb shell am start -W -a android.intent.action.VIEW -d "reelhouse://film/$id" "$PKG" > /dev/null 2>&1 < /dev/null
  sleep "$FILM_SECONDS"
done < "$OUT/ids.txt"
# The last film's write, in its idle turn (one second, then two at most), then the app sent to the
# back: what is held is written at once there.
sleep 4
adb shell input keyevent KEYCODE_HOME < /dev/null
sleep 3
adb logcat -d -v threadtime > "$OUT/films.log"
echo "done at load $(load1)" >> "$OUT/device.txt"
exit 0
