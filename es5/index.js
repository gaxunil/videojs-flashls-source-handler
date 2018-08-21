'use strict';

exports.__esModule = true;
exports.FlashlsHandler = undefined;

var _video = require('video.js');

var _video2 = _interopRequireDefault(_video);

var _window = require('global/window');

var _window2 = _interopRequireDefault(_window);

var _captionStream = require('mux.js/lib/m2ts/caption-stream');

var _metadataStream = require('mux.js/lib/m2ts/metadata-stream');

var _metadataStream2 = _interopRequireDefault(_metadataStream);

var _representations = require('./representations.js');

var _flashlsAudioTracks = require('./flashlsAudioTracks.js');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * Define properties on a cue for backwards compatability,
 * but warn the user that the way that they are using it
 * is depricated and will be removed at a later date.
 *
 * @param {Cue} cue the cue to add the properties on
 * @private
 */
var deprecateOldCue = function deprecateOldCue(cue) {
  Object.defineProperties(cue.frame, {
    id: {
      get: function get() {
        _video2['default'].log.warn('cue.frame.id is deprecated. Use cue.value.key instead.');
        return cue.value.key;
      }
    },
    value: {
      get: function get() {
        _video2['default'].log.warn('cue.frame.value is deprecated. Use cue.value.data instead.');
        return cue.value.data;
      }
    },
    privateData: {
      get: function get() {
        _video2['default'].log.warn('cue.frame.privateData is deprecated. Use cue.value.data instead.');
        return cue.value.data;
      }
    }
  });
};

/**
 * Remove text track from tech
 */
var removeExistingTrack = function removeExistingTrack(tech, kind, label) {
  var tracks = tech.remoteTextTracks() || [];

  for (var i = 0; i < tracks.length; i++) {
    var track = tracks[i];

    if (track.kind === kind && track.label === label) {
      tech.removeRemoteTextTrack(track);
    }
  }
};

/**
 * convert a string to a byte array of char codes
 */
var stringToByteArray = function stringToByteArray(data) {
  var bytes = new Uint8Array(data.length);

  for (var i = 0; i < data.length; i++) {
    bytes[i] = data.charCodeAt(i);
  }

  return bytes;
};

/**
 * Remove cues from a track on video.js.
 *
 * @param {Double} start start of where we should remove the cue
 * @param {Double} end end of where the we should remove the cue
 * @param {Object} track the text track to remove the cues from
 * @private
 */
var removeCuesFromTrack = function removeCuesFromTrack(start, end, track) {
  var i = void 0;
  var cue = void 0;

  if (!track) {
    return;
  }

  if (!track.cues) {
    return;
  }

  i = track.cues.length;

  while (i--) {
    cue = track.cues[i];

    // Remove any overlapping cue
    if (cue.startTime <= end && cue.endTime >= start) {
      track.removeCue(cue);
    }
  }
};

/**
 * Removes cues from the track that come before the start of the buffer
 *
 * @param {TimeRanges} buffered state of the buffer
 * @param {TextTrack} track track to remove cues from
 * @private
 * @function removeOldCues
 */
var removeOldCues = function removeOldCues(buffered, track) {
  if (buffered.length) {
    removeCuesFromTrack(0, buffered.start(0), track);
  }
};

/**
 * Updates the selected index of the quality levels list and triggers a change event
 *
 * @param {QualityLevelList} qualityLevels
 *        The quality levels list
 * @param {String} id
 *        The id of the new active quality level
 * @function updateSelectedIndex
 */
var updateSelectedIndex = function updateSelectedIndex(qualityLevels, id) {
  var selectedIndex = -1;

  for (var i = 0; i < qualityLevels.length; i++) {
    if (qualityLevels[i].id === id) {
      selectedIndex = i;
      break;
    }
  }

  qualityLevels.selectedIndex_ = selectedIndex;
  qualityLevels.trigger({
    selectedIndex: selectedIndex,
    type: 'change'
  });
};

// Fudge factor to account for TimeRanges rounding
var TIME_FUDGE_FACTOR = 1 / 30;

var filterRanges = function filterRanges(timeRanges, predicate) {
  var results = [];

  if (timeRanges && timeRanges.length) {
    // Search for ranges that match the predicate
    for (var i = 0; i < timeRanges.length; i++) {
      if (predicate(timeRanges.start(i), timeRanges.end(i))) {
        results.push([timeRanges.start(i), timeRanges.end(i)]);
      }
    }
  }

  return _video2['default'].createTimeRanges(results);
};

/**
 * Attempts to find the buffered TimeRange that contains the specified
 * time.
 * @param {TimeRanges} buffered - the TimeRanges object to query
 * @param {number} time  - the time to filter on.
 * @returns {TimeRanges} a new TimeRanges object
 */
