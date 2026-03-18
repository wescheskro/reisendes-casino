(function() {
'use strict';

// Skip in iframes / embedded games
if (window.location.search.includes('embed=1') || window !== window.top) return;

// ═══════════════════════════════════════════════════════════════
// FRIENDS SYSTEM – Freundesliste + Video/Audio-Telefonie
// ═══════════════════════════════════════════════════════════════

const TOKEN_KEY = 'token';
const API = window.location.origin;

// ─── CSS ───
const style = document.createElement('style');
style.textContent = `
/* ============ FRIENDS BADGE ============ */
.friends-badge {
  position: fixed; bottom: 80px; right: 12px; z-index: 100001;
  width: 44px; height: 44px; border-radius: 50%;
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border: 2px solid rgba(100,200,255,0.4);
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; cursor: grab;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  transition: transform 0.2s, box-shadow 0.2s;
  user-select: none;
}
.friends-badge.dragging { cursor: grabbing; transform: scale(1.15); }
.friends-badge:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 20px rgba(100,200,255,0.3);
}
.friends-badge .notif-dot {
  position: absolute; top: -2px; right: -2px;
  width: 14px; height: 14px; border-radius: 50%;
  background: #ff4444; border: 2px solid #1a1a2e;
  font-size: 8px; color: #fff; display: none;
  align-items: center; justify-content: center;
}
.friends-badge .notif-dot.show { display: flex; }

/* ============ FRIENDS RESIZE CONTROLS ============ */
.fb-resize {
  position: absolute; bottom: -28px; left: 50%; transform: translateX(-50%);
  display: none; gap: 3px; background: rgba(0,0,0,.7);
  border-radius: 6px; padding: 2px 4px; backdrop-filter: blur(6px);
  border: 1px solid rgba(100,200,255,.2);
}
.friends-badge:hover .fb-resize { display: flex; }
.fb-rz {
  background: none; border: 1px solid rgba(100,200,255,.3);
  color: #64c8ff; font-size: 12px; width: 22px; height: 22px;
  border-radius: 4px; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
}
.fb-rz:hover { background: rgba(100,200,255,.15); border-color: rgba(100,200,255,.5); }

/* ============ FRIENDS PANEL ============ */
.friends-panel {
  position: fixed; top: 0; left: -380px; z-index: 100002;
  width: 360px; max-width: 90vw; height: 100vh;
  background: linear-gradient(180deg, #0d1117, #161b22);
  border-right: 1px solid rgba(100,200,255,0.15);
  box-shadow: 6px 0 30px rgba(0,0,0,0.7);
  transition: left 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex; flex-direction: column;
  font-family: 'Segoe UI', system-ui, sans-serif;
}
.friends-panel.open { left: 0; }

.fp-header {
  padding: 16px 20px; display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid rgba(100,200,255,0.1);
  background: rgba(100,200,255,0.03);
}
.fp-header h2 {
  flex: 1; margin: 0; font-size: 18px; color: #e6f0ff;
  font-weight: 700; letter-spacing: 0.5px;
}
.fp-close {
  width: 32px; height: 32px; border-radius: 8px;
  background: rgba(255,255,255,0.05); border: none;
  color: #888; font-size: 18px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.fp-close:hover { background: rgba(255,255,255,0.1); color: #fff; }

/* Search */
.fp-search {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(100,200,255,0.08);
}
.fp-search input {
  width: 100%; padding: 10px 14px; border-radius: 10px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(100,200,255,0.15);
  color: #fff; font-size: 14px; outline: none;
  box-sizing: border-box;
}
.fp-search input::placeholder { color: #555; }
.fp-search input:focus { border-color: rgba(100,200,255,0.4); }

/* Tabs */
.fp-tabs {
  display: flex; border-bottom: 1px solid rgba(100,200,255,0.08);
}
.fp-tab {
  flex: 1; padding: 10px; text-align: center;
  color: #666; font-size: 13px; font-weight: 600;
  cursor: pointer; border: none; background: none;
  border-bottom: 2px solid transparent;
  transition: color 0.2s, border-color 0.2s;
}
.fp-tab:hover { color: #aaa; }
.fp-tab.active { color: #64b5f6; border-bottom-color: #64b5f6; }
.fp-tab .tab-count {
  display: inline-block; min-width: 18px; height: 18px;
  line-height: 18px; border-radius: 9px;
  background: rgba(100,200,255,0.15); font-size: 10px;
  margin-left: 4px; padding: 0 5px;
}

/* List */
.fp-list {
  flex: 1; overflow-y: auto; padding: 8px 0;
}
.fp-list::-webkit-scrollbar { width: 4px; }
.fp-list::-webkit-scrollbar-thumb { background: rgba(100,200,255,0.2); border-radius: 2px; }

.fp-empty {
  text-align: center; padding: 40px 20px; color: #555;
  font-size: 14px;
}
.fp-empty .empty-icon { font-size: 48px; margin-bottom: 12px; }

/* Friend Card */
.friend-card {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; cursor: pointer;
  transition: background 0.15s;
}
.friend-card:hover { background: rgba(100,200,255,0.05); }

.friend-avatar {
  width: 42px; height: 42px; border-radius: 50%;
  background: linear-gradient(135deg, #1e3a5f, #2a5298);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; position: relative; flex-shrink: 0;
}
.friend-avatar .online-dot {
  position: absolute; bottom: 0; right: 0;
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid #0d1117;
}
.friend-avatar .online-dot.on { background: #4caf50; }
.friend-avatar .online-dot.off { background: #666; }

.friend-info { flex: 1; min-width: 0; }
.friend-name {
  font-size: 14px; font-weight: 600; color: #e0e0e0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.friend-meta {
  font-size: 11px; color: #666; margin-top: 2px;
}

.friend-actions {
  display: flex; gap: 6px; flex-shrink: 0;
}
.friend-action-btn {
  width: 34px; height: 34px; border-radius: 10px;
  border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; transition: background 0.2s, transform 0.2s;
}
.friend-action-btn:hover { transform: scale(1.1); }
.fab-call { background: rgba(76,175,80,0.15); color: #4caf50; }
.fab-call:hover { background: rgba(76,175,80,0.3); }
.fab-video { background: rgba(33,150,243,0.15); color: #2196f3; }
.fab-video:hover { background: rgba(33,150,243,0.3); }
.fab-remove { background: rgba(244,67,54,0.1); color: #f44336; }
.fab-remove:hover { background: rgba(244,67,54,0.25); }

/* Request Card */
.request-card {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px;
}
.request-btns { display: flex; gap: 6px; }
.req-btn {
  padding: 6px 14px; border-radius: 8px; border: none;
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: background 0.2s;
}
.req-accept { background: #4caf50; color: #fff; }
.req-accept:hover { background: #66bb6a; }
.req-decline { background: rgba(255,255,255,0.08); color: #aaa; }
.req-decline:hover { background: rgba(255,255,255,0.15); }

/* Search Results */
.search-result {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px;
}
.sr-add-btn {
  padding: 6px 16px; border-radius: 8px; border: none;
  font-size: 12px; font-weight: 600; cursor: pointer;
  background: linear-gradient(135deg, #2196f3, #1976d2);
  color: #fff; transition: opacity 0.2s;
}
.sr-add-btn:hover { opacity: 0.85; }
.sr-add-btn.pending { background: #555; cursor: default; }
.sr-add-btn.is-friend { background: #4caf50; cursor: default; }

/* ============ CALL OVERLAY ============ */
.call-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0,0,0,0.95);
  display: none; flex-direction: column;
  align-items: center; justify-content: center;
}
.call-overlay.active { display: flex; }

.call-status {
  color: #fff; font-size: 16px; margin-bottom: 8px;
  opacity: 0.7;
}
.call-username {
  color: #fff; font-size: 28px; font-weight: 700;
  margin-bottom: 4px;
}
.call-timer {
  color: rgba(255,255,255,0.5); font-size: 14px;
  margin-bottom: 30px; font-variant-numeric: tabular-nums;
}

.call-avatar-big {
  width: 120px; height: 120px; border-radius: 50%;
  background: linear-gradient(135deg, #1e3a5f, #2a5298);
  display: flex; align-items: center; justify-content: center;
  font-size: 56px; margin-bottom: 20px;
  animation: callPulse 2s ease-in-out infinite;
}
@keyframes callPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(100,200,255,0.3); }
  50% { box-shadow: 0 0 0 20px rgba(100,200,255,0); }
}
.call-overlay.connected .call-avatar-big { animation: none; }

.call-videos {
  position: relative; width: 100%; height: 100%;
  display: none;
}
.call-overlay.connected .call-videos { display: flex; }
.call-overlay.connected .call-avatar-big,
.call-overlay.connected .call-status { display: none; }

.call-remote-video {
  width: 100%; height: 100%; object-fit: cover;
  background: #000;
}
.call-local-video {
  position: absolute; bottom: 100px; right: 20px;
  width: 130px; height: 180px; border-radius: 14px;
  object-fit: cover; border: 2px solid rgba(255,255,255,0.2);
  background: #111; z-index: 2;
}

.call-controls {
  position: absolute; bottom: 30px; left: 50%;
  transform: translateX(-50%);
  display: flex; gap: 16px; z-index: 3;
}
.call-ctrl-btn {
  width: 56px; height: 56px; border-radius: 50%;
  border: none; font-size: 24px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.2s, opacity 0.2s;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.call-ctrl-btn:hover { transform: scale(1.1); }
.cc-mute { background: rgba(255,255,255,0.15); color: #fff; }
.cc-mute.muted { background: #f44336; }
.cc-cam { background: rgba(255,255,255,0.15); color: #fff; }
.cc-cam.off { background: #f44336; }
.cc-end { background: #f44336; color: #fff; width: 64px; height: 64px; font-size: 28px; }
.cc-end:hover { background: #d32f2f; }

/* Incoming call */
.call-incoming-overlay {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(0,0,0,0.85);
  display: none; flex-direction: column;
  align-items: center; justify-content: center;
}
.call-incoming-overlay.active { display: flex; }
.ci-avatar {
  width: 100px; height: 100px; border-radius: 50%;
  background: linear-gradient(135deg, #1e3a5f, #2a5298);
  display: flex; align-items: center; justify-content: center;
  font-size: 48px; margin-bottom: 20px;
  animation: callPulse 1.5s ease-in-out infinite;
}
.ci-name { color: #fff; font-size: 24px; font-weight: 700; margin-bottom: 4px; }
.ci-label { color: rgba(255,255,255,0.5); font-size: 14px; margin-bottom: 30px; }
.ci-buttons { display: flex; gap: 30px; }
.ci-btn {
  width: 64px; height: 64px; border-radius: 50%;
  border: none; font-size: 28px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.2s;
}
.ci-btn:hover { transform: scale(1.1); }
.ci-accept { background: #4caf50; color: #fff; }
.ci-decline { background: #f44336; color: #fff; }

/* ============ INCOMING TOAST ============ */
.friends-toast {
  position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
  z-index: 9999; padding: 12px 24px; border-radius: 12px;
  background: linear-gradient(135deg, rgba(30,58,95,0.95), rgba(42,82,152,0.95));
  border: 1px solid rgba(100,200,255,0.3);
  color: #fff; font-size: 14px; font-weight: 500;
  box-shadow: 0 8px 30px rgba(0,0,0,0.5);
  opacity: 0; transition: opacity 0.3s; pointer-events: none;
}
.friends-toast.show { opacity: 1; pointer-events: auto; }
`;
document.head.appendChild(style);

// ─── STATE ───
let panelOpen = false;
let currentTab = 'friends';
let friendsList = [];
let requestsList = [];
let searchResults = [];
let searchTimeout = null;

// Call state
let currentCall = null;
let peerConnection = null;
let localStream = null;
let callTimer = null;
let callSeconds = 0;
let isMuted = false;
let isCamOff = false;

// ─── HTML STRUCTURE ───
const badge = document.createElement('div');
badge.className = 'friends-badge';
badge.innerHTML = `👥<div class="notif-dot"></div>`;

// ─── DRAG & POSITION SAVE ───
const FB_POS_KEY = 'friends_badge_pos';
const FB_SIZE_KEY = 'friends_badge_size';
let fbSize = parseInt(localStorage.getItem(FB_SIZE_KEY)) || 48;
let fbDragging = false, fbDragged = false, fbStartX = 0, fbStartY = 0, fbOrigX = 0, fbOrigY = 0;

// Apply saved size
function applyFbSize() {
  badge.style.width = fbSize + 'px';
  badge.style.height = fbSize + 'px';
  badge.style.fontSize = Math.max(14, Math.round(fbSize * 0.45)) + 'px';
}
applyFbSize();

function resizeFb(delta) {
  fbSize = Math.max(30, Math.min(90, fbSize + delta));
  applyFbSize();
  localStorage.setItem(FB_SIZE_KEY, fbSize);
}

function saveFbPos() {
  localStorage.setItem(FB_POS_KEY, JSON.stringify({ top: badge.offsetTop, left: badge.offsetLeft }));
  localStorage.setItem(FB_SIZE_KEY, fbSize);
  badge.style.boxShadow = '0 0 20px rgba(100,200,255,0.6)';
  setTimeout(() => { badge.style.boxShadow = ''; }, 600);
}

// Restore saved position
const savedFbPos = JSON.parse(localStorage.getItem(FB_POS_KEY) || 'null');
if (savedFbPos) {
  const maxL = window.innerWidth - 50, maxT = window.innerHeight - 50;
  badge.style.top = Math.max(0, Math.min(maxT, savedFbPos.top)) + 'px';
  badge.style.left = Math.max(0, Math.min(maxL, savedFbPos.left)) + 'px';
}

function fbPointerDown(e) {
  if (e.target.closest('.notif-dot') || e.target.closest('.fb-resize')) return;
  fbDragging = true; fbDragged = false;
  fbStartX = e.clientX || e.touches?.[0]?.clientX || 0;
  fbStartY = e.clientY || e.touches?.[0]?.clientY || 0;
  fbOrigX = badge.offsetLeft;
  fbOrigY = badge.offsetTop;
  badge.classList.add('dragging');
  e.preventDefault();
}
function fbPointerMove(e) {
  if (!fbDragging) return;
  const cx = e.clientX || e.touches?.[0]?.clientX || 0;
  const cy = e.clientY || e.touches?.[0]?.clientY || 0;
  const dx = cx - fbStartX, dy = cy - fbStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) fbDragged = true;
  badge.style.left = Math.max(0, Math.min(window.innerWidth - 52, fbOrigX + dx)) + 'px';
  badge.style.top = Math.max(0, Math.min(window.innerHeight - 52, fbOrigY + dy)) + 'px';
}
function fbPointerUp() {
  if (!fbDragging) return;
  fbDragging = false;
  badge.classList.remove('dragging');
  if (fbDragged) {
    localStorage.setItem(FB_POS_KEY, JSON.stringify({ top: badge.offsetTop, left: badge.offsetLeft }));
  }
}

badge.addEventListener('mousedown', fbPointerDown);
badge.addEventListener('touchstart', fbPointerDown, { passive: false });
document.addEventListener('mousemove', fbPointerMove);
document.addEventListener('touchmove', fbPointerMove, { passive: false });
document.addEventListener('mouseup', fbPointerUp);
document.addEventListener('touchend', fbPointerUp);

badge.addEventListener('click', (e) => { if (!fbDragged) togglePanel(); });

const panel = document.createElement('div');
panel.className = 'friends-panel';
panel.innerHTML = `
  <div class="fp-header">
    <h2>👥 Freunde</h2>
    <button class="fp-close" onclick="window._friends.close()">✕</button>
  </div>
  <div class="fp-search">
    <input type="text" id="fpSearchInput" placeholder="🔍 Spieler suchen..." oninput="window._friends.search(this.value)">
  </div>
  <div class="fp-tabs">
    <button class="fp-tab active" data-tab="friends" onclick="window._friends.tab('friends')">
      Freunde <span class="tab-count" id="tcFriends">0</span>
    </button>
    <button class="fp-tab" data-tab="requests" onclick="window._friends.tab('requests')">
      Anfragen <span class="tab-count" id="tcRequests">0</span>
    </button>
  </div>
  <div class="fp-list" id="fpList"></div>
`;

// Call overlay
const callOverlay = document.createElement('div');
callOverlay.className = 'call-overlay';
callOverlay.innerHTML = `
  <div class="call-avatar-big">👤</div>
  <div class="call-status" id="callStatus">Verbinde...</div>
  <div class="call-username" id="callUsername"></div>
  <div class="call-timer" id="callTimer">00:00</div>
  <div class="call-videos">
    <video class="call-remote-video" id="remoteVideo" autoplay playsinline></video>
    <video class="call-local-video" id="localVideo" autoplay playsinline muted></video>
  </div>
  <div class="call-controls">
    <button class="call-ctrl-btn cc-mute" onclick="window._friends.toggleMute()">🎤</button>
    <button class="call-ctrl-btn cc-cam" onclick="window._friends.toggleCam()">📷</button>
    <button class="call-ctrl-btn cc-end" onclick="window._friends.endCall()">📞</button>
  </div>
`;

// Incoming call overlay
const incomingOverlay = document.createElement('div');
incomingOverlay.className = 'call-incoming-overlay';
incomingOverlay.innerHTML = `
  <div class="ci-avatar">👤</div>
  <div class="ci-name" id="ciName"></div>
  <div class="ci-label" id="ciLabel">Eingehender Anruf...</div>
  <div class="ci-buttons">
    <button class="ci-btn ci-decline" onclick="window._friends.declineIncoming()">✕</button>
    <button class="ci-btn ci-accept" onclick="window._friends.acceptIncoming()">📞</button>
  </div>
`;

// Toast
const toast = document.createElement('div');
toast.className = 'friends-toast';

document.body.appendChild(badge);
document.body.appendChild(panel);
document.body.appendChild(callOverlay);
document.body.appendChild(incomingOverlay);
document.body.appendChild(toast);

// ─── HELPERS ───
function getToken() { return localStorage.getItem(TOKEN_KEY); }

async function apiFetch(path, opts = {}) {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...opts.headers }
  });
  return res.json();
}

