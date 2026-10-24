#!/usr/bin/env bash
# The browser checks: each opens the game in Chromium (Playwright), plays it and prints "ok:" or "FAIL:" lines.
# They run against the normal page (index.html) and the single file (dist/TheMaskedHouse.html, copied to out/lonely
# so it is checked on its own, with nothing else beside it).
#
#   tests/browser/run.sh              every check
#   tests/browser/run.sh fight_ui ... just these
#
# Build the single file first (node tools/build.js). Screenshots land in tests/browser/out (not kept in git).
cd "$(dirname "$0")" || exit 1
mkdir -p out/lonely && cp ../../dist/TheMaskedHouse.html out/lonely/
# tex_timing also checks the page as served from a web server
python3 -m http.server 8765 --directory ../.. >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
list=${*:-$(ls *.js | sed 's/\.js$//')}
fails=0
for t in $list; do
  out=$(timeout 590 node "$t.js" 2>&1)
  n=$(grep -cE "FAIL|Error" <<<"$out")
  printf "%s:%s " "$t" "$n"
  if [ "$n" -gt 0 ]; then echo; grep -E "FAIL|Error" <<<"$out" | head -5; fi
  fails=$((fails + n))
done
echo
echo "TOTAL_FAILS=$fails"
[ "$fails" -eq 0 ]
