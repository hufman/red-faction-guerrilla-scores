var PromiseAll = function() {
  var promise = m.deferred();
  m.sync(arguments).then(function(datas) {
    promise.resolve(datas[datas.length - 1]);
  }, function(errors) {
    promise.reject(errors[errors.length - 1]);
  });
  return promise.promise;
}
var scores = (function() {
  var foleyMarkers = {}  // cue name mapped to a list of timestamps
                          // indicating acceptable times to transition
  var songs = {
    'Uprising': {
      name: 'Uprising',
      path: 'mus_progression_01',
      file: 'mus_progression_01.mtbl'
    },
    'Mission Capstone': {
      name: 'Mission Capstone',
      path: 'mus_progression_01',
      file: 'mus_mission_capstone.mtbl'
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
    }).then(function(data) {Object.assign(foleyMarkers, data);});
  };
  var loadingFoleyMarkers = loadFoleyMarkers();

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
        var transitionNodes = doc.evaluate('./TRANSITION_CLIP', stateNode); var transitionNode;
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
        clip['state'] = allElementTexts(doc, clipNode, 'STATE')[0];
        // meanders
        clip['nextCues'] = parseMeanders(doc, clipNode, 'WEIGHTED');
        clip['lullCues'] = parseMeanders(doc, clipNode, 'LULL_NAME');
      }

      return mtbl;
    });
    return PromiseAll(loadingFoleyMarkers, loadingScore);
  };

  return {
    list: list,
    load: loadScore,
    foleyMarkers: foleyMarkers
  };
})()

