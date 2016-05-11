#!/usr/bin/env python

import sys

filename = "mus_prog_1.names"
file = open(filename,'r')

for i,name in enumerate(file.readlines()):
  print('%08x.wav %s.wav' % (i, name.strip()))
