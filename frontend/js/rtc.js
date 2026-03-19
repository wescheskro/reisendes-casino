// ═══════════════════════════════════════════════════════
// RTC.js v2 — Nutzt das bewährte rtc: Server-System
// Gleiche Events wie der funktionierende Poker-Chat
// ═══════════════════════════════════════════════════════

(function() {
  'use strict';

  var _socket = null;
  var _room = null;
  var _stream = null;
  var _pcs = {};
  var _micOn = false;
  var _camOn = false;
  var _attached = false;

  function log(msg) { console.log('[RTC] ' + msg); }

  function showStatus(msg, color) {
    var el = document.getElementById('rtc-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rtc-status';
      el.style.cssText = 'position:fixed;top:50px;left:50%;transform:translateX(-50%);z-index:99999;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:bold;color:#fff;pointer-events:none;transition:opacity 0.5s;';
      document.body.appendChild(el);
    }
    el.style.background = color || 'rgba(0,0,0,0.8)';
    el.style.opacity = '1';
    el.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(function() { el.style.opacity = '0'; }, 4000);
  }

  // ─── Media ───
  async function getMedia() {
    if (_stream) return _stream;
    try {
      _stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch(e) {
      try {
        _stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch(e2) {
        log('Mic/Cam FEHLER: ' + (e2.name || e2));
        showStatus('🎤 Mic blockiert: ' + (e2.name || 'Fehler'), '#c0392b');
        return null;
      }
    }
    if (_stream) {
      _stream.getAudioTracks().forEach(function(t) { t.enabled = true; });
      _stream.getVideoTracks().forEach(function(t) { t.enabled = false; });
      _micOn = true;
      _camOn = false;
      log('Media OK: audio=' + _stream.getAudioTracks().length);
      showStatus('🎤 Mic aktiv!', '#27ae60');
    }
    return _stream;
  }

  // ─── Peer Connection ───
  function makePC(peerId, isInitiator) {
    if (_pcs[peerId]) {
      if (isInitiator) return _pcs[peerId];
      _pcs[peerId].close();
      delete _pcs[peerId];
    }

    var pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    _pcs[peerId] = pc;

    if (_stream) {
      _stream.getTracks().forEach(function(t) { pc.addTrack(t, _stream); });
    }

    pc.ontrack = function(e) {
      var kind = e.track.kind;
      if (kind === 'audio') {
        var elId = 'rtc-audio-' + peerId;
        var el = document.getElementById(elId);
        if (!el) {
          el = document.createElement('audio');
          el.id = elId;
          el.autoplay = true;
          el.playsInline = true;
          el.style.display = 'none';
          document.body.appendChild(el);
        }
        el.srcObject = e.streams[0];
      } else if (kind === 'video') {
        window.dispatchEvent(new CustomEvent('rtc:video', { detail: { peerId: peerId, stream: e.streams[0] } }));
      }
    };

    pc.onicecandidate = function(e) {
      if (e.candidate && _socket) {
        _socket.emit('rtc:ice', { to: peerId, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = function() {
      log('PC ' + peerId.substr(0,8) + ' → ' + pc.connectionState);
      if (pc.connectionState === 'connected') {
        showStatus('✅ Sprachchat verbunden!', '#27ae60');
      }
      if (pc.connectionState === 'failed') {
        showStatus('❌ Verbindung fehlgeschlagen', '#c0392b');
        cleanup(peerId);
      }
    };

    if (isInitiator) {
      pc.createOffer().then(function(offer) {
        return pc.setLocalDescription(offer);
      }).then(function() {
        _socket.emit('rtc:offer', { to: peerId, offer: pc.localDescription });
        log('Offer → ' + peerId.substr(0,8));
        showStatus('📡 Verbinde...', '#2980b9');
      }).catch(function(e) {
        log('Offer FEHLER: ' + e);
      });
    }

    return pc;
  }

  function cleanup(peerId) {
    var pc = _pcs[peerId];
    if (pc) { pc.close(); delete _pcs[peerId]; }
    var el = document.getElementById('rtc-audio-' + peerId);
    if (el) el.remove();
    window.dispatchEvent(new CustomEvent('rtc:video:remove', { detail: { peerId: peerId } }));
  }

  // ─── Init: Signaling Events registrieren ───
  function init(socket, room) {
    _socket = socket;
    _room = room;

    if (_attached) return;
    _attached = true;

    // Server sendet Liste aller Peers im Room
    socket.on('rtc:peers', function(peers) {
      log('Peers im Room: ' + peers.length);
      if (_stream && peers.length > 0) {
        peers.forEach(function(p) {
          makePC(p.peerId, true);
        });
      } else if (peers.length === 0) {
        showStatus('🎤 Mic an — warte auf Mitspieler', '#f39c12');
      }
    });

    // Neuer Peer joined — ER sendet uns ein Offer (wir warten)
    socket.on('rtc:peerJoined', function(data) {
      log('Peer joined: ' + data.username);
      // Nichts tun — der neue Peer bekommt rtc:peers und sendet Offers
    });

    // Peer hat verlassen
    socket.on('rtc:peerLeft', function(data) {
      log('Peer left: ' + data.peerId);
      cleanup(data.peerId);
    });

    // Offer empfangen — Media holen und antworten
    socket.on('rtc:offer', async function(data) {
      log('Offer ← ' + (data.username || data.from.substr(0,8)));
      if (!_stream) {
        _micOn = true;
        await getMedia();
      }
      if (!_stream) {
        log('Kein Media — kann nicht antworten');
        return;
      }
      var pc = makePC(data.from, false);
      try {
        await pc.setRemoteDescription(data.offer);
        var answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        _socket.emit('rtc:answer', { to: data.from, answer: answer });
        log('Answer → ' + data.from.substr(0,8));
      } catch(e) {
        log('Offer-Handling FEHLER: ' + e);
      }
    });

    // Answer empfangen
    socket.on('rtc:answer', async function(data) {
      var pc = _pcs[data.from];
      if (pc) {
        try { await pc.setRemoteDescription(data.answer); }
        catch(e) { log('Answer FEHLER: ' + e); }
      }
    });

    // ICE Candidate
    socket.on('rtc:ice', async function(data) {
      var pc = _pcs[data.from];
      if (pc) {
        try { await pc.addIceCandidate(data.candidate); }
        catch(e) { /* kann vor SDP kommen */ }
      }
    });
  }

  // ─── Voice Chat starten ───
  async function start(socket, room) {
    if (!socket) socket = _socket;
    if (!room) room = _room;
    if (!socket || !room) return;
    _socket = socket;
    _room = room;

    var stream = await getMedia();
    if (!stream) return;

    // Dem RTC-Room beitreten → Server sendet rtc:peers zurück
    log('Joining room: ' + room);
    socket.emit('rtc:join', { room: room });
  }

  // ─── Stoppen ───
  function stopAll() {
    if (_stream) { _stream.getTracks().forEach(function(t) { t.stop(); }); _stream = null; }
    _micOn = false; _camOn = false;
    Object.keys(_pcs).forEach(cleanup);
    if (_socket) _socket.emit('rtc:leave');
  }

  // ─── Toggles ───
  function toggleMic() {
    if (!_stream) return false;
    _micOn = !_micOn;
    _stream.getAudioTracks().forEach(function(t) { t.enabled = _micOn; });
    return _micOn;
  }

  async function toggleCam() {
    if (!_stream) return false;
    _camOn = !_camOn;

    // Kein Video-Track vorhanden? Kamera jetzt anfordern!
    if (_camOn && _stream.getVideoTracks().length === 0) {
      try {
        log('Kein Video-Track — fordere Kamera an...');
        var vidStream = await navigator.mediaDevices.getUserMedia({ video: true });
        var track = vidStream.getVideoTracks()[0];
        if (track) {
          _stream.addTrack(track);
          // Track zu allen bestehenden Peer-Connections hinzufügen
          Object.keys(_pcs).forEach(function(peerId) {
            var pc = _pcs[peerId];
            if (pc && pc.connectionState !== 'closed') {
              try { pc.addTrack(track, _stream); } catch(e) { log('addTrack error: ' + e); }
            }
          });
          log('Video-Track hinzugefügt!');
          showStatus('📷 Kamera aktiv!', '#27ae60');
        }
      } catch(e) {
        log('Kamera FEHLER: ' + (e.name || e));
        showStatus('📷 Kamera blockiert: ' + (e.name || 'Fehler'), '#c0392b');
        _camOn = false;
        return false;
      }
    }

    _stream.getVideoTracks().forEach(function(t) { t.enabled = _camOn; });
    return _camOn;
  }

  // ─── Public API ───
  window.RTC = {
    init: init,
    start: start,
    stopAll: stopAll,
    toggleMic: toggleMic,
    toggleCam: toggleCam,
    get stream() { return _stream; },
    get micOn() { return _micOn; },
    get camOn() { return _camOn; }
  };

  // ─── EIGENES VIDEO DRAG & DROP ───
  document.addEventListener('DOMContentLoaded', function() {
    var mv = document.getElementById('myVideo');
    if (!mv) return;
    
    // Füge Minimize-Button und Header-Leiste hinzu
    var header = document.createElement('div');
    header.style.cssText = 'position:absolute;top:0;left:0;right:0;height:22px;background:linear-gradient(180deg,rgba(0,0,0,0.5),transparent);cursor:move;z-index:10;display:flex;justify-content:flex-end;align-items:center;padding:0 4px;border-radius:8px 8px 0 0;';
    var closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'color:rgba(255,255,255,0.7);font-size:11px;cursor:pointer;padding:2px 5px;border-radius:50%;transition:all 0.15s;line-height:1;';
    closeBtn.onmouseenter = function(){ closeBtn.style.background='rgba(231,76,60,0.7)'; closeBtn.style.color='#fff'; };
    closeBtn.onmouseleave = function(){ closeBtn.style.background='transparent'; closeBtn.style.color='rgba(255,255,255,0.7)'; };
    closeBtn.onclick = function(e) {
      e.stopPropagation();
      mv.style.display = 'none';
      if (window.RTC.camOn) window.RTC.toggleCam();
    };
    header.appendChild(closeBtn);
    mv.appendChild(header);

    // Klick-Logik zum Wieder-Einblenden falls versteckt: erfolgt typischerweise über den Kamera-Knopf im Spiel.
    // Die Drag-Logik:
    var isDragging = false;
    var startX, startY, initX, initY;

    header.addEventListener('mousedown', dragStart);
    header.addEventListener('touchstart', dragStart, {passive: false});

    function dragStart(e) {
      if (e.target === closeBtn) return;
      if (e.type === 'mousedown') e.preventDefault();
      isDragging = true;
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      var rect = mv.getBoundingClientRect();
      startX = clientX;
      startY = clientY;
      initX = rect.left;
      initY = rect.top;
      // Constraints lösen
      mv.style.right = 'auto';
      mv.style.bottom = 'auto';
      mv.style.left = initX + 'px';
      mv.style.top = initY + 'px';
      e.preventDefault();
    }

    window.addEventListener('mousemove', dragMove);
    window.addEventListener('touchmove', dragMove, {passive: false});
    window.addEventListener('mouseup', dragEnd);
    window.addEventListener('touchend', dragEnd);

    function dragMove(e) {
      if (!isDragging) return;
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      var dx = clientX - startX;
      var dy = clientY - startY;
      mv.style.left = (initX + dx) + 'px';
      mv.style.top = (initY + dy) + 'px';
      e.preventDefault();
    }

    function dragEnd() {
      isDragging = false;
    }
  });

})();
