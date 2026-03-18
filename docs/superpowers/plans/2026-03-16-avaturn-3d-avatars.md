# Avaturn 3D Avatar System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DiceBear 2D avatars with Avaturn 3D avatar creation, storing thumbnails for poker seat display and syncing across multiplayer.

**Architecture:** Avaturn iframe SDK opens in a modal for avatar creation. On export, we render the GLB model via Three.js offscreen canvas to capture a PNG thumbnail. Thumbnails are stored as data URLs in localStorage (client) and synced to other players via Socket.IO. DiceBear remains as fallback for users without custom 3D avatars.

**Tech Stack:** Avaturn SDK (CDN), Three.js + GLTFLoader (CDN), Socket.IO, localStorage

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/games/poker.html` | Modify | Avatar editor UI (add Avaturn tab), Three.js thumbnail renderer, updated renderAvatar() |
| `backend/server.js` | Modify | Add avatarUrl to player state, socket event for avatar sync, include in pokerTableState |

---

### Task 1: Backend — Avatar URL in Player State & Socket Sync

**Files:**
- Modify: `backend/server.js:1807-1830` (pokerTableState)
- Modify: `backend/server.js:2250-2290` (poker:join handler area)

- [ ] **Step 1: Add avatarUrl to pokerTableState output**

In `pokerTableState()` (line 1813), add `avatarUrl` to the seat data object:

```javascript
return {
  seat: i, username: p.username, chips: p.chips,
  bet: p.roundBet || 0, folded: p.folded,
  cards: isYou ? p.cards.map(cardStr) : (table.phase === 'showdown' && !p.folded ? p.cards.map(cardStr) : ['??','??']),
  isYou, isDealer: i === table.dealerSeat, isBot: !!p.isBot,
  botStyle: p.isBot ? p.botStyle : null,
  peeking: !!p.peeking,
  handName: table.phase === 'showdown' && !p.folded ? bestPokerHand(p.cards, table.community).name : null,
  avatarUrl: p.avatarUrl || null
};
```

- [ ] **Step 2: Add poker:setAvatar socket event**

Add a new socket handler after the existing poker handlers. When a player updates their avatar, store the URL and broadcast the updated state:

```javascript
socket.on('poker:setAvatar', ({ avatarUrl }) => {
  if (!socket.user) return;
  const tableId = socket._pkTable;
  if (!tableId) return;
  const table = tables.poker.get(tableId);
  if (!table) return;
  const player = table.players.get(socket.user.id);
  if (!player) return;
  player.avatarUrl = avatarUrl;
  emitPokerState(table);
});
```

- [ ] **Step 3: Store avatarUrl when player joins**

In the poker:join handler, when creating the player object, also accept and store an avatarUrl if provided:

```javascript
socket.on('poker:join', ({ tableId, seat, username, avatarUrl }) => {
  // ... existing code ...
  // When creating player object, add:
  // avatarUrl: avatarUrl || null
});
```

- [ ] **Step 4: Restart server and verify no errors**

Run: Kill old process, `node backend/server.js`
Expected: Server starts without errors on port 3000

---

### Task 2: Frontend — Avaturn Iframe Integration in Avatar Editor

**Files:**
- Modify: `frontend/games/poker.html:1159-1205` (Avatar Editor HTML)
- Modify: `frontend/games/poker.html:780-855` (Avatar Editor CSS)
- Modify: `frontend/games/poker.html:1824-1935` (Avatar Editor JS)

- [ ] **Step 1: Add Three.js and GLTFLoader CDN scripts**

Add before the closing `</body>` tag (or in `<head>`):

```html
<script src="https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.162.0/examples/js/loaders/GLTFLoader.js"></script>
```

- [ ] **Step 2: Add "3D Avatar" tab to Avatar Editor HTML**

Update the avatar editor modal tabs (line 1170-1172) to add a third tab:

```html
<div class="ave-tabs">
  <button class="ave-tab active" onclick="aveTab('presets')">Charaktere</button>
  <button class="ave-tab" onclick="aveTab('custom')">Anpassen</button>
  <button class="ave-tab" onclick="aveTab('avaturn')">✨ 3D Avatar</button>
</div>
```

Add the Avaturn panel after `avePanelCustom` (after line 1201):

```html
<div class="ave-panel" id="avePanelAvaturn" style="display:none">
  <div class="avaturn-container" id="avaturnContainer">
    <div class="avaturn-loading" id="avaturnLoading">
      <div class="avaturn-spinner"></div>
      <p>3D Avatar Editor wird geladen...</p>
    </div>
    <iframe id="avaturnIframe" style="display:none;width:100%;height:450px;border:none;border-radius:12px;"></iframe>
  </div>
  <p style="color:#888;font-size:10px;text-align:center;margin-top:8px;">Erstelle deinen einzigartigen 3D Avatar — powered by Avaturn</p>