function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return m + ':' + s;
}

// ─── PANEL ───
function togglePanel() {
  panelOpen = !panelOpen;
  panel.classList.toggle('open', panelOpen);
  if (panelOpen) loadFriends();
}

function closePanel() {
  panelOpen = false;
  panel.classList.remove('open');
}

// Close on outside click
document.addEventListener('click', (e) => {
  if (panelOpen && !panel.contains(e.target) && !badge.contains(e.target)) {
    closePanel();
  }
});

// ─── TABS ───
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.fp-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  renderList();
}

// ─── DATA LOADING ───
async function loadFriends() {
  const data = await apiFetch('/api/friends');
  if (!data) return;
  friendsList = data.friends || [];
  requestsList = data.requests || [];

  document.getElementById('tcFriends').textContent = friendsList.length;
  document.getElementById('tcRequests').textContent = requestsList.length;

  const notifDot = badge.querySelector('.notif-dot');
  notifDot.classList.toggle('show', requestsList.length > 0);

  renderList();
}

// ─── RENDER ───
function renderList() {
  const list = document.getElementById('fpList');
  const searchVal = document.getElementById('fpSearchInput').value.trim();

  // Wenn Suche aktiv
  if (searchVal.length >= 2) {
    if (searchResults.length === 0) {
      list.innerHTML = '<div class="fp-empty"><div class="empty-icon">🔍</div>Kein Spieler gefunden</div>';
    } else {
      list.innerHTML = searchResults.map(r => `
        <div class="search-result">
          <div class="friend-avatar"><span>👤</span></div>
          <div class="friend-info">
            <div class="friend-name">${esc(r.username)}</div>
            <div class="friend-meta">Level ${r.level}</div>
          </div>
          ${r.isFriend ? '<button class="sr-add-btn is-friend" disabled>✓ Freund</button>' :
            r.isPending ? '<button class="sr-add-btn pending" disabled>⏳ Gesendet</button>' :
            `<button class="sr-add-btn" onclick="window._friends.addFriend('${esc(r.username)}')">+ Hinzufügen</button>`}
        </div>
      `).join('');
    }
    return;
  }

  if (currentTab === 'friends') {
    if (friendsList.length === 0) {
      list.innerHTML = '<div class="fp-empty"><div class="empty-icon">👥</div>Noch keine Freunde<br><small>Suche nach Spielern um sie hinzuzufügen!</small></div>';
    } else {
      // Online zuerst sortieren
      const sorted = [...friendsList].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
      list.innerHTML = sorted.map(f => `
        <div class="friend-card">
          <div class="friend-avatar">
            <span>👤</span>
            <div class="online-dot ${f.online ? 'on' : 'off'}"></div>
          </div>
          <div class="friend-info">
            <div class="friend-name">${esc(f.username)}</div>
            <div class="friend-meta">
              ${f.online ? '🟢 Online' : '⚫ Offline'} · Lvl ${f.level} · ${f.rang}
            </div>
          </div>
          <div class="friend-actions">
            ${f.online ? `
              <button class="friend-action-btn fab-call" onclick="window._friends.call('${f.id}','${esc(f.username)}','audio')" title="Anrufen">📞</button>
              <button class="friend-action-btn fab-video" onclick="window._friends.call('${f.id}','${esc(f.username)}','video')" title="Videoanruf">📹</button>
            ` : ''}
            <button class="friend-action-btn fab-remove" onclick="window._friends.removeFriend('${f.id}','${esc(f.username)}')" title="Entfernen">✕</button>
          </div>
        </div>
      `).join('');
    }
  } else {
    if (requestsList.length === 0) {
      list.innerHTML = '<div class="fp-empty"><div class="empty-icon">📬</div>Keine Anfragen</div>';
    } else {
      list.innerHTML = requestsList.map(r => `
        <div class="request-card">
          <div class="friend-avatar"><span>👤</span></div>
          <div class="friend-info">
            <div class="friend-name">${esc(r.username)}</div>
            <div class="friend-meta">Level ${r.level}</div>
          </div>
          <div class="request-btns">
            <button class="req-btn req-accept" onclick="window._friends.acceptReq('${r.id}')">Annehmen</button>
            <button class="req-btn req-decline" onclick="window._friends.declineReq('${r.id}')">Ablehnen</button>
          </div>
        </div>
      `).join('');
    }
  }
}

