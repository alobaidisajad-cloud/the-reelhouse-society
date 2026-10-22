#!/usr/bin/env bash
# no-error-dialogs.sh — the phone with Android's own error dialogs hidden, as the flows run on it.
# Sourced, not run: by run-flows.sh before the flows, and by the speed lab's scrolls.sh before its
# sign-in. A freshly booted emulator on a software GPU is slow enough that its own launcher misses a
# deadline, and Android puts "Pixel Launcher isn't responding" over everything: the flows, and the
# lab's sign-in (speed lab 39857275319, both halves), then look for the app under a system dialog.
# Such dialogs are hidden (the app's own crash still reaches the device log), and any already
# showing is closed.
adb shell settings put global hide_error_dialogs 1
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null 2>&1 || true