</div>
```

- [ ] **Step 3: Add Avaturn panel CSS**

Add after the existing avatar editor CSS (after line 855):

```css
/* ============ AVATURN 3D PANEL ============ */
.avaturn-container{
  width:100%;border-radius:12px;overflow:hidden;
  background:#0a0a12;min-height:450px;position:relative;
}
.avaturn-loading{
  position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:12px;color:#D4AF37;
}
.avaturn-spinner{
  width:40px;height:40px;border:3px solid rgba(212,175,55,.2);
  border-top-color:#D4AF37;border-radius:50%;
  animation:spin 1s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}
/* Three.js thumbnail preview */
.avaturn-thumb-preview{
  text-align:center;margin-top:12px;
}
.avaturn-thumb-preview img{
  width:80px;height:80px;border-radius:50%;
  border:3px solid rgba(212,175,55,.4);
  box-shadow:0 4px 20px rgba(0,0,0,.5);
}
```

- [ ] **Step 4: Update aveTab() JS to handle avaturn tab**

Update the `aveTab` function to show/hide the new panel and load the Avaturn iframe:

```javascript
function aveTab(tab) {
  document.querySelectorAll('.ave-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('avePanelPresets').style.display = tab === 'presets' ? '' : 'none';
  document.getElementById('avePanelCustom').style.display = tab === 'custom' ? '' : 'none';
  document.getElementById('avePanelAvaturn').style.display = tab === 'avaturn' ? '' : 'none';
  if (tab === 'avaturn') loadAvaturnEditor();
}
```

- [ ] **Step 5: Add Avaturn iframe loader + message listener**

Add the Avaturn integration JS. Uses the subdomain iframe approach (free tier). The subdomain URL is configurable:

```javascript
// ===================== AVATURN 3D INTEGRATION =====================
const AVATURN_SUBDOMAIN = localStorage.getItem('avaturnSubdomain') || 'demo';
let avaturnLoaded = false;

function loadAvaturnEditor() {
  if (avaturnLoaded) return;
  const iframe = document.getElementById('avaturnIframe');
  const loading = document.getElementById('avaturnLoading');

  iframe.src = `https://${AVATURN_SUBDOMAIN}.avaturn.dev`;
  iframe.onload = () => {
    loading.style.display = 'none';
    iframe.style.display = 'block';
    avaturnLoaded = true;
  };

  // Listen for export messages from Avaturn iframe
  window.addEventListener('message', handleAvaturnMessage);
}

function handleAvaturnMessage(event) {
  // Avaturn sends message when avatar is exported
  if (!event.data || typeof event.data !== 'object') return;
  if (event.data.source !== 'avaturn') return;

  if (event.data.eventName === 'v2.avatar.exported') {
    const glbUrl = event.data.avatarUrl || event.data.url;
    if (glbUrl) {
      generateAvatarThumbnail(glbUrl);
    }
  }
}
```

- [ ] **Step 6: Add Three.js GLB-to-thumbnail renderer**

This function loads the GLB, renders it to an offscreen canvas, and captures a PNG thumbnail:

```javascript
async function generateAvatarThumbnail(glbUrl) {
  const SIZE = 256;

  // Create offscreen renderer
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 1.5, 2.5);
  camera.lookAt(0, 1.2, 0);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2, 3, 2);
  scene.add(dirLight);
  const fillLight = new THREE.DirectionalLight(0xffd700, 0.3);
  fillLight.position.set(-2, 1, -1);
  scene.add(fillLight);

  try {
    const loader = new THREE.GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.load(glbUrl, resolve, undefined, reject);
    });

    const model = gltf.scene;

    // Center and scale model
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) model.scale.multiplyScalar(2.0 / maxDim);

    scene.add(model);
    renderer.render(scene, camera);

    // Capture thumbnail as data URL
    const thumbnailUrl = renderer.domElement.toDataURL('image/png');

    // Save to localStorage and update game
    saveAvaturnAvatar(thumbnailUrl, glbUrl);

    // Show preview
    const previewDiv = document.querySelector('.avaturn-thumb-preview') || document.createElement('div');
    previewDiv.className = 'avaturn-thumb-preview';
    previewDiv.innerHTML = `<p style="color:#2ecc71;font-size:12px;margin-bottom:8px;">✓ Avatar erstellt!</p><img src="${thumbnailUrl}" alt="3D Avatar">`;
    document.getElementById('avaturnContainer').appendChild(previewDiv);

  } catch(err) {
    console.error('Avatar thumbnail error:', err);
  } finally {
    renderer.dispose();
  }
}

