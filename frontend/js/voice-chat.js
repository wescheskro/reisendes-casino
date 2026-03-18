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
  let _socket = null; // gespeicherter Socket für vc:user-joined

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
        console.error('Mikrofon/Kamera Fehler:', e2);
        return null;
      }
    }
    if (myStream) {
      myStream.getAudioTracks().forEach(t => { t.enabled = true; });
      myStream.getVideoTracks().forEach(t => { t.enabled = false; }); // Cam default aus
      micOn = true;
      camOn = false;
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
  }

  // ─── WebRTC ───
  function createPeerConnection(socket, peerId, isInitiator) {
    if (peerConnections[peerId]) return peerConnections[peerId];
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerConnections[peerId] = pc;

    if (myStream) {
      myStream.getTracks().forEach(t => pc.addTrack(t, myStream));
    }

    pc.ontrack = function(e) {
      // Remote Audio/Video abspielen
      let el = document.getElementById('vc-remote-' + peerId);
      if (!el) {
        el = document.createElement(e.track.kind === 'video' ? 'video' : 'audio');
        el.id = 'vc-remote-' + peerId;
        el.autoplay = true;
        el.playsInline = true;
        if (e.track.kind === 'audio') el.style.display = 'none';
        if (e.track.kind === 'video') {
          el.style.cssText = 'position:fixed;bottom:80px;right:10px;width:120px;height:90px;border-radius:10px;border:2px solid #d4af37;z-index:95;object-fit:cover;background:#000;cursor:pointer;';
          el.onclick = function() {
            // Toggle groß/klein
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

    if (isInitiator) {
      pc.createOffer().then(function(offer) {
        pc.setLocalDescription(offer);
        socket.emit('vc:offer', { to: peerId, offer: offer });
      });
    }

    return pc;
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

    // Neuer User joined → Peer-Connection aufbauen
    socket.on('vc:user-joined', function(data) {
      if (myStream && data.userId) {
        createPeerConnection(socket, data.userId, true);
      }
    });

    socket.on('vc:offer', async function(data) {
      createPeerConnection(socket, data.from, false);
      const pc = peerConnections[data.from];
      if (pc) {
        await pc.setRemoteDescription(data.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('vc:answer', { to: data.from, answer: answer });
      }
    });

    socket.on('vc:answer', async function(data) {
      const pc = peerConnections[data.from];
      if (pc) await pc.setRemoteDescription(data.answer);
    });

    socket.on('vc:ice', async function(data) {
      const pc = peerConnections[data.from];
      if (pc) await pc.addIceCandidate(data.candidate);
    });

    socket.on('vc:user-left', function(data) {
      const pc = peerConnections[data.userId];
      if (pc) {
        pc.close();
        delete peerConnections[data.userId];
      }
      const el = document.getElementById('vc-remote-' + data.userId);
      if (el) el.remove();
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
  async function autoStart(socket, players, myId) {
    if (!socket && _socket) socket = _socket;
    if (!socket) return;
    _socket = socket;
    const stream = await ensureMedia(false); // nur Audio
    if (!stream) return;
    socket.emit('vc:join', {});
    // Verbinde mit allen bereits anwesenden Spielern
    if (players && players.length > 0) {
      setupPeers(socket, players, myId);
    }
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
