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
    'Oppression': {
      name: 'Oppression',
      path: 'mus_progression_02',
      file: 'mus_progression_02.mtbl'
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
    'Vindication': {
      name: 'Vindication',
      path: 'mus_progression_03',
      file: 'mus_progression_03.mtbl'
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
    return PromiseAll(loadingFoleyMarkers, loadingScore);
  };

  return {
    list: list,
    load: loadScore,
    foleyMarkers: foleyMarkers
  };
})()

var spoolEngine = (function() {
  /*
  Mobile chrome and safari have a feature where audio.play()
  won't work until it is called inside a user-initiated event listener,
  and each new audio object needs to be acknowledged by the user in this way.
  So, we have to precreate a ring buffer of audio objects and
  audio.play() all of them (silently) during the Play button press.
  Then we can keep reusing them to play cues.
  */
  var subscribers = [];		// functions to call when we are spooled
  var formats = {'opus':'audio/ogg; codecs="opus"', 'mp3':'audio/mpeg'}
  var newAudio = [];		// html5 audio clips that have not been user accepted
  var unusedAudio = [];		// html5 audio clips that are not currently playing
  var isSpooled = false;	// whether audio clips are allowed to play

  var subscribe = function(callback) {
    subscribers.push(callback);
  };
  var notify = function(data) {
    subscribers.forEach(function (s) {
      s(data);
    });
  };

  var createAudio = function(url) {
    var audio = document.createElement('audio');
    audio.setAttribute('preload', 'auto');
    for (var ext in formats) {
      var src = document.createElement('source');
      src.setAttribute('src', url + '.' + ext);
      src.setAttribute('type', formats[ext]);
      audio.appendChild(src);
    }
    return audio
  };
  var spoolAudio = function(url) {
    /* needs to be run after the first setNextClip */
    if (isSpooled) {
      return;		// already done
    }
    var onPlaySpool = function(e) {
      var audio = this;
      audio.removeEventListener('play', onPlaySpool);
      audio.addEventListener('pause', onPauseSpool);
      // chrome complains if you pause/load too soon after playing??
      window.setTimeout(function() {audio.pause();}, 0);
    };
    var onPauseSpool = function(e) {
      // when a spool file has started playing
      // which means the user has clicked play and the
      // browser has whitelisted this audio
      var audio = this;
      audio.removeEventListener('pause', onPauseSpool);
      var index = newAudio.indexOf(this);
      if (index>=0) {
        console.log("Finished spooling an audio");
        newAudio.splice(index, 1);
      } else {
        console.warn("Trying to remove spooled newAudio twice?");
      }
      unusedAudio.push(audio);
      console.log("spooled, unusedAudio size now: %f", unusedAudio.length);
      isSpooled = true;
      notify();
    };
    var neededCount = 4-(newAudio.length+unusedAudio.length);
    for (var i=0; i<neededCount; i++) {
      var audio = createAudio('blank');
      newAudio.push(audio);
      audio.addEventListener('play', onPlaySpool);
    }
    for (var i=0; i<newAudio.length; i++) {
      var audio = newAudio[i];
      audio.volume = 0;
      var promise = audio.play();
      if (promise && promise.then) {
        promise.then(function(){}, function(){});
      }
    }
    console.log("Spooling, newAudio size: %f", newAudio.length);
  };
  var borrowAudio = function(url) {
    // returns a fresh audio object with the given url
    // might return null if not ready
    if (!isSpooled && newAudio.length==0) {
      spoolAudio(url);
      return;
    }
    console.log("borrowing, unusedAudio size was: %f", unusedAudio.length);
    var audio = unusedAudio.pop();
    if (!audio) {
      console.warn("No unusedAudios to borrow!");
      return;
    }
    //audio.pause();
    audio.addEventListener('ended', onAudioEnd);
    while (audio.firstChild) {
      audio.removeChild(audio.firstChild);
    }
    for (var ext in formats) {
      var src = document.createElement('source');
      src.setAttribute('src', url + '.' + ext);
      src.setAttribute('type', formats[ext]);
      audio.appendChild(src);
    }
    audio.currentTime=0;
    return audio;
  };
  var onAudioEnd = function(e) {
    // when an audio has finished playing, return this to the queue
    returnAudio(this);
  }
  var returnAudio = function(audio) {
    // return an audio clip back to the spools
    audio.removeEventListener('ended', onAudioEnd);
    var alreadyIndex = unusedAudio.indexOf(audio);
    if (alreadyIndex == -1) {
      unusedAudio.push(audio)
      console.log("returned, unusedAudio size now: %f", unusedAudio.length);
    } else {
      console.warn("Duplicate returnAudio of %s", audio.firstChild.src);
    }
  };

  return {
    onIsReady: subscribe,
    isReady: function() { return isSpooled },
    load: spoolAudio,
    borrowAudio: borrowAudio,
    returnAudio: returnAudio
  }
})();

