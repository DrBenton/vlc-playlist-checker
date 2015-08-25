'use strict';

var Promise = require('bluebird');
var spawn = require('child_process').spawn;
var exec = Promise.promisify(require('child_process').exec);
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var request = Promise.promisify(require('request'));
var sprintf = require('sprintf-js').sprintf;
var m3uParser = require('playlist-parser').M3U;

var debug = require('debug')('vlc')

Promise.promisifyAll(fs);

var DEFAULT_PLAYLIST_URL = 'http://mafreebox.freebox.fr/freeboxtv/playlist.m3u';
var DEFAULT_PLAYLIST_CHANNEL_DURATION = 10000;
var VLC_DEFAULT_PATHS_PAR_PLATFORM = {
    'win32': 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
    'darwin': '/Applications/VLC.app/Contents/MacOS/VLC',
    'linux': '/usr/bin/vlc',
};

var currentChannelIndex;
var eventEmitter = new EventEmitter();


function initVlcOrchestration(vlcPlaylistUrl) {
    return getVlcPlaylistContent(vlcPlaylistUrl)
        .spread(onVlcPlaylistContentRetrieved)
        .then(parsePlaylistContent)
    ;
}

function getVlcPlaylistContent(vlcPlaylistUrl) {
    vlcPlaylistUrl = vlcPlaylistUrl || DEFAULT_PLAYLIST_URL;

    eventEmitter.emit('playlist-download-start', {
        url: vlcPlaylistUrl
    });

    return request(vlcPlaylistUrl);
}

function onVlcPlaylistContentRetrieved(response, body) {
    debug('response.statusCode=', response.statusCode);

    var success = (200 === response.statusCode);

    eventEmitter.emit('playlist-download-end', {
        success: success
    });

    if (success) {
        return body;
    }
    throw new Error('VLC playlist content could not be retrieved!');
}

function parsePlaylistContent(body) {
    var playlistContent = m3uParser.parse(body);
    playlistContent = playlistContent.filter(function (playlistItem) {
        return !!playlistItem;
    });

    debug(playlistContent.length + ' items found in playlist.');

    return playlistContent;
}

function launchPlaylistChannels(vlcPath, channelDuration, playlistContent) {
    vlcPath = vlcPath || getVlcDefaultPath();
    channelDuration = channelDuration || DEFAULT_PLAYLIST_CHANNEL_DURATION;

    eventEmitter.emit('playlist-init', {
        total: playlistContent.length
    });

    debug('Launching %d channels.', playlistContent.length);

    return new Promise(function (resolve, reject) {
        currentChannelIndex = 0;
        launchNextChannelForEver(vlcPath, channelDuration, playlistContent);
    });
}

function launchNextChannelForEver(vlcPath, channelDuration, playlistContent) {
    function onChannelFinished() {
        debug('Channel %d finished. Let\'s launch the next one!', currentChannelIndex);
        process.nextTick(playItAgainSam);
    }

    function playItAgainSam() {
        launchNextChannelForEver(vlcPath, channelDuration, playlistContent);
    }

    return launchNextChannel(vlcPath, channelDuration, playlistContent).then(onChannelFinished);
}

function launchNextChannel(vlcPath, channelDuration, playlistContent) {
    var channelPromise = launchChannel(vlcPath, channelDuration, playlistContent, currentChannelIndex);
    currentChannelIndex++;
    if (playlistContent.length === currentChannelIndex) {
        currentChannelIndex = 0;//let's loop for ever!
    }

    return channelPromise;
}

function launchChannel(vlcPath, channelDuration, playlistContent, channelIndex) {

    debug('Launching channel %d of %d for %d seconds', channelIndex, playlistContent.length, channelDuration);
    var channelUrl = playlistContent[channelIndex].file;
    var channelTitle = playlistContent[channelIndex].title;
    debug('channelTitle=', channelTitle, ', channelUrl=', channelUrl);

    eventEmitter.emit('playlist-progress', {
        current: channelIndex,
        total: playlistContent.length,
        channelUrl: channelUrl,
        channelTitle: channelTitle
    });

    return checkVlcPath(vlcPath)
        .then(_.partial(launchVlcAndWait, vlcPath, channelDuration, channelUrl, channelTitle));
}

function checkVlcPath(vlcPath) {
    return fs.statAsync(vlcPath).catch(onVlcNotFound);

    function onVlcNotFound() {
        throw new Error(sprintf('VLC not found at path "%s"!', vlcPath));
    }
}

function launchVlcAndWait(vlcPath, channelDuration, channelUrl, channelTitle) {

    debug(sprintf('Launching "%s" with channel "%s"', vlcPath, channelTitle));

    return new Promise(function (resolve, reject) {

        var cmd = sprintf(
            '"%s" --one-instance --no-video-title-show "%s"',
            vlcPath,
            channelUrl
        );
        if ('win32' !== process.platform) {
            cmd += ' &';
        }
        exec(cmd);

        setTimeout(resolvePromise, channelDuration);

        function resolvePromise() {
            process.nextTick(resolve);
        }

    });
}

function launchVlcAndKillAfterChannelDuration(vlcPath, channelDuration, channelUrl) {

    return new Promise(function (resolve, reject) {

        var vlcProcess = spawn(vlcPath, [channelUrl]);

        vlcProcess.on('close', function (code, signal) {
            debug('child process terminated due to receipt of signal ' + signal);
        });

        setTimeout(killVlcAndResolvePromise, channelDuration);

        function killVlcAndResolvePromise() {
            debug('Let\'s shut down VLC...')
            vlcProcess.kill('SIGHUP');
            process.nextTick(resolve);
        }

    });
}

function getVlcDefaultPath() {
    return VLC_DEFAULT_PATHS_PAR_PLATFORM[process.platform];
}

module.exports.initVlcOrchestration = initVlcOrchestration;
module.exports.launchPlaylistChannels = launchPlaylistChannels;
module.exports.getVlcDefaultPath = getVlcDefaultPath;
module.exports.eventEmitter = eventEmitter;
module.exports.DEFAULT_PLAYLIST_URL = DEFAULT_PLAYLIST_URL;
module.exports.DEFAULT_PLAYLIST_CHANNEL_DURATION = DEFAULT_PLAYLIST_CHANNEL_DURATION;
