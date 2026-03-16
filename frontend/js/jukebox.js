// ===================== GLOBALE JUKEBOX =====================
// YouTube-basierter Musikplayer mit Suche, Playlist-Management & Persistenz
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

const STORAGE_KEY = 'jukeboxState';
const PLAYLIST_KEY = 'jukeboxPlaylist';
const YT_API_KEY = ''; // Optional: YouTube Data API Key für bessere Suche

let player = null;
let playlist = [];
let currentIdx = 0;
let isPlaying = false;
let volume = 30;
let jkSocket = null;
let jkMinimized = false;
let jkDragging = false;
let searchOpen = false;
let searchTimeout = null;
let dragItem = null;
let dragOverItem = null;

// ---- Gespeicherte Playlist & Einstellungen laden ----
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved) {
    volume = saved.volume ?? 30;
    currentIdx = saved.idx ?? 0;
    jkMinimized = saved.minimized ?? false;
  }
} catch(e) {}

try {
  const savedPL = JSON.parse(localStorage.getItem(PLAYLIST_KEY));
  if (savedPL && Array.isArray(savedPL) && savedPL.length > 0) {
    playlist = savedPL;
  } else {
    playlist = [...DEFAULT_PLAYLIST];
  }
} catch(e) {
  playlist = [...DEFAULT_PLAYLIST];
}

// Sicherstellen dass idx nicht out of bounds
if (currentIdx >= playlist.length) currentIdx = 0;

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      volume, idx: currentIdx, minimized: jkMinimized
    }));
  } catch(e) {}
}

function savePlaylist() {
  try {
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist));
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
  if (e.data === YT.PlayerState.ENDED) nextTrack();
  isPlaying = (e.data === YT.PlayerState.PLAYING);
  updatePlayBtn();
}

function onPlayerError() {
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

// ---- Song löschen ----
function removeSong(idx) {
  if (playlist.length <= 1) return; // Mindestens 1 Song
  const wasPlaying = idx === currentIdx;
  playlist.splice(idx, 1);
  if (currentIdx >= playlist.length) currentIdx = 0;
  else if (idx < currentIdx) currentIdx--;
  savePlaylist();
  if (wasPlaying && isPlaying) playTrack(currentIdx);
  else updateUI();
}

// ---- Reihenfolge ändern (Drag & Drop) ----
function moveTrack(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const item = playlist.splice(fromIdx, 1)[0];
  playlist.splice(toIdx, 0, item);
  // currentIdx anpassen
  if (currentIdx === fromIdx) currentIdx = toIdx;
  else if (fromIdx < currentIdx && toIdx >= currentIdx) currentIdx--;
  else if (fromIdx > currentIdx && toIdx <= currentIdx) currentIdx++;
  savePlaylist();
  buildPlaylist();
}

// ---- Song nach oben/unten ----
function moveUp(idx) {
  if (idx <= 0) return;
  moveTrack(idx, idx - 1);
}

function moveDown(idx) {
  if (idx >= playlist.length - 1) return;
  moveTrack(idx, idx + 1);
}

// ---- Custom URL hinzufügen ----
function addCustomUrl() {
  const url = prompt('YouTube-URL oder Video-ID eingeben:');
  if (!url) return;
  let videoId = url.trim();
  const match = url.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (match) videoId = match[1];
  if (videoId.length !== 11) { alert('Ungültige YouTube-URL'); return; }
  const title = prompt('Titel (optional):', 'Mein Song') || 'Mein Song';
  addToPlaylist(videoId, title, true);
}

function addToPlaylist(videoId, title, autoPlay) {
  // Duplikat-Check
  if (playlist.some(s => s.id === videoId)) {
    const idx = playlist.findIndex(s => s.id === videoId);
    if (autoPlay) playTrack(idx);
    return;
  }
  playlist.push({ id: videoId, title });
  savePlaylist();
  if (autoPlay) playTrack(playlist.length - 1);
  else buildPlaylist();
  if (jkSocket) jkSocket.emit('jukebox:add', { videoId, title });
}

// ---- YouTube Suche ----
async function searchYouTube(query) {
  if (!query || query.length < 2) {
    renderSearchResults([]);
    return;
  }
  try {
    const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(8000)
    });
    const results = await res.json();
    if (Array.isArray(results)) {
      renderSearchResults(results);
      return;
    }
  } catch(e) {}
  renderSearchResults([]);
}