var playbackEngine = (function(spool) {
  var playing = false;		// whether we are currently playing or trying to play
  var previousAudio = null;	// any previous audio clip that is fading out
  var currentStart = null;	// time (in seconds) when the currentClip started playing
  var currentTime = null;	// when paused, this is when we paused the clip
  var currentAudio = null;	// the current audio clip
  var currentData = null;	// any supplementary data associated with the current clip
  var transitionTime = null;	// when to do nextAudio.play(), after currentStart
  var transitionType = null;	// what type of transition to do, 'fade' or 'ending'
  var nextAudio = null;		// the next audio clip, that we are currently preloading
  var nextLoaded = false;	// whether the next audio clip is loaded
  var nextUrl = null;		// what url to load next
  var nextTimer = null;		// the timer that will do nextAudio.play()
  var nextData = null;		// any supplementary data associated with the next clip
  var subscriptions = [];

  var play = function() {
    console.log("Starting to play");
    playing = true;
    if (currentAudio && currentAudio.paused) {
      currentAudio.play();
      // onPlay will handle scheduleNext
    } else if (nextAudio) {
      // on initial play
      scheduleNext();
    } else {
      spool.load();
      console.log("Next audio isn't loaded yet, won't schedule next");
    }
    notify();
  };
  var pause = function() {
    console.log("Pausing playback");
    playing = false;
    if (currentAudio && !currentAudio.paused) {
      currentAudio.pause();
    }
    cancelTimer();
    notify();
  };
  var reset = function() {
    pause();
    if (previousAudio) spoolEngine.returnAudio(previousAudio);
    if (currentAudio) spoolEngine.returnAudio(currentAudio);
    if (nextAudio) spoolEngine.returnAudio(nextAudio);
    playing = false;
    previousAudio = null;
    currentStart = null;
    currentTime = null;
    currentAudio = null;
    currentData = null;
    transitionTime = null;
    transitionType = null;
    nextAudio = null;
    nextLoaded = false;
    nextUrl = null;
    nextTimer = null;
    nextData = null;
  };
  var subscribe = function(callback) {
    subscriptions.push(callback);
  };
  var notify = function(data) {
    subscriptions.forEach(function(s) {
      s(data);
    });
  };
  var getPlayback = function() {
    // return a view of the current playback data
    var ret = {};
    ret['playing'] = playing;
    ret['nextLoaded'] = nextLoaded;
    if (currentAudio) {
      ret['currentTime'] = getCurrentTime();
      ret['currentDuration'] = currentAudio.duration;
      ret['currentData'] = currentData;
    }
    if (nextAudio) {
      ret['nextData'] = nextData;
    }
    return ret
  };

  var getCurrentTime = function() {
    if (currentStart) {
      return Date.now()/1000.0 - currentStart;
    } else {
      return currentTime;
    }
  };
  var setNextClip = function(offset, url, transition, data) {
    // set the next clip to play
    transitionType = transition;
    transitionTime = offset;
    nextData = data;
    nextUrl = url;
    // start loading it
    loadNext();
  };

  var loadNext = function() {
    /* needs to be run after setNextClip */
    // after setNextClip has set the next url
    // try loading it
    if (nextAudio) {
      nextAudio.removeEventListener('canplaythrough', onNextLoaded);
      cancelTimer();
      spoolEngine.returnAudio(nextAudio);
      nextAudio = null;
    }
    nextLoaded = false;
    nextAudio = spoolEngine.borrowAudio(nextUrl);
    if (!nextAudio) {
      console.log("Haven't verified playback yet");
      spoolEngine.onIsReady(function() {
        if (!nextAudio) {
          loadNext();
        }
      });
      return;
    }
    console.log("Starting to load next clip");
    nextAudio.addEventListener('canplaythrough', onNextLoaded);
    nextAudio.load();
  }
  var onNextLoaded = function(e) {
    console.log("Next clip is loaded");
    this.removeEventListener('canplaythrough', onNextLoaded);
    nextLoaded = true;
    // make sure the file is ready to go
    this.volume = 0;
    this.play();
    this.pause();
    this.currentTime = 0;
    this.volume = 1;
    if (playing) {
      console.log("Scheduling next clip");
      scheduleNext();
    } else {
      console.log("Not current playing, won't schedule next clip");
    }
    notify();
  };
  var scheduleNext = function() {
    if (!nextAudio ||		// currentAudio.onPlay caused a new currentTime
        !nextLoaded) {	// before we finished loading nextAudio
      return;			// wait for onNextLoaded to trigger this
    }
    cancelTimer();
    if (!currentAudio) {	// no loaded cue, start immediately
      nextTimer = window.setTimeout(playNext, 0);
    } else {
      var currentTime = getCurrentTime();	// time into the clip
      var delay = transitionTime - currentTime;
      console.log("Next cue is ready to play in %f", delay);
      nextTimer = window.setTimeout(playNext, delay*1000.0);
    }
  };
  var cancelTimer = function() {
    if (nextTimer) {
      window.clearTimeout(nextTimer);
      nextTimer = null;
    }
  };

  var playNext = function() {
    if (currentAudio) {
      // clear callbacks
      currentAudio.removeEventListener('play', onPlay);
      currentAudio.removeEventListener('pause', onPause);
      currentAudio.removeEventListener('waiting', onPause);
      // fade out the previous thing, if necessary
      if (transitionType == 'fade') {
        fadeout(currentAudio);
      }
      previousAudio = currentAudio;
      currentAudio = null;
    }
    // swap the next into current
    currentAudio = nextAudio;
    currentData = nextData;
    nextAudio = null;
    nextData = null;
    currentAudio.addEventListener('play', onPlay);
    currentAudio.addEventListener('pause', onPause);
    currentAudio.addEventListener('waiting', onPause);
    currentAudio.play();
    currentStart = null;
    currentTime = 0;
    notify();
  };
  var onPlay = function(e) {
    if (this != currentAudio) {
      // buffer underrun on previousAudio
      return;
    }
    currentStart = Date.now()/1000.0 - currentAudio.currentTime;
    currentTime = null;
    scheduleNext();
    notify();
  };
  var onPause = function(e) {
    if (this != currentAudio) {
      // previousAudio.onPause triggered, ignore
      return;
    }
    // buffer underrun or manual pause
    currentTime = getCurrentTime();
    currentStart = null;
    cancelTimer();
    notify();
  };
  var fadeout = function(audio) {
    var length = 5.0;
    var step = 0.1;
    var interval = length / step;
    var fadeDown = function() {
      var vol = audio.volume;
      vol -= step;
      if (vol > 0) {
        audio.volume = vol;
        if (audio.volume * 1.0 != 1) {
          // working fade-out
          setTimeout(fadeDown, interval);
        } else {
          // mobile safari doesn't support fading
          audio.currentTime = audio.duration;
          audio.pause();
        }
      } else {
        // faded to 0
        audio.currentTime = audio.duration;
        audio.pause();
      }
    };
    fadeDown();
  };

  return {
    play: play,
    pause: pause,
    reset: reset,
    subscribe: subscribe,
    getPlayback: getPlayback,
    setNextClip: setNextClip
  }
})(spoolEngine);

var musicEngine = (function(scores, playbackEngine){
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

  var reset = function() {
    playbackEngine.reset();
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
  var skip = function() {
    scheduleNext(true);
  };
  var getPlaybackState = function() {
    var audioPlayback = playbackEngine.getPlayback();
    var ret = {};
    ret['currentState'] = playback['currentState'];
    ret['nextState'] = playback['nextState'];
    ret['states'] = getStates();
    ret['currentCue'] = playback['currentCue'];
    ret['nextCue'] = playback['nextCue'];
    ret['nextChoices'] = getChoices();
    ret['playing'] = audioPlayback['playing'];
    ret['currentTime'] = audioPlayback['currentTime'];
    ret['currentDuration'] = audioPlayback['currentDuration'];
    ret['currentFoleys'] = foleyMarkers[playback['currentCue']] || [];
    return ret;
  };
  var getStates = function() {
    if (scoreData != null) {
      return Object.keys(scoreData['states']);
    }
    return [];
  };
  var setState = function(state) {
    if (!scoreData['states'].hasOwnProperty(state)) {
      throw new RangeError("Invalid state "+state);
    }
    if (!playback['currentCue']) { // haven't started playing yet
      playback['currentState'] = state;
    }
    playback['nextState'] = state;
    nextChoices();
  };
  var getChoices = function() {
    var ret = []
    for (var i=0; i<(playback['nextChoices'] || []).length; i++) {
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

  playbackEngine.subscribe(function() {
    // something changed in the music engine
    var playbackState = playbackEngine.getPlayback();
    if (playbackState['currentData']) {
      playback['currentCue'] = playbackState['currentData']['cue'];
      if (playback['currentCue'].indexOf('LULL') == -1) {
        playback['currentState'] = scoreData['cues'][playback['currentCue']]['state'];
      } else {
        playback['currentState'] = playback['nextState'];
      }
    }
    if (playbackState['currentData'] && !playbackState['nextData']) { // started playing nextAudio
      console.log("Detected the start of playback of %s", playbackState['currentData']['cue'])
      playback['nextCue'] = null;
      playback['nextChoices'] = null;
      nextChoices();
    }
    sendNotify();
  });

  var nextChoices = function() {
    /* Pick the list of choices for the next cue */
    var cueData = scoreData['cues'][playback['currentCue']];
    var oldStateIndex = scoreData['statesOrder'].indexOf(playback['currentState']);
    var newStateIndex = scoreData['statesOrder'].indexOf(playback['nextState']);

    if (!cueData) { // no current cue
      nextChoicesFirst();
    } else if (playback['currentState'] == playback['nextState']) {
      nextChoicesIntraState();
    } else if (oldStateIndex > newStateIndex &&
               cueData && cueData['lullCues'].length > 0) {
      nextChoicesLull();
    } else {
      nextChoicesTransition();
    }
  };
  var nextChoicesFirst = function() {
    playback['nextChoices'] = scoreData['states'][playback['nextState']]['firstClips'];
    pickNextChoice();
  };
  var nextChoicesIntraState = function() {
    /* Pick the list of choices, when staying in the same state */
    var cueData = scoreData['cues'][playback['currentCue']];
    if (cueData) {
      playback['nextChoices'] = cueData['nextCues'];
      if (playback['nextChoices'].length == 0) {
        playback['nextChoices'] = scoreData['states'][playback['nextState']]['firstClips'];
      }
      pickNextChoice();
    } else {
      console.error("Cue doesn't exist in the data! " + playback['currentCue']);
    }
  };
  var nextChoicesLull = function() {
    var cueData = scoreData['cues'][playback['currentCue']];
    if (cueData) {
      playback['nextChoices'] = cueData['lullCues'];
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
      // amb melodic -> combat does have a transition
      // transitionsOut checks to see if the transition cue is actually
      // in the nextState
      var outs = scoreData['states'][playback['currentState']]['transitionsOut'];
      var outClips = outs[playback['currentCue']] || [];
      var validOuts = [];
      if (outClips.length > 0) {
        // moving from normal to a transition
        for (var i=0; i<outClips.length; i++) {
          var outClipName = outClips[i];
          var outClipData = scoreData['cues'][outClipName];
          var outClipNextName = outClipData['nextCues'][0]['name'];
          if (scoreData['cues'][outClipNextName]['state'] == playback['nextState']) {
            validOuts.push(outClips[i]);
          }
        }
      } else {
        // finishing a transition
        var nextCue = cueData['nextCues'][0] || {};
        var nextCueName = nextCue['name'];
        var nextCueData = scoreData['cues'][nextCueName] || {};
        if (nextCueData['state'] == playback['nextState']) {
          validOuts = cueData['nextCues'];
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
  var scheduleNext = function(soon) {
    var playbackState = playbackEngine.getPlayback();

    // load the data for the nextCue
    var jumpPoint = 0;
    var transition = 'fade';
    var url = scoreData['cues'][playback['nextCue']]['path'];
    var nextData = {};
    nextData['cue'] = playback['nextCue'];

    if (!playbackState['currentData']) {
      // first cue
      console.log("First cue of the song");
      playbackEngine.setNextClip(jumpPoint, url, transition, nextData);
      return;
    }

    // decide when to schedule the nextCue
    var currentTime = playbackState['currentTime']
    var currentData = playbackState['currentData'] || {};
    var currentCue = currentData['cue'];
    var currentFoleys = foleyMarkers[currentCue] || [];

    if (!soon && playback['currentState'] == playback['nextState']) { // play to the end
      transition = 'ending';
      jumpPoint = currentFoleys[currentFoleys.length-1];
    } else if (playback['currentState'].indexOf('AMBIENCE')>=0) {
      // cut if the next foley is later than 25 seconds
      var MAX_WAIT = 25;
      var EARLY_JUMP = 5;
      transition = 'fade';
      for (var i=0; i<currentFoleys.length; i++) {
        if (currentFoleys[i] < currentTime) {
          continue;
        }
        if (currentFoleys[i] < currentTime+MAX_WAIT) {
          jumpPoint = currentFoleys[i];
          break;
        }
        if (currentFoleys[i] >= currentTime+MAX_WAIT) {
          break;
        }
      }
      if (jumpPoint == 0) {
        jumpPoint = currentTime+EARLY_JUMP;
      }
    } else {  // shortcut
      // find the earliest foley that is after the currentTime
      for (var i=currentFoleys.length-1; i>=0; i--) {
        if (i == currentFoleys.length-1) {
          transition = 'ending';
        } else {
          transition = 'fade';
        }
        if (currentFoleys[i] > currentTime) {
          jumpPoint = currentFoleys[i];
        }
      }
      console.log("Cutting to next cue at %f, which is after %f", jumpPoint, currentTime);
    }
    console.log("Scheduling next cue %s at %f", playback['nextCue'], jumpPoint);
    playbackEngine.setNextClip(jumpPoint, url, transition, nextData);
  };

  var loadScore = function(name) {
    playbackEngine.pause();
    reset();
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
    scoreData: scoreData,
    play: playbackEngine.play,
    pause: playbackEngine.pause,
    skip: skip,
    setState: setState,
    setChoice: setChoice,
    onNotify: onNotify,
    getPlaybackState: getPlaybackState,
  };
})(scores, playbackEngine);

//musicEngine.loadScore('Mission Capstone');
musicEngine.loadScore('Uprising');

var GUI = {
  animationPrevious: {
    'cueName': '',
    'time': 0
  },
  animationName: 'cue-progress',
  changeChoice: function(dir) {
    var playback = musicEngine.getPlaybackState();
    var i = playback['nextChoices'].indexOf(playback['nextCue']);
    if (i >= 0) {
      i += dir;
      i = Math.min(i, playback['nextChoices'].length-1);
      i = Math.max(i, 0);
      musicEngine.setChoice(playback['nextChoices'][i]);
    }
  },
  onkey: function(e) {
    if (e.keyCode==32) { // space
      if (musicEngine.getPlaybackState()['playing']) {
        musicEngine.pause();
      } else {
        musicEngine.play();
      }
      m.redraw();
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
    var playback = musicEngine.getPlaybackState();
    var about = function() {
      return m('div',
        "Red Faction: Guerrilla is an open-world action game from 2009 with a unique background audio system. Instead of playing a simple loop, it arranges a set of clips into a dynamically shifting score that reacts to the game's intensity level. As the player health decreases and more enemies appear, the game plays a smooth transition to a more intense set of background music. This page is a demonstration of this dynamic soundtrack.");
    };
    var scoreSelector = function() {
      return m('select', {onchange: m.withAttr('value', musicEngine.loadScore)},
        scores.list.map(function(s) {
          if ((musicEngine['scoreData']||{})['name'] == s) {
            return m('option', {'value': s, 'selected': true}, s);
          } else {
            return m('option', {'value': s}, s);
          }
        })
      );
    };
    var playbackControls = function() {
      if (playback['playing']) {
        return m('button', {'onclick': musicEngine.pause}, 'Pause')
      } else {
        return m('button', {'onclick': musicEngine.play}, 'Play')
      }
    };
    var viewState = function(statename) {
      if (statename == playback['nextState']) {
        return m('option', {'value':statename, 'selected': true}, statename);
      } else {
        return m('option', {'value':statename}, statename);
      }
    };
    var viewStates = function() {
      return m('select', {onchange: m.withAttr('value', musicEngine.setState)},
        playback['states'].map(viewState)
      );
    };
    var cueProgress = function() {
      if (! playback['currentTime']) {
        return null;
      }
      var setStart = false;
      if ((playback['currentCue'] != GUI.animationPrevious['name']) ||
          (Date.now() > GUI.animationPrevious['time'] + 50)) {
        // keep setStart until a frame has finished redrawing
        GUI.animationPrevious['setStart'] = true;
        GUI.animationPrevious['time'] = Date.now();
        GUI.animationPrevious['name'] = playback['currentCue'];
        if (GUI.animationName == 'cue-progress') {
          GUI.animationName = 'cue-progress-alt';
        } else {
          GUI.animationName = 'cue-progress';
        }
      } else if (Date.now() < GUI.animationPrevious['time'] + 50) {
        // redraw right after the previous redraw
        GUI.animationPrevious['setStart'] = true;
      }
      setStart = GUI.animationPrevious['setStart'];
      window.setTimeout(function() {
        GUI.animationPrevious['setStart'] = false;
      }, 10);
      var cueName = playback['currentCue'];
      var duration = playback['currentDuration'];
      var currentTime = playback['currentTime'];
      var playState = playback['playing'] ? 'running' : 'paused';
      var remaining = duration - currentTime;
      var currentPerc = 100.0 * currentTime / duration;
      var jumpPoints = playback['currentFoleys'].map(function(f) {
        return 100.0 * f / duration;
      });
      var animStyle = {
        'animation-name': GUI.animationName,
        'animation-duration': duration.toFixed(3)+'s',
        'animation-timing-function': 'linear',
        'animation-play-state': playState
      };
      if (setStart) {
        animStyle['animation-delay'] = '-'+currentTime.toFixed(3)+'s'
      }

      return m('p.cue', [
        cueName,
        m('div.cue-progress-container', [
          m('div.cue-progress', {
            'style': animStyle
          }),
          jumpPoints.map(function(j) {
            return m('div.cue-foley', {
              'style': {
                'left': j+'%'
              }
            });
          })
        ])
      ]);
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
      return playback['nextChoices'].map(viewNextCue);
    };
    return m('div', [
      about(),
      m('p', "Current score:"),
      scoreSelector(),
      m('p', playbackControls()),
      m('p', "Current state: " + playback['currentState']),
      m('p', "Desired State:"),
      viewStates(),
      m('p', "Current cue:"),
      cueProgress(),
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
