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
      bottom: 80px;
      right: 12px;
      z-index: 90;
      cursor: pointer;
      transition: transform .2s;
      filter: drop-shadow(0 4px 12px rgba(0,0,0,.6));
    }
    .ice-bucket img { width: 50px; height: auto; }
    .ice-bucket:hover { transform: scale(1.15); }
    .ice-bucket:active { transform: scale(.95); }

    .drink-menu {
      display: none;
      position: fixed;
      bottom: 140px;
      right: 12px;
      z-index: 91;
      background: rgba(15,10,5,.95);
      border: 2px solid rgba(212,175,55,.4);
      border-radius: 16px;
      padding: 12px;
      backdrop-filter: blur(10px);
      min-width: 160px;
    }
    .drink-menu.active { display: block; }
    .drink-menu-title {
      color: #D4AF37;
      font-family: 'Playfair Display', serif;
      font-size: 13px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 8px;
      letter-spacing: 1px;
    }
    .drink-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 10px;
      cursor: pointer;
      transition: background .2s;
    }
    .drink-menu-item:hover { background: rgba(212,175,55,.15); }
    .drink-menu-item img { width: 24px; height: 40px; object-fit: contain; }
    .drink-menu-item-info { flex: 1; }
    .drink-menu-item-name { color: #F0E6D3; font-size: 13px; font-weight: 700; }
    .drink-menu-item-price { color: #D4AF37; font-size: 11px; }

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

  const menu = document.createElement('div');
  menu.className = 'drink-menu';
  menu.id = 'drinkMenu';
  let menuHTML = '<div class="drink-menu-title">Getränke</div>';
  for (const [id, d] of Object.entries(DRINKS)) {
    menuHTML += `<div class="drink-menu-item" onclick="window._drinks.buy('${id}')">
      <img src="${d.img}" alt="${d.name}">
      <div class="drink-menu-item-info">
        <div class="drink-menu-item-name">${d.name}</div>
        <div class="drink-menu-item-price">${d.price.toLocaleString('de-DE')} ₿</div>
      </div>
    </div>`;
  }
  menu.innerHTML = menuHTML;

  document.body.appendChild(bucket);
  document.body.appendChild(menu);

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
    e.preventDefault();
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
  bucket.addEventListener('touchstart', bOnStart, {passive:false});
  window.addEventListener('mousemove', bOnMove);
  window.addEventListener('touchmove', bOnMove, {passive:false});
  window.addEventListener('mouseup', bOnEnd);
  window.addEventListener('touchend', bOnEnd);

  function toggleDrinkMenu() {
    const r = bucket.getBoundingClientRect();
    menu.style.bottom = 'auto';
    menu.style.right = 'auto';
    menu.style.left = Math.min(window.innerWidth - 180, r.left) + 'px';
    menu.style.top = Math.max(0, r.top - 200) + 'px';
    menu.classList.toggle('active');
  }

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ice-bucket') && !e.target.closest('.drink-menu')) {
      menu.classList.remove('active');
    }
  });

  async function buyDrink(drinkId) {
    const drink = DRINKS[drinkId];
    if (!drink) return;
    menu.classList.remove('active');

    const token = localStorage.getItem('casinoToken');
    const isGuest = !token && localStorage.getItem('casinoGuest');

    if (!token && !isGuest) { alert('Bitte zuerst anmelden!'); return; }

    if (isGuest) {
      let guestBaxt = parseInt(localStorage.getItem('guestBaxt') || '0');
      if (guestBaxt < drink.price) { alert('Nicht genug Baxt Coins!'); return; }
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
        if (data.error) { alert(data.error); return; }
      } catch(e) { alert('Fehler beim Kauf'); return; }
    }

    // Chat-Nachricht senden
    const socket = window._gameSocket || (window.io && io.sockets && Object.values(io.sockets)[0]);
    if (typeof addChat === 'function') addChat(drink.emoji, drink.emoji + ' ' + (localStorage.getItem('casinoGuest') ? JSON.parse(localStorage.getItem('casinoGuest')).username : 'Du') + ' hat ' + drink.msg + ' bestellt! Prost! 🥂');
    if (typeof addChatMsg === 'function') addChatMsg(drink.emoji, drink.msg + ' bestellt! Prost! 🥂');

    if (window._baxt) window._baxt.loadBalance();

    // Video abspielen
    if (drink.video) {
      const overlay = document.createElement('div');
      overlay.className = 'drink-video-overlay';
      const vid = document.createElement('video');
      vid.src = drink.video;
      vid.autoplay = true;
      vid.playsInline = true;
      vid.onended = () => overlay.remove();
      overlay.onclick = () => overlay.remove();
      overlay.appendChild(vid);
      document.body.appendChild(overlay);
    }
  }

  window._drinks = { buy: buyDrink, toggle: toggleDrinkMenu };
})();
