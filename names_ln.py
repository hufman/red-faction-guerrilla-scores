#!/usr/bin/env python

import sys

filename = sys.argv[1]
file = open(filename,'r')
offset = 0

if len(sys.argv)>2:
  offset = int(sys.argv[2], 16)

for i,name in enumerate(file.readlines()):
  if name.strip() == '':
    continue
  print('%08x.wav %s.wav' % (offset+i, name.strip()))
