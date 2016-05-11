#!/usr/bin/env python

import sys
import xml.etree.ElementTree as ET

filename = sys.argv[1]
tree = ET.parse(filename)

for file_node in tree.findall('.//File'):
  name = file_node.find('Name').text
  marker_nodes = file_node.findall('Marker')
  offset = marker_nodes[-1].find('Time_Offset').text

  print("%s %s (%s)"% (name, offset, len(marker_nodes)))
