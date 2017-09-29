var scores = (function() {
  var foleyMarkers = {}  // cue name mapped to a list of timestamps
                          // indicating acceptable times to transition
  var songs = {
    'Uprising (Day)': {
      name: 'Uprising (Day)',
      path: 'mus_progression_01',
      file: 'mus_progression_01_day.mtbl'
    },
    'Uprising (Night)': {
      name: 'Uprising (Night)',
      path: 'mus_progression_01',
      file: 'mus_progression_01_night.mtbl'
    },
    'Uprising (Marauder)': {
      name: 'Uprising (Marauder)',
      path: 'mus_progression_01',
      file: 'mus_progression_01_marauder.mtbl'
    },
    'Oppression (Day)': {
      name: 'Oppression (Day)',
      path: 'mus_progression_02',
      file: 'mus_progression_02_day.mtbl'
    },
    'Oppression (Night)': {
      name: 'Oppression (Night)',
      path: 'mus_progression_02',
      file: 'mus_progression_02_night.mtbl'
    },
    'Oppression (Marauder)': {
      name: 'Oppression (Marauder)',
      path: 'mus_progression_02',
      file: 'mus_progression_02_marauder.mtbl'
    },
    'Vindication (Day)': {
      name: 'Vindication (Day)',
      path: 'mus_progression_03',
      file: 'mus_progression_03_day.mtbl'
    },
    'Vindication (Night)': {
      name: 'Vindication (Night)',
      path: 'mus_progression_03',
      file: 'mus_progression_03_night.mtbl'
    },
    'Vindication (Marauder)': {
      name: 'Vindication (Marauder)',
      path: 'mus_progression_03',
      file: 'mus_progression_03_marauder.mtbl'
    },
    'Subvert': {
      name: 'Subvert',
      path: 'mus_progression_01',
      file: 'mus_mission_a.mtbl'
    },
    'Mission Evade': {
      name: 'Mission Evade',
      path: 'mus_progression_01',
      file: 'mus_mission_b.mtbl'
    },
    'Mission Destroy': {
      name: 'Mission Destroy',
      path: 'mus_progression_01',
      file: 'mus_mission_c.mtbl'
    },
    'Mission Capstone': {
      name: 'Mission Capstone',
      path: 'mus_progression_01',
      file: 'mus_mission_capstone.mtbl'
    },
    'Mission Final': {
      name: 'Mission Final',
      path: 'mus_progression_01',
      file: 'mus_mission_final.mtbl'
    },
    'Demolitions Master': {
      name: 'Demolitions Master',
      path: 'mus_demomaster',
      file: 'mus_demomaster.mtbl'
    }
  };
  var list = Object.keys(songs);

  var score = null;

  var loadFoleyMarkers = function() {
    return m.request({method:'GET', url:'foley_markers.xtbl',
      deserialize: function(data) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(data, 'application/xml');
        return doc;
      },
      unwrapSuccess: function(doc) {
        var results = {};
        var nodes = doc.evaluate('.//File', doc, null, XPathResult.ANY_TYPE, null);
        var node = nodes.iterateNext();
        while (node) {
          var name = doc.evaluate('./Name', node, null, XPathResult.STRING_TYPE, null).stringValue;
          var times = [];
          var markers = doc.evaluate('./Marker', node, null, XPathResult.ANY_TYPE, null);
          var markerNode = markers.iterateNext();
          while (markerNode) {
            var timeNode = doc.evaluate('./Time_Offset', markerNode, null, XPathResult.NUMBER_TYPE, null);
            var time = timeNode.numberValue / 1000.0;
            times.push(time);
            markerNode = markers.iterateNext();
          }
          results[name] = times;
          node = nodes.iterateNext();
        }
        return results;
      }
    }).then(function(data) {Object.assign(foleyMarkers, data);});
  };
  var loadingFoleyMarkers = loadFoleyMarkers();

  var loadScoreFromServer = function(name) {
    var scoreMetadata = songs[name];
    var path = scoreMetadata['path'];
    var score = scoreMetadata['file'];
    var mtbl = {};
    mtbl['name'] = name;
    mtbl['path'] = path;
    mtbl['file'] = score;

    var _p = function(filename) {
      return path + '/' + filename;
    };
    var loadingScore = m.request({method:'GET', url:_p(score),
      deserialize: function(data) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(data, 'application/xml');
        return doc;
      }
    }).then(function(doc) {
      var allElementTexts = function(doc, context, query) {
        var results = [];
        if (query.indexOf('/') == -1) {
          query = './' + query;
        }
        var nodes = doc.evaluate(query, context, null, XPathResult.ANY_TYPE, null); var node;
        while ((node = nodes.iterateNext()) != null) {
          results.push(node.textContent);
        }
        return results;
      }
      // parse the mtbl
      var scoreNode = doc.evaluate('.//SCORE', doc, null, XPathResult.ANY_TYPE, null).iterateNext();
      mtbl['firstState'] = allElementTexts(doc, scoreNode, 'FIRST_STATE')[0];

      // load all the states
      mtbl['states'] = {};	// keyed on state name
      mtbl['statesOrder'] = [];	// order of states, from least to most intense
      var stateNodes = doc.evaluate('./STATE', scoreNode, null, XPathResult.ANY_TYPE, null); var stateNode;
      while ((stateNode = stateNodes.iterateNext()) != null) {
        var name = allElementTexts(doc, stateNode, 'NAME')[0];
        mtbl['statesOrder'].push(name);
        var state = {}
        mtbl['states'][name] = state;
        state['name'] = name;
        // first clips of the state
        state['firstClips'] = allElementTexts(doc, stateNode, 'FIRST_CLIP');

        // load transition clips into this state
        state['transitionsIn'] = {};	// keyed on previous state name
        var transitionNodes = doc.evaluate('./TRANSITION', stateNode, null, XPathResult.ANY_TYPE, null); var transitionNode;
        while ((transitionNode = transitionNodes.iterateNext()) != null) {
          var fromName = allElementTexts(doc, transitionNode, 'FROM')[0];
          state['transitionsIn'][fromName] = allElementTexts(doc, transitionNode, 'CLIP');
        }

        // load transition clips out of this state
        state['transitionsOut'] = {};	// keyed on cue name
        var transitionNodes = doc.evaluate('./TRANSITION_CLIP', stateNode, null, XPathResult.ANY_TYPE, null); var transitionNode;
        while ((transitionNode = transitionNodes.iterateNext()) != null) {
          var fromName = allElementTexts(doc, transitionNode, 'FROM_CLIP')[0];
          state['transitionsOut'][fromName] = allElementTexts(doc, transitionNode, 'CLIP');
        }
      }

      // load intra-state cue meanders
      var parseMeanders = function(doc, context, name) {
        var weightedNodes = allElementTexts(doc, context, name);
        var totalWeight = 0.0;
        var cues = [];
        for (var i=0; i<weightedNodes.length; i++) {
          var weight = weightedNodes[i];
          var weightSplits = weight.split(':',2);
          var weightVal = parseInt(weightSplits[0]);
          var weightName = weightSplits[1];
          var cue = {};
          cue['weight'] = weightVal;
          cue['name'] = weightName;
          cues.push(cue);
          totalWeight += weightVal;
        }
        for (var i=0; i<cues.length; i++) {
          cues[i]['probability'] = cues[i]['weight'] / totalWeight;
        }
        return cues;
      }
      mtbl['cues'] = {}	// keyed on cue name
      var clipNodes = doc.evaluate('./CLIP', scoreNode, null, XPathResult.ANY_TYPE, null); var clipNode;
      while ((clipNode = clipNodes.iterateNext()) != null) {
        var clip = {};
        var name = allElementTexts(doc, clipNode, 'NAME')[0];
        mtbl['cues'][name] = clip;
        clip['path'] = _p(name);
        clip['name'] = name;
        clip['state'] = allElementTexts(doc, clipNode, 'STATE')[0];
        // meanders
        clip['nextCues'] = parseMeanders(doc, clipNode, 'WEIGHTED');
        clip['lullCues'] = parseMeanders(doc, clipNode, 'LULL_NAME');
      }

      return mtbl;
    });
    return loadingScore;
  };

  // expand a list of strings into a full Cue Choice description
  var expandCueChoices = function(strList) {
    var cueList = [];
    for (var i=0; i<strList.length; i++) {
      var str = strList[i];
      var cue = {};
      cue['name'] = str;
      cue['weight'] = 1;
      cue['probability'] = 1.0 / strList.length;
      cueList.push(cue);
    }
    return cueList;
  };

  // converts from state-centric to clip-centric data structure
  var convertScore = function(mtbl) {
    var score = {
      'firstState': '',
      'statesOrder': [],
      'states': {},
      'cues': {}
    };
    // get state info
    score['firstState'] = mtbl['firstState'];
    for (var i=0; i<mtbl['statesOrder'].length; i++) {
      var stateName = mtbl['statesOrder'][i];
      var mtblState = mtbl['states'][stateName];
      score['statesOrder'].push(stateName);
      var state = {}
      score['states'][stateName] = state;
      state['name'] = stateName;
      state['firstClips'] = expandCueChoices(mtblState['firstClips']);
    }
    // create all the cues
    for (var name in mtbl['cues']) {
      var mtblCue = mtbl['cues'][name];
      var cue = {};
      score['cues'][name] = cue;
      cue['name'] = name;
      cue['path'] = mtblCue['path'];
      cue['file'] = mtblCue['file'];
      cue['state'] = mtblCue['state'];
      if (name.indexOf('_TRAN_') != -1) {
        // transition clips have the previous state as their state
        // but i want them to actually have the destination state
        var stateIndex = score['statesOrder'].indexOf(cue['state']);
        cue['state'] = score['statesOrder'][stateIndex+1];
      }
    }
    // link the cues
    for (var name in mtbl['cues']) {
      var mtblCue = mtbl['cues'][name];
      var cue = score['cues'][name];
      var stateIndex = score['statesOrder'].indexOf(cue['state']);
      cue['jumpPoints'] = foleyMarkers[name];
      // set up transitions
      cue['nextStates'] = {}
      // handle current state
      var nextState = {};
      nextState['name'] = cue['state'];
      nextState['cues'] = mtblCue['nextCues'];
      cue['nextStates'][nextState['name']] = nextState;
      // handle up state
      if (name.indexOf('_TRAN_') == -1 && name.indexOf('_LULL_') == -1 && stateIndex+1 < score['statesOrder'].length) {
        if (mtbl['states'][cue['state']]['transitionsOut'].hasOwnProperty(name)) {
          var upState = {};
          upState['name'] = score['statesOrder'][stateIndex+1];
          upState['cues'] = expandCueChoices(mtbl['states'][cue['state']]['transitionsOut'][name]);
          cue['nextStates'][upState['name']] = upState;
        }
      }
    }
    // assign the Lull clips
    for (var name in mtbl['cues']) {
      var mtblCue = mtbl['cues'][name];
      var cue = score['cues'][name];
      var stateIndex = score['statesOrder'].indexOf(cue['state']);
      // handle down state
      if (name.indexOf('_PROG1_') == -1 && mtblCue['lullCues'].length > 0) {
        for (var l=0; l<mtblCue['lullCues'].length; l++) {
          var mtblLullCue = mtblCue['lullCues'][l];
          var lullCue = {};
          // prepare downState
          var downState;
          var lullState = mtbl['cues'][mtblLullCue['name']]['state'];
          if (!cue['nextStates'].hasOwnProperty(lullState)) {
            downState = {};
            downState['name'] = lullState;
            downState['cues'] = [];
            cue['nextStates'][downState['name']] = downState;
          } else {
            downState = cue['nextStates'][downState['name']];
          }
          // create a fake cue transition
          lullCue['name'] = mtblLullCue['name'] + '_FROM_' + name;
          lullCue['weight'] = mtblLullCue['weight'];
          lullCue['probability'] = mtblLullCue['probability'];
          downState['cues'].push(lullCue);
          // clone the actual LULL cue to a fake one that returns back
          var origLullCue = score['cues'][mtblLullCue['name']];
          var newLullCue = {};
          newLullCue['name'] = origLullCue['name'] + '_FROM_' + name;
          newLullCue['state'] = origLullCue['state'];
          newLullCue['jumpPoints'] = origLullCue['jumpPoints'];
          newLullCue['file'] = origLullCue['file'];
          newLullCue['path'] = origLullCue['path'];
          newLullCue['nextStates'] = {}
          // continue to ambient after lull
          if (origLullCue['nextStates'][newLullCue['state']].length > 0) {
            newLullCue['nextStates'][newLullCue['state']] = origLullCue['nextStates'][newLullCue['state']]
          } else {
            var destState = {};
            destState['name'] = newLullCue['state'];
            destState['cues'] = expandCueChoices(mtbl['states'][newLullCue['state']]['transitionsIn'][cue['state']]);
            newLullCue['nextStates'][destState['name']] = destState;
          }
          // jump back to combat
          newLullCue['nextStates'][cue['state']] = cue['nextStates'][cue['state']]
          score['cues'][newLullCue['name']] = newLullCue;
        } // for in lullCues
      } // if lullCues
      // make some fake transitions, if there are no Lulls
      if (name.indexOf('_LULL_') == -1 && stateIndex-1 >= 0 && (name.indexOf('_PROG1_') != -1 || mtblCue['lullCues'].length == 0)) {
        var downState = {};
        downState['name'] = score['statesOrder'][stateIndex-1];
        downState['cues'] = expandCueChoices(mtbl['states'][downState['name']]['transitionsIn'][cue['state']]);
        cue['nextStates'][downState['name']] = downState;
      } // if not LULL
    } // for in cues
    return score;
  };

  var loadScore = function(name) {
    return PromiseAll(loadingFoleyMarkers, loadScoreFromServer(name)).then(convertScore);
  };

  return {
    list: list,
    load: loadScore,
  };
})()

