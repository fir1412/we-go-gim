#!/usr/bin/env bash
# After `git push origin main`: wait until GitHub Pages serves this sw.js VERSION, re-running a Pages build that
# failed ("in progress deployment" when pushes land close together). Run with: bash tests/live-check.sh
set -u
cd "$(dirname "$0")/.."
want=$(sed -n 2p sw.js) repo=fir1412/we-go-gim url=https://fir1412.github.io/we-go-gim/sw.js
sha=$(git rev-parse main)
for i in $(seq 1 60); do
  [ "$(curl -s "$url?x=$RANDOM" | sed -n 2p)" = "$want" ] && { echo "LIVE: $want"; exit 0; }
  id=$(gh run list -R "$repo" -L 1 --json databaseId,conclusion,headSha -q ".[0] | select(.conclusion==\"failure\" and .headSha==\"$sha\") | .databaseId" 2>/dev/null)
  [ -n "$id" ] && { echo "re-running failed Pages run $id"; gh run rerun "$id" -R "$repo" >/dev/null; sleep 30; }
  sleep 15
done
echo "NOT LIVE after 15 min: still not $want"; exit 2
