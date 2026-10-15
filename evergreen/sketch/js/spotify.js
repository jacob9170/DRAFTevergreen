// spotify.js — plays real songs through Spotify's embed player (iFrame API).
// Logged into Spotify Premium in the browser = full tracks; otherwise 30 s previews.
// Docs: https://developer.spotify.com/documentation/embeds/references/iframe-api

class SpotifyPlayer {
  constructor(elementId, onPlayingChange) {
    this.controller = null;
    this.pendingUri = null;
    this.isPlaying = false;

    // The Spotify script calls this global when it has loaded.
    window.onSpotifyIframeApiReady = (IFrameAPI) => {
      const el = document.getElementById(elementId);
      const options = { width: "100%", height: 80, uri: this.pendingUri || "spotify:track:6CcJMwBtXByIz4zQLzFkKc" };
      IFrameAPI.createController(el, options, (controller) => {
        this.controller = controller;
        controller.addListener("playback_update", (e) => {
          const playing = !e.data.isPaused && !e.data.isBuffering;
          if (playing !== this.isPlaying) {
            this.isPlaying = playing;
            onPlayingChange(playing);
          }
        });
        if (this.pendingUri) this.play(this.pendingUri);
      });
    };
  }

  play(uri) {
    if (!this.controller) {
      this.pendingUri = uri; // API not ready yet — play as soon as it is
      return;
    }
    this.pendingUri = null;
    this.controller.loadUri(uri);
    this.controller.play();
  }

  pause() {
    if (this.controller) this.controller.pause();
  }
}
