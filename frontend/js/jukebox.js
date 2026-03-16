// ===================== GLOBALE JUKEBOX =====================
// YouTube-basierter Musikplayer, synchronisiert über alle Spieler
(function() {
'use strict';

// ---- CONFIG ----
const DEFAULT_PLAYLIST = [
  { id: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up' },
  { id: '3GwjfUFyY6M', title: 'Sinti Swing - Dark Eyes' },
  { id: 'HMnrl0tmd3k', title: 'Django Reinhardt - Minor Swing' },
  { id: 'gcE1avXFJb4', title: 'Parov Stelar - Catgroove' },
  { id: 'FsfKsNOIalg', title: 'Parov Stelar - Booty Swing' },
  { id: 'twqM56f_cVo', title: 'Electro Swing Mix' },
];

let player = null;      // YouTube player instance
let playlist = [...DEFAULT_PLAYLIST];
let currentIdx = 0;
let isPlaying = false;
let volume = 30;
let jkSocket = null;    // Socket reference
let jkMinimized = false;
let jkDragging = false;

// ---- Gespeicherte Einstellungen laden ----
try {
  const saved = JSON.parse(localStorage.getItem('jukeboxState'));
  if (saved) {
    volume = saved.volume ?? 30;
    currentIdx = saved.idx ?? 0;
    jkMinimized = saved.minimized ?? false;
  }
} catch(e) {}

function saveState() {
  try {
    localStorage.setItem('jukeboxState', JSON.stringify({
      volume, idx: currentIdx, minimized: jkMinimized
    }));
  } catch(e) {}
}

// ---- YouTube IFrame API laden ----
function loadYTApi() {
  if (window.YT && window.YT.Player) { initPlayer(); return; }
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function() {
  initPlayer();
};

function initPlayer() {
  if (player) return;
  player = new YT.Player('jk-yt-player', {
    height: '0', width: '0',
    playerVars: {
      autoplay: 0, controls: 0, disablekb: 1,
      fs: 0, modestbranding: 1, rel: 0, showinfo: 0
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerState,
      onError: onPlayerError
    }
  });
}

function onPlayerReady() {
  player.setVolume(volume);
  updateUI();
}

function onPlayerState(e) {
  if (e.data === YT.PlayerState.ENDED) {
    // Nächster Song
    nextTrack();
  }
  isPlaying = (e.data === YT.PlayerState.PLAYING);
  updatePlayBtn();
}

function onPlayerError() {
  // Bei Fehler nächsten Song probieren
  setTimeout(nextTrack, 1000);
}

// ---- Steuerung ----
function playTrack(idx) {
  if (idx < 0 || idx >= playlist.length) idx = 0;
  currentIdx = idx;
  if (player && player.loadVideoById) {
    player.loadVideoById(playlist[idx].id);
    isPlaying = true;
  }
  updateUI();
  saveState();
  // An andere broadcasten
  if (jkSocket) {
    jkSocket.emit('jukebox:play', { videoId: playlist[idx].id, idx, title: playlist[idx].title });
  }
}

function togglePlay() {
  if (!player) return;
  if (isPlaying) {
    player.pauseVideo();
    isPlaying = false;
    if (jkSocket) jkSocket.emit('jukebox:pause');
  } else {
    if (player.getVideoData && player.getVideoData().video_id) {
      player.playVideo();
    } else {
      playTrack(currentIdx);
    }
    isPlaying = true;
    if (jkSocket) jkSocket.emit('jukebox:resume');
  }
  updatePlayBtn();
}

function nextTrack() {
  playTrack((currentIdx + 1) % playlist.length);
}

function prevTrack() {
  playTrack((currentIdx - 1 + playlist.length) % playlist.length);
}

function setVolume(v) {
  volume = Math.max(0, Math.min(100, parseInt(v)));
  if (player && player.setVolume) player.setVolume(volume);
  const volSlider = document.getElementById('jk-vol');
  if (volSlider) volSlider.value = volume;
  saveState();
}

// ---- Custom URL hinzufügen ----
function addCustomUrl() {
  const url = prompt('YouTube-URL oder Video-ID eingeben:');
  if (!url) return;
  let videoId = url;
  // URL parsen
  const match = url.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (match) videoId = match[1];
  if (videoId.length !== 11) { alert('Ungültige YouTube-URL'); return; }
  const title = prompt('Titel (optional):', 'Custom Song') || 'Custom Song';
  playlist.push({ id: videoId, title });
  playTrack(playlist.length - 1);
  // An alle broadcasten
  if (jkSocket) {
    jkSocket.emit('jukebox:add', { videoId, title });
  }
}

// ---- UI bauen ----
function buildUI() {
  // Container
  const wrap = document.createElement('div');
  wrap.id = 'jukebox';
  wrap.className = jkMinimized ? 'jk-mini' : '';
  wrap.innerHTML = `
    <div class="jk-header" id="jkHeader">
      <span class="jk-icon">🎵</span>
      <span class="jk-title" id="jkTitle">Jukebox</span>
      <button class="jk-minbtn" id="jkMinBtn" title="Minimieren">${jkMinimized ? '▲' : '▼'}</button>
    </div>
    <div class="jk-body" id="jkBody">
      <div class="jk-track" id="jkTrack">Wähle einen Song...</div>
      <div class="jk-controls">
        <button class="jk-btn" onclick="window._jk.prev()" title="Zurück">⏮</button>
        <button class="jk-btn jk-play" id="jkPlayBtn" onclick="window._jk.toggle()" title="Play/Pause">▶</button>
        <button class="jk-btn" onclick="window._jk.next()" title="Weiter">⏭</button>
        <input type="range" id="jk-vol" class="jk-vol" min="0" max="100" value="${volume}"
          oninput="window._jk.vol(this.value)" title="Lautstärke">
      </div>
      <div class="jk-playlist" id="jkPlaylist"></div>
      <button class="jk-add" onclick="window._jk.addUrl()">+ YouTube hinzufügen</button>
    </div>
    <div id="jk-yt-player"></div>
  `;
  document.body.appendChild(wrap);

  // Style injizieren
  const style = document.createElement('style');
  style.textContent = `
    #jukebox{
      position:fixed;bottom:12px;left:12px;z-index:9998;
      width:240px;border-radius:14px;overflow:hidden;
      background:rgba(15,8,3,.95);border:1.5px solid rgba(212,175,55,.25);
      box-shadow:0 8px 32px rgba(0,0,0,.6);backdrop-filter:blur(12px);
      font-family:'Playfair Display',serif;color:#F0E6D3;
      transition:width .3s,height .3s;
      touch-action:none;user-select:none;
    }
    #jukebox.jk-mini .jk-body{display:none}
    #jukebox.jk-mini{width:160px}
    #jk-yt-player{position:absolute;width:0;height:0;overflow:hidden;pointer-events:none}
    .jk-header{
      display:flex;align-items:center;gap:6px;padding:8px 10px;
      background:linear-gradient(135deg,rgba(212,175,55,.15),rgba(212,175,55,.05));
      border-bottom:1px solid rgba(212,175,55,.12);cursor:grab;
    }
    .jk-icon{font-size:16px}
    .jk-title{font-size:11px;font-weight:700;color:#D4AF37;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .jk-minbtn{
      background:none;border:none;color:#D4AF37;font-size:10px;cursor:pointer;
      width:22px;height:22px;display:flex;align-items:center;justify-content:center;
      border-radius:50%;transition:.2s;
    }
    .jk-minbtn:hover{background:rgba(212,175,55,.15)}
    .jk-body{padding:8px 10px}
    .jk-track{
      font-size:10px;color:rgba(240,230,211,.6);margin-bottom:6px;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    }
    .jk-controls{display:flex;align-items:center;gap:4px;margin-bottom:6px}
    .jk-btn{
      width:28px;height:28px;border-radius:50%;border:1.5px solid rgba(212,175,55,.3);
      background:rgba(212,175,55,.08);color:#D4AF37;font-size:11px;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      transition:.15s;
    }
    .jk-btn:active{transform:scale(.9);background:rgba(212,175,55,.2)}
    .jk-play{width:34px;height:34px;font-size:14px;background:rgba(212,175,55,.15);border-color:rgba(212,175,55,.5)}
    .jk-vol{
      flex:1;height:4px;-webkit-appearance:none;appearance:none;
      background:rgba(212,175,55,.2);border-radius:2px;outline:none;cursor:pointer;
    }
    .jk-vol::-webkit-slider-thumb{
      -webkit-appearance:none;width:14px;height:14px;border-radius:50%;
      background:#D4AF37;border:none;box-shadow:0 1px 4px rgba(0,0,0,.4);
    }
    .jk-vol::-moz-range-thumb{
      width:14px;height:14px;border-radius:50%;
      background:#D4AF37;border:none;
    }
    .jk-playlist{
      max-height:120px;overflow-y:auto;margin-bottom:4px;
      scrollbar-width:thin;scrollbar-color:rgba(212,175,55,.3) transparent;
    }
    .jk-playlist::-webkit-scrollbar{width:3px}
    .jk-playlist::-webkit-scrollbar-thumb{background:rgba(212,175,55,.3);border-radius:2px}
    .jk-song{
      font-size:9px;padding:4px 6px;border-radius:4px;cursor:pointer;
      color:rgba(240,230,211,.5);transition:.15s;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    }
    .jk-song:hover{background:rgba(212,175,55,.1);color:#D4AF37}
    .jk-song.active{color:#F4D03F;font-weight:700;background:rgba(212,175,55,.12)}
    .jk-add{
      width:100%;padding:5px;border:1.5px dashed rgba(212,175,55,.2);
      background:none;color:rgba(212,175,55,.5);font-size:9px;
      border-radius:6px;cursor:pointer;font-family:inherit;transition:.15s;
    }
    .jk-add:hover{border-color:rgba(212,175,55,.4);color:#D4AF37}
    @media(max-width:600px){
      #jukebox{width:200px;bottom:8px;left:8px}
      #jukebox.jk-mini{width:130px}
      .jk-btn{width:26px;height:26px;font-size:10px}
      .jk-play{width:30px;height:30px;font-size:12px}
    }
  `;
  document.head.appendChild(style);

  // Events
  document.getElementById('jkMinBtn').onclick = toggleMinimize;
  buildPlaylist();
  initDrag();
}

function toggleMinimize() {
  jkMinimized = !jkMinimized;
  const jk = document.getElementById('jukebox');
  jk.classList.toggle('jk-mini', jkMinimized);
  document.getElementById('jkMinBtn').textContent = jkMinimized ? '▲' : '▼';
  saveState();
}

function buildPlaylist() {
  const el = document.getElementById('jkPlaylist');
  if (!el) return;
  el.innerHTML = playlist.map((s, i) =>
    `<div class="jk-song${i === currentIdx ? ' active' : ''}" onclick="window._jk.play(${i})" title="${s.title}">${i + 1}. ${s.title}</div>`
  ).join('');
}

function updateUI() {
  const trackEl = document.getElementById('jkTrack');
  if (trackEl && playlist[currentIdx]) {
    trackEl.textContent = '♪ ' + playlist[currentIdx].title;
  }
  const titleEl = document.getElementById('jkTitle');
  if (titleEl && playlist[currentIdx]) {
    titleEl.textContent = playlist[currentIdx].title;
  }
  buildPlaylist();
  updatePlayBtn();
}

function updatePlayBtn() {
  const btn = document.getElementById('jkPlayBtn');
  if (btn) btn.textContent = isPlaying ? '⏸' : '▶';
}

// ---- Drag ----
function initDrag() {
  const header = document.getElementById('jkHeader');
  const jk = document.getElementById('jukebox');
  if (!header || !jk) return;

  let dragging = false, startX, startY, origX, origY;

  function start(e) {
    const pos = e.touches ? e.touches[0] : e;
    startX = pos.clientX; startY = pos.clientY;
    const r = jk.getBoundingClientRect();
    origX = r.left; origY = r.top;
    dragging = true; jkDragging = false;
  }
  function move(e) {
    if (!dragging) return;
    const pos = e.touches ? e.touches[0] : e;
    const dx = pos.clientX - startX, dy = pos.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) jkDragging = true;
    if (!jkDragging) return;
    e.preventDefault();
    const nx = Math.max(0, Math.min(window.innerWidth - 60, origX + dx));
    const ny = Math.max(0, Math.min(window.innerHeight - 40, origY + dy));
    jk.style.left = nx + 'px';
    jk.style.top = ny + 'px';
    jk.style.bottom = 'auto';
    jk.style.right = 'auto';
  }
  function end() { dragging = false; }

  header.addEventListener('mousedown', start);
  header.addEventListener('touchstart', start, { passive: true });
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('mouseup', end);
  window.addEventListener('touchend', end);
}

// ---- Socket Sync ----
function initSocket() {
  // Warte auf globalen Socket oder erstelle eigenen
  function tryConnect() {
    // Nutze existierenden Socket falls vorhanden
    if (window.io && !jkSocket) {
      // Prüfe ob schon ein Socket existiert (z.B. vom Pokerspiel)
      const existingSocket = document.querySelector('script')?.['_socket'];
      if (typeof socket !== 'undefined' && socket && socket.connected) {
        jkSocket = socket;
      } else {
        // Eigene Verbindung für Jukebox
        const token = localStorage.getItem('casinoToken');
        const name = localStorage.getItem('pokerPlayerName');
        jkSocket = io({ auth: { token, username: name || undefined } });
      }
      setupSocketEvents();
    }
  }

  // Warte kurz bis Socket.IO geladen ist
  if (window.io) tryConnect();
  else setTimeout(tryConnect, 2000);
}

function setupSocketEvents() {
  if (!jkSocket) return;

  jkSocket.emit('jukebox:join');

  jkSocket.on('jukebox:sync', (data) => {
    // State vom Server empfangen
    if (data.playlist && data.playlist.length > 0) {
      playlist = data.playlist;
    }
    if (data.videoId && player) {
      currentIdx = data.idx || 0;
      if (data.playing) {
        player.loadVideoById({ videoId: data.videoId, startSeconds: data.time || 0 });
        isPlaying = true;
      }
      updateUI();
    }
  });

  jkSocket.on('jukebox:play', (data) => {
    // Anderer Spieler hat Song gestartet
    if (data.videoId && player) {
      const idx = playlist.findIndex(s => s.id === data.videoId);
      if (idx >= 0) currentIdx = idx;
      else {
        playlist.push({ id: data.videoId, title: data.title || 'Unbekannt' });
        currentIdx = playlist.length - 1;
      }
      player.loadVideoById(data.videoId);
      isPlaying = true;
      updateUI();
    }
  });

  jkSocket.on('jukebox:pause', () => {
    if (player) { player.pauseVideo(); isPlaying = false; updatePlayBtn(); }
  });

  jkSocket.on('jukebox:resume', () => {
    if (player) { player.playVideo(); isPlaying = true; updatePlayBtn(); }
  });

  jkSocket.on('jukebox:add', (data) => {
    if (data.videoId) {
      const exists = playlist.some(s => s.id === data.videoId);
      if (!exists) {
        playlist.push({ id: data.videoId, title: data.title || 'Custom Song' });
        buildPlaylist();
      }
    }
  });
}

// ---- Global API ----
window._jk = {
  play: playTrack,
  toggle: togglePlay,
  next: nextTrack,
  prev: prevTrack,
  vol: setVolume,
  addUrl: addCustomUrl,
};

// ---- Init ----
function init() {
  buildUI();
  loadYTApi();
  initSocket();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
