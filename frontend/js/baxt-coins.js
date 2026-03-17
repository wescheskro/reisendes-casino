// ===========================================================================
// BAXT COINS – Frontend Widget & Manager
// Reisendes Casino – Interne Krypto-Währung
// ===========================================================================

(function() {
  'use strict';

  // ── CSS einspritzen ──
  const style = document.createElement('style');
  style.textContent = `
    /* ===== BAXT COINS WIDGET ===== */
    .baxt-widget {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 9990;
      font-family: 'Segoe UI', sans-serif;
      cursor: grab;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .baxt-widget.dragging {
      cursor: grabbing;
      opacity: 0.9;
    }

    .baxt-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid #D4AF37;
      border-radius: 25px;
      padding: 6px 14px 6px 10px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 2px 12px rgba(212,175,55,0.3);
      user-select: none;
    }
    .baxt-badge:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 20px rgba(212,175,55,0.5);
    }

    .baxt-coin-icon {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(145deg, #D4AF37, #F4D03F);
      border: 2px solid #b8960f;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 14px;
      color: #1a1a2e;
      text-shadow: 0 1px 0 rgba(255,255,255,0.3);
      box-shadow: inset 0 -2px 4px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.5);
      flex-shrink: 0;
    }

    .baxt-amount {
      color: #F4D03F;
      font-weight: 700;
      font-size: 15px;
      text-shadow: 0 0 8px rgba(244,208,63,0.4);
      letter-spacing: 0.5px;
    }

    .baxt-topup {
      width: 24px; height: 24px; border-radius: 50%;
      background: linear-gradient(135deg, #27ae60, #2ecc71);
      border: 1.5px solid rgba(255,255,255,.2);
      color: #fff; font-size: 16px; font-weight: 900;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all .2s; flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(46,204,113,.3);
      line-height: 1;
    }
    .baxt-topup:hover { transform: scale(1.15); box-shadow: 0 4px 12px rgba(46,204,113,.5); }

    /* ── Dropdown Panel ── */
    .baxt-panel {
      position: absolute;
      top: 48px;
      right: 0;
      width: 300px;
      background: linear-gradient(180deg, #1a1a2e 0%, #0d1117 100%);
      border: 1px solid #D4AF37;
      border-radius: 16px;
      padding: 0;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(212,175,55,0.15);
      display: none;
      overflow: hidden;
    }
    .baxt-panel.open { display: block; animation: baxtSlideIn 0.25s ease; }

    @keyframes baxtSlideIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .baxt-panel-header {
      background: linear-gradient(135deg, #D4AF37, #b8960f);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .baxt-panel-header .baxt-coin-icon {
      width: 36px; height: 36px; font-size: 18px;
      border: 3px solid #1a1a2e;
    }
    .baxt-panel-title {
      color: #1a1a2e;
      font-size: 18px;
      font-weight: 800;
    }
    .baxt-panel-balance {
      color: #1a1a2e;
      font-size: 13px;
      opacity: 0.8;
    }

    .baxt-panel-body {
      padding: 12px 16px;
    }

    .baxt-action-btn {
      width: 100%;
      padding: 10px;
      margin-bottom: 8px;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: center;
    }
    .baxt-action-btn:hover { transform: translateY(-1px); }

    .baxt-btn-send {
      background: linear-gradient(135deg, #D4AF37, #F4D03F);
      color: #1a1a2e;
    }
    .baxt-btn-send:hover { box-shadow: 0 4px 15px rgba(212,175,55,0.5); }

    .baxt-btn-daily {
      background: linear-gradient(135deg, #27ae60, #2ecc71);
      color: #fff;
    }
    .baxt-btn-daily:hover { box-shadow: 0 4px 15px rgba(46,204,113,0.5); }
    .baxt-btn-daily:disabled {
      background: #333;
      color: #666;
      cursor: not-allowed;
      transform: none;
    }

    .baxt-btn-history {
      background: rgba(255,255,255,0.08);
      color: #ccc;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .baxt-btn-history:hover { background: rgba(255,255,255,0.15); }

    .baxt-btn-ranking {
      background: rgba(212,175,55,0.15);
      color: #D4AF37;
      border: 1px solid rgba(212,175,55,0.3);
    }
    .baxt-btn-ranking:hover { background: rgba(212,175,55,0.25); }

    /* ── Transfer Modal ── */
    .baxt-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: baxtFadeIn 0.2s ease;
    }
    @keyframes baxtFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .baxt-modal {
      background: linear-gradient(180deg, #1a1a2e 0%, #0d1117 100%);
      border: 2px solid #D4AF37;
      border-radius: 20px;
      padding: 24px;
      width: 320px;
      max-width: 90vw;
      box-shadow: 0 16px 48px rgba(0,0,0,0.8);
    }
    .baxt-modal h3 {
      color: #D4AF37;
      margin: 0 0 16px 0;
      font-size: 18px;
      text-align: center;
    }
    .baxt-modal input {
      width: 100%;
      padding: 10px 14px;
      margin-bottom: 10px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(212,175,55,0.3);
      border-radius: 10px;
      color: #fff;
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
    }
    .baxt-modal input:focus {
      border-color: #D4AF37;
      box-shadow: 0 0 10px rgba(212,175,55,0.3);
    }
    .baxt-modal input::placeholder { color: #666; }

    .baxt-modal-actions {
      display: flex;
      gap: 8px;
      margin-top: 14px;
    }
    .baxt-modal-actions button {
      flex: 1;
      padding: 10px;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .baxt-modal-cancel {
      background: rgba(255,255,255,0.1);
      color: #ccc;
    }
    .baxt-modal-confirm {
      background: linear-gradient(135deg, #D4AF37, #F4D03F);
      color: #1a1a2e;
    }

    .baxt-modal-error {
      color: #e74c3c;
      font-size: 12px;
      text-align: center;
      margin-top: 6px;
      min-height: 16px;
    }

    /* ── History List ── */
    .baxt-history-list {
      max-height: 250px;
      overflow-y: auto;
      padding: 8px 0;
    }
    .baxt-history-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 12px;
    }
    .baxt-history-item:last-child { border: none; }
    .baxt-history-reason { color: #aaa; }
    .baxt-history-amount { font-weight: 700; }
    .baxt-history-amount.positive { color: #2ecc71; }
    .baxt-history-amount.negative { color: #e74c3c; }

    /* ── Earn Toast ── */
    .baxt-toast {
      position: fixed;
      top: 60px;
      right: 12px;
      z-index: 9995;
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      border: 1px solid #D4AF37;
      border-radius: 12px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 20px rgba(212,175,55,0.4);
      animation: baxtToastIn 0.4s ease, baxtToastOut 0.4s ease 2.6s forwards;
      pointer-events: none;
    }
    @keyframes baxtToastIn {
      from { opacity: 0; transform: translateX(50px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes baxtToastOut {
      from { opacity: 1; transform: translateX(0); }
      to { opacity: 0; transform: translateX(50px); }
    }
    .baxt-toast-icon { font-size: 20px; }
    .baxt-toast-text { color: #F4D03F; font-weight: 600; font-size: 14px; }
    .baxt-toast-sub { color: #aaa; font-size: 11px; }

    /* ── Ranking ── */
    .baxt-ranking-list {
      max-height: 280px;
      overflow-y: auto;
    }
    .baxt-ranking-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 13px;
    }
    .baxt-ranking-pos {
      width: 24px;
      text-align: center;
      font-weight: 800;
      color: #D4AF37;
    }
    .baxt-ranking-name { flex: 1; color: #ddd; }
    .baxt-ranking-coins { color: #F4D03F; font-weight: 700; }
  `;
  document.head.appendChild(style);

  // ── State ──
  let baxtCoins = 0;
  let panelOpen = false;
  let panelView = 'main'; // main | history | ranking

  // ── XSS Protection ──
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── Token Helper ──
  function getToken() {
    return localStorage.getItem('casinoToken') || localStorage.getItem('token');
  }

  async function apiFetch(url, opts = {}) {
    const token = getToken();
    if (!token) return null;
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(opts.headers || {}) }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Fehler');
    }
    return res.json();
  }

  // ── Gast-Modus Helpers ──
  function isGuest() {
    return !getToken() && !!localStorage.getItem('casinoGuest');
  }

  function getGuestBaxt() {
    return parseInt(localStorage.getItem('guestBaxt') || '0');
  }

  // ── Balance laden ──
  async function loadBalance() {
    if (isGuest()) {
      baxtCoins = getGuestBaxt();
      updateBadge();
      return;
    }
    try {
      const data = await apiFetch('/api/baxt/balance');
      if (data) {
        baxtCoins = data.baxtCoins;
        updateBadge();
      }
    } catch (e) { /* nicht eingeloggt */ }
  }

  // ── Widget bauen ──
  function createWidget() {
    const widget = document.createElement('div');
    widget.className = 'baxt-widget';
    widget.id = 'baxt-widget';
    widget.innerHTML = `
      <div class="baxt-badge" onclick="window._baxt.togglePanel()">
        <div class="baxt-coin-icon">₿</div>
        <span class="baxt-amount" id="baxt-display">0</span>
      </div>
      <div class="baxt-topup" onclick="event.stopPropagation();window._baxt.topUp()" title="Aufladen">+</div>
      <div class="baxt-panel" id="baxt-panel"></div>
    `;

    document.body.appendChild(widget);

    // Gespeicherte Position wiederherstellen
    const saved = localStorage.getItem('baxt-widget-pos');
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        widget.style.top = pos.top + 'px';
        widget.style.right = 'auto';
        widget.style.left = pos.left + 'px';
      } catch (e) {}
    }

    // ── Drag-Logik (mit Threshold damit Klicks durchkommen) ──
    let pointerDown = false, dragging = false, startX, startY, origX, origY;
    const DRAG_THRESHOLD = 6; // px – erst ab dieser Distanz wird es ein Drag

    function onStart(e) {
      // Panel-Klicks & Topup nicht abfangen
      if (e.target.closest('.baxt-panel') || e.target.closest('.baxt-topup')) return;
      pointerDown = true;
      dragging = false;
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      const rect = widget.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
    }

    function onMove(e) {
      if (!pointerDown) return;
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      // Threshold prüfen – erst dann Drag starten
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        dragging = true;
        widget.classList.add('dragging');
        e.preventDefault();
      }

      if (e.cancelable) e.preventDefault();
      widget.style.right = 'auto';
      widget.style.left = Math.max(0, Math.min(window.innerWidth - 60, origX + dx)) + 'px';
      widget.style.top = Math.max(0, Math.min(window.innerHeight - 40, origY + dy)) + 'px';
    }

    function onEnd(e) {
      if (!pointerDown) return;
      pointerDown = false;
      if (dragging) {
        dragging = false;
        widget.classList.remove('dragging');
        localStorage.setItem('baxt-widget-pos', JSON.stringify({
          top: parseInt(widget.style.top),
          left: parseInt(widget.style.left)
        }));
        // Drag beenden → Click unterdrücken
        e.preventDefault();
        e.stopPropagation();
      }
      // Kein Drag → normaler Click geht durch (togglePanel etc.)
    }

    widget.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd, true);
    widget.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  function updateBadge() {
    const el = document.getElementById('baxt-display');
    if (el) el.textContent = baxtCoins.toLocaleString('de-DE');
  }

  // ── Panel Rendern ──
  function renderPanel() {
    const panel = document.getElementById('baxt-panel');
    if (!panel) return;

    if (panelView === 'history') {
      renderHistory(panel);
      return;
    }
    if (panelView === 'ranking') {
      renderRanking(panel);
      return;
    }

    // Main View
    const today = new Date().toISOString().split('T')[0];
    const dailyClaimed = localStorage.getItem('baxt-daily') === today;
    const guestMode = isGuest();

    panel.innerHTML = `
      <div class="baxt-panel-header">
        <div class="baxt-coin-icon" style="font-size:20px;width:40px;height:40px;">₿</div>
        <div>
          <div class="baxt-panel-title">${baxtCoins.toLocaleString('de-DE')} Baxt</div>
          <div class="baxt-panel-balance">${guestMode ? 'Gast-Guthaben' : 'Deine Baxt Coins'}</div>
        </div>
      </div>
      <div class="baxt-panel-body">
        ${guestMode ? `
          <div style="text-align:center;padding:8px 0 12px;color:#aaa;font-size:13px">
            Registriere dich fur 5.000 Bonus-Baxt!
          </div>
          <button class="baxt-action-btn baxt-btn-daily" onclick="window.location.href='/';" style="background:linear-gradient(135deg,#D4AF37,#F4D03F);color:#1a1a2e">
            Jetzt registrieren
          </button>
        ` : `
          <button class="baxt-action-btn baxt-btn-daily" ${dailyClaimed ? 'disabled' : ''} onclick="window._baxt.claimDaily()">
            🎁 ${dailyClaimed ? 'Morgen wieder!' : 'Täglicher Bonus (100 Baxt)'}
          </button>
          <button class="baxt-action-btn baxt-btn-send" onclick="window._baxt.openTransfer()">
            💸 Baxt Coins senden
          </button>
          <button class="baxt-action-btn baxt-btn-ranking" onclick="window._baxt.showRanking()">
            🏆 Baxt Rangliste
          </button>
          <button class="baxt-action-btn baxt-btn-history" onclick="window._baxt.showHistory()">
            📜 Verlauf anzeigen
          </button>
        `}
      </div>
    `;
  }

  // ── History View ──
  async function renderHistory(panel) {
    panel.innerHTML = `
      <div class="baxt-panel-header">
        <div style="cursor:pointer;font-size:18px;" onclick="window._baxt.backToMain()">←</div>
        <div>
          <div class="baxt-panel-title">Verlauf</div>
          <div class="baxt-panel-balance">Letzte Transaktionen</div>
        </div>
      </div>
      <div class="baxt-panel-body">
        <div style="text-align:center;color:#666;padding:20px;">Laden...</div>
      </div>
    `;

    try {
      const data = await apiFetch('/api/baxt/history');
      const body = panel.querySelector('.baxt-panel-body');
      if (!data.history || data.history.length === 0) {
        body.innerHTML = '<div style="text-align:center;color:#666;padding:20px;">Noch keine Transaktionen</div>';
        return;
      }

      const reasonLabels = {
        'poker_win': '♠ Poker gewonnen',
        'poker_round': '♠ Poker gespielt',
        'blackjack_win': '🃏 Blackjack gewonnen',
        'blackjack_bj': '🃏 Blackjack!',
        'blackjack_round': '🃏 Blackjack gespielt',
        'daily_login': '🎁 Täglicher Bonus',
        'level_up': '⬆ Level-Up Bonus',
        'slot_big_win': '🎰 Slot Großgewinn',
        'slot_win': '🎰 Slot Gewinn',
        'slot_bet': '🎰 Slot Einsatz',
        'transfer_out': '💸 Gesendet',
        'transfer_in': '💰 Erhalten'
      };

      let html = '<div class="baxt-history-list">';
      for (const tx of data.history) {
        const isOut = tx.type === 'transfer_out' || tx.type === 'slot_bet';
        const label = reasonLabels[tx.reason || tx.type] || tx.reason || tx.type;
        const extra = tx.to ? ` an ${escapeHtml(tx.to)}` : (tx.from ? ` von ${escapeHtml(tx.from)}` : '');
        html += `
          <div class="baxt-history-item">
            <div>
              <div class="baxt-history-reason">${label}${extra}</div>
              <div style="color:#555;font-size:10px;">${new Date(tx.timestamp).toLocaleString('de-DE')}</div>
            </div>
            <div class="baxt-history-amount ${isOut ? 'negative' : 'positive'}">
              ${isOut ? '-' : '+'}${tx.amount}
            </div>
          </div>
        `;
      }
      html += '</div>';
      body.innerHTML = html;
    } catch (e) {
      panel.querySelector('.baxt-panel-body').innerHTML = `<div style="color:#e74c3c;text-align:center;">Fehler: ${e.message}</div>`;
    }
  }

  // ── Ranking View ──
  async function renderRanking(panel) {
    panel.innerHTML = `
      <div class="baxt-panel-header">
        <div style="cursor:pointer;font-size:18px;" onclick="window._baxt.backToMain()">←</div>
        <div>
          <div class="baxt-panel-title">🏆 Baxt Rangliste</div>
          <div class="baxt-panel-balance">Top 20 Spieler</div>
        </div>
      </div>
      <div class="baxt-panel-body">
        <div style="text-align:center;color:#666;padding:20px;">Laden...</div>
      </div>
    `;

    try {
      const data = await apiFetch('/api/baxt/leaderboard');
      const body = panel.querySelector('.baxt-panel-body');

      if (!data.leaderboard || data.leaderboard.length === 0) {
        body.innerHTML = '<div style="text-align:center;color:#666;padding:20px;">Noch keine Spieler</div>';
        return;
      }

      const medals = ['🥇', '🥈', '🥉'];
      let html = '<div class="baxt-ranking-list">';
      data.leaderboard.forEach((u, i) => {
        html += `
          <div class="baxt-ranking-item">
            <div class="baxt-ranking-pos">${medals[i] || (i + 1)}</div>
            <div class="baxt-ranking-name">${u.username} <span style="color:#888;font-size:0.5em;">${u.rang}</span></div>
            <div class="baxt-ranking-coins">${u.baxtCoins.toLocaleString('de-DE')} ₿</div>
          </div>
        `;
      });
      html += '</div>';
      body.innerHTML = html;
    } catch (e) {
      panel.querySelector('.baxt-panel-body').innerHTML = `<div style="color:#e74c3c;text-align:center;">Fehler: ${e.message}</div>`;
    }
  }

  // ── Transfer Modal ──
  function openTransfer() {
    panelOpen = false;
    document.getElementById('baxt-panel')?.classList.remove('open');

    const overlay = document.createElement('div');
    overlay.className = 'baxt-modal-overlay';
    overlay.id = 'baxt-transfer-modal';
    overlay.innerHTML = `
      <div class="baxt-modal">
        <h3>💸 Baxt Coins senden</h3>
        <input type="text" id="baxt-recipient" placeholder="Spielername" autocomplete="off">
        <input type="number" id="baxt-send-amount" placeholder="Betrag (min. 10)" min="10" step="1">
        <div class="baxt-modal-error" id="baxt-send-error"></div>
        <div class="baxt-modal-actions">
          <button class="baxt-modal-cancel" onclick="window._baxt.closeTransfer()">Abbrechen</button>
          <button class="baxt-modal-confirm" onclick="window._baxt.doTransfer()">Senden</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeTransfer(); });
    setTimeout(() => document.getElementById('baxt-recipient')?.focus(), 100);
  }

  function closeTransfer() {
    document.getElementById('baxt-transfer-modal')?.remove();
  }

  function topUp() {
    panelOpen = false;
    document.getElementById('baxt-panel')?.classList.remove('open');
    // Shop öffnen (auf Hauptseite) oder Redirect
    if (window.openShop) {
      window.openShop();
    } else {
      window.location.href = '/?shop=1';
    }
  }

  function closeTopUp() {
    document.getElementById('baxt-topup-modal')?.remove();
  }

  async function doTopUp(amount) {
    try {
      const data = await apiFetch('/api/baxt/topup', {
        method: 'POST',
        body: JSON.stringify({ amount })
      });
      baxtCoins = data.baxtCoins;
      updateBadge();
      closeTopUp();
      showToast(`➕ ${amount.toLocaleString('de-DE')} ₿ aufgeladen!`, 'Konto aufgeladen');
    } catch (e) {
      const errorEl = document.getElementById('baxt-topup-error');
      if (errorEl) errorEl.textContent = e.message || 'Fehler beim Aufladen';
    }
  }

  async function doTransfer() {
    const recipient = document.getElementById('baxt-recipient')?.value?.trim();
    const amount = parseInt(document.getElementById('baxt-send-amount')?.value);
    const errorEl = document.getElementById('baxt-send-error');

    if (!recipient) { errorEl.textContent = 'Bitte Spielername eingeben'; return; }
    if (!amount || amount < 10) { errorEl.textContent = 'Mindestens 10 Baxt Coins'; return; }
    if (amount > baxtCoins) { errorEl.textContent = 'Nicht genug Baxt Coins'; return; }

    try {
      const data = await apiFetch('/api/baxt/transfer', {
        method: 'POST',
        body: JSON.stringify({ recipientUsername: recipient, amount })
      });
      baxtCoins = data.baxtCoins;
      updateBadge();
      closeTransfer();
      showToast(`💸 ${amount} Baxt an ${data.to} gesendet!`, 'Transfer erfolgreich');
    } catch (e) {
      errorEl.textContent = e.message;
    }
  }

  // ── Daily Claim ──
  async function claimDaily() {
    try {
      const data = await apiFetch('/api/baxt/daily', { method: 'POST' });
      baxtCoins = data.baxtCoins;
      updateBadge();
      localStorage.setItem('baxt-daily', new Date().toISOString().split('T')[0]);
      renderPanel();
      showToast(`🎁 +${data.baxtEarned} Baxt Coins!`, 'Täglicher Bonus');
    } catch (e) {
      if (e.message.includes('schon')) {
        localStorage.setItem('baxt-daily', new Date().toISOString().split('T')[0]);
        renderPanel();
      }
    }
  }

  // ── Toast Notification ──
  function showToast(text, sub) {
    const existing = document.querySelectorAll('.baxt-toast');
    existing.forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = 'baxt-toast';
    toast.innerHTML = `
      <div class="baxt-toast-icon">🪙</div>
      <div>
        <div class="baxt-toast-text">${escapeHtml(text)}</div>
        ${sub ? `<div class="baxt-toast-sub">${escapeHtml(sub)}</div>` : ''}
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  // ── Socket Events ──
  function setupSocketEvents() {
    // Warte auf globalen Socket (von Spielseiten)
    const checkSocket = setInterval(() => {
      const sock = window.socket || window._socket;
      if (sock) {
        clearInterval(checkSocket);

        sock.on('baxt:earned', (data) => {
          baxtCoins = data.total;
          updateBadge();
          const labels = {
            'poker_win': 'Poker gewonnen!',
            'poker_round': 'Poker gespielt',
            'blackjack_win': 'Blackjack gewonnen!',
            'blackjack_bj': 'Blackjack!',
            'blackjack_round': 'Blackjack gespielt'
          };
          showToast(`+${data.coins} Baxt`, labels[data.reason] || data.reason);
        });

        sock.on('baxt:received', (data) => {
          baxtCoins = data.total;
          updateBadge();
          showToast(`💰 +${data.amount} Baxt von ${data.from}`, 'Geschenk erhalten!');
        });
      }
    }, 500);

    // Nach 30s aufhören zu suchen
    setTimeout(() => clearInterval(checkSocket), 30000);
  }

  // ── Global API ──
  window._baxt = {
    togglePanel() {
      panelOpen = !panelOpen;
      panelView = 'main';
      const panel = document.getElementById('baxt-panel');
      if (panel) {
        panel.classList.toggle('open', panelOpen);
        if (panelOpen) renderPanel();
      }
    },
    showHistory() { panelView = 'history'; renderPanel(); },
    showRanking() { panelView = 'ranking'; renderPanel(); },
    backToMain() { panelView = 'main'; renderPanel(); },
    openTransfer() { openTransfer(); },
    closeTransfer() { closeTransfer(); },
    doTransfer() { doTransfer(); },
    claimDaily() { claimDaily(); },
    topUp() { topUp(); },
    closeTopUp() { closeTopUp(); },
    doTopUp(amount) { doTopUp(amount); },
    refresh() { loadBalance(); },
    getBalance() { return baxtCoins; }
  };

  // ── Init ──
  function init() {
    // Nicht in Embeds anzeigen
    if (new URLSearchParams(window.location.search).get('embed') === '1') return;

    const token = getToken();
    const guest = isGuest();
    if (!token && !guest) return; // Weder eingeloggt noch Gast → kein Widget

    createWidget();
    loadBalance();
    if (token) setupSocketEvents();

    // Gast-Balance live tracken (localStorage Änderungen)
    if (guest) {
      setInterval(() => {
        const gb = getGuestBaxt();
        if (gb !== baxtCoins) {
          baxtCoins = gb;
          updateBadge();
        }
      }, 1000);
    }

    // Click-Outside schließt Panel
    document.addEventListener('click', (e) => {
      if (panelOpen && !e.target.closest('.baxt-widget')) {
        panelOpen = false;
        document.getElementById('baxt-panel')?.classList.remove('open');
      }
    });
  }

  // Globaler Update-Callback für andere Scripts
  window.baxtUpdateBalance = function(newBalance) {
    baxtCoins = newBalance;
    updateBadge();
  };

  // Warten bis DOM bereit ist
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
