// A stand-in for the YouTube IFrame API, for browser suites.
//
// The app's rule is that a performance runs exactly as long as the clip that
// plays, and that no song means no round. Both of those are only testable if a
// suite can decide what the player does — and a sandboxed test runner has no
// business reaching out to youtube.com anyway: it would make every run depend
// on a third party's uptime, a search result that changes, and a network the
// CI box may not have.
//
// So this is the real API surface, faked, with the parts the app actually
// touches and nothing else. Injected before the app boots via
// Page.addScriptToEvaluateOnNewDocument, so loadYoutubeApi() finds window.YT
// already present and resolves immediately.
//
//   window.__FAKE_YT = { duration, failAfter, autoplay }
//     duration    what getDuration() reports (seconds)
//     failAfter   fire onError on the Nth loadPlaylist (1-based); 0 = never
//     autoplay    whether loading a song reaches PLAYING at all
//
// Tests can flip window.__FAKE_YT at runtime to make the music die mid-round.
(function () {
  const cfg = () => Object.assign({ duration: 210, failAfter: 0, autoplay: true }, window.__FAKE_YT || {});
  let loads = 0;
  window.__FAKE_YT_STATE = { loads: 0, lastQuery: '', seekedTo: null, playing: false };

  function FakePlayer(el, opts) {
    const events = (opts && opts.events) || {};
    let currentTime = 0;
    let ticking = null;

    const target = {
      unMute() {}, setVolume() {},
      getDuration: () => cfg().duration,
      getCurrentTime: () => currentTime,
      seekTo(t) { currentTime = Number(t) || 0; window.__FAKE_YT_STATE.seekedTo = currentTime; },
      playVideo() { window.__FAKE_YT_STATE.playing = true; },
      pauseVideo() { window.__FAKE_YT_STATE.playing = false; },
      stopVideo() { window.__FAKE_YT_STATE.playing = false; },
      loadVideoById() { this.loadPlaylist({ list: 'byid' }); },
      loadPlaylist(o) {
        loads += 1;
        window.__FAKE_YT_STATE.loads = loads;
        window.__FAKE_YT_STATE.lastQuery = (o && o.list) || '';
        const c = cfg();
        currentTime = 0;
        clearInterval(ticking);
        if (c.failAfter && loads >= c.failAfter) { setTimeout(() => events.onError && events.onError({ data: 150, target }), 20); return; }
        if (!c.autoplay) return;
        setTimeout(() => {
          window.__FAKE_YT_STATE.playing = true;
          // A real clip advances, and the app reads getCurrentTime() to work
          // out how much of the window is left. Advance in real time.
          ticking = setInterval(() => { currentTime += 0.1; }, 100);
          events.onStateChange && events.onStateChange({ data: 1 /* PLAYING */, target });
        }, 30);
      },
      destroy() { clearInterval(ticking); },
    };
    // The real API replaces the element it is handed; nothing here needs to.
    setTimeout(() => events.onReady && events.onReady({ target }), 10);
    return target;
  }

  window.YT = { Player: FakePlayer, PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  if (typeof window.onYouTubeIframeAPIReady === 'function') window.onYouTubeIframeAPIReady();
})();
