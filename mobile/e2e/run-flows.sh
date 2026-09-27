#!/usr/bin/env bash
# run-flows.sh — install the E2E app on the emulator and run the Maestro flows.
#
# Run by e2e.yml inside the emulator step, from the repository root. A failed
# flow explains itself on the run page: Maestro's own report as an error
# annotation, and what was on the screen at that moment as a notice.
set -uo pipefail

APK=mobile/android/app/build/outputs/apk/release/app-release.apk
FLOWS=${E2E_FLOWS:-mobile/.maestro}
OUT=${RUNNER_TEMP:-/tmp}
MAESTRO=${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}

adb install -r "$APK" || { echo "::error title=E2E::the app would not install"; exit 1; }

"$MAESTRO" test "$FLOWS" \
  -e E2E_MEMBER_EMAIL="$E2E_MEMBER_EMAIL" \
  -e E2E_MEMBER_PASSWORD="$E2E_MEMBER_PASSWORD" \
  -e E2E_MEMBER_USERNAME="$E2E_MEMBER_USERNAME" \
  --format junit --output "$OUT/maestro-report.xml" \
  --debug-output "$OUT/maestro-debug" \
  > "$OUT/maestro.log" 2>&1
rc=$?
cat "$OUT/maestro.log"

if [ $rc -ne 0 ]; then
  node mobile/e2e/annotate.mjs "E2E flows failed" "$OUT/maestro.log"
  "$MAESTRO" hierarchy > "$OUT/screen.json" 2>/dev/null || true
  node mobile/e2e/screen.mjs "$OUT/screen.json" > "$OUT/screen.txt"
  node mobile/e2e/annotate.mjs "What was on the screen when it failed" "$OUT/screen.txt" notice
fi
exit $rc
