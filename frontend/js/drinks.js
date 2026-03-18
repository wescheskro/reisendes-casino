// ===== GETRÄNKE-BESTELLUNG =====
// Shared Eiskübel + Menü für alle Spiele (Poker, Blackjack, Roulette, Bar)
// Embed-Modus (Landing Page Preview) wird übersprungen.

(function() {
  'use strict';
  if (new URLSearchParams(window.location.search).get('embed') === '1') return;

  const DRINKS = {
    whiskey:    { name: 'Whiskey',    price: 500,  img: '/img/whiskey.png',   emoji: '🥃', msg: 'eine Runde Whiskey',      video: '/games/sounds/whiskey-order.mp4' },
    vodka:      { name: 'Vodka',      price: 800,  img: '/img/vodka.jpg',     emoji: '🍸', msg: 'eine Runde Vodka',        video: '/games/sounds/vodka-order.mp4' },
    champagner: { name: 'Champagner', price: 1500, img: '/img/champagne.png', emoji: '🍾', msg: 'eine Flasche Champagner', video: '/games/sounds/champagne-order.mp4' }
  };

  // ── CSS ──
  const style = document.createElement('style');
  style.textContent = `
    .ice-bucket {
      position: fixed; bottom: 140px; right: 12px; z-index: 90;
      cursor: pointer; transition: transform .2s;
      filter: drop-shadow(0 4px 12px rgba(0,0,0,.6));
      -webkit-tap-highlight-color: transparent;
      touch-action: none; user-select: none;
    }
    .ice-bucket img { width: 65px; height: auto; pointer-events: none; }
    .ice-bucket:active { transform: scale(.9); }
    .drink-overlay {
      display: none; position: fixed; inset: 0; z-index: 100000;
      background: rgba(0,0,0,.75); backdrop-filter: blur(4px);
      justify-content: center; align-items: center;
    }
    .drink-overlay.open { display: flex; }
    .drink-card {
      background: linear-gradient(145deg,#1a1a2e,#16213e);
      border: 2px solid #D4AF37; border-radius: 16px;
      padding: 20px; min-width: 270px; max-width: 92vw;
    }
    .drink-card h3 {
      color: #D4AF37; font-family: 'Playfair Display', serif;
      font-size: 20px; text-align: center; margin: 0 0 16px;
    }
    .drink-item {
      display: flex; align-items: center; gap: 14px; padding: 14px;
      border: 1px solid rgba(212,175,55,.25); border-radius: 12px;
      margin-bottom: 10px; cursor: pointer; transition: .2s;
      -webkit-tap-highlight-color: rgba(212,175,55,.2);
    }
    .drink-item:active { background: rgba(212,175,55,.25); border-color: #D4AF37; }
    .drink-item img { width: 36px; height: 54px; object-fit: contain; }
    .drink-item-name { color: #F0E6D3; font-size: 16px; font-weight: 700; }
    .drink-item-price { color: #D4AF37; font-size: 14px; font-weight: 600; }
    .drink-cancel {
      display: block; width: 100%; padding: 12px; margin-top: 6px;
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
      border-radius: 10px; color: #aaa; font-size: 15px; cursor: pointer;
      text-align: center; -webkit-tap-highlight-color: rgba(255,255,255,.1);
    }
    .drink-cancel:active { background: rgba(255,255,255,.15); }
    .drink-toast {
      position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
      z-index: 100002; padding: 10px 24px; border-radius: 12px;
      font-size: 14px; font-weight: 700; pointer-events: none;
      animation: drinkToastIn .3s ease;
    }
    @keyframes drinkToastIn { from { opacity:0; transform: translateX(-50%) translateY(-10px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
  `;
  document.head.appendChild(style);

  // ── Eiskübel erstellen ──
  const bucket = document.createElement('div');
  bucket.className = 'ice-bucket';
  bucket.innerHTML = '<img src="/img/ice-bucket.png" alt="Getränke">';
  document.body.appendChild(bucket);

  // ── Menü-Overlay erstellen ──
  const overlay = document.createElement('div');
  overlay.className = 'drink-overlay';
  let cardHTML = '<div class="drink-card"><h3>🍸 Getränke bestellen</h3>';
  for (const [id, d] of Object.entries(DRINKS)) {
    cardHTML += `<div class="drink-item" data-id="${id}">
      <img src="${d.img}" alt="${d.name}">
      <div><div class="drink-item-name">${d.emoji} ${d.name}</div>
      <div class="drink-item-price">${d.price.toLocaleString('de-DE')} ₿</div></div>
    </div>`;
  }
  cardHTML += '<div class="drink-cancel">Abbrechen</div></div>';
  overlay.innerHTML = cardHTML;
  document.body.appendChild(overlay);

  // ── Eiskübel: Einfacher Click/Tap (KEIN Drag) ──
  bucket.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    openMenu();
  });

  // ── Menü: Event-Handler ──
  overlay.addEventListener('click', function(e) {
    const item = e.target.closest('.drink-item');
    const cancel = e.target.closest('.drink-cancel');
    if (item && item.dataset.id) {
      e.stopPropagation();
      buyDrink(item.dataset.id);
    } else if (cancel || e.target === overlay) {
      closeMenu();
    }
  });

  function openMenu() { overlay.classList.add('open'); }
  function closeMenu() { overlay.classList.remove('open'); }

  function showToast(msg, isError) {
    const t = document.createElement('div');
    t.className = 'drink-toast';
    t.textContent = msg;
    t.style.background = isError ? 'rgba(231,76,60,.9)' : 'rgba(46,204,113,.9)';
    t.style.color = '#fff';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ── Getränk kaufen ──
  async function buyDrink(drinkId) {
    const drink = DRINKS[drinkId];
    if (!drink) return;
    closeMenu();

    const token = localStorage.getItem('casinoToken');
    const isGuest = !token && localStorage.getItem('casinoGuest');

    if (!token && !isGuest) { showToast('Bitte zuerst anmelden!', true); return; }

    // Gast: lokales Guthaben
    if (isGuest) {
      let gb = parseInt(localStorage.getItem('guestBaxt') || '0');
      if (gb < drink.price) { showToast('Nicht genug Baxt Coins!', true); return; }
      gb -= drink.price;
      localStorage.setItem('guestBaxt', String(gb));
    } else {
      // Registrierter User: Server-API
      try {
        const res = await fetch('/api/baxt/slot-bet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ amount: drink.price })
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          showToast(data.error || 'Nicht genug Baxt Coins!', true);
          return;
        }
        // Balance sofort aktualisieren
        if (data.baxtCoins !== undefined) {
          try {
            const u = JSON.parse(localStorage.getItem('casinoUser') || '{}');
            if (u.id) { u.baxtCoins = data.baxtCoins; localStorage.setItem('casinoUser', JSON.stringify(u)); }
          } catch(e) {}
        }
      } catch(e) {
        showToast('Netzwerkfehler', true);
        return;
      }
    }

    // Erfolg!
    showToast(drink.emoji + ' ' + drink.name + ' bestellt! Prost! 🥂', false);

    // Balance-Widget aktualisieren (lokal + Top-Window)
    if (window._baxt) window._baxt.refresh();
    try { if (window.top && window.top._baxt) window.top._baxt.refresh(); } catch(e) {}

    // Chat-Nachricht (falls Funktionen existieren)
    try {
      if (typeof addChatMsg === 'function') addChatMsg(drink.emoji, drink.msg + ' bestellt! Prost! 🥂');
      if (typeof addChat === 'function') {
        const uname = isGuest ? JSON.parse(localStorage.getItem('casinoGuest')).username : 'Du';
        addChat(drink.emoji, drink.emoji + ' ' + uname + ' hat ' + drink.msg + ' bestellt! Prost! 🥂');
      }
    } catch(e) {}

    // Video abspielen
    if (drink.video) {
      playDrinkVideo(drink.video);
    }
  }

  function playDrinkVideo(src) {
    const vOverlay = document.createElement('div');
    vOverlay.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:pointer;';
    const vid = document.createElement('video');
    vid.src = src;
    vid.playsInline = true;
    vid.muted = true; // muted für autoplay auf Mobile
    vid.style.cssText = 'max-width:92%;max-height:80%;border-radius:16px;';

    function cleanup() { try { vOverlay.remove(); } catch(e) {} }
    vid.onended = cleanup;
    vid.onerror = cleanup;
    vOverlay.onclick = cleanup;

    vOverlay.appendChild(vid);
    document.body.appendChild(vOverlay);

    // Play starten (muted wegen Mobile autoplay policy)
    const playPromise = vid.play();
    if (playPromise) {
      playPromise.then(() => {
        // Nach kurzem Delay unmuten (User hat getippt = Interaction)
        setTimeout(() => { vid.muted = false; }, 200);
      }).catch(() => {
        // Autoplay komplett blockiert — Overlay entfernen
        cleanup();
      });
    }
  }

  function toggleMenu() { overlay.classList.contains('open') ? closeMenu() : openMenu(); }
  window._drinks = { buy: buyDrink, open: openMenu, close: closeMenu, toggle: toggleMenu };
})();
