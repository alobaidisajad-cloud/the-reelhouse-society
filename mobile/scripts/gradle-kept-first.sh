#!/usr/bin/env bash
# A Gradle build from the packages GitHub's cache keeps, asking the network only for what they lack.
#
#   (cd android && bash "$GITHUB_WORKSPACE/mobile/scripts/gradle-kept-first.sh" assembleRelease <flags...>)
#
# Every build asked Maven Central again for what the cache already held: an answer Gradle keeps
# expires (a version range in a day, a file a repository does not have, such as a plugin marker's
# jar, too), and a cache restored from its key is never saved again, so every build re-asked them.
# Eleven builds of a night asking at once met 429 Too Many Requests, which Gradle answers by turning
# the repository off for the rest of the build (nightly 45676715897: two builds, eleven minutes of
# 429 on one jar that does not exist). So the build first runs offline, from the kept packages
# alone. Only when they lack something (Gradle says "offline mode") is it run again online, each
# package asked up to eight times from five seconds apart, and the step's output says fetched=true,
# so the workflow keeps the fuller packages for the next build. Any other failure stops the build.
set -u
LOG="$(mktemp)"
./gradlew --offline "$@" 2>&1 | tee "$LOG"
rc=${PIPESTATUS[0]}
if [ "$rc" -ne 0 ] && grep -q 'offline mode' "$LOG"; then
  echo "(the kept packages lack what the build asks for: it is run again, asking the network)"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "fetched=true" >> "$GITHUB_OUTPUT"; fi
  ./gradlew -Dorg.gradle.internal.repository.max.tentatives=8 -Dorg.gradle.internal.repository.initial.backoff=5000 "$@"
  rc=$?
fi
rm -f "$LOG"
exit "$rc"
