#!/bin/bash
shopt -s nullglob
[ -n "$1" ] && base="$1" || base="."
for i in "$base"/*adx; do
  basename=$(basename "$i" .adx)
  out="${basename}.wav"
  [ -e "$out" ] || ffmpeg -i "$i" -map 0:a "$out"
done
for i in "$base"/*wav; do
  basename=$(basename "$i" .wav)
  out="${basename}.opus"
  [ -e "$out" ] || ffmpeg -i "$i" -map 0:a -codec:a opus -vbr on "$out"
  out="${basename}.mp3"
  [ -e "$out" ] || ffmpeg -i "$i" -map 0:a -codec:a libmp3lame -qscale:a 5 "$out"
done