var findRange = function findRange(buffered, time) {
  return filterRanges(buffered, function (start, end) {
    return start - TIME_FUDGE_FACTOR <= time && end + TIME_FUDGE_FACTOR >= time;
  });
};

var FlashlsHandler = exports.FlashlsHandler = function () {
  function FlashlsHandler(source, tech, options) {
    var _this = this;

    _classCallCheck(this, FlashlsHandler);

    // tech.player() is deprecated but setup a reference to HLS for
    // backwards-compatibility
    if (tech.options_ && tech.options_.playerId) {
      var _player = (0, _video2['default'])(tech.options_.playerId);

      if (!_player.hasOwnProperty('hls')) {
        Object.defineProperty(_player, 'hls', {
          get: function get() {
            _video2['default'].log.warn('player.hls is deprecated. Use player.tech_.hls instead.');
            tech.trigger({ type: 'usage', name: 'flashls-player-access' });
            return _this;
          }
        });
      }
    }

    Object.defineProperties(this, {
      stats: {
        get: function get() {
          return this.tech_.el_.vjs_getProperty('stats');
        }
      },
      bandwidth: {
        get: function get() {
          return this.tech_.el_.vjs_getProperty('stats').bandwidth;
        }
      }
    });

    this.tech_ = tech;
    this.metadataTrack_ = null;
    this.inbandTextTracks_ = {};
    this.metadataStream_ = new _metadataStream2['default']();
    this.captionStream_ = new _captionStream.CaptionStream();

    // bind event listeners to this context
    this.onLoadedmetadata_ = this.onLoadedmetadata_.bind(this);
    this.onSeeking_ = this.onSeeking_.bind(this);
    this.onId3updated_ = this.onId3updated_.bind(this);
    this.onCaptionData_ = this.onCaptionData_.bind(this);
    this.onMetadataStreamData_ = this.onMetadataStreamData_.bind(this);
    this.onCaptionStreamData_ = this.onCaptionStreamData_.bind(this);
    this.onLevelSwitch_ = this.onLevelSwitch_.bind(this);
    this.onLevelLoaded_ = this.onLevelLoaded_.bind(this);
    this.onFragmentLoaded_ = this.onFragmentLoaded_.bind(this);
    this.onAudioTrackChanged = this.onAudioTrackChanged.bind(this);

    this.tech_.on('loadedmetadata', this.onLoadedmetadata_);
    this.tech_.on('seeking', this.onSeeking_);
    this.tech_.on('id3updated', this.onId3updated_);
    this.tech_.on('captiondata', this.onCaptionData_);
    this.tech_.on('levelswitch', this.onLevelSwitch_);
    this.tech_.on('levelloaded', this.onLevelLoaded_);
    this.tech_.on('fragmentloaded', this.onFragmentLoaded_);

    this.metadataStream_.on('data', this.onMetadataStreamData_);
    this.captionStream_.on('data', this.onCaptionStreamData_);

    this.playlists = new _video2['default'].EventTarget();
    this.playlists.media = function () {
      return _this.media_();
    };
  }

  FlashlsHandler.prototype.src = function src(source) {
    // do nothing if source is falsey
    if (!source) {
      return;
    }
    this.tech_.setSrc(source.src);
  };

  /**
   * Calculates the interval of time that is currently seekable.
   *
   * @return {TimeRange}
   *         Returns the time ranges that can be seeked to.
   */


  FlashlsHandler.prototype.seekable = function seekable() {
    var seekableStart = this.tech_.el_.vjs_getProperty('seekableStart');
    var seekableEnd = this.tech_.el_.vjs_getProperty('seekableEnd');

    if (seekableEnd === 0) {
      return _video2['default'].createTimeRange();
    }

    return _video2['default'].createTimeRange(seekableStart, seekableEnd);
  };

  FlashlsHandler.prototype.media_ = function media_() {
    var levels = this.tech_.el_.vjs_getProperty('levels');
    var level = this.tech_.el_.vjs_getProperty('level');
    var media = void 0;

    if (levels.length) {
      media = {
        resolvedUri: levels[level].url,
        attributes: {
          BANDWIDTH: levels[level].bitrate,
          RESOLUTION: {
            width: levels[level].width,
            height: levels[level].height
          }
        }
      };
    }

    return media;
  };

  /**
   * Event listener for the loadedmetadata event. This sets up the representations api
   * and populates the quality levels list if it is available on the player
   */


  FlashlsHandler.prototype.onLoadedmetadata_ = function onLoadedmetadata_() {
    var _this2 = this;

    this.representations = (0, _representations.createRepresentations)(this.tech_);

    var player = _video2['default'].players[this.tech_.options_.playerId];

    if (player && player.qualityLevels) {
      this.qualityLevels_ = player.qualityLevels();
      this.representations().forEach(function (representation) {
        _this2.qualityLevels_.addQualityLevel(representation);
      });

      // update initial selected index
      updateSelectedIndex(this.qualityLevels_, this.tech_.el_.vjs_getProperty('level') + '');
    }

    (0, _flashlsAudioTracks.setupAudioTracks)(this.tech_);
    this.tech_.audioTracks().on('change', this.onAudioTrackChanged);
  };

  /**
   * Event listener for the change event. This will update the selected index of the
   * audio track list with the new active track.
   */


  FlashlsHandler.prototype.onAudioTrackChanged = function onAudioTrackChanged() {
    (0, _flashlsAudioTracks.updateAudioTrack)(this.tech_);
  };

  /**
   * Event listener for the levelswitch event. This will update the selected index of the
   * quality levels list with the new active level.
   *
   * @param {Object} event
   *        event object for the levelswitch event
   * @param {Array} level
   *        The active level will be the first element of the array
   */


  FlashlsHandler.prototype.onLevelSwitch_ = function onLevelSwitch_(event, level) {
    if (this.qualityLevels_) {
      updateSelectedIndex(this.qualityLevels_, level[0].levelIndex + '');
    }
    this.playlists.trigger('mediachange');
    this.tech_.trigger({ type: 'mediachange', bubbles: true });
  };

  /**
   * Event listener for the levelloaded event.
   */


  FlashlsHandler.prototype.onLevelLoaded_ = function onLevelLoaded_() {
    this.playlists.trigger('loadedplaylist');
  };

  /**
   * Event listener for the fragmentloaded event.
   */


  FlashlsHandler.prototype.onFragmentLoaded_ = function onFragmentLoaded_() {
    this.tech_.trigger('bandwidthupdate');
    this.captionStream_.flush();
  };

  /**
   * Event listener for the seeking event. This will remove cues from the metadata track
   * and inband text tracks during seeks
   */


  FlashlsHandler.prototype.onSeeking_ = function onSeeking_() {
    var _this3 = this;

    removeCuesFromTrack(0, Infinity, this.metadataTrack_);

    var buffered = findRange(this.tech_.buffered(), this.tech_.currentTime());

    if (!buffered.length) {
      Object.keys(this.inbandTextTracks_).forEach(function (id) {
        removeCuesFromTrack(0, Infinity, _this3.inbandTextTracks_[id]);
      });
      this.captionStream_.reset();
    }
  };

  /**
   * Event listener for the id3updated event. This will store id3 tags recevied by flashls
   *
   * @param {Object} event
   *        event object for the levelswitch event
   * @param {Array} data
   *        The id3 tag base64 encoded will be the first element of the array
   */


  FlashlsHandler.prototype.onId3updated_ = function onId3updated_(event, data) {
    var id3tag = _window2['default'].atob(data[0]);
    var bytes = stringToByteArray(id3tag);
    var chunk = {
      type: 'timed-metadata',
      dataAlignmentIndicator: true,
      data: bytes
    };

    this.metadataStream_.push(chunk);
  };

  /**
   * Event listener for the data event from the metadata stream. This will create cues
   * for each frame in the metadata tag and add them to the metadata track
   *
   * @param {Object} tag
   *        The metadata tag
   */


  FlashlsHandler.prototype.onMetadataStreamData_ = function onMetadataStreamData_(tag) {
    var _this4 = this;

    if (!this.metadataTrack_) {
      this.metadataTrack_ = this.tech_.addRemoteTextTrack({
        kind: 'metadata',
        label: 'Timed Metadata'
      }, false).track;

      this.metadataTrack_.inBandMetadataTrackDispatchType = '';
    }

    removeOldCues(this.tech_.buffered(), this.metadataTrack_);

    var time = this.tech_.currentTime();

    tag.frames.forEach(function (frame) {
      var cue = new _window2['default'].VTTCue(time, time + 0.1, frame.value || frame.url || frame.data || '');

      cue.frame = frame;
      cue.value = frame;

      deprecateOldCue(cue);
      _this4.metadataTrack_.addCue(cue);
    });

    if (this.metadataTrack_.cues && this.metadataTrack_.cues.length) {
      var cues = this.metadataTrack_.cues;
      var cuesArray = [];
      var duration = this.tech_.duration();

      if (isNaN(duration) || Math.abs(duration) === Infinity) {
        duration = Number.MAX_VALUE;
      }

      for (var i = 0; i < cues.length; i++) {
        cuesArray.push(cues[i]);
      }

      cuesArray.sort(function (a, b) {
        return a.startTime - b.startTime;
      });

      for (var _i = 0; _i < cuesArray.length - 1; _i++) {
        if (cuesArray[_i].endTime !== cuesArray[_i + 1].startTime) {
          cuesArray[_i].endTime = cuesArray[_i + 1].startTime;
        }
      }
      cuesArray[cuesArray.length - 1].endTime = duration;
    }
  };

  /**
   * Event listener for the captiondata event from FlasHLS. This will parse out the
   * caption data and feed it to the CEA608 caption stream.
   *
   * @param {Object} event
   *        The captiondata event object
   * @param {Array} data
   *        The caption packets array will be the first element of data.
   */


  FlashlsHandler.prototype.onCaptionData_ = function onCaptionData_(event, data) {
    var _this5 = this;

    data[0].forEach(function (d) {
      _this5.captionStream_.push({
        pts: d.pos * 90000,
        dts: d.dts * 90000,
        escapedRBSP: stringToByteArray(_window2['default'].atob(d.data)),
        nalUnitType: 'sei_rbsp'
      });
    });
  };

  /**
   * Event listener for the data event from the CEA608 caption stream. This will create
   * cues for the captions received from the stream and add them to the inband text track
   *
   * @param {Object} caption
   *        The caption object
   */


  FlashlsHandler.prototype.onCaptionStreamData_ = function onCaptionStreamData_(caption) {
    if (caption) {
      if (!this.inbandTextTracks_[caption.stream]) {
        removeExistingTrack(this.tech_, 'captions', caption.stream);
        this.inbandTextTracks_[caption.stream] = this.tech_.addRemoteTextTrack({
          kind: 'captions',
          label: caption.stream,
          id: caption.stream
        }, false).track;
      }

      removeOldCues(this.tech_.buffered(), this.inbandTextTracks_[caption.stream]);

      this.inbandTextTracks_[caption.stream].addCue(new _window2['default'].VTTCue(caption.startPts / 90000, caption.endPts / 90000, caption.text));
    }
  };

  FlashlsHandler.prototype.dispose = function dispose() {
    this.tech_.off('loadedmetadata', this.onLoadedmetadata_);
    this.tech_.off('seeked', this.onSeeking_);
    this.tech_.off('id3updated', this.onId3updated_);
    this.tech_.off('captiondata', this.onCaptionData_);
    this.tech_.audioTracks().off('change', this.onAudioTrackChanged);
    this.tech_.off('levelswitch', this.onLevelSwitch_);
    this.tech_.off('levelloaded', this.onLevelLoaded_);
    this.tech_.off('fragmentloaded', this.onFragmentLoaded_);

    if (this.qualityLevels_) {
      this.qualityLevels_.dispose();
    }
  };

  return FlashlsHandler;
}();

