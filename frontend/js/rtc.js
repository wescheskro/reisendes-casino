// ═══════════════════════════════════════════════════════
// RTC.js — Sauberes Voice/Video Chat für alle Spiele
// Exakt gleiche Technik wie die funktionierende Bar
// ═══════════════════════════════════════════════════════
//
// Benutzung in jedem Spiel:
//   <script src="/js/rtc.js"></script>
//   RTC.init(socket, 'rl');           // prefix = 'rl', 'bj', 'pk'
//   RTC.startMedia();                  // Mic starten (braucht User-Geste)
//   RTC.connectTo(peerId);             // PC zu einem Peer aufbauen
//   RTC.connectToAll(players, myId);   // PCs zu allen Peers aufbauen
//   RTC.disconnect(peerId);            // PC schließen
//   RTC.toggleMic() / RTC.toggleCam()

(function() {
  'use strict';

  var _socket = null;
  var _prefix = '';
  var _stream = null;
  var _pcs = {};
  var _micOn = false;
  var _camOn = false;
  var _inited = false;

  // Sichtbarer Status-Toast für Debugging
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
    clearTimeout(el._timer);
    el._timer = setTimeout(function() { el.style.opacity = '0'; }, 4000);
  }

  // ─── Init: Socket + Event-Prefix setzen ───
  function init(socket, prefix) {
    _socket = socket;
    _prefix = prefix || 'rtc';

    if (_inited) return; // Listener nur einmal registrieren
    _inited = true;

    // Signaling Events empfangen
    socket.on(_prefix + ':offer', async function(data) {
      console.log('[RTC] Offer von', data.from);
      // Media holen falls noch nicht da
      if (!_stream) {
        _micOn = true;
        await getMedia();
      }
      if (!_stream) {
        console.warn('[RTC] Kein Media — kann Offer nicht beantworten');
        return;
      }
      // PC erstellen und antworten
      var pc = makePC(data.from, false);
      try {
        await pc.setRemoteDescription(data.offer);
        var answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit(_prefix + ':answer', { to: data.from, answer: answer });
        console.log('[RTC] Answer gesendet an', data.from);
        showStatus('✅ Sprachchat verbunden!', '#27ae60');
      } catch(e) {
        console.error('[RTC] Offer-Handling Fehler:', e);
      }
    });

    socket.on(_prefix + ':answer', async function(data) {
      var pc = _pcs[data.from];
      if (pc) {
        try { await pc.setRemoteDescription(data.answer); }
        catch(e) { console.error('[RTC] Answer Fehler:', e); }
      }
    });

    socket.on(_prefix + ':ice', async function(data) {
      var pc = _pcs[data.from];
      if (pc) {
        try { await pc.addIceCandidate(data.candidate); }
        catch(e) { /* ICE kann vor SDP kommen — ignorieren */ }
      }
    });
  }

  // ─── Media holen ───
  async function getMedia() {
    if (_stream) return _stream;
    try {
      _stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch(e) {
      try {
        _stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch(e2) {
        console.error('[RTC] Mic/Cam Fehler:', e2);
        showStatus('🎤 Mic blockiert: ' + (e2.name || e2), '#c0392b');
        return null;
      }
    }
    if (_stream) {
      _stream.getAudioTracks().forEach(function(t) { t.enabled = _micOn; });
      _stream.getVideoTracks().forEach(function(t) { t.enabled = _camOn; });
      console.log('[RTC] Media OK: audio=' + _stream.getAudioTracks().length + ' video=' + _stream.getVideoTracks().length);
      showStatus('🎤 Mic aktiv!', '#27ae60');
    }
    return _stream;
  }

  // ─── Media starten (public) ───
  async function startMedia() {
    _micOn = true;
    return await getMedia();
  }

  // ─── Peer Connection erstellen ───
  function makePC(peerId, isInitiator) {
    // Bereits vorhanden?
    if (_pcs[peerId]) {
      if (isInitiator) return _pcs[peerId]; // Nicht nochmal initiieren
      // Als Responder: alte schließen, neue erstellen
      _pcs[peerId].close();
      delete _pcs[peerId];
    }

    var pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    _pcs[peerId] = pc;

    // Tracks hinzufügen
    if (_stream) {
      _stream.getTracks().forEach(function(t) { pc.addTrack(t, _stream); });
    }

    // Remote Audio/Video empfangen
    pc.ontrack = function(e) {
      var kind = e.track.kind;
      var elId = 'rtc-' + kind + '-' + peerId;
      var el = document.getElementById(elId);
      if (!el) {
        el = document.createElement(kind === 'video' ? 'video' : 'audio');
        el.id = elId;
        el.autoplay = true;
        el.playsInline = true;
        if (kind === 'audio') el.style.display = 'none';
        if (kind === 'video') {
          el.style.cssText = 'position:fixed;bottom:80px;right:10px;width:120px;height:90px;border-radius:10px;border:2px solid #d4af37;z-index:95;object-fit:cover;background:#000;cursor:pointer;';
          el.onclick = function() {
            if (el.style.width === '120px') {
              el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:80vw;height:60vh;border-radius:12px;border:3px solid #d4af37;z-index:9999;object-fit:contain;background:#000;cursor:pointer;';
            } else {
              el.style.cssText = 'position:fixed;bottom:80px;right:10px;width:120px;height:90px;border-radius:10px;border:2px solid #d4af37;z-index:95;object-fit:cover;background:#000;cursor:pointer;';
            }
          };
        }
        document.body.appendChild(el);
      }
      el.srcObject = e.streams[0];
    };

    // ICE Candidates senden
    pc.onicecandidate = function(e) {
      if (e.candidate && _socket) {
        _socket.emit(_prefix + ':ice', { to: peerId, candidate: e.candidate });
      }
    };

    // Verbindungsstatus
    pc.onconnectionstatechange = function() {
      if (pc.connectionState === 'connected') {
        showStatus('✅ Sprachchat aktiv!', '#27ae60');
      }
      if (pc.connectionState === 'failed') {
        showStatus('❌ Verbindung fehlgeschlagen', '#c0392b');
        cleanup(peerId);
      }
      if (pc.connectionState === 'closed') {
        cleanup(peerId);
      }
    };

    // Offer senden wenn Initiator
    if (isInitiator) {
      pc.createOffer().then(function(offer) {
        return pc.setLocalDescription(offer);
      }).then(function() {
        _socket.emit(_prefix + ':offer', { to: peerId, offer: pc.localDescription });
        console.log('[RTC] Offer gesendet an', peerId);
        showStatus('📡 Verbinde mit Spieler...', '#2980b9');
      }).catch(function(e) {
        console.error('[RTC] Offer Fehler:', e);
      });
    }

    return pc;
  }

  // ─── Zu einem Peer verbinden ───
  function connectTo(peerId) {
    if (!_stream || !peerId || peerId === (_socket && _socket.id)) return;
    makePC(peerId, true);
  }

  // ─── Zu allen Peers verbinden ───
  function connectToAll(players, myId) {
    if (!_stream || !players) return;
    var count = 0;
    players.forEach(function(p) {
      if (!p) return;
      var pid = p.socketId || p.id;
      if (!pid || pid === myId || p.isBot || p.isYou) return;
      makePC(pid, true);
      count++;
    });
    if (count === 0) showStatus('🎤 Mic an — warte auf Mitspieler', '#f39c12');
  }

  // ─── Peer aufräumen ───
  function cleanup(peerId) {
    var pc = _pcs[peerId];
    if (pc) { pc.close(); delete _pcs[peerId]; }
    ['audio', 'video'].forEach(function(kind) {
      var el = document.getElementById('rtc-' + kind + '-' + peerId);
      if (el) el.remove();
    });
  }

  // ─── Alles stoppen ───
  function stopAll() {
    if (_stream) { _stream.getTracks().forEach(function(t) { t.stop(); }); _stream = null; }
    _micOn = false; _camOn = false;
    Object.keys(_pcs).forEach(cleanup);
  }

  // ─── Toggles ───
  function toggleMic() {
    if (!_stream) return false;
    _micOn = !_micOn;
    _stream.getAudioTracks().forEach(function(t) { t.enabled = _micOn; });
    return _micOn;
  }

  function toggleCam() {
    if (!_stream) return false;
    _camOn = !_camOn;
    _stream.getVideoTracks().forEach(function(t) { t.enabled = _camOn; });
    return _camOn;
  }

  // ─── Public API ───
  window.RTC = {
    init: init,
    startMedia: startMedia,
    connectTo: connectTo,
    connectToAll: connectToAll,
    disconnect: cleanup,
    stopAll: stopAll,
    toggleMic: toggleMic,
    toggleCam: toggleCam,
    get stream() { return _stream; },
    get micOn() { return _micOn; },
    get camOn() { return _camOn; },
    get pcs() { return _pcs; }
  };
})();
