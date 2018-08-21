'use strict';

exports.__esModule = true;
exports.setupAudioTracks = exports.updateAudioTrack = undefined;

var _video = require('video.js');

var _video2 = _interopRequireDefault(_video);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

/**
 * Updates the selected index of the audio track list with the new active track
 *
 * @param {Object} tech
 *        The flash tech
 * @function updateAudioTrack
 */
var updateAudioTrack = exports.updateAudioTrack = function updateAudioTrack(tech) {
  var audioTracks = tech.el_.vjs_getProperty('audioTracks');
  var vjsAudioTracks = tech.audioTracks();
  var enabledTrackId = null;

  for (var i = 0; i < vjsAudioTracks.length; i++) {
    if (vjsAudioTracks[i].enabled) {
      enabledTrackId = vjsAudioTracks[i].id;
      break;
    }
  }

  if (enabledTrackId === null) {
    // no tracks enabled, do nothing
    return;
  }

  for (var _i = 0; _i < audioTracks.length; _i++) {
    if (enabledTrackId === audioTracks[_i].title) {
      tech.el_.vjs_setProperty('audioTrack', _i);
      return;
    }
  }
};

/**
 * This adds the videojs audio track to the audio track list
 *
 * @param {Object} tech
 *        The flash tech
 * @function onTrackChanged
 */
var setupAudioTracks = exports.setupAudioTracks = function setupAudioTracks(tech) {
  var altAudioTracks = tech.el_.vjs_getProperty('altAudioTracks');
  var audioTracks = tech.el_.vjs_getProperty('audioTracks');
  var enabledIndex = tech.el_.vjs_getProperty('audioTrack');

  audioTracks.forEach(function (track, index) {
    var altTrack = altAudioTracks[track.id];

    tech.audioTracks().addTrack(new _video2['default'].AudioTrack({
      id: altTrack.name,
      enabled: enabledIndex === index,
      language: altTrack.lang,
      'default': altTrack.default_track,
      label: altTrack.name
    }));
  });
};