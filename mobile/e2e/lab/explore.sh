#!/usr/bin/env bash
# explore.sh — the explorer's run on one emulator boot (e2e/explore.mjs).
#
#   bash mobile/e2e/lab/explore.sh
#
# The app as it is ($RUNNER_TEMP/apks/A.apk), the seeded member signed in once (sign-in.yaml), as
# scrolls.sh does; then explore.mjs opens every route and pokes at it, with API_URL and
# SERVICE_ROLE_KEY of the sealed world to read the seed's ids. The phone is put upright and on a
# full network again at the end. Everything lands in $RUNNER_TEMP/lab/explore; explore.mjs's exit
# is this script's.
set -u
PKG=com.reelhouse.society
OUT="$RUNNER_TEMP/lab/explore"
MAESTRO=${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}
mkdir -p "$OUT"

adb root > /dev/null 2>&1
sleep 3
adb wait-for-device
adb shell settings put global airplane_mode_on 0
for s in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb shell settings put global "$s" 0
done
. "$(dirname "$0")/../no-error-dialogs.sh"
. "$(dirname "$0")/../no-keyboard.sh"

adb install -r "$RUNNER_TEMP/apks/A.apk" > "$OUT/install.txt" 2>&1 || { echo "install failed: $(tail -n 2 "$OUT/install.txt")"; exit 1; }
"$MAESTRO" test -e E2E_MEMBER_EMAIL="$E2E_MEMBER_EMAIL" -e E2E_MEMBER_PASSWORD="$E2E_MEMBER_PASSWORD" \
  mobile/e2e/lab/sign-in.yaml > "$OUT/sign-in.txt" 2>&1 < /dev/null
signed=$?
node mobile/e2e/scrub.mjs "$OUT/sign-in.txt" > /dev/null
[ $signed -eq 0 ] || { echo "the member could not be signed in:"; tail -n 20 "$OUT/sign-in.txt"; exit 1; }

node mobile/e2e/explore.mjs "$OUT" > "$OUT/explore.txt" 2>&1 < /dev/null
rc=$?
cat "$OUT/explore.txt"
adb shell settings put system user_rotation 0
adb emu network speed full > /dev/null 2>&1
adb emu network delay none > /dev/null 2>&1
exit $rc
