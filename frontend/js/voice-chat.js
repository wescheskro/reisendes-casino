// ─── Shared Voice Chat (WebRTC) ───
// Wird in allen Spielen eingebunden: <script src="/js/voice-chat.js"></script>
// Braucht: window._vcSocket (Socket.IO instance), window._vcRoom (Room-Name)
// Optional: window._vcAutoMic = true (Auto-Mic bei Betreten)

(function() {
  'use strict';

  let myStream = null;
  let micOn = false;
  let camOn = false;
  let peerConnections = {};
  let localVideoEl = null;
  let _socket = null;
  let _signalingAttached = false; // Guard gegen doppelte Listener
  let _joined = false; // Ob wir schon im VC-Room sind

  // ─── Media ───
  async function ensureMedia(wantVideo) {
    if (myStream) return myStream;
    try {
      myStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantVideo !== false
      });
    } catch(e) {
      try {
        myStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch(e2) {
        console.error('[VC] Mikrofon/Kamera Fehler:', e2);
        return null;
      }
    }
    if (myStream) {
      myStream.getAudioTracks().forEach(t => { t.enabled = true; });
      myStream.getVideoTracks().forEach(t => { t.enabled = false; }); // Cam default aus
      micOn = true;
      camOn = false;
      console.log('[VC] Media erhalten: audio=' + myStream.getAudioTracks().length + ' video=' + myStream.getVideoTracks().length);
    }
    return myStream;
  }

  function stopMedia() {
    if (myStream) {
      myStream.getTracks().forEach(t => t.stop());
      myStream = null;
    }
    micOn = false;
    camOn = false;
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
    if (_socket && _joined) {
      _socket.emit('vc:leave');
      _joined = false;
    }
  }

  // ─── WebRTC ───
  function createPeerConnection(socket, peerId, isInitiator) {
    // Bei Glare: wenn bereits eine PC existiert UND wir Initiator sind,
    // die alte schliessen und neu aufbauen
    if (peerConnections[peerId]) {
      if (isInitiator) {
        // PC existiert schon - nicht nochmal initiieren
        return peerConnections[peerId];
      }
      // Non-initiator: alte PC schliessen, neu aufbauen (wir antworten auf ein Offer)
      peerConnections[peerId].close();
      delete peerConnections[peerId];
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerConnections[peerId] = pc;

    if (myStream) {
      myStream.getTracks().forEach(t => pc.addTrack(t, myStream));
    }

    pc.ontrack = function(e) {
      // Remote Audio/Video abspielen
      // Für jeden Track-Typ ein eigenes Element
      const kind = e.track.kind; // 'audio' oder 'video'
      const elId = 'vc-remote-' + kind + '-' + peerId;
      let el = document.getElementById(elId);
      if (!el) {
        el = document.createElement(kind === 'video' ? 'video' : 'audio');
        el.id = elId;
        el.autoplay = true;
        el.playsInline = true;
        if (kind === 'audio') {
          el.style.display = 'none';
        }
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

    pc.onicecandidate = function(e) {
      if (e.candidate) {
        socket.emit('vc:ice', { to: peerId, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = function() {
      console.log('[VC] PC ' + peerId + ' state: ' + pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(peerId);
      }
    };

    if (isInitiator) {
      pc.createOffer().then(function(offer) {
        return pc.setLocalDescription(offer);
      }).then(function() {
        socket.emit('vc:offer', { to: peerId, offer: pc.localDescription });
        console.log('[VC] Offer gesendet an ' + peerId);
      }).catch(function(err) {
        console.error('[VC] Offer Fehler:', err);
      });
    }

    return pc;
  }

  function cleanupPeer(peerId) {
    const pc = peerConnections[peerId];
    if (pc) {
      pc.close();
      delete peerConnections[peerId];
    }
    // Alle Remote-Elemente dieses Peers entfernen
    var audioEl = document.getElementById('vc-remote-audio-' + peerId);
    if (audioEl) audioEl.remove();
    var videoEl = document.getElementById('vc-remote-video-' + peerId);
    if (videoEl) videoEl.remove();
    // Legacy Element-ID auch bereinigen
    var legacyEl = document.getElementById('vc-remote-' + peerId);
    if (legacyEl) legacyEl.remove();
  }

  function setupPeers(socket, players, myId) {
    players.forEach(function(p) {
      if (!p || p.id === myId) return;
      createPeerConnection(socket, p.id, true);
    });
  }

  // ─── Signaling Events ───
  function attachSignaling(socket) {
    _socket = socket;

    // Bei Reconnect: alte Peer-Connections bereinigen, VC-Status zurücksetzen
    if (_joined) {
      Object.keys(peerConnections).forEach(function(pid) {
        cleanupPeer(pid);
      });
      _joined = false;
    }

    // Guard: nur einmal Listener registrieren
    if (_signalingAttached) return;
    _signalingAttached = true;

    // Liste aller bereits anwesenden Peers erhalten → Peer-Connections aufbauen
    // NUR der Joiner (der vc:join gesendet hat) bekommt vc:peers
    // → Er ist Initiator für alle bestehenden Peers
    socket.on('vc:peers', function(peers) {
      console.log('[VC] vc:peers erhalten:', peers ? peers.length : 0);
      if (myStream && peers && peers.length > 0) {
        peers.forEach(function(p) {
          createPeerConnection(socket, p.id, true);
        });
      }
    });

    // Neuer User joined → NICHT initiieren!
    // Der neue User bekommt vc:peers und wird selbst Offers senden.
    // Wir warten einfach auf sein vc:offer.
    socket.on('vc:user-joined', function(data) {
      console.log('[VC] User joined VC:', data.userId);
      // Nichts tun - wir warten auf sein Offer
    });

    socket.on('vc:offer', async function(data) {
      console.log('[VC] Offer erhalten von ' + data.from);
      // Media holen falls noch nicht vorhanden (der User hat VC noch nicht gestartet)
      if (!myStream) {
        await ensureMedia(false);
      }
      if (!myStream) {
        console.warn('[VC] Kein Media - kann Offer nicht beantworten');
        return;
      }
      // PC als Non-Initiator erstellen (ersetzt ggf. vorhandene PC)
      createPeerConnection(socket, data.from, false);
      const pc = peerConnections[data.from];
      if (pc) {
        try {
          await pc.setRemoteDescription(data.offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('vc:answer', { to: data.from, answer: answer });
          console.log('[VC] Answer gesendet an ' + data.from);
        } catch(err) {
          console.error('[VC] Offer-Handling Fehler:', err);
        }
      }
    });

    socket.on('vc:answer', async function(data) {
      console.log('[VC] Answer erhalten von ' + data.from);
      const pc = peerConnections[data.from];
      if (pc) {
        try {
          await pc.setRemoteDescription(data.answer);
        } catch(err) {
          console.error('[VC] Answer-Handling Fehler:', err);
        }
      }
    });

    socket.on('vc:ice', async function(data) {
      const pc = peerConnections[data.from];
      if (pc) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch(err) {
          // ICE candidates können vor setRemoteDescription ankommen - ignorieren
        }
      }
    });

    socket.on('vc:user-left', function(data) {
      console.log('[VC] User left VC:', data.userId);
      cleanupPeer(data.userId);
    });
  }

  // ─── Toggle Functions ───
  function toggleMic() {
    if (!myStream) return;
    micOn = !micOn;
    myStream.getAudioTracks().forEach(t => { t.enabled = micOn; });
    return micOn;
  }

  function toggleCam() {
    if (!myStream) return;
    camOn = !camOn;
    myStream.getVideoTracks().forEach(t => { t.enabled = camOn; });
    return camOn;
  }

  // ─── Auto-Mic bei erstem Klick ───
  // room = eindeutiger Raum-Name (z.B. "rl-tisch-1", "bj-tisch-1")
  async function autoStart(socket, room, myId) {
    if (_joined) return; // Schon beigetreten
    if (!socket && _socket) socket = _socket;
    if (!socket) return;
    _socket = socket;
    console.log('[VC] autoStart für Room:', room);
    const stream = await ensureMedia(false); // nur Audio
    if (!stream) {
      console.warn('[VC] Kein Media - autoStart abgebrochen');
      return;
    }
    // vc:join mit Room-Name → Server sendet vc:peers zurück
    _joined = true;
    socket.emit('vc:join', { room: room || 'default' });
  }

  // ─── Public API ───
  window._vc = {
    ensureMedia: ensureMedia,
    stopMedia: stopMedia,
    toggleMic: toggleMic,
    toggleCam: toggleCam,
    autoStart: autoStart,
    setupPeers: setupPeers,
    attachSignaling: attachSignaling,
    createPeerConnection: createPeerConnection,
    get micOn() { return micOn; },
    get camOn() { return camOn; },
    get stream() { return myStream; },
    get peers() { return peerConnections; }
  };
})();
