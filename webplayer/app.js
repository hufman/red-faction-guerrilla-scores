var scores = (function() {
  var foleyMarkers = {}  // cue name mapped to a list of timestamps
                          // indicating acceptable times to transition
  var songs = {
    'Uprising': {
      name: 'Uprising',
      path: 'mus_progression_01',
      file: 'mus_progression_01.mtbl'
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
        var nodes = doc.evaluate('.//File', doc);
        var node = nodes.iterateNext();
        while (node) {
          var name = doc.evaluate('./Name', node, null, XPathResult.STRING_TYPE).stringValue
          var times = [];
          var markers = doc.evaluate('./Marker', node);
          var markerNode = markers.iterateNext();
          while (markerNode) {
            var timeNode = doc.evaluate('./Time_Offset', markerNode, null, XPathResult.NUMBER_TYPE)
            var time = timeNode.numberValue / 1000.0;
            times.push(time);
            markerNode = markers.iterateNext();
          }
          results[name] = times;
          node = nodes.iterateNext();
        }
        return results;
      }
    }).then(function(data) {foleyMarkers = data;});
  };
  loadFoleyMarkers();

  var loadScore = function(name) {
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
    return m.request({method:'GET', url:_p(score),
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
        var nodes = doc.evaluate(query, context); var node;
        while ((node = nodes.iterateNext()) != null) {
          results.push(node.textContent);
        }
        return results;
      }
      // parse the mtbl
      var scoreNode = doc.evaluate('.//SCORE', doc).iterateNext();
      mtbl['firstState'] = allElementTexts(doc, scoreNode, 'FIRST_STATE')[0];

      // load all the states
      mtbl['states'] = {}	// keyed on state name
      var stateNodes = doc.evaluate('./STATE', scoreNode); var stateNode;
      while ((stateNode = stateNodes.iterateNext()) != null) {
        var state = {}
        var name = allElementTexts(doc, stateNode, 'NAME')[0];
        mtbl['states'][name] = state;
        state['name'] = name;
        // first clips of the state
        state['firstClips'] = allElementTexts(doc, stateNode, 'FIRST_CLIP');

        // load transition clips into this state
        state['transitionsIn'] = {};	// keyed on previous state name
        var transitionNodes = doc.evaluate('./TRANSITION', stateNode); var transitionNode;
        while ((transitionNode = transitionNodes.iterateNext()) != null) {
          var fromName = allElementTexts(doc, transitionNode, 'FROM')[0];
          state['transitionsIn'][fromName] = allElementTexts(doc, transitionNode, 'CLIP');
        }

        // load transition clips out of this state
        state['transitionsOut'] = {};	// keyed on cue name
        var transitionNodes = doc.evaluate('./TRANSITIONcLIP', stateNode); var transitionNode;
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
      var clipNodes = doc.evaluate('./CLIP', scoreNode); var clipNode;
      while ((clipNode = clipNodes.iterateNext()) != null) {
        var clip = {};
        var name = allElementTexts(doc, clipNode, 'NAME')[0];
        mtbl['cues'][name] = clip;
        clip['path'] = _p(name);
        clip['name'] = name;
        clip['state'] = allElementTexts(doc, clipNode, 'STATE');
        // meanders
        clip['nextCues'] = parseMeanders(doc, clipNode, 'WEIGHTED');
        clip['lullCues'] = parseMeanders(doc, clipNode, 'LULL_NAME');
      }

      return mtbl;
    });
  };

  return {
    list: list,
    load: loadScore
  };
})()

var musicEngine = (function(scores){
  var randomChoice = function(array) {
    var index = Math.floor(Math.random() * array.length);
    return array[index];
  };

  var scoreData = null;
  var playback = {};

  var clear = function() {
    playback = {};
  };
  var init = function() {
    // various first time startup things for a song
    playback['currentState'] = scoreData['firstState'];
    playback['currentCue'] = randomChoice(scoreData['states'][playback['currentState']]['firstClips']);
  };
  var play = function() {
    var cue = scoreData['cues'][playback['currentCue']];
    playback['currentAudio'] = document.createElement('audio');
    playback['currentAudio'].setAttribute('src', cue['path'] + '.opus');
    playback['currentAudio'].play();
  };
  var stop = function() {
    if (playback['currentAudio'] &&
        !playback['currentAudio'].paused) {
      playback['currentAudio'].pause();
    }
  };

  var loadScore = function(name) {
    stop();
    clear();
    var loadingScore = scores.load(name);
    loadingScore.then(function(newData) {
      scoreData = newData;
      init();
      play();
    });
  };

  return {
    loadScore: loadScore,
    play: play,
    stop: stop
  };
})(scores);

musicEngine.loadScore('Uprising');
