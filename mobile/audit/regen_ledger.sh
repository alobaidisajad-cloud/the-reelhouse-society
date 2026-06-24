#!/bin/bash
# Regenerates audit/LEDGER.md from /tmp/filelist.txt (all files) + audit/status.tsv (audited).
cd "$(dirname "$0")/.."
declare -A ST
if [ -f audit/status.tsv ]; then
  while IFS=$'\t' read -r path status crit high med low elite; do
    ST["$path"]="$status|$crit|$high|$med|$low|$elite"
  done < audit/status.tsv
fi
total=$(wc -l < /tmp/filelist.txt)
done_n=$(grep -c "AUDITED" audit/status.tsv 2>/dev/null || echo 0)
{
echo "# ReelHouse Mobile — Audit Ledger"
echo ""
echo "**Progress: $done_n / $total files AUDITED.**  Regenerated $(date '+%Y-%m-%d %H:%M')."
echo ""
echo "| File | Lines | Status | Crit | High | Med | Low | Elite? |"
echo "|------|------:|--------|----:|----:|----:|----:|--------|"
sort -t'|' -k2 /tmp/filelist.txt | while IFS='|' read -r lines path; do
  if [ -n "${ST[$path]}" ]; then
    IFS='|' read -r status crit high med low elite <<< "${ST[$path]}"
    echo "| \`$path\` | $lines | $status | $crit | $high | $med | $low | $elite |"
  else
    echo "| \`$path\` | $lines | PENDING |  |  |  |  |  |"
  fi
done
} > audit/LEDGER.md
echo "Ledger regenerated: $done_n / $total AUDITED."
