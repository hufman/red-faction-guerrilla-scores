#!/bin/sh
[ -e files.txt ] && rm files.txt

for i in *wav; do
  name=`echo "$i" | awk -F. '{print $1}'`
  duration=`ffprobe -v error -i $i -show_format -of default=noprint_wrappers=1 | grep duration | awk -F= '{print $2}'`
  echo "$name|$duration" >> files.txt
done