function esc(s) { return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

// ─── ACTIONS ───
async function addFriend(username) {
  const data = await apiFetch('/api/friends/request', {
    method: 'POST', body: JSON.stringify({ username })
  });
  if (data && data.status) {
    showToast(data.message || 'Anfrage gesendet!');
    doSearch(document.getElementById('fpSearchInput').value);
  } else {
    showToast(data?.error || 'Fehler');
  }
}

async function acceptRequest(userId) {
  await apiFetch('/api/friends/accept', {
    method: 'POST', body: JSON.stringify({ userId })
  });
  showToast('Freundschaft angenommen! 🎉');
  loadFriends();
}

async function declineRequest(userId) {
  await apiFetch('/api/friends/decline', {
    method: 'POST', body: JSON.stringify({ userId })
  });
  loadFriends();
}

async function removeFriend(userId, username) {
  if (!confirm(`${username} wirklich als Freund entfernen?`)) return;
  await apiFetch('/api/friends/remove', {
    method: 'POST', body: JSON.stringify({ userId })
  });
  showToast(`${username} entfernt`);
  loadFriends();
}

// ─── SEARCH ───
async function doSearch(query) {
  if (query.length < 2) { searchResults = []; renderList(); return; }
  const data = await apiFetch('/api/friends/search?q=' + encodeURIComponent(query));
  if (data) { searchResults = data.results || []; renderList(); }
}

function onSearch(val) {
  clearTimeout(searchTimeout);
  if (val.length < 2) { searchResults = []; renderList(); return; }
  searchTimeout = setTimeout(() => doSearch(val), 300);
}

// ─── CALL SYSTEM ───
function getSocket() {
  // Global socket reference
  if (window._pokerSocket) return window._pokerSocket;
  if (window._socket) return window._socket;
  if (window.socket) return window.socket;
  return null;
}

// Poll for socket
let socketReady = false;
function waitForSocket(cb) {
  const check = setInterval(() => {
    const s = getSocket();
    if (s) { clearInterval(check); cb(s); }
  }, 500);
  setTimeout(() => clearInterval(check), 30000);
}

function setupSocketEvents(socket) {
  if (socketReady) return;
  socketReady = true;

  socket.on('friends:request', (data) => {
    showToast(`📬 ${data.username} möchte dein Freund sein!`);
    const notifDot = badge.querySelector('.notif-dot');
    notifDot.classList.add('show');
    if (panelOpen) loadFriends();
  });

  socket.on('friends:accepted', (data) => {
    showToast(`🎉 ${data.username} und du seid jetzt Freunde!`);
    if (panelOpen) loadFriends();
  });

  socket.on('friends:online', (data) => {
    if (panelOpen) loadFriends();
  });

  socket.on('friends:offline', (data) => {
    if (panelOpen) loadFriends();
  });

  // Incoming call
  socket.on('call:incoming', (data) => {
    currentCall = {
      callId: data.callId,
      callType: data.callType,
      callerId: data.callerId,
      callerName: data.callerName,
      direction: 'incoming'
    };
    document.getElementById('ciName').textContent = data.callerName;
    document.getElementById('ciLabel').textContent =
      data.callType === 'video' ? '📹 Videoanruf...' : '📞 Audioanruf...';
    incomingOverlay.classList.add('active');

    // Klingelton
    try {
      const ring = new AudioContext();
      function playRing() {
        if (!incomingOverlay.classList.contains('active')) return;
        const o = ring.createOscillator();
        const g = ring.createGain();
        o.connect(g); g.connect(ring.destination);
        o.frequency.value = 440; g.gain.value = 0.15;
        o.start(); o.stop(ring.currentTime + 0.3);
        setTimeout(() => {
          if (!incomingOverlay.classList.contains('active')) return;
          const o2 = ring.createOscillator();
          const g2 = ring.createGain();
          o2.connect(g2); g2.connect(ring.destination);
          o2.frequency.value = 554; g2.gain.value = 0.15;
          o2.start(); o2.stop(ring.currentTime + 0.3);
        }, 350);
        setTimeout(playRing, 2000);
      }
      playRing();
    } catch(e) {}
  });

  socket.on('call:ringing', (data) => {
    currentCall = { ...currentCall, callId: data.callId, targetUsername: data.targetUsername };
    document.getElementById('callUsername').textContent = data.targetUsername;
    document.getElementById('callStatus').textContent = 'Klingelt...';
    document.getElementById('callTimer').textContent = '';
    callOverlay.classList.add('active');
    callOverlay.classList.remove('connected');
  });

  socket.on('call:accepted', async (data) => {
    currentCall.peerId = data.peerId;
    document.getElementById('callStatus').textContent = 'Verbunden';
    await setupWebRTC(true);
  });

  socket.on('call:connected', async (data) => {
    currentCall.peerId = data.peerId;
    incomingOverlay.classList.remove('active');
    document.getElementById('callUsername').textContent = currentCall.callerName || '';
    document.getElementById('callStatus').textContent = 'Verbunden';
    callOverlay.classList.add('active');
    callOverlay.classList.remove('connected');
    await setupWebRTC(false);
  });

  socket.on('call:declined', () => {
    showToast('Anruf abgelehnt');
    cleanupCall();
  });

  socket.on('call:ended', () => {
    showToast('Anruf beendet');
    cleanupCall();
  });

  socket.on('call:error', (data) => {
    showToast(data.message);
    cleanupCall();
  });

  // WebRTC signaling
  socket.on('call:offer', async (data) => {
    if (!peerConnection) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('call:answer', { peerId: data.peerId, answer });
  });

  socket.on('call:answer', async (data) => {
    if (!peerConnection) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  });

  socket.on('call:ice-candidate', async (data) => {
    if (!peerConnection) return;
    try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e) {}
  });
}

