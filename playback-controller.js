(function () {
  class PlaybackController {
    constructor(options = {}) {
      this.onState = typeof options.onState === 'function' ? options.onState : null;
      this.getIsPlaying = typeof options.getIsPlaying === 'function' ? options.getIsPlaying : () => false;
      this.audioElement = options.audioElement || null;
      this.playerHostId = options.playerHostId || 'ytPlayer';
      this.hls = null;
      this.ytPlayer = null;
      this.boundAudio = null;
    }

    emitState(state) {
      if (this.onState) this.onState(state);
    }

    bindAudioEvents(audioEl) {
      if (!audioEl || audioEl._rgbPlaybackBound) return;
      audioEl._rgbPlaybackBound = true;
      this.boundAudio = audioEl;
      audioEl.addEventListener('playing', () => this.emitState('playing'));
      audioEl.addEventListener('play', () => this.emitState('play'));
      audioEl.addEventListener('waiting', () => this.emitState('waiting'));
      audioEl.addEventListener('pause', () => { if (this.getIsPlaying()) this.emitState('paused'); });
      audioEl.addEventListener('ended', () => this.emitState('ended'));
      audioEl.addEventListener('error', () => this.emitState('error'));
      audioEl.addEventListener('timeupdate', () => {
        if ((audioEl.currentTime || 0) > 0.05) this.emitState('playing');
      });
    }

    start(liveConfig) {
      const player = liveConfig?.player;
      if (!player) return;
      this.emitState('loading');

      if (player.type === 'youtube') return this.startYouTube(player);
      if (player.type === 'hls') return this.startHls(player, liveConfig?.fallbackAudioUrl || '');
      if (player.type === 'audio' || player.type === 'web') return this.startAudio(player.url);
      if (player.type === 'bilibili') {
        // A Bilibili page URL is not a direct media URL. Do not feed it into <audio>.
        // Bilibili should be played from downloaded/offline media or HLS produced by the backend.
        this.emitState('unsupported-bilibili-page');
        return;
      }
    }

    startYouTube(player) {
      const YTApi = window.YT;
      const PlayerCtor = YTApi && YTApi.Player;
      if (!PlayerCtor) {
        this.emitState('yt-api-missing');
        return;
      }
      const config = {
        height: '1',
        width: '1',
        videoId: player.videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          fs: 0,
          playsinline: 1
        },
        events: {
          onReady: (ev) => {
            this.emitState('ready');
            try { ev.target.playVideo(); } catch (_) {}
          },
          onStateChange: (ev) => {
            const YTState = window.YT && window.YT.PlayerState;
            if (!YTState) return;
            if (ev.data === YTState.PLAYING) this.emitState('playing');
            else if (ev.data === YTState.BUFFERING) this.emitState('buffering');
            else if (ev.data === YTState.PAUSED) this.emitState('paused');
            else if (ev.data === YTState.ENDED) this.emitState('ended');
            else if (ev.data === YTState.CUED) this.emitState('cued');
          },
          onError: () => this.emitState('error')
        }
      };
      try {
        if (!this.ytPlayer) {
          this.ytPlayer = new PlayerCtor(this.playerHostId, config);
        } else {
          try { this.ytPlayer.loadVideoById(player.videoId); } catch (_) {}
          this.emitState('reloading');
        }
      } catch (_) {
        this.emitState('yt-init-error');
      }
    }

    startHls(player, fallbackAudioUrl) {
      const a = this.audioElement;
      if (!a) return;
      this.bindAudioEvents(a);
      const src = player.url;
      const fallbackToAudio = () => {
        if (!fallbackAudioUrl) return;
        a.src = fallbackAudioUrl;
        a.play().catch(() => this.emitState('autoplay-blocked'));
      };
      if (window.Hls && window.Hls.isSupported()) {
        if (this.hls) {
          try { this.hls.destroy(); } catch (_) {}
        }
        this.hls = new window.Hls({ maxBufferLength: 20, lowLatencyMode: true });
        this.hls.loadSource(src);
        this.hls.attachMedia(a);
        this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          a.play().catch(() => fallbackToAudio());
        });
        this.hls.on(window.Hls.Events.ERROR, () => {
          fallbackToAudio();
        });
      } else {
        a.src = src;
        a.play().catch(() => fallbackToAudio());
      }
    }

    startAudio(url) {
      const a = this.audioElement;
      if (!a) return;
      this.bindAudioEvents(a);
      a.src = url;
      a.play().catch(() => this.emitState('autoplay-blocked'));
    }

    pause() {
      if (this.ytPlayer?.pauseVideo) {
        try { this.ytPlayer.pauseVideo(); } catch (_) {}
      }
      if (this.audioElement && !this.audioElement.paused) {
        try { this.audioElement.pause(); } catch (_) {}
      }
    }

    resume() {
      if (this.ytPlayer?.playVideo) {
        try { this.ytPlayer.playVideo(); } catch (_) {}
      }
      if (this.audioElement?.paused) {
        this.audioElement.play().catch(() => {});
      }
    }

    getCurrentTime(liveConfig) {
      if (liveConfig?.player?.type === 'youtube' && this.ytPlayer?.getCurrentTime) {
        return this.ytPlayer.getCurrentTime() || 0;
      }
      if (this.audioElement) return this.audioElement.currentTime || 0;
      return 0;
    }

    getYouTubePlayerState() {
      if (this.ytPlayer?.getPlayerState) return this.ytPlayer.getPlayerState();
      return null;
    }

    isAudioHealthy() {
      const a = this.audioElement;
      return Boolean(a && !a.paused && !a.ended);
    }
  }

  window.PlaybackController = PlaybackController;
})();
