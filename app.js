var program = require('commander');
var vlcOrchestrator = require('./vlc-orchestrator');
var ProgressBar = require('progress');
//var pace = require('pace');

program
    .version('0.0.1')
    .option('-d, --channel-duration <duration>', 'Duration of each channel of the playlist', parseInt)
    .option('-p, --vlc-path <path>', 'VLC path')
    .option('-u, --playlist-url <url>', 'Playlist url')
    .parse(process.argv);

console.log('VLC Playlist Checker (c) Olivier Philippon <http://rougemine.com>');
console.log('Press CTRL+C to stop this program.');

vlcOrchestrator.eventEmitter.on('playlist-download-start', onPlaylistDownloadStart);
vlcOrchestrator.eventEmitter.on('playlist-download-end', onPlaylistDownloadEnd);
vlcOrchestrator.eventEmitter.on('playlist-init', onPlaylistInit);
vlcOrchestrator.eventEmitter.on('playlist-progress', onPlaylistProgress);

vlcOrchestrator.initVlcOrchestration(program.playlistUrl)
    .then(onVlcOrchestrationInit)
    .catch(onError)
    .done()
;

function onVlcOrchestrationInit(playlistContent) {
    launchPlaylistChannels(playlistContent);
}

function launchPlaylistChannels(playlistContent) {
    var channelDuration = null;
    if (program.channelDuration) {
        channelDuration = program.channelDuration * 1000;
    }

    vlcOrchestrator.launchPlaylistChannels(program.vlcPath, channelDuration, playlistContent);
}

function onError(err) {
    console.error(err.message);
    process.exit(1)
}


var progressInstance;

function onPlaylistDownloadStart(payload) {
    console.log('Downloading playlist...', payload.url);
}

function onPlaylistDownloadEnd(payload) {
    if (payload.success) {
        console.log('Playlist successfully downloaded.');
    } else {
        console.log('Playlist download error!');
    }
}

function onPlaylistInit(payload) {
    console.log(payload.total + ' items found in playlist.');
    progressInstance = new ProgressBar(':current/:total [:bar] :percent :elapsed :eta', {
        complete: '=',
        incomplete: ' ',
        total: payload.total
    });
    //progressInstance = pace(payload.total);
}

function onPlaylistProgress(payload) {
    if (!progressInstance) {
        return;
    }

    console.log('Reading', payload.channelTitle);
    progressInstance.tick();
    //progressInstance.op(payload.current);
}
