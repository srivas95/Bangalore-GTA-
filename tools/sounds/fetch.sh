#!/bin/sh
# Download the source recordings listed in sources.txt into $1 (default ./raw).
# Then: python3 build_sounds.py <raw dir> <out dir>  and copy <out>/audio to public/audio
# and <out>/soundBank.json to src/systems/soundBank.json (compacted).
set -e
OUT=${1:-raw}
mkdir -p "$OUT"
grep -v '^#' "$(dirname "$0")/sources.txt" | while IFS='|' read -r name year path; do
  [ -s "$OUT/$name.mp3" ] && continue
  enc=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$path")
  curl -sSL --retry 3 -o "$OUT/$name.mp3" "https://archive.org/download/sonniss-gdc-$year-game-audio-bundle-normalized/$enc"
  echo "$name"
done