// ─── WebRTC ───
async function setupWebRTC(isInitiator) {
  const socket = getSocket();
  const isVideo = currentCall && currentCall.callType === 'video';

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
    });
  } catch(e) {
    // Fallback nur Audio
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch(e2) {
      showToast('Kein Mikrofon verfügbar!');
      endCall();
      return;
    }
  }

  document.getElementById('localVideo').srcObject = localStream;

  peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

  peerConnection.ontrack = (e) => {
    document.getElementById('remoteVideo').srcObject = e.streams[0];
    callOverlay.classList.add('connected');
    startCallTimer();
  };

  peerConnection.onicecandidate = (e) => {
    if (e.candidate && socket) {
      socket.emit('call:ice-candidate', {
        peerId: currentCall.peerId,
        candidate: e.candidate
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === 'disconnected' ||
        peerConnection.connectionState === 'failed') {
      endCall();
    }
  };

  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('call:offer', { peerId: currentCall.peerId, offer });
  }
}

function startCallTimer() {
  callSeconds = 0;
  callTimer = setInterval(() => {
    callSeconds++;
    document.getElementById('callTimer').textContent = formatTime(callSeconds);
  }, 1000);
}

function cleanupCall() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (callTimer) { clearInterval(callTimer); callTimer = null; }
  callSeconds = 0;
  isMuted = false;
  isCamOff = false;
  currentCall = null;
  callOverlay.classList.remove('active', 'connected');
  incomingOverlay.classList.remove('active');
  document.getElementById('remoteVideo').srcObject = null;
  document.getElementById('localVideo').srcObject = null;
}

