#!/usr/bin/env python

import sys
import xml.etree.ElementTree as ET
import graphviz

filename = sys.argv[1]
tree = ET.parse(filename)

title = tree.find('.//SCORE/NAME').text
g_main = graphviz.Digraph(title, engine='neato', format='svg')

states = {}

def add_state(name):
  global states
  g_state = graphviz.Digraph(state_name, format='svg')
  states[state_name] = g_state
  return g_state

def add_clip(graph, clip_name):
  print("Found clip %s"%(clip_name,))
  graph.node(clip_name)

# load all the states
for state_node in tree.findall('.//SCORE/STATE'):
  state_name = state_node.find('NAME').text
  g_state = add_state(state_name)

# load all the clips
for clip_node in tree.findall('.//SCORE/CLIP'):
  clip_name = clip_node.find('NAME').text
  state_name = clip_node.find('STATE').text
  g_state = states[state_name]
  add_clip(g_state, clip_name)

# add intra-state edges
for clip_node in tree.findall('.//SCORE/CLIP'):
  clip_name = clip_node.find('NAME').text
  state_name = clip_node.find('STATE').text
  g_state = states[state_name]
  for dest_node in clip_node.findall('./WEIGHTED'):
    dest_name = dest_node.text.split(':')[1]
    g_state.edge(clip_name, dest_name)
  for dest_node in clip_node.findall('./LULL_NAME'):
    dest_name = dest_node.text.split(':')[1]
    g_state.edge(clip_name, dest_name)

# add inter-state edges
for state_node in tree.findall('.//SCORE/STATE'):
  state_name = state_node.find('NAME').text
  g_state = states[state_name]
  for tran_node in state_node.findall('./TRANSITION_CLIP'):
    from_clip_name = tran_node.find('FROM_CLIP').text
    for tran_dest_node in tran_node.findall('./CLIP'):
      dest_clip_name = tran_dest_node.text
      g_state.edge(from_clip_name, dest_clip_name)

# add the subgraphs
for g_state in states.values():
  g_main.subgraph(g_state)

# render
states.values()[0].render('testoutput')
