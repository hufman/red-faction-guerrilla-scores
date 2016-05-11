#!/usr/bin/env python

import sys
import xml.etree.ElementTree as ET

filename = sys.argv[1]
tree = ET.parse(filename)
root = tree.getroot()

clips = tree.findall('.//TABLE/MUSIC/SCORE/CLIP')
for i,clip in enumerate(clips):
  print('%08x.wav %s.wav' % (i, clip.find('NAME').text))