function renderSearchResults(results) {
  const el = document.getElementById('jkSearchResults');
  if (!el) return;

  if (results.length === 0) {
    const q = document.getElementById('jkSearchInput')?.value || '';
    el.innerHTML = q.length >= 2
      ? '<div class="jk-sr-empty">Keine Ergebnisse</div>'
      : '';
    return;
  }

  el.innerHTML = results.map(r => {
    const inPlaylist = playlist.some(s => s.id === r.id);
    return `
      <div class="jk-sr-item" onclick="window._jk.addFromSearch('${r.id}', '${esc(r.title)}')">
        <div class="jk-sr-info">
          <div class="jk-sr-title">${esc(r.title)}</div>
          <div class="jk-sr-channel">${esc(r.channel || '')}</div>
        </div>
        <div class="jk-sr-action">${inPlaylist ? '✓' : '+'}</div>
      </div>
    `;
  }).join('');
}

function esc(s) {
  return String(s || '').replace(/'/g, "\\'").replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function addFromSearch(videoId, title) {
  // Decode escaped characters
  title = title.replace(/\\'/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  addToPlaylist(videoId, title, true);
  // Suche schließen
  toggleSearch(false);
}

function toggleSearch(force) {
  searchOpen = force !== undefined ? force : !searchOpen;
  const panel = document.getElementById('jkSearchPanel');
  if (panel) panel.style.display = searchOpen ? 'block' : 'none';
  if (searchOpen) {
    setTimeout(() => document.getElementById('jkSearchInput')?.focus(), 100);
  }
}

function onSearchInput(val) {
  clearTimeout(searchTimeout);
  if (val.length < 2) { renderSearchResults([]); return; }
  searchTimeout = setTimeout(() => searchYouTube(val), 400);
}

// ---- Playlist Reset ----
function resetPlaylist() {
  if (!confirm('Playlist auf Standard zurücksetzen?')) return;
  playlist = [...DEFAULT_PLAYLIST];
  currentIdx = 0;
  savePlaylist();
  saveState();
  if (isPlaying) playTrack(0);
  else updateUI();
}

// ---- UI bauen ----
function buildUI() {
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
      <div class="jk-bottom-btns">
        <button class="jk-search-btn" onclick="window._jk.toggleSearch()">🔍 YouTube Suche</button>
        <button class="jk-add" onclick="window._jk.addUrl()">+ URL</button>
        <button class="jk-reset-btn" onclick="window._jk.reset()" title="Playlist zurücksetzen">↺</button>
      </div>
      <!-- YouTube Search Panel -->
      <div class="jk-search-panel" id="jkSearchPanel" style="display:none">
        <input type="text" class="jk-search-input" id="jkSearchInput"
          placeholder="Song suchen..." oninput="window._jk.onSearch(this.value)">
        <div class="jk-search-results" id="jkSearchResults"></div>
      </div>
    </div>
    <div id="jk-yt-player"></div>
  `;
  document.body.appendChild(wrap);

  // Style
  const style = document.createElement('style');
  style.textContent = `
    #jukebox{
      position:fixed;bottom:12px;left:12px;z-index:9998;
      width:280px;border-radius:18px;overflow:hidden;
      background:rgba(15,8,3,.97);
      border:2px solid rgba(212,175,55,.35);
      box-shadow:0 0 20px rgba(160,120,255,.15),0 8px 32px rgba(0,0,0,.7),inset 0 1px 0 rgba(212,175,55,.1);
      font-family:'Playfair Display',serif;color:#F0E6D3;
      transition:width .3s,height .3s;
      touch-action:none;user-select:none;
    }
    #jukebox::before{
      content:'';position:absolute;top:0;left:0;right:0;bottom:0;
      background:url('/img/jukebox-bg.jpg') center/cover no-repeat;
      opacity:.12;pointer-events:none;z-index:0;
      border-radius:18px;
    }
    #jukebox>*{position:relative;z-index:1}
    #jukebox.jk-mini .jk-body{display:none}
    #jukebox.jk-mini{width:160px}
    #jk-yt-player{position:absolute;width:0;height:0;overflow:hidden;pointer-events:none}
    .jk-header{
      display:flex;align-items:center;gap:6px;padding:10px 12px;
      background:linear-gradient(180deg,rgba(160,120,255,.12),rgba(212,175,55,.08));
      border-bottom:1px solid rgba(212,175,55,.2);cursor:grab;
      border-radius:18px 18px 0 0;
    }
    .jk-icon{font-size:18px;text-shadow:0 0 8px rgba(160,120,255,.5)}
    .jk-title{font-size:11px;font-weight:700;color:#D4AF37;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 0 6px rgba(212,175,55,.3)}
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
    .jk-play{
      width:36px;height:36px;font-size:14px;
      background:linear-gradient(135deg,rgba(160,120,255,.2),rgba(212,175,55,.15));
      border-color:rgba(160,120,255,.5);
      box-shadow:0 0 8px rgba(160,120,255,.25);
    }
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

    /* ---- Playlist ---- */
    .jk-playlist{
      max-height:150px;overflow-y:auto;margin-bottom:6px;
      scrollbar-width:thin;scrollbar-color:rgba(212,175,55,.3) transparent;
    }
    .jk-playlist::-webkit-scrollbar{width:3px}
    .jk-playlist::-webkit-scrollbar-thumb{background:rgba(212,175,55,.3);border-radius:2px}

    .jk-song{
      display:flex;align-items:center;gap:4px;
      font-size:9px;padding:3px 4px;border-radius:4px;
      color:rgba(240,230,211,.5);transition:.15s;
      cursor:pointer;
    }
    .jk-song:hover{background:rgba(212,175,55,.1);color:#D4AF37}
    .jk-song.active{color:#F4D03F;font-weight:700;background:rgba(212,175,55,.12)}
    .jk-song.drag-over{border-top:2px solid #D4AF37}

    .jk-song-title{
      flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    }
    .jk-song-actions{
      display:flex;gap:1px;opacity:0;transition:opacity .15s;flex-shrink:0;
    }
    .jk-song:hover .jk-song-actions{opacity:1}
    .jk-sa{
      width:16px;height:16px;border-radius:3px;border:none;
      background:none;color:rgba(212,175,55,.4);font-size:8px;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      transition:.15s;padding:0;
    }
    .jk-sa:hover{color:#D4AF37;background:rgba(212,175,55,.15)}
    .jk-sa-del:hover{color:#f44;background:rgba(255,68,68,.15)}
    .jk-song-grip{
      cursor:grab;color:rgba(212,175,55,.25);font-size:10px;flex-shrink:0;
      padding:0 2px;
    }
    .jk-song-grip:active{cursor:grabbing}
    .jk-song.dragging{opacity:0.4}

    /* ---- Bottom Buttons ---- */
    .jk-bottom-btns{
      display:flex;gap:4px;margin-bottom:4px;
    }
    .jk-search-btn{
      flex:1;padding:6px;border:1.5px solid rgba(160,120,255,.2);
      background:linear-gradient(135deg,rgba(160,120,255,.08),rgba(212,175,55,.05));
      color:rgba(212,175,55,.7);font-size:9px;
      border-radius:8px;cursor:pointer;font-family:inherit;transition:.2s;
    }
    .jk-search-btn:hover{border-color:rgba(160,120,255,.4);color:#D4AF37;background:linear-gradient(135deg,rgba(160,120,255,.15),rgba(212,175,55,.1));box-shadow:0 0 6px rgba(160,120,255,.15)}
    .jk-add{
      padding:5px 8px;border:1.5px dashed rgba(212,175,55,.2);
      background:none;color:rgba(212,175,55,.5);font-size:9px;
      border-radius:6px;cursor:pointer;font-family:inherit;transition:.15s;
    }
    .jk-add:hover{border-color:rgba(212,175,55,.4);color:#D4AF37}
    .jk-reset-btn{
      width:28px;padding:5px;border:1.5px solid rgba(212,175,55,.15);
      background:none;color:rgba(212,175,55,.35);font-size:10px;
      border-radius:6px;cursor:pointer;font-family:inherit;transition:.15s;
    }
    .jk-reset-btn:hover{border-color:rgba(212,175,55,.3);color:#D4AF37}

    /* ---- Search Panel ---- */
    .jk-search-panel{
      margin-top:6px;border-top:1px solid rgba(212,175,55,.1);
      padding-top:6px;
    }
    .jk-search-input{
      width:100%;padding:7px 10px;border-radius:8px;
      background:rgba(255,255,255,.06);border:1px solid rgba(212,175,55,.2);
      color:#F0E6D3;font-size:11px;outline:none;box-sizing:border-box;
      font-family:inherit;
    }
    .jk-search-input::placeholder{color:rgba(212,175,55,.35)}
    .jk-search-input:focus{border-color:rgba(212,175,55,.5)}
    .jk-search-results{
      max-height:180px;overflow-y:auto;margin-top:4px;
      scrollbar-width:thin;scrollbar-color:rgba(212,175,55,.3) transparent;
    }
    .jk-search-results::-webkit-scrollbar{width:3px}
    .jk-search-results::-webkit-scrollbar-thumb{background:rgba(212,175,55,.3);border-radius:2px}
    .jk-sr-item{
      display:flex;align-items:center;gap:6px;
      padding:5px 6px;border-radius:5px;cursor:pointer;
      transition:.15s;
    }
    .jk-sr-item:hover{background:rgba(212,175,55,.1)}
    .jk-sr-info{flex:1;min-width:0}
    .jk-sr-title{
      font-size:10px;color:#e0d6c2;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    }
    .jk-sr-channel{font-size:8px;color:rgba(212,175,55,.4);margin-top:1px}
    .jk-sr-action{
      width:22px;height:22px;border-radius:50%;
      background:rgba(212,175,55,.15);color:#D4AF37;
      font-size:12px;font-weight:700;flex-shrink:0;
      display:flex;align-items:center;justify-content:center;
    }
    .jk-sr-empty{
      text-align:center;padding:16px 8px;color:rgba(212,175,55,.3);font-size:10px;
    }

    @media(max-width:600px){
      #jukebox{width:220px;bottom:8px;left:8px}
      #jukebox.jk-mini{width:130px}
      .jk-btn{width:26px;height:26px;font-size:10px}
      .jk-play{width:30px;height:30px;font-size:12px}
      .jk-playlist{max-height:100px}
      .jk-search-results{max-height:130px}
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
  el.innerHTML = playlist.map((s, i) => `
    <div class="jk-song${i === currentIdx ? ' active' : ''}"
         data-idx="${i}" draggable="true"
         ondragstart="window._jk.dragStart(event,${i})"
         ondragover="window._jk.dragOver(event,${i})"
         ondragleave="window._jk.dragLeave(event)"
         ondrop="window._jk.drop(event,${i})"
         ondragend="window._jk.dragEnd(event)">
      <span class="jk-song-grip">⠿</span>
      <span class="jk-song-title" onclick="window._jk.play(${i})">${i + 1}. ${escHtml(s.title)}</span>
      <span class="jk-song-actions">
        <button class="jk-sa" onclick="event.stopPropagation();window._jk.moveUp(${i})" title="Nach oben">▲</button>
        <button class="jk-sa" onclick="event.stopPropagation();window._jk.moveDown(${i})" title="Nach unten">▼</button>
        <button class="jk-sa jk-sa-del" onclick="event.stopPropagation();window._jk.remove(${i})" title="Löschen">✕</button>
      </span>
    </div>
  `).join('');

  // Touch drag support
  el.querySelectorAll('.jk-song').forEach(song => {
    let touchStartY = 0;
    let touchIdx = parseInt(song.dataset.idx);
    song.addEventListener('touchstart', (e) => {
      if (!e.target.closest('.jk-song-grip')) return;
      touchStartY = e.touches[0].clientY;
      dragItem = touchIdx;
      song.classList.add('dragging');
    }, { passive: true });
    song.addEventListener('touchmove', (e) => {
      if (dragItem === null) return;
      const touchY = e.touches[0].clientY;
      const songs = el.querySelectorAll('.jk-song');
      songs.forEach(s => {
        const r = s.getBoundingClientRect();
        if (touchY > r.top && touchY < r.bottom) {
          dragOverItem = parseInt(s.dataset.idx);
          s.classList.add('drag-over');
        } else {
          s.classList.remove('drag-over');
        }
      });
    }, { passive: true });
    song.addEventListener('touchend', () => {
      if (dragItem !== null && dragOverItem !== null && dragItem !== dragOverItem) {
        moveTrack(dragItem, dragOverItem);
      }
      el.querySelectorAll('.jk-song').forEach(s => s.classList.remove('dragging', 'drag-over'));
      dragItem = null;
      dragOverItem = null;
    });
  });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---- Drag & Drop (Desktop) ----
function onDragStart(e, idx) {
  dragItem = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.target.classList.add('dragging');
}
function onDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  dragOverItem = idx;
  // Visual feedback
  const songs = document.querySelectorAll('.jk-song');
  songs.forEach(s => s.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}
function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}
function onDrop(e, idx) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (dragItem !== null && dragItem !== idx) {
    moveTrack(dragItem, idx);
  }
  dragItem = null;
  dragOverItem = null;
}
function onDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.jk-song').forEach(s => s.classList.remove('drag-over'));
  dragItem = null;
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

// ---- Drag (Jukebox Widget verschieben) ----
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
  function tryConnect() {
    if (window.io && !jkSocket) {
      if (typeof socket !== 'undefined' && socket && socket.connected) {
        jkSocket = socket;
      } else {
        const token = localStorage.getItem('casinoToken');
        const name = localStorage.getItem('pokerPlayerName');
        jkSocket = io({ auth: { token, username: name || undefined } });
      }
      setupSocketEvents();
    }
  }
  if (window.io) tryConnect();
  else setTimeout(tryConnect, 2000);
}

function setupSocketEvents() {
  if (!jkSocket) return;

  jkSocket.emit('jukebox:join');

  jkSocket.on('jukebox:sync', (data) => {
    if (data.playlist && data.playlist.length > 0) {
      playlist = data.playlist;
      savePlaylist();
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
    if (data.videoId && player) {
      const idx = playlist.findIndex(s => s.id === data.videoId);
      if (idx >= 0) currentIdx = idx;
      else {
        playlist.push({ id: data.videoId, title: data.title || 'Unbekannt' });
        currentIdx = playlist.length - 1;
        savePlaylist();
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
        savePlaylist();
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
  remove: removeSong,
  moveUp,
  moveDown,
  reset: resetPlaylist,
  toggleSearch,
  onSearch: onSearchInput,
  addFromSearch,
  // Drag events
  dragStart: onDragStart,
  dragOver: onDragOver,
  dragLeave: onDragLeave,
  drop: onDrop,
  dragEnd: onDragEnd,
};

// ---- Init ----
function init() {
  // Nicht in Embed-Iframes laden (verhindert doppelte Musik)
  if (window.location.search.includes('embed=1') || window !== window.top) return;
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
