#!/usr/bin/env bash
# kept-debs.sh — installs the system packages a run before kept (~/apt-debs), by dpkg alone.
#
#   bash mobile/scripts/kept-debs.sh [<dir>]
#
# Playwright's --with-deps runs apt-get update before it installs anything, and on a slow
# Ubuntu mirror that alone outlived a five-minute try (God-Tier 39806861456: 4.5 minutes on the
# package lists, none of the 26 MB of packages yet asked for). The packages are on disk already,
# so they go in without apt. A package already installed, at any version, is left as it is: the
# runner's image may carry a newer one. Exits 1 when none were kept or dpkg refuses one, and the
# caller then lets apt fetch them (a first run, or a new image).
set -u
DIR="${1:-$HOME/apt-debs}"
ls "$DIR"/*.deb > /dev/null 2>&1 || { echo "no packages kept in $DIR"; exit 1; }
want=()
for deb in "$DIR"/*.deb; do
  pkg=$(dpkg-deb -f "$deb" Package)
  dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q "install ok installed" || want+=("$deb")
done
if [ ${#want[@]} -eq 0 ]; then
  echo "every kept package is installed already"
  exit 0
fi
echo "installing ${#want[@]} kept packages"
sudo dpkg -i "${want[@]}" > /dev/null || { echo "dpkg refused a kept package"; exit 1; }
