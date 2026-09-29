#!/usr/bin/env bash
# surface-jest-failure.sh <jest output file> <title>
#
# A CI log needs a sign-in to read, so a Jest step that fails puts its failing
# tests into ONE error annotation: on the run's page, and in the public checks
# API. The failing files, then Jest's summary of each ("● Console" lines left
# out), then its totals. No file: that step never ran (an earlier one failed).
out="$1"
title="$2"
[ -f "$out" ] || exit 0
{
  grep -E "^FAIL " "$out" | sort -u | head -20
  sed -n '/Summary of all failing tests/,/^Test Suites:/p' "$out" | grep -v "● Console" | head -60
  grep -E "^Tests:|^Test Suites:|threshold" "$out" | tail -5
} > "${out%.txt}-failure.txt"
echo "::error title=${title}::$(sed ':a;N;$!ba;s/%/%25/g;s/\r//g;s/\n/%0A/g' "${out%.txt}-failure.txt")"