var musicEngine = (function(scores){
  var randomChoice = function(array) {
    var index = Math.floor(Math.random() * array.length);
    return array[index];
  };
  var randomWeightedChoice = function(array) {
    if (!array[0].probability) {
      return randomChoice(array);
    }
    var probable = Math.random();
    for (var i=0; i<array.length; i++) {
      probable = probable - array[i].probability;
      if (probable < 0) {
        return array[i]['name'];
      }
    };
    return array[array.length - 1]['name'];
  };

  var foleyMarkers = scores['foleyMarkers'];
  var scoreData = null;
  var playback = {};
  var subscribers = [];

  var clear = function() {
    for (var key in playback) {
      delete playback[key];
    }
  };
  var init = function() {
    /* various first time startup things for a score */
    playback['currentState'] = scoreData['firstState'];
    playback['nextState'] = playback['currentState'];
    playback['nextChoices'] = scoreData['states'][playback['currentState']]['firstClips'];
    pickNextChoice();
  };
  var play = function() {
    /* Start playing audio */
    console.log("Resuming playback");
    if (playback['currentAudio'] &&
        playback['currentAudio'].paused) {
      playback['currentAudio'].play();
    }
  };
  var stop = function() {
    /* Stop playing audio */
    console.log("Pausing playback");
    if (playback['currentAudio'] &&
        !playback['currentAudio'].paused) {
      playback['currentAudio'].pause();
    }
  };
  var skip = function() {
    scheduleNextFuture(true);
  };
  var getStates = function() {
    return Object.keys(scoreData['states']);
  };
  var setState = function(state) {
    if (!scoreData['states'].hasOwnProperty(state)) {
      throw new RangeError("Invalid state "+state);
    }
    playback['nextState'] = state;
    nextChoices();
  };
  var getChoices = function() {
    var ret = []
    for (var i=0; i<playback['nextChoices'].length; i++) {
      var cue = playback['nextChoices'][i];
      if (cue.hasOwnProperty('probability')) {
        ret.push(cue['name']);
      } else {
        ret.push(cue);
      }
    }
    return ret;
  };
  var setChoice = function(choice) {
    var found = false;
    var choices = getChoices();
    i = choices.indexOf(choice);
    if (i==-1) {
      throw new RangeError("Invalid choice "+choice);
    }
    playback['nextCue'] = choice;
    console.log("Chose %s", playback['nextCue']);
    scheduleNext();
    sendNotify();
  };
  var onNotify = function(callback) {
    subscribers.push(callback)
  };
  var sendNotify = function(data) {
    for (var i=0; i<subscribers.length; i++) {
      subscribers[i](data);
    }
  };

  var nextChoices = function() {
    /* Pick the list of choices for the next cue */
    if (playback['currentState'] == playback['nextState']) {
      nextChoicesIntraState();
    } else {
      nextChoicesTransition();
    }
  };
  var nextChoicesIntraState = function() {
    /* Pick the list of choices, when staying in the same state */
    var cueData = scoreData['cues'][playback['currentCue']];
    if (cueData) {
      playback['nextChoices'] = cueData['nextCues'];
      pickNextChoice();
    } else {
      console.error("Cue doesn't exist in the data! " + playback['currentCue']);
    }
  };
  var nextChoicesTransition = function() {
    /* Pick the list of choices, when transitioning to a new state */
    var cueData = scoreData['cues'][playback['currentCue']];
    if (cueData) {
      // amb -> amb melodic doesn't have a transition
      // amb -> combat does have a transition
      // transitionsOut checks to see if the transition cue is actually
      // in the nextState
      var outs = scoreData['states'][playback['currentState']]['transitionsOut'];
      var outClips = outs[playback['currentCue']] || [];
      var validOuts = [];
      for (var i=0; i<outClips.length; i++) {
        var outClipName = outClips[i];
        var outClipData = scoreData['cues'][outClipName];
        var outClipNextName = outClipData['nextCues'][0]['name'];
        if (scoreData['cues'][outClipNextName]['state'] == playback['nextState']) {
          validOuts.push(outClips[i]);
        }
      }
      // if we have transitions, use them
      // otherwise, just pick from transitionsIn
      if (validOuts.length > 0) {
        playback['nextChoices'] = validOuts;
      } else {
        console.log("No transitions found from %s to %s", playback['currentState'], playback['nextState']);
        var nextState = scoreData['states'][playback['nextState']];
        playback['nextChoices'] = nextState['transitionsIn'][playback['currentState']];
      }
      pickNextChoice();
    } else {
      console.error("Cue doesn't exist in the data! " + playback['currentCue']);
    }
  };
  var pickNextChoice = function() {
    /* Pick out the next cue to play */
    console.log("Choosing next cue from %o", playback['nextChoices']);
    playback['nextCue'] = randomWeightedChoice(playback['nextChoices']);
    console.log("Picked %s", playback['nextCue']);
    scheduleNext();
    sendNotify();
  };
  var scheduleNext = function() {
    /* start preloading nextAudio */
    console.log("Preloading next cue %s", playback['nextCue']);
    var cue = scoreData['cues'][playback['nextCue']];
    playback['nextAudio'] = document.createElement('audio');
    playback['nextAudio'].setAttribute('preload', 'auto');
    var formats = {'opus':'audio/ogg; codecs="opus"', 'mp3':'audio/mpeg'}
    for (var ext in formats) {
      var src = document.createElement('source');
      src.setAttribute('src', cue['path'] + '.' + ext);
      src.setAttribute('type', formats[ext]);
      playback['nextAudio'].appendChild(src);
    }
    if (! playback['currentAudio']) {  // nothing is currently loaded to play
      scheduleNextImmediately();
    } else {  // there is something lined up
      // if it's playing, schedule it now
      if (playback['currentStart']) {
        console.log("Currently playing, schedule next cue");
        scheduleNextFuture();
      };
      // else, it will schedule when currentAudio starts playing
    };
  };
  var scheduleNextImmediately = function() {
    /* try to play nextAudio as soon as its loaded */
    var nextAudio = playback['nextAudio'];
    var loadListener = function() {
      nextAudio.removeEventListener('canplay', loadListener);
      playNext();
    };
    nextAudio.addEventListener('canplay', loadListener);
    console.log("Scheduling initial playback ASAP");
  };
  var scheduleNextFuture = function(soon) {
    var currentTime = playback['currentAudio'].currentTime;
    var currentFoleys = foleyMarkers[playback['currentCue']];
    var jumpPoint = 0;
    cancelNextFuture(); // clear out any previous timers
    if (!soon && playback['currentState'] == playback['nextState']) { // play to the end
      playback['transition'] = 'ending';
      jumpPoint = currentFoleys[currentFoleys.length-1];
    } else {  // shortcut
      // find the earliest foley that is after the currentTime
      for (var i=currentFoleys.length-1; i>=0; i--) {
        if (i == currentFoleys.length-1) {
          playback['transition'] = 'ending';
        } else {
          playback['transition'] = 'fade';
        }
        if (currentFoleys[i] > currentTime) {
          jumpPoint = currentFoleys[i];
        }
      }
      console.log("Cutting to next cue at %f, which is after %f", jumpPoint, currentTime);
    }
    currentTime = playback['currentAudio'].currentTime;
    var delay = jumpPoint - currentTime;
    playback['playNextTimer'] = window.setTimeout(playNext, delay*1000.0);
    console.log("Scheduled next cue for %f", delay);
  };
  var cancelNextFuture = function() {
    if (playback['playNextTimer']) {
      window.clearTimeout(playback['playNextTimer']);
    }
  };
  var playNext = function() {
    // callbacks for start/stop
    var onPlay = function() {
      playback['currentStart'] = Date.now()/1000.0 - playback['currentAudio'].currentTime;
      console.log("Recording start time: %s", playback['currentStart']);
      // playback started, prepare the next song
      if (!playback['nextCue']) {
        nextChoices();
      } else {
        // resume from pause, reschedule
        scheduleNextFuture();
      }
    };
    var onPause = function(e) {
      if (this.ended) {
        return;
      }
      // buffer underrun, or manual pause
      playback['currentStart'] = null;
      cancelNextFuture();
    };
    if (playback['currentAudio']) {
      // clear callbacks
      playback['currentAudio'].removeEventListener('play', onPlay);
      playback['currentAudio'].removeEventListener('pause', onPause);
      playback['currentAudio'].removeEventListener('waiting', onPause);
      // fade out the previous thing, if necessary
      if (playback['transition'] == 'fade') {
        fadeout(playback['currentAudio'])
      }
      playback['previousAudio'] = playback['currentAudio'];
    }
    // swap the next into current
    console.log("Starting to play next");
    playback['currentCue'] = playback['nextCue'];
    playback['currentState'] = scoreData['cues'][playback['currentCue']]['state'];
    playback['currentAudio'] = playback['nextAudio'];
    delete playback['nextCue'];
    delete playback['nextAudio'];
    playback['currentAudio'].addEventListener('play', onPlay);
    playback['currentAudio'].addEventListener('pause', onPause);
    playback['currentAudio'].addEventListener('waiting', onPause);
    playback['currentAudio'].play();
    sendNotify();
  };
  var fadeout = function(audio) {
    var length = 2.0;
    var step = 0.1;
    var interval = length / step;
    var fadeDown = function() {
      var vol = audio.volume;
      vol -= step;
      if (vol > 0) {
        audio.volume = vol;
        setTimeout(fadeDown, interval);
      }
    };
    fadeDown();
  };

  var loadScore = function(name) {
    stop();
    clear();
    var loadingScore = scores.load(name);
    loadingScore.then(function(newData) {
      foleyMarkers = scores['foleyMarkers'];
      scoreData = newData;
      init();
      play();
    });
  };

  return {
    loadScore: loadScore,
    play: play,
    stop: stop,
    skip: skip,
    getStates: getStates,
    setState: setState,
    getChoices: getChoices,
    setChoice: setChoice,
    onNotify: onNotify,
    playbackState: playback
  };
})(scores);

