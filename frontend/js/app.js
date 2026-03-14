/* ============================================================
   REISENDES CASINO – Main Application
   ============================================================ */

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const API_BASE = window.location.origin + '/api';
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣', '🔔', '👑', '🎡', '🎪'];
const SYMBOL_WEIGHTS = [20, 18, 16, 14, 10, 8, 6, 4, 2, 2]; // lower = rarer

const MULTIPLIERS = {
  '👑': 50, '🎪': 40, '🎡': 35, '7️⃣': 25, '🔔': 15,
  '💎': 10, '🍇': 5, '🍊': 3, '🍋': 2, '🍒': 1.5
};

// Romani / Jenisch / Sinti phrases
const PHRASES = {
  welcome: 'Latscho Diwes!',
  welcomeSub: 'Willkommen im Reisendes Casino',
  goodLuck: 'Baxt hai Sastipe!',
  win: 'Baro Gewinn!',
  bigWin: 'Baro Baro!',
  spin: 'Drehen',
  deposit: 'Einzahlen',
  withdraw: 'Auszahlen',
  balance: 'Guthaben',
  games: 'Spiele',
  lobby: 'Lobby',
  profile: 'Profil',
  login: 'Anmelden',
  register: 'Registrieren',
  phone: 'Handynummer',
  pin: 'PIN',
  username: 'Spielername',
  hello: 'Latscho!',
  thanks: 'Parik tut!',
  casino: 'Reisendes Casino',
  promoTitle: 'Willkommensbonus',
  promoText: 'Sichere dir deinen Bonus auf die erste Einzahlung',
  hotGames: 'Beliebte Spiele',
  newGames: 'Neue Spiele',
  allGames: 'Alle Spiele',
  exclusive: 'Exklusiv',
  noAccount: 'Noch kein Konto?',
  hasAccount: 'Schon registriert?',
  playNow: 'Jetzt spielen',
  installApp: 'App installieren',
  installDesc: 'Reisendes Casino auf deinem Homescreen',
  online: 'Online',
  jackpot: 'Jackpot',
  fairPlay: 'Fair Play',
  support: 'Hilfe'
};

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------
let state = {
  user: null,
  token: localStorage.getItem('rc_token'),
  balance: 0,
  currentPage: 'lobby',
  currentBet: 1.00,
  isSpinning: false,
  games: []
};

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  // Try to restore session
  if (state.token) {
    try {
      const res = await apiCall('/wallet/balance');
      if (res.balance !== undefined) {
        state.balance = res.balance;
        // Get user info from stored data
        const stored = localStorage.getItem('rc_user');
        if (stored) state.user = JSON.parse(stored);
      }
    } catch (e) {
      // Token expired
      localStorage.removeItem('rc_token');
      state.token = null;
    }
  }

  loadGames();
  renderApp();
  setupEventListeners();
  checkPWAInstall();
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function apiCall(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const res = await fetch(API_BASE + endpoint, {
    ...options,
    headers: { ...headers, ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API Error');
  return data;
}

// ---------------------------------------------------------------------------
// GAMES
// ---------------------------------------------------------------------------
async function loadGames() {
  try {
    const data = await apiCall('/games');
    state.games = data.games;
  } catch (e) {
    // Use fallback
    state.games = [];
  }
  renderGameGrid();
}

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
async function handleRegister(e) {
  e.preventDefault();
  const phone = document.getElementById('reg-phone').value;
  const username = document.getElementById('reg-username').value;
  const pin = document.getElementById('reg-pin').value;

  if (!phone || !username || !pin) {
    showAuthError('reg', 'Bitte alle Felder ausfüllen');
    return;
  }

  try {
    const data = await apiCall('/auth/register', {
      method: 'POST',
      body: { phone, username, pin }
    });

    state.token = data.token;
    state.user = data.user;
    state.balance = data.user.balance;
    localStorage.setItem('rc_token', data.token);
    localStorage.setItem('rc_user', JSON.stringify(data.user));

    hideAuth();
    renderApp();
    showToast(`${PHRASES.hello} ${data.user.username}!`, 'success');
  } catch (err) {
    showAuthError('reg', err.message);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('login-phone').value;
  const pin = document.getElementById('login-pin').value;

  if (!phone || !pin) {
    showAuthError('login', 'Bitte alle Felder ausfüllen');
    return;
  }

  try {
    const data = await apiCall('/auth/login', {
      method: 'POST',
      body: { phone, pin }
    });

    state.token = data.token;
    state.user = data.user;
    state.balance = data.user.balance;
    localStorage.setItem('rc_token', data.token);
    localStorage.setItem('rc_user', JSON.stringify(data.user));

    hideAuth();
    renderApp();
    showToast(`${PHRASES.welcome} ${data.user.username}!`, 'success');
  } catch (err) {
    showAuthError('login', err.message);
  }
}

function showAuth(type) {
  document.getElementById('auth-login').classList.toggle('active', type === 'login');
  document.getElementById('auth-register').classList.toggle('active', type === 'register');
}

function hideAuth() {
  document.getElementById('auth-login').classList.remove('active');
  document.getElementById('auth-register').classList.remove('active');
}

function showAuthError(type, msg) {
  const el = document.getElementById(`${type}-error`);
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

function logout() {
  state.token = null;
  state.user = null;
  state.balance = 0;
  localStorage.removeItem('rc_token');
  localStorage.removeItem('rc_user');
  renderApp();
  showToast('Bis bald! Latsche Drom!', 'success');
}

// ---------------------------------------------------------------------------
// WALLET
// ---------------------------------------------------------------------------
async function handleDeposit(amount) {
  if (!state.token) { showAuth('login'); return; }

  try {
    const data = await apiCall('/wallet/deposit', {
      method: 'POST',
      body: { amount }
    });
    state.balance = data.balance;
    updateBalanceDisplay();
    showToast(`+${amount.toFixed(2)}€ ${PHRASES.thanks}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// SLOT MACHINE
// ---------------------------------------------------------------------------
function openSlot(gameId) {
  if (!state.token) { showAuth('login'); return; }

  const game = state.games.find(g => g.id === gameId);
  if (!game) return;

  // Playable games have their own page
  const GAME_PAGES = {
    'book-of-baxt': '/games/book-of-baxt.html'
  };

  if (GAME_PAGES[gameId]) {
    window.location.href = GAME_PAGES[gameId];
    return;
  }

  document.getElementById('slot-game-title').textContent = game.name;
  document.getElementById('slot-modal').classList.add('active');
  state.currentBet = 1.00;
  updateBetDisplay();
  updateSlotBalance();

  // Reset reels
  document.querySelectorAll('.reel .symbol').forEach(el => {
    el.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  });

  document.getElementById('win-display').textContent = '';
}

function closeSlot() {
  document.getElementById('slot-modal').classList.remove('active');
}

function changeBet(delta) {
  const bets = [0.20, 0.50, 1.00, 2.00, 5.00, 10.00, 20.00, 50.00];
  const currentIdx = bets.indexOf(state.currentBet);
  const newIdx = Math.max(0, Math.min(bets.length - 1, currentIdx + delta));
  state.currentBet = bets[newIdx];
  updateBetDisplay();
}

function updateBetDisplay() {
  document.getElementById('bet-value').textContent = state.currentBet.toFixed(2) + '€';
}

function updateSlotBalance() {
  const el = document.getElementById('slot-balance-val');
  if (el) el.textContent = state.balance.toFixed(2) + '€';
}

function getWeightedSymbol() {
  const totalWeight = SYMBOL_WEIGHTS.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  for (let i = 0; i < SYMBOLS.length; i++) {
    random -= SYMBOL_WEIGHTS[i];
    if (random <= 0) return SYMBOLS[i];
  }
  return SYMBOLS[0];
}

async function spin() {
  if (state.isSpinning) return;
  if (state.balance < state.currentBet) {
    showToast('Net genug Loveh! Bitte einzahlen.', 'error');
    return;
  }

  state.isSpinning = true;
  const spinBtn = document.getElementById('spin-btn');
  spinBtn.disabled = true;

  // Deduct bet
  state.balance -= state.currentBet;
  updateBalanceDisplay();
  updateSlotBalance();

  const winDisplay = document.getElementById('win-display');
  winDisplay.textContent = '';
  winDisplay.classList.remove('animate');

  // Spin animation
  const reels = document.querySelectorAll('.reel');
  const results = [];

  reels.forEach(reel => reel.classList.add('spinning'));

  // Stop reels one by one
  for (let i = 0; i < 3; i++) {
    await sleep(400 + i * 300);
    const symbol = getWeightedSymbol();
    results.push(symbol);
    reels[i].classList.remove('spinning');
    reels[i].querySelector('.symbol').textContent = symbol;
  }

  // Check win
  await sleep(200);
  let winAmount = 0;

  if (results[0] === results[1] && results[1] === results[2]) {
    // Three of a kind
    const multi = MULTIPLIERS[results[0]] || 2;
    winAmount = state.currentBet * multi;
  } else if (results[0] === results[1] || results[1] === results[2]) {
    // Two of a kind
    const matchSymbol = results[0] === results[1] ? results[0] : results[1];
    const multi = (MULTIPLIERS[matchSymbol] || 2) * 0.2;
    winAmount = state.currentBet * multi;
  }

  if (winAmount > 0) {
    winAmount = Math.round(winAmount * 100) / 100;
    state.balance += winAmount;
    updateBalanceDisplay();
    updateSlotBalance();

    winDisplay.textContent = `${winAmount >= state.currentBet * 10 ? PHRASES.bigWin : PHRASES.win} +${winAmount.toFixed(2)}€`;
    winDisplay.classList.add('animate');

    if (winAmount >= state.currentBet * 10) {
      celebrateWin();
    }
  }

  state.isSpinning = false;
  spinBtn.disabled = false;
}

function celebrateWin() {
  // Gold particle burst
  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: fixed;
      top: 50%; left: 50%;
      width: 8px; height: 8px;
      background: ${Math.random() > 0.5 ? '#D4AF37' : '#F4D03F'};
      border-radius: 50%;
      pointer-events: none;
      z-index: 9999;
      animation: particle ${0.5 + Math.random()}s ease-out forwards;
    `;
    document.body.appendChild(particle);

    const angle = (Math.PI * 2 * i) / 30;
    const dist = 100 + Math.random() * 150;
    particle.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0)`, opacity: 0 }
    ], { duration: 800 + Math.random() * 400, easing: 'ease-out' });

    setTimeout(() => particle.remove(), 1500);
  }
}

// ---------------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------------
function navigate(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.style.display = 'block';

  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  if (page === 'profile') renderProfile();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// RENDERING
// ---------------------------------------------------------------------------
function renderApp() {
  updateBalanceDisplay();
  renderGameGrid();
  if (!state.token) {
    document.querySelector('.nav-balance .amount').textContent = '0.00';
  }
}

function updateBalanceDisplay() {
  const el = document.querySelector('.nav-balance .amount');
  if (el) el.textContent = state.balance.toFixed(2);

  const profileBal = document.querySelector('.profile-balance-big');
  if (profileBal) profileBal.textContent = state.balance.toFixed(2) + '€';
}

function renderGameGrid(filter = 'all') {
  const grid = document.getElementById('games-grid');
  if (!grid) return;

  let games = state.games;
  if (filter === 'hot') games = games.filter(g => g.badge === 'hot');
  else if (filter === 'new') games = games.filter(g => g.badge === 'new');
  else if (filter === 'exclusive') games = games.filter(g => g.badge === 'exclusive');
  else if (filter === 'jackpot') games = games.filter(g => g.badge === 'jackpot');

  grid.innerHTML = games.map(game => `
    <div class="game-card" onclick="openSlot('${game.id}')">
      <div class="game-thumb">${game.img}</div>
      <div class="game-info">
        <div class="game-name">${game.name}</div>
        <div class="game-provider">${game.provider}</div>
      </div>
      ${game.badge ? `<span class="game-badge ${game.badge}">${game.badge === 'hot' ? 'HOT' : game.badge === 'new' ? 'NEU' : game.badge === 'jackpot' ? 'JACKPOT' : 'EXKLUSIV'}</span>` : ''}
      <div class="play-overlay">
        <div class="play-btn-circle">&#9654;</div>
      </div>
    </div>
  `).join('');
}

function renderProfile() {
  if (!state.user) return;
  const name = document.querySelector('.profile-name');
  const phone = document.querySelector('.profile-phone');
  if (name) name.textContent = state.user.username;
  if (phone) phone.textContent = state.user.phone;
  updateBalanceDisplay();
}

// ---------------------------------------------------------------------------
// FILTER TABS
// ---------------------------------------------------------------------------
function filterGames(filter, el) {
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderGameGrid(filter);
}

// ---------------------------------------------------------------------------
// UI HELPERS
// ---------------------------------------------------------------------------
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// PWA INSTALL
// ---------------------------------------------------------------------------
let deferredPrompt;

function checkPWAInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(() => {
      document.getElementById('pwa-prompt')?.classList.add('show');
    }, 5000);
  });
}

async function installPWA() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  if (result.outcome === 'accepted') {
    showToast('App installiert! Latsche!', 'success');
  }
  deferredPrompt = null;
  document.getElementById('pwa-prompt')?.classList.remove('show');
}

function dismissPWA() {
  document.getElementById('pwa-prompt')?.classList.remove('show');
}

// ---------------------------------------------------------------------------
// WALLET MODAL
// ---------------------------------------------------------------------------
function openWallet() {
  if (!state.token) { showAuth('login'); return; }
  document.getElementById('wallet-modal').classList.add('active');
}

function closeWallet() {
  document.getElementById('wallet-modal').classList.remove('active');
}

// ---------------------------------------------------------------------------
// EVENT LISTENERS
// ---------------------------------------------------------------------------
function setupEventListeners() {
  // Close modals on overlay click
  document.getElementById('slot-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSlot();
  });

  document.getElementById('wallet-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeWallet();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.getElementById('slot-modal')?.classList.contains('active')) {
      e.preventDefault();
      spin();
    }
    if (e.code === 'Escape') {
      closeSlot();
      closeWallet();
    }
  });
}
