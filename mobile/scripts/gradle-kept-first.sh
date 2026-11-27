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
# alone. Only when they lack something is it run again online, each package asked up to eight times
# from five seconds apart, and the step's output says fetched=true, so the workflow keeps the fuller
# packages for the next build. Any other failure stops the build.
#
# Gradle says a package is lacking in more than one way: a library "No cached version ... available
# for offline mode", a plugin "could not resolve plugin artifact" with no word of offline mode (the
# foojay toolchain plugin, nightly 45804336594: every build of the night failed in 24 s, never asking
# the network). Both are a resolution Gradle could not make, and that is what LACKING reads.
LACKING='offline mode|could not resolve'
set -u
# Google's copy of Maven Central is asked first and Central itself second, offline and online alike
# (maven-central-copy.init.gradle): Central answers the runners with 429 (nightly 45894847027's
# warm-up, eleven minutes on one jar), and the kept packages are held by the repository they were read
# from, so both runs name the same ones. Gradle moves to the next repository only past a 404, never past
# an error, so a copy that answers with an error (COPY_DOWN) is met here: the build runs once more
# from Central alone.
COPY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/maven-central-copy.init.gradle"
COPY_DOWN="Could not (GET|HEAD) 'https://maven-central\.storage-download\.googleapis\.com/"
PATIENT=(-Dorg.gradle.internal.repository.max.tentatives=8 -Dorg.gradle.internal.repository.initial.backoff=5000)
LOG="$(mktemp)"
./gradlew --offline --init-script "$COPY" "$@" 2>&1 | tee "$LOG"
rc=${PIPESTATUS[0]}
if [ "$rc" -ne 0 ] && grep -qiE "$LACKING" "$LOG"; then
  echo "(the kept packages lack what the build asks for: it is run again, asking the network)"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "fetched=true" >> "$GITHUB_OUTPUT"; fi
  ./gradlew --init-script "$COPY" "${PATIENT[@]}" "$@" 2>&1 | tee "$LOG"
  rc=${PIPESTATUS[0]}
  if [ "$rc" -ne 0 ] && grep -qE "$COPY_DOWN" "$LOG"; then
    echo "(Google's copy of Maven Central answered with an error: it is run again, from Maven Central alone)"
    ./gradlew "${PATIENT[@]}" "$@"
    rc=$?
  fi
fi
rm -f "$LOG"
exit "$rc"
