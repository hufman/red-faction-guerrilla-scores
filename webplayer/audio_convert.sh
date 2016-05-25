#!/bin/bash
for i in *wav; do
  basename=$(basename "$i" .wav)
  out="${basename}.opus"
  [ -e "$out" ] || ffmpeg -i "$i" -map 0:a -codec:a opus -vbr on "$out"
  out="${basename}.mp3"
  [ -e "$out" ] || ffmpeg -i "$i" -map 0:a -codec:a libmp3lame -qscale:a 5 "$out"
done
