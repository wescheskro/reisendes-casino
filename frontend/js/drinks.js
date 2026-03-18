// ===== GETRÄNKE-BESTELLUNG =====
// Eiskübel in Poker, Blackjack, Roulette
// Bar hat eigenes System (bar.html)

(function() {
  'use strict';
  if (new URLSearchParams(window.location.search).get('embed') === '1') return;

  const DRINKS = {
    whiskey: { name: 'Whiskey', price: 500, img: '/img/whiskey.png', emoji: '🥃', msg: 'eine Runde Whiskey', video: '/games/sounds/whiskey-order.mp4' },
    vodka: { name: 'Vodka', price: 800, img: '/img/vodka.jpg', emoji: '🍸', msg: 'eine Runde Vodka', video: '/games/sounds/vodka-order.mp4' },
    champagner: { name: 'Champagner', price: 1500, img: '/img/champagne.png', emoji: '🍾', msg: 'eine Flasche Champagner', video: '/games/sounds/champagne-order.mp4' }
  };

  // CSS
  const style = document.createElement('style');
  style.textContent = `
    .ice-bucket {
      position: fixed;
      bottom: 140px;
      right: 12px;
      z-index: 90;
      cursor: pointer;
      transition: transform .2s;
      filter: drop-shadow(0 4px 12px rgba(0,0,0,.6));
    }
    .ice-bucket img { width: 65px; height: auto; }
    .ice-bucket:hover { transform: scale(1.15); }
    .ice-bucket:active { transform: scale(.95); }

    .drink-menu-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 100000;
      background: rgba(0,0,0,.7);
      backdrop-filter: blur(4px);
      justify-content: center;
      align-items: center;
    }
    .drink-menu-overlay.active { display: flex; }
    .drink-menu {
      background: rgba(15,10,5,.95);
      border: 2px solid rgba(212,175,55,.4);
      border-radius: 16px;
      padding: 16px;
      min-width: 260px;
      max-width: 90vw;
    }
    .drink-menu-title {
      color: #D4AF37;
      font-family: 'Playfair Display', serif;
      font-size: 18px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 12px;
      letter-spacing: 1px;
    }
    .drink-menu-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 12px;
      cursor: pointer;
      transition: background .2s;
      border: 1px solid rgba(212,175,55,.2);
      margin-bottom: 8px;
    }
    .drink-menu-item:hover, .drink-menu-item:active { background: rgba(212,175,55,.2); border-color: #D4AF37; }
    .drink-menu-item img { width: 32px; height: 50px; object-fit: contain; }
    .drink-menu-item-info { flex: 1; }
    .drink-menu-item-name { color: #F0E6D3; font-size: 15px; font-weight: 700; }
    .drink-menu-item-price { color: #D4AF37; font-size: 13px; font-weight: 600; }
    .drink-menu-cancel {
      display: block; width: 100%; padding: 10px; margin-top: 4px;
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
      border-radius: 10px; color: #aaa; font-size: 14px; cursor: pointer; text-align: center;
    }
    .drink-menu-cancel:hover { background: rgba(255,255,255,.12); }

    .drink-video-overlay {
      position: fixed; inset: 0; z-index: 100001;
      background: rgba(0,0,0,.8);
      display: flex; align-items: center; justify-content: center;
    }
    .drink-video-overlay video {
      max-width: 90%; max-height: 80%; border-radius: 16px;
    }
  `;
  document.head.appendChild(style);

  // HTML
  const bucket = document.createElement('div');
  bucket.className = 'ice-bucket';
  bucket.innerHTML = '<img src="/img/ice-bucket.png" alt="Getränke" draggable="false">';

  const menuOverlay = document.createElement('div');
  menuOverlay.className = 'drink-menu-overlay';
  const menu = document.createElement('div');
  menu.className = 'drink-menu';
  let menuHTML = '<div class="drink-menu-title">🍸 Getränke bestellen</div>';
  for (const [id, d] of Object.entries(DRINKS)) {
    menuHTML += `<div class="drink-menu-item" data-drink="${id}">
      <img src="${d.img}" alt="${d.name}">
      <div class="drink-menu-item-info">
        <div class="drink-menu-item-name">${d.emoji} ${d.name}</div>
        <div class="drink-menu-item-price">${d.price.toLocaleString('de-DE')} ₿</div>
      </div>
    </div>`;
  }
  menuHTML += '<div class="drink-menu-cancel" data-drink="cancel">Abbrechen</div>';
  menu.innerHTML = menuHTML;
  menuOverlay.appendChild(menu);

  // Click on overlay background closes menu
  menuOverlay.addEventListener('click', (e) => {
    if (e.target === menuOverlay) { menuOverlay.classList.remove('active'); }
  });
  // Click on menu items
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-drink]');
    if (!item) return;
    e.stopPropagation();
    if (item.dataset.drink === 'cancel') {
      menuOverlay.classList.remove('active');
    } else {
      buyDrink(item.dataset.drink);
    }
  });

  document.body.appendChild(bucket);
  document.body.appendChild(menuOverlay);

  // Draggable bucket
  let bDragging = false, bWasDragged = false, bStartX, bStartY, bOrigX, bOrigY;
  const saved = JSON.parse(localStorage.getItem('ice-bucket-pos') || 'null');
  if (saved) {
    bucket.style.bottom = 'auto';
    bucket.style.top = Math.max(0, Math.min(window.innerHeight - 60, saved.top)) + 'px';
    bucket.style.right = 'auto';
    bucket.style.left = Math.max(0, Math.min(window.innerWidth - 60, saved.left)) + 'px';
  }
  function bOnStart(e) {
    bDragging = true; bWasDragged = false;
    const t = e.touches ? e.touches[0] : e;
    bStartX = t.clientX; bStartY = t.clientY;
    const r = bucket.getBoundingClientRect();
    bOrigX = r.left; bOrigY = r.top;
  }
  function bOnMove(e) {
    if (!bDragging) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - bStartX, dy = t.clientY - bStartY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) bWasDragged = true;
    bucket.style.bottom = 'auto'; bucket.style.right = 'auto';
    bucket.style.left = Math.max(0, Math.min(window.innerWidth - 60, bOrigX + dx)) + 'px';
    bucket.style.top = Math.max(0, Math.min(window.innerHeight - 60, bOrigY + dy)) + 'px';
    if (e.cancelable) e.preventDefault();
  }
  function bOnEnd() {
    if (!bDragging) return;
    bDragging = false;
    if (bWasDragged) {
      localStorage.setItem('ice-bucket-pos', JSON.stringify({ top: parseInt(bucket.style.top), left: parseInt(bucket.style.left) }));
    } else {
      toggleDrinkMenu();
    }
  }
  bucket.addEventListener('mousedown', bOnStart);
  bucket.addEventListener('touchstart', bOnStart, {passive:true});
  window.addEventListener('mousemove', bOnMove);
  window.addEventListener('touchmove', bOnMove, {passive:false});
  window.addEventListener('mouseup', bOnEnd);
  window.addEventListener('touchend', bOnEnd);

  function toggleDrinkMenu() {
    if (menuOverlay.classList.contains('active')) {
      menuOverlay.classList.remove('active');
    } else {
      menuOverlay.classList.add('active');
    }
  }

  async function buyDrink(drinkId) {
    const drink = DRINKS[drinkId];
    if (!drink) return;
    menuOverlay.classList.remove('active');

    const token = localStorage.getItem('casinoToken');
    const isGuest = !token && localStorage.getItem('casinoGuest');

    function drinkToast(msg) {
      const t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:100002;background:rgba(231,76,60,.9);color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:700;pointer-events:none;';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }

    if (!token && !isGuest) { drinkToast('Bitte zuerst anmelden!'); return; }

    if (isGuest) {
      let guestBaxt = parseInt(localStorage.getItem('guestBaxt') || '0');
      if (guestBaxt < drink.price) { drinkToast('Nicht genug Baxt Coins!'); return; }
      guestBaxt -= drink.price;
      localStorage.setItem('guestBaxt', String(guestBaxt));
    } else {
      try {
        const res = await fetch('/api/baxt/slot-bet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ amount: drink.price })
        });
        const data = await res.json();
        if (data.error) { drinkToast(data.error); return; }
      } catch(e) { drinkToast('Fehler beim Kauf'); return; }
    }
    // Chat-Nachricht senden
    const socket = window._gameSocket || (window.io && io.sockets && Object.values(io.sockets)[0]);
    if (typeof addChat === 'function') addChat(drink.emoji, drink.emoji + ' ' + (localStorage.getItem('casinoGuest') ? JSON.parse(localStorage.getItem('casinoGuest')).username : 'Du') + ' hat ' + drink.msg + ' bestellt! Prost! 🥂');
    if (typeof addChatMsg === 'function') addChatMsg(drink.emoji, drink.msg + ' bestellt! Prost! 🥂');

    if (window._baxt) window._baxt.loadBalance();

    // Video abspielen (lokal im aktuellen Dokument)
    if (drink.video) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:pointer;';
      const vid = document.createElement('video');
      vid.src = drink.video;
      vid.autoplay = true;
      vid.playsInline = true;
      vid.muted = true;
      vid.style.cssText = 'max-width:90%;max-height:80%;border-radius:16px;';
      vid.onplay = () => { setTimeout(() => { vid.muted = false; }, 100); };
      vid.onended = () => overlay.remove();
      vid.onerror = () => { console.log('[DRINKS] video error, removing overlay'); overlay.remove(); };
      overlay.onclick = () => overlay.remove();
      overlay.appendChild(vid);
      document.body.appendChild(overlay);
      // Fallback: play manually if autoplay blocked
      vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); });
    }
  }

  window._drinks = { buy: buyDrink, toggle: toggleDrinkMenu };
})();
