#!/usr/bin/env bash
# no-keyboard.sh — the phone with no on-screen keyboard and no autofill, as a flow types on it.
# Sourced, not run (it sets rooted, imes_all and left for the script that sources it, and stops that
# script when a keyboard is left): by run-flows.sh before the flows, and by the speed lab's
# scrolls.sh before its sign-in.
# No on-screen keyboard. Maestro types by injecting key events, and they pass
# through the keyboard app first: on an email field Gboard stalled them mid-
# address ("e2e_member@e", then nothing for minutes, runs 36500199970 and
# 36566533738) and opened its own menus. A member taps keys; a test injects
# them. With no input method the injected keys reach the field itself. (So the
# flows never call hideKeyboard: in Maestro it presses Back.)
# The APPS are disabled, not the input methods: Android keeps one input method
# enabled whatever is disabled (run 36579267804: Gboard stayed, its clipboard
# covered the password field, and the password went into the email field).
# As root (a google_apis image allows it): the shell user may not disable a
# system app (run 36590647413: both stayed). Android's own answer is printed.
rooted="$(adb root 2>&1 | tr -d '\r')"
adb wait-for-device
# Kept for the keyboard's room (below), which turns one back on for a tap.
imes_all="$(adb shell ime list -a -s | tr -d '\r')"
answers=""
for pkg in $(echo "$imes_all" | sed 's#/.*##' | sort -u); do
  answers="${answers} ${pkg}: $(adb shell pm disable "${pkg}" 2>&1 | tr -d '\r' | tr '\n' ' ');"
done
# Which input methods are ENABLED is a setting of its own, and it outlived the
# apps (run 36602917035: both "new state: disabled", both still listed). It is
# cleared, and Android is given a moment to redraw its list from what is left.
adb shell settings delete secure enabled_input_methods > /dev/null 2>&1
adb shell settings delete secure default_input_method > /dev/null 2>&1
for _ in 1 2 3 4 5 6 7 8 9 10; do
  left="$(adb shell ime list -s | tr -d '\r' | tr '\n' ' ')"
  [ -z "${left// /}" ] && break
  sleep 2
done
echo "root: ${rooted} | ${answers} | input methods left: [${left}]"
# Nor an autofill service: the email fields ask for autofill (autoComplete
# "email"), and with the keyboards gone typing still stalled at the same place,
# "e2e_member@e" (run 36628647938), while Android's AutofillManager inspected the
# field. A member's phone offers their saved address; a test types its own.
autofill="$(adb shell settings put secure autofill_service null 2>&1; adb shell settings get secure autofill_service | tr -d '\r')"
echo "autofill service: ${autofill}"
if [ -n "${left// /}" ]; then
  enabled="$(adb shell settings get secure enabled_input_methods | tr -d '\r')"
  echo "::error title=A keyboard app is still on the device::left: ${left} | enabled setting: ${enabled} | root: ${rooted} | Android said:${answers} — every flow that types would fail behind it."
  exit 1
fi