function saveAvaturnAvatar(thumbnailUrl, glbUrl) {
  const name = localStorage.getItem('pokerPlayerName') || 'Spieler';
  myAvatarConfig.url = thumbnailUrl;
  myAvatarConfig.glbUrl = glbUrl;
  myAvatarConfig.forName = name;
  myAvatarConfig.type = '3d';
  localStorage.setItem('pokerAvatar', JSON.stringify(myAvatarConfig));

  // Sync to other players via socket
  if (socket && socket.connected) {
    socket.emit('poker:setAvatar', { avatarUrl: thumbnailUrl });
  }

  // Re-render seats
  if (myState) renderState(myState);
}
```

---

### Task 3: Frontend — Update Avatar Display for Multiplayer Sync

**Files:**
- Modify: `frontend/games/poker.html:1799-1822` (getAvatarUrl, renderAvatar)

- [ ] **Step 1: Update getAvatarUrl to use server-provided avatar**

Modify `getAvatarUrl` to accept an optional avatarUrl from the server state:

```javascript
function getAvatarUrl(username, serverAvatarUrl) {
  // Server-provided avatar (from other players' 3D avatars)
  if (serverAvatarUrl) return serverAvatarUrl;
  // Own custom avatar from localStorage
  if (myAvatarConfig.url && username === (myAvatarConfig.forName || '')) {
    return myAvatarConfig.url;
  }
  // Fallback: DiceBear
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(username)}&backgroundColor=transparent&style=circle`;
}
```

- [ ] **Step 2: Update renderAvatar to pass server avatar URL**

```javascript
function renderAvatar(username, isYou, serverAvatarUrl) {
  const url = getAvatarUrl(username, isYou ? null : serverAvatarUrl);
  const editBtn = isYou ? '<div class="seat-avatar-edit" onclick="event.stopPropagation();openAvatarEditor()">✎</div>' : '';
  return `<div class="seat-avatar" style="position:relative"><img src="${url}" alt="${username}" loading="lazy">${editBtn}</div>`;
}
```

- [ ] **Step 3: Update renderState to pass avatarUrl from state**

Find where `renderAvatar` is called in the `renderState` function and update the call to include the server-provided avatarUrl:

```javascript
const avatarHTML = renderAvatar(s.username, s.isYou, s.avatarUrl);
```

- [ ] **Step 4: Send own avatarUrl when joining table**

Update the poker:join emit to include the avatar URL:

```javascript
// Where socket.emit('poker:join', ...) is called, add avatarUrl:
const myAvatar = myAvatarConfig.url || null;
socket.emit('poker:join', { tableId, seat, username, avatarUrl: myAvatar });
```

---

### Task 4: Setup & Configuration

- [ ] **Step 1: Jérôme registers at developer.avaturn.me**

Manual step: Go to https://developer.avaturn.me and create a free account. Get the subdomain (e.g., `reisendes-casino`). Then set it in browser console:
```javascript
localStorage.setItem('avaturnSubdomain', 'reisendes-casino');
```

Or we hardcode it in the code once we have it.

- [ ] **Step 2: Test the full flow**

1. Open poker game
2. Click edit avatar (✎ pencil)
3. Click "✨ 3D Avatar" tab
4. Avaturn editor loads in iframe
5. Create/customize avatar
6. On export → thumbnail generated → saved → displayed at seat
7. Open second browser → join same table → see the 3D avatar thumbnail on the other player's seat

- [ ] **Step 3: Commit**

```bash
git add frontend/games/poker.html backend/server.js
git commit -m "feat: integrate Avaturn 3D avatar system with thumbnail rendering"
```

---

## Notes

- **Fallback**: DiceBear avatars remain the default. Players without 3D avatars see auto-generated 2D avatars.
- **Storage**: Thumbnails are PNG data URLs (~50-100KB each). For production, these should be uploaded to a CDN/S3 bucket.
- **Avaturn Free Tier**: Unlimited avatars and exports. No REST API access (would need $800/mo PRO plan).
- **CORS**: GLB URLs from Avaturn should be CORS-friendly for Three.js loading. If not, we may need to proxy through our server.
- **Mobile**: Avaturn iframe works on mobile browsers. Three.js thumbnail generation is a one-time operation and lightweight.