function initiateCall(targetId, targetName, callType) {
  const socket = getSocket();
  if (!socket) { showToast('Keine Verbindung!'); return; }

  currentCall = {
    targetId,
    targetUsername: targetName,
    callType,
    direction: 'outgoing'
  };

  socket.emit('call:initiate', { targetUserId: targetId, callType });
  closePanel();
}

function acceptIncoming() {
  if (!currentCall) return;
  const socket = getSocket();
  if (!socket) return;

  socket.emit('call:accept', {
    callId: currentCall.callId,
    callerId: currentCall.callerId
  });
}

function declineIncoming() {
  if (!currentCall) return;
  const socket = getSocket();
  if (socket) {
    socket.emit('call:decline', {
      callId: currentCall.callId,
      callerId: currentCall.callerId
    });
  }
  cleanupCall();
}

function endCall() {
  const socket = getSocket();
  if (socket && currentCall) {
    socket.emit('call:end', { callId: currentCall.callId });
  }
  cleanupCall();
}

function toggleMute() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  const btn = callOverlay.querySelector('.cc-mute');
  btn.classList.toggle('muted', isMuted);
  btn.textContent = isMuted ? '🔇' : '🎤';
}

function toggleCam() {
  if (!localStream) return;
  const videoTracks = localStream.getVideoTracks();
  if (videoTracks.length === 0) return;
  isCamOff = !isCamOff;
  videoTracks.forEach(t => t.enabled = !isCamOff);
  const btn = callOverlay.querySelector('.cc-cam');
  btn.classList.toggle('off', isCamOff);
  btn.textContent = isCamOff ? '🚫' : '📷';
}

// ─── SOCKET INIT ───
waitForSocket(setupSocketEvents);

// ─── AUTO LOAD ───
if (getToken()) {
  setTimeout(loadFriends, 1500);
}

// ─── GLOBAL API ───
window._friends = {
  close: closePanel,
  tab: setTab,
  search: onSearch,
  addFriend,
  acceptReq: acceptRequest,
  declineReq: declineRequest,
  removeFriend,
  call: initiateCall,
  acceptIncoming,
  declineIncoming,
  endCall,
  toggleMute,
  toggleCam,
  bigger: () => resizeFb(8),
  smaller: () => resizeFb(-8),
  savePos: saveFbPos
};

})();
