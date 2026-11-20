/*
 * net.js — Transport layer for Lip Sync Bingo multiplayer.
 *
 * Three transports, one interface, so the game code never cares how
 * players are connected:
 *
 *  1. Loopback  — solo "just me" practice. No peers, no network.
 *  2. PeerJS    — online rooms over the free public PeerJS broker.
 *                 Host peer id is "lsb-<CODE>", so the 4-letter room
 *                 code IS the address. Host-authoritative.
 *  3. Hotspot   — Korey's requirement: players join HIS Android hotspot
 *                 with NO internet. Plain RTCPeerConnection with manual
 *                 signaling (QR code or copy/paste text). No STUN, no
 *                 broker, no server of any kind once paired — the data
 *                 channels run directly phone-to-phone over the hotspot.
 *
 * Host transport interface:
 *   broadcast(obj)            send to every connected guest
 *   sendTo(peerKey, obj)      send to one guest
 *   onMessage(fn(peerKey, obj)), onJoin(fn(peerKey)), onLeave(fn(peerKey))
 *   close()
 * Guest transport interface:
 *   send(obj), onMessage(fn(obj)), onClose(fn()), close()
 */
(function (root) {
  'use strict';

  function noop() {}
  function callbacks(o) {
    o = o || {};
    return {
      onMessage: o.onMessage || noop,
      onJoin: o.onJoin || noop,
      onLeave: o.onLeave || noop,
      onClose: o.onClose || noop,
      onError: o.onError || noop,
      onMedia: o.onMedia || noop,
      onRemoteTrack: o.onRemoteTrack || noop,
      onRemoteStream: o.onRemoteStream || noop
    };
  }

  /** replaceTrack that never throws/rejects into game code. */
  function rp(sender, track) {
    if (!sender) return;
    try {
      var r = sender.replaceTrack(track);
      if (r && r.catch) r.catch(function () {});
    } catch (e) { /* transceiver gone — stage just shows the name tile */ }
  }

  /* ============================ Loopback ============================ */
  function createLoopbackHost() {
    return {
      kind: 'solo',
      broadcast: noop, sendTo: noop,
      onMessage: noop, onJoin: noop, onLeave: noop,
      close: noop
    };
  }

  /* ============================= PeerJS ============================= */
  var PEER_PREFIX = 'lsb-v1-';

  function createPeerHost(code, cb) {
    cb = callbacks(cb);
    return new Promise(function (resolve, reject) {
      if (typeof Peer === 'undefined') return reject(new Error('PeerJS library not loaded (needs internet once to fetch it).'));
      var peer = new Peer(PEER_PREFIX + code);
      var conns = {}; // peerKey (remote peer id) -> DataConnection
      var mediaCalls = []; // live stage-video calls (in + out)
      // If the broker never answers (no internet), 'open' never fires
      // and no error may arrive either — don't leave the promise (and
      // the "Opening your room…" toast) hanging forever.
      var openTimer = setTimeout(function () {
        try { peer.destroy(); } catch (e) {}
        reject(new Error('Could not reach the game server — check your internet and try again.'));
      }, 12000);
      function trackCall(c) {
        mediaCalls.push(c);
        c.on('close', function () {
          var i = mediaCalls.indexOf(c);
          if (i >= 0) mediaCalls.splice(i, 1);
        });
      }
      peer.on('call', function (call) {
        trackCall(call);
        try { call.answer(); } catch (e) {} // receive-only: viewers send nothing back
        call.on('stream', function (s) { cb.onMedia(call.metadata || {}, s); });
      });
      var transport = {
        kind: 'online',
        code: code,
        broadcast: function (obj) {
          Object.keys(conns).forEach(function (k) {
            try { conns[k].send(obj); } catch (e) { /* dropped conn */ }
          });
        },
        sendTo: function (peerKey, obj) {
          if (conns[peerKey]) { try { conns[peerKey].send(obj); } catch (e) {} }
        },
        onMessage: function (fn) { cb.onMessage = fn; },
        onJoin: function (fn) { cb.onJoin = fn; },
        onLeave: function (fn) { cb.onLeave = fn; },
        onMedia: function (fn) { cb.onMedia = fn; },
        myMediaId: function () { return peer.id; },
        callMedia: function (peerId, stream, meta) {
          try {
            var c = peer.call(peerId, stream, { metadata: meta });
            if (c) trackCall(c);
            return c;
          } catch (e) { return null; }
        },
        closeMedia: function () {
          mediaCalls.slice().forEach(function (c) { try { c.close(); } catch (e) {} });
          mediaCalls = [];
        },
        close: function () { try { peer.destroy(); } catch (e) {} }
      };
      peer.on('open', function () { clearTimeout(openTimer); resolve(transport); });
      peer.on('error', function (err) {
        clearTimeout(openTimer);
        if (err.type === 'unavailable-id') {
          reject(new Error('Room code ' + code + ' is already in use — host again to get a fresh code.'));
        } else { cb.onError(err); reject(err); }
      });
      peer.on('connection', function (conn) {
        var gone = false; // 'error' and 'close' can BOTH fire for one departure
        function leave() {
          if (gone) return;
          gone = true;
          delete conns[conn.peer];
          cb.onLeave(conn.peer);
        }
        conn.on('open', function () {
          conns[conn.peer] = conn;
          cb.onJoin(conn.peer);
        });
        conn.on('data', function (data) { cb.onMessage(conn.peer, data); });
        conn.on('close', leave);
        conn.on('error', leave);
      });
    });
  }

  function createPeerGuest(code, cb) {
    cb = callbacks(cb);
    return new Promise(function (resolve, reject) {
      if (typeof Peer === 'undefined') return reject(new Error('PeerJS library not loaded (needs internet once to fetch it).'));
      var peer = new Peer();
      var settled = false;
      var mediaCalls = []; // live stage-video calls (in + out)
      // Same hang guard as the host: if the broker never opens this
      // peer (no internet), settle with an error instead of spinning.
      var openTimer = setTimeout(function () {
        if (!settled) {
          settled = true;
          try { peer.destroy(); } catch (e) {}
          reject(new Error('Could not reach the game server — check your internet and try again.'));
        }
      }, 12000);
      function trackCall(c) {
        mediaCalls.push(c);
        c.on('close', function () {
          var i = mediaCalls.indexOf(c);
          if (i >= 0) mediaCalls.splice(i, 1);
        });
      }
      peer.on('call', function (call) {
        trackCall(call);
        try { call.answer(); } catch (e) {} // receive-only
        call.on('stream', function (s) { cb.onMedia(call.metadata || {}, s); });
      });
      peer.on('open', function () {
        clearTimeout(openTimer);
        var conn = peer.connect(PEER_PREFIX + code, { reliable: true });
        var transport = {
          kind: 'online',
          send: function (obj) { try { conn.send(obj); } catch (e) {} },
          onMessage: function (fn) { cb.onMessage = fn; },
          onClose: function (fn) { cb.onClose = fn; },
          onMedia: function (fn) { cb.onMedia = fn; },
          myMediaId: function () { return peer.id; },
          callMedia: function (peerId, stream, meta) {
            try {
              var c = peer.call(peerId, stream, { metadata: meta });
              if (c) trackCall(c);
              return c;
            } catch (e) { return null; }
          },
          closeMedia: function () {
            mediaCalls.slice().forEach(function (c) { try { c.close(); } catch (e) {} });
            mediaCalls = [];
          },
          close: function () { try { conn.close(); } catch (e) {} try { peer.destroy(); } catch (e) {} }
        };
        conn.on('open', function () { settled = true; resolve(transport); });
        conn.on('data', function (data) { cb.onMessage(data); });
        conn.on('close', function () { cb.onClose(); });
        conn.on('error', function (err) { if (!settled) { settled = true; reject(err); } });
        setTimeout(function () {
          if (!settled) { settled = true; reject(new Error('Could not reach room ' + code + '. Check the code and that the host is waiting.')); }
        }, 12000);
      });
      peer.on('error', function (err) {
        if (err.type === 'peer-unavailable') {
          if (!settled) { settled = true; reject(new Error('No room found with code ' + code + '.')); }
        } else if (!settled) { settled = true; reject(err); }
      });
    });
  }

  /* ==================== Hotspot (manual WebRTC) ===================== */
  /* Signaling blobs are base64 JSON: {v:1, type, sdp}. The host makes  */
  /* one offer per guest; each pairing is independent, so the host can */
  /* pair players one after another. ICE uses NO servers — host        */
  /* candidates on the local hotspot are all we need or want.          */

  function encodeSignal(type, sdp) {
    return btoa(JSON.stringify({ v: 1, type: type, sdp: sdp }));
  }
  function decodeSignal(text) {
    var raw = String(text || '').trim();
    var obj = JSON.parse(atob(raw));
    if (!obj || obj.v !== 1 || !obj.sdp) throw new Error('That code does not look like a Lip Sync Bingo pairing code.');
    return obj;
  }

  function waitForIce(pc) {
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === 'complete') return resolve();
      var done = false;
      function finish() { if (!done) { done = true; resolve(); } }
      pc.addEventListener('icegatheringstatechange', function () {
        if (pc.iceGatheringState === 'complete') finish();
      });
      setTimeout(finish, 4000); // LAN gathering is fast; don't hang forever
    });
  }

  function newLocalPC() {
    return new RTCPeerConnection({ iceServers: [] });
  }

  function createHotspotHost(cb) {
    cb = callbacks(cb);
    var channels = {}; // pairingId -> RTCDataChannel (open ones)
    var pending = {};  // pairingId -> RTCPeerConnection awaiting answer
    var mediaPc = {};  // pairingId -> {pc, senders:[slot0, slot1]} stage video
    var counter = 0;

    var transport = {
      kind: 'hotspot',
      broadcast: function (obj) {
        var s = JSON.stringify(obj);
        Object.keys(channels).forEach(function (k) {
          try { channels[k].send(s); } catch (e) {}
        });
      },
      sendTo: function (peerKey, obj) {
        if (channels[peerKey]) { try { channels[peerKey].send(JSON.stringify(obj)); } catch (e) {} }
      },
      onMessage: function (fn) { cb.onMessage = fn; },
      onJoin: function (fn) { cb.onJoin = fn; },
      onLeave: function (fn) { cb.onLeave = fn; },
      close: function () {
        Object.keys(channels).forEach(function (k) { try { channels[k].close(); } catch (e) {} });
        Object.keys(pending).forEach(function (k) { try { pending[k].close(); } catch (e) {} });
        // Paired guests' PCs live ONLY in mediaPc once their answer is
        // accepted (they leave `pending`) — close them too, or leaving
        // the room leaks live RTCPeerConnections.
        Object.keys(mediaPc).forEach(function (k) { try { mediaPc[k].pc.close(); } catch (e) {} });
        channels = {}; pending = {}; mediaPc = {};
      },

      /**
       * Forward a stage-video track to every guest's slot sender
       * (except the pairing it came from). Pure replaceTrack — the
       * video m-lines were negotiated at pairing time, so this never
       * needs renegotiation over the QR codes.
       */
      setForward: function (slot, track, exceptPairingId) {
        Object.keys(mediaPc).forEach(function (k) {
          if (k === exceptPairingId) return;
          rp(mediaPc[k].senders[slot], track);
        });
      },
      /** Send the host's own camera track to every guest on a slot. */
      setHostTrack: function (slot, track) {
        Object.keys(mediaPc).forEach(function (k) { rp(mediaPc[k].senders[slot], track); });
      },
      /** Blank every stage-video slot on every guest connection. */
      clearStageMedia: function () {
        Object.keys(mediaPc).forEach(function (k) {
          mediaPc[k].senders.forEach(function (s) { rp(s, null); });
        });
      },

      /** Create an invite for ONE guest. Returns {pairingId, code}. */
      makeOffer: function () {
        var pairingId = 'hs' + (++counter) + '-' + Math.random().toString(36).slice(2, 7);
        var pc = newLocalPC();
        pending[pairingId] = pc;
        var dc = pc.createDataChannel('lsb');
        wireChannel(pairingId, dc);
        // Two stage-video slots (performer 1 / performer 2), negotiated
        // NOW so a performance later is a replaceTrack, not a new
        // round of QR signaling the room can't do mid-game.
        var vts = [
          pc.addTransceiver('video', { direction: 'sendrecv' }),
          pc.addTransceiver('video', { direction: 'sendrecv' })
        ];
        mediaPc[pairingId] = { pc: pc, senders: [vts[0].sender, vts[1].sender] };
        pc.ontrack = function (ev) {
          var idx = vts.indexOf(ev.transceiver);
          if (idx === -1) return;
          var stream = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
          cb.onRemoteTrack(pairingId, idx, ev.track, stream);
        };
        return pc.createOffer()
          .then(function (offer) { return pc.setLocalDescription(offer); })
          .then(waitForIce.bind(null, pc))
          .then(function () {
            return { pairingId: pairingId, code: encodeSignal('offer', pc.localDescription.sdp) };
          });
      },

      /** Apply a guest's answer code to the matching pending pairing. */
      acceptAnswer: function (pairingId, codeText) {
        var pc = pending[pairingId];
        if (!pc) throw new Error('That invite already expired — make a fresh one.');
        var sig = decodeSignal(codeText);
        if (sig.type !== 'answer') throw new Error('That is an invite code, not a reply code. Paste the guest\u2019s reply code.');
        delete pending[pairingId];
        return pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
      }
    };

    function wireChannel(pairingId, dc) {
      dc.onopen = function () { channels[pairingId] = dc; cb.onJoin(pairingId); };
      dc.onmessage = function (ev) {
        try { cb.onMessage(pairingId, JSON.parse(ev.data)); } catch (e) {}
      };
      dc.onclose = function () { delete channels[pairingId]; delete mediaPc[pairingId]; cb.onLeave(pairingId); };
    }
    return transport;
  }

  function createHotspotGuest(cb) {
    cb = callbacks(cb);
    var pc = null, dc = null;
    var transport = {
      kind: 'hotspot',
      send: function (obj) { if (dc && dc.readyState === 'open') { try { dc.send(JSON.stringify(obj)); } catch (e) {} } },
      onMessage: function (fn) { cb.onMessage = fn; },
      onClose: function (fn) { cb.onClose = fn; },
      onRemoteStream: function (fn) { cb.onRemoteStream = fn; },
      close: function () { try { dc && dc.close(); } catch (e) {} try { pc && pc.close(); } catch (e) {} },

      /** My camera track onto my stage slot (0 or 1); null to blank it. */
      setMyTrack: function (slot, track) {
        if (!pc) return;
        var vts = pc.getTransceivers().filter(function (t) {
          return t.receiver && t.receiver.track && t.receiver.track.kind === 'video';
        });
        if (vts[slot]) rp(vts[slot].sender, track);
      },
      clearMyStage: function () {
        if (!pc) return;
        pc.getTransceivers().forEach(function (t) {
          if (t.receiver && t.receiver.track && t.receiver.track.kind === 'video') rp(t.sender, null);
        });
      },

      /** Take the host's invite code, produce our reply code. */
      acceptOffer: function (codeText) {
        var sig = decodeSignal(codeText);
        if (sig.type !== 'offer') throw new Error('That is a reply code, not an invite code. Paste the host\u2019s invite code.');
        if (pc) { try { pc.close(); } catch (e) {} pc = null; dc = null; } // re-pairing: don't leak the old PC
        pc = newLocalPC();
        pc.ontrack = function (ev) {
          var vts = pc.getTransceivers().filter(function (t) {
            return t.receiver && t.receiver.track && t.receiver.track.kind === 'video';
          });
          var idx = vts.indexOf(ev.transceiver);
          if (idx === -1) return;
          var stream = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
          cb.onRemoteStream(idx, stream);
        };
        pc.ondatachannel = function (ev) {
          dc = ev.channel;
          dc.onmessage = function (m) { try { cb.onMessage(JSON.parse(m.data)); } catch (e) {} };
          dc.onclose = function () { cb.onClose(); };
        };
        return pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp })
          .then(function () { return pc.createAnswer(); })
          .then(function (answer) { return pc.setLocalDescription(answer); })
          .then(function () { return waitForIce(pc); })
          .then(function () { return encodeSignal('answer', pc.localDescription.sdp); });
      }
    };
    return transport;
  }

  /* ========================= QR helpers ============================= */

  /** Render text as a QR code into an element. Returns false if the
   *  text is too long for a QR code (caller shows the text instead). */
  function renderQR(el, text) {
    if (typeof qrcode === 'undefined') { el.textContent = ''; return false; }
    try {
      var qr = qrcode(0, 'L');
      qr.addData(text);
      qr.make();
      el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 10, scalable: true });
      return true;
    } catch (e) {
      el.textContent = '';
      return false;
    }
  }

  /**
   * Scan a QR code with the camera. Calls onText(decodedString) once,
   * then stops. Returns a stop() function. Requires jsQR + getUserMedia.
   */
  function startScanner(videoEl, onText, onError) {
    var stopped = false, stream = null, raf = 0;
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });

    function stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof jsQR === 'undefined') {
      onError && onError(new Error('Camera scanning is not available here — paste the code text instead.'));
      return stop;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(function (s) {
        // stop() was pressed while the camera was still starting: the
        // stream arrives after stop() already ran (it saw stream==null),
        // so kill the tracks here or the camera stays on forever.
        if (stopped) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = s;
        videoEl.srcObject = s;
        videoEl.setAttribute('playsinline', 'true');
        return videoEl.play();
      })
      .then(function tick() {
        if (stopped) return;
        if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
          canvas.width = videoEl.videoWidth;
          canvas.height = videoEl.videoHeight;
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          var code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) { stop(); onText(code.data); return; }
        }
        raf = requestAnimationFrame(tick);
      })
      .catch(function (err) { onError && onError(err); });
    return stop;
  }

  root.LSB_NET = {
    createLoopbackHost: createLoopbackHost,
    createPeerHost: createPeerHost,
    createPeerGuest: createPeerGuest,
    createHotspotHost: createHotspotHost,
    createHotspotGuest: createHotspotGuest,
    renderQR: renderQR,
    startScanner: startScanner
  };
})(typeof self !== 'undefined' ? self : this);
