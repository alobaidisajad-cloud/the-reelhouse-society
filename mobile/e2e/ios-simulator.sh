#!/usr/bin/env bash
# The simulator the iOS jobs run on (ios-launch.yml, speed-lab.yml): the iPhone 17 Pro on the
# image's newest iOS (simctl lists the runtimes oldest first), or the device named as the first
# argument (ios-launch.yml's iPad: "iPad Pro 13-inch", the widest window the app is drawn at).
# macos-26 carries no iPhone 16 Pro: the jobs' old lookup found none, and under `bash -e` its failed
# assignment ended the step with no word (the iPhone launch check on PR #128). Prints its id, or
# names the devices of that kind there are and fails.
set -u
want="${1:-iPhone 17 Pro}"
kind="${want%% *}"
list=$(xcrun simctl list devices available)
id=$(printf '%s\n' "$list" | grep -F "$want (" | tail -n 1 | grep -oE '[0-9A-F-]{36}' || true)
if [ -z "$id" ]; then
  echo "::error::no $want simulator on this image; its ${kind}s:" >&2
  printf '%s\n' "$list" | grep -F "$kind" >&2
  exit 1
fi
echo "$id"