musicEngine.loadScore('Mission Capstone');

var GUI = {
  changeChoice: function(dir) {
    var i = musicEngine.getChoices().indexOf(musicEngine['playbackState']['nextCue']);
    if (i >= 0) {
      i += dir;
      i = Math.min(i, musicEngine['playbackState']['nextChoices'].length-1);
      i = Math.max(i, 0);
      musicEngine.setChoice(musicEngine.getChoices()[i]);
    }
  },
  onkey: function(e) {
    if (e.keyCode==32) { // space
      if (musicEngine['playbackState']['currentStart']) {
        musicEngine.stop();
      } else {
        musicEngine.play();
      }
      e.preventDefault();
    }
    if (e.keyCode==13) { // enter
      musicEngine.skip();
      e.preventDefault();
    }
    if (e.keyCode==37) { // left
      GUI.changeChoice(-1);
      e.preventDefault();
    }
    if (e.keyCode==39) { // right
      GUI.changeChoice(1);
      e.preventDefault();
    }
  },
  view: function() {
    var playback = musicEngine['playbackState'];
    var viewState = function(statename) {
      if (statename == playback['nextState']) {
        return m('option', {'value':statename, 'selected': true}, statename);
      } else {
        return m('option', {'value':statename}, statename);
      }
    };
    var viewStates = function() {
      return m('select', {onchange: m.withAttr('value', musicEngine.setState)},
        musicEngine.getStates().map(viewState)
      );
    };
    var viewNextCue = function(cuename) {
      var options = {
        'onclick': m.withAttr('innerHTML', musicEngine.setChoice)
      };
      if (cuename == playback['nextCue']) {
        return m('p.cue.selected', options, cuename);
      } else {
        return m('p.cue', options, cuename);
      }
    };
    var viewCueChoices = function() {
      return musicEngine.getChoices().map(viewNextCue);
    };
    return m('div', [
      m('p', "Current state: " + playback['currentState']),
      m('p', "Desired State:"),
      viewStates(),
      m('p', "Current cue: " + playback['currentCue']),
      m('p', "Next cue:"),
      viewCueChoices()
    ]);
  }
};
document.addEventListener('DOMContentLoaded', function(e) {
  m.mount(document.body, GUI);
  document.body.addEventListener('keydown', GUI.onkey);
  musicEngine.onNotify(function() {
    m.redraw();
  });
});