/*
 * Registers the SWF as a handler for HLS video.
 *
 * @property {Tech~SourceObject} source
 *           The source object
 *
 * @property {Flash} tech
 *           The instance of the Flash tech
 */


var FlashlsSourceHandler = {};

var mpegurlRE = /^(audio|video|application)\/(x-|vnd\.apple\.)?mpegurl/i;

/**
 * Reports that Flash can play HLS.
 *
 * @param {string} type
 *        The mimetype to check
 *
 * @return {string}
 *         'maybe', or '' (empty string)
 */
FlashlsSourceHandler.canPlayType = function (type) {
  return mpegurlRE.test(type) ? 'maybe' : '';
};

/**
 * Returns true if the source type indicates HLS content.
 *
 * @param {Tech~SourceObject} source
 *         The source object
 *
 * @param {Object} [options]
 *         Options to be passed to the tech.
 *
 * @return {string}
 *         'maybe', or '' (empty string).
 */
FlashlsSourceHandler.canHandleSource = function (source, options) {
  return FlashlsSourceHandler.canPlayType(source.type) === 'maybe';
};

/**
 * Pass the source to the swf.
 *
 * @param {Tech~SourceObject} source
 *        The source object
 *
 * @param {Flash} tech
 *        The instance of the Flash tech
 *
 * @param {Object} [options]
 *        The options to pass to the source
 */
FlashlsSourceHandler.handleSource = function (source, tech, options) {
  tech.hls = new FlashlsHandler(source, tech, options);
  tech.hls.src(source);
  return tech.hls;
};

// Register the source handler and make sure it takes precedence over
// any other Flash source handlers for HLS
_video2['default'].getTech('Flash').registerSourceHandler(FlashlsSourceHandler, 0);

// Include the version number.
FlashlsSourceHandler.VERSION = '__VERSION__';

exports['default'] = FlashlsSourceHandler;