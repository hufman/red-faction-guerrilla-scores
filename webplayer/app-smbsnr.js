var scores = (function() {
  var song_names = [
    'Monkey Island',
    'Excavation Site',
    'Chimpan Sea',
    'Far East',
    'Polar Festival',
    'Magma Valley',
    'Siliconia'
  ];
  var songs = {}
  var list = [];
  for (var i=0; i < song_names.length; i++) {
    var index1 = i + 1;
    var name = 'World ' + index1 + ' - ' + song_names[i];
    var file = 'bgm_w' + index1 + '_';
    songs[name] = {
      name: name,
      path: 'SMBStepnRoll',
      file: file
    }
    list.push(name);
  }

  var score = null;

  var loadingServerFiles = m.request({method:'GET', url:'SMBStepnRoll/files.txt',
    deserialize:function(body) {
      var lines = body.split('\n');
      return lines.map(function(line) {
        var splitted = line.split('|');
        return {'filename': splitted[0],
                'length': splitted[1]
        };
      })
    }
  });

  // converts from state-centric to clip-centric data structure
  var convertScore = function(file_datas, scorename) {
    var parseFilename = function(filename) {
      var groups = filename.match(/bgm_w(\d)_(s(\d+))(to|_)?(\d+)?/);
      if (groups == null) { return null; }
      var data = {
        'scorenumber': groups[1],
        'statename': groups[2],
        'statenumber': groups[3],
        'clipnumber': groups[5]
      };
      if (groups[4] == 'to') {
        data['transition'] = true;
        data['nextstatenumber'] = data['clipnumber'];
        data['nextstatename'] = 's' + data['nextstatenumber'];
        delete data['clipnumber'];
      }
      return data;
    };
    var parseCuename = function(cuename) {
      var groups = cuename.match(/(s(\d+))(to|_)?(\d+)?/);
      if (groups == null) { return null; }
      var data = {
        'statename': groups[1],
        'statenumber': groups[2],
        'clipnumber': groups[4]
      }
      if (groups[3] == 'to') {
        data['transition'] = true;
        data['nextstatenumber'] = data['clipnumber'];
        data['nextstatename'] = 's' + data['nextstatenumber'];
        delete data['clipnumber'];
      }
      return data;
    };
    var expandSiblingCues = function(nextCuename){
      // find all of the cues within the same state as the given nextCuename
      // with the probability set to give nextCuename by default
      var cuedata = parseCuename(nextCuename);
      var siblingCues = Object.keys(score['cues']).filter(function(c) {
        var cdata = parseCuename(c);
        if (cuedata['transition']) return c==nextCuename;
        return !cdata['transition'] && cdata['statename'] == cuedata['statename'];
      });
      var result = siblingCues.map(function(c) {
        if (c==nextCuename) return {'name': c, 'weight': 1, 'probability': 1.0};
        else return {'name': c, 'weight': 1, 'probability': 0.0};
      });
      return result;
    };

    var score = {
      'firstState': '',
      'statesOrder': [],
      'states': {},
      'cues': {}
    };
    // create state info
    score['firstState'] = 's1';
    for (var s=1; s<=10; s++) {
      var stateName = 's' + s;
      score['statesOrder'].push(stateName)
      var state = {}
      score['states'][stateName] = state;
      state['name'] = stateName;
      state['firstClips'] = [{'name': stateName+'_1', 'weight': 1, 'probability': 1.0}]
    }
    // create all the cues
    for (var i in file_datas) {
      var filedata = file_datas[i];
      var filename = filedata['filename'];
      var length = filedata['length'];
      if (filename.substr(0,songs[scorename]['file'].length) != songs[scorename]['file'])
        continue;
      var cuedata = parseFilename(filename);
      var name = filename.substr(7);
      var state = cuedata['statename'];

      var cue = {};
      score['cues'][name] = cue;
      cue['name'] = name;
      cue['path'] = songs[scorename]['path'] + '/' + filename;
      cue['state'] = state;
      cue['jumpPoints'] = [length];  // todo
    }
    // link the cues
    for (var name in score['cues']) {
      var cue = score['cues'][name];
      var cuedata = parseCuename(name);
      var state = cuedata['statename'];
      var clipnumber = cuedata['clipnumber'];

      // find the next clip in the current state
      var nextcue = null;
      if (cuedata['transition']) {
        // transition clip to next state
        nextcue = cuedata['nextstatename'] + '_1';
        cue['state'] = cuedata['nextstatename'];
      } else if (clipnumber != null) {
        // normal level song
        var nextclipnumber = parseInt(clipnumber)+1;
        nextcue = state + '_' + nextclipnumber;
        if (score['cues'][nextcue] == null) {
          nextclipnumber = 1;
          nextcue = state + '_' + nextclipnumber;
        }
      } else {
        // level 10, repeat the same song
        nextcue = name;
      }

      // set up transitions
      cue['nextStates'] = {}
      // handle current state
      var nextState = {};
      nextState['name'] = cue['state'];
      nextState['cues'] = expandSiblingCues(nextcue);
      cue['nextStates'][nextState['name']] = nextState;
      // handle up state
      var stateIndex = score['statesOrder'].indexOf(cue['state']);
      if (stateIndex < score['statesOrder'].length - 1) {
        var upState = {};
        upState['name'] = score['statesOrder'][stateIndex+1];
        var transition_cuename = cue['state'] + 'to' + (parseInt(cuedata['statenumber']) + 1);
        var next_cuename = null;
        if (score['cues'][transition_cuename] != null) {
          // has a transition cue
          next_cuename = transition_cuename;
        } else if (stateIndex+1 < score['statesOrder'].length - 1) {
          // not level 10
          next_cuename = upState['name']+'_1';
        } else {
          // going to level 10, no clip number
          next_cuename = upState['name'];
        }
        upState['cues'] = expandSiblingCues(next_cuename);
        cue['nextStates'][upState['name']] = upState;
      }
      // handle bonus level up state to skip over the bonus stage
      if (score['statesOrder'][stateIndex+1] == 's5') {
        var next_statename = score['statesOrder'][stateIndex+2];
        var next_cuename = null;
        var transition_cuename = 's5to6';
        if (score['cues'][transition_cuename] != null) {
          // has a transition from bonus level
          next_cuename = transition_cuename;
        } else {
          next_cuename = next_statename + '_1';
        }
        var upState = {};
        upState['name'] = next_statename;
        upState['cues'] = expandSiblingCues(next_cuename);
        cue['nextStates'][upState['name']] = upState;
      }
    }
    return score;
  };

  var loadScore = function(name) {
    return loadingServerFiles.then(function (filenames) {return convertScore(filenames, name)});
  };

  return {
    list: list,
    load: loadScore,
  };
})()

