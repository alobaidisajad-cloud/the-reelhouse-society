#!/usr/bin/env bash
# The simulator both iPhone jobs run on (ios-launch.yml, speed-lab.yml): the iPhone 17 Pro on the
# image's newest iOS (simctl lists the runtimes oldest first). macos-26 carries no iPhone 16 Pro:
# the jobs' old lookup found none, and under `bash -e` its failed assignment ended the step with
# no word (the iPhone launch check on PR #128). Prints its id, or names the iPhones there are and
# fails.
set -u
want='iPhone 17 Pro'
list=$(xcrun simctl list devices available)
id=$(printf '%s\n' "$list" | grep -F "$want (" | tail -n 1 | grep -oE '[0-9A-F-]{36}' || true)
if [ -z "$id" ]; then
  echo "::error::no $want simulator on this image; its iPhones:" >&2
  printf '%s\n' "$list" | grep -F 'iPhone' >&2
  exit 1
fi
echo "$id"
