const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const geoip = require('geoip-lite');
const http = require('http');
const { Server: SocketIO } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'reisendes-casino-secret-change-in-production';

// ---------------------------------------------------------------------------
// In-Memory DB (später PostgreSQL)
// ---------------------------------------------------------------------------
const db = {
  users: new Map(),
  transactions: new Map(),
  sessions: new Map(),
  leaderboard: new Map(),        // odgovor: weekKey -> Map(userId -> {totalWin, username, spins})
  weeklyWinners: []              // Archiv vergangener Gewinner
};

// Aktuelle Kalenderwoche berechnen
function getWeekKey() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - jan1) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Sonntag 23:59 nächster Reset
function getWeekEnd() {
  const now = new Date();
  const day = now.getDay(); // 0=So
  const diff = day === 0 ? 0 : 7 - day;
  const end = new Date(now);
  end.setDate(end.getDate() + diff);
  end.setHours(23, 59, 59, 999);
  return end;
}

// ---------------------------------------------------------------------------
// Blocked Countries (GlüStV compliance) – DE entfernt, App ist Fun-Casino
// ---------------------------------------------------------------------------
const BLOCKED_COUNTRIES = [];

// ---------------------------------------------------------------------------
// TRUHEN & ITEMS SYSTEM (Schausteller-Edition)
// ---------------------------------------------------------------------------
const RÄNGE = [
  { name: 'reisender',        minLevel: 1,  label: 'Reisender' },
  { name: 'schausteller',     minLevel: 5,  label: 'Schausteller' },
  { name: 'kirmes-könig',     minLevel: 10, label: 'Kirmes-König' },
  { name: 'glücksrad-meister',minLevel: 20, label: 'Glücksrad-Meister' },
  { name: 'wohnwagen-legende',minLevel: 35, label: 'Wohnwagen-Legende' },
  { name: 'baro',             minLevel: 50, label: 'Baro' }
];

const XP_PER_LEVEL = 500; // XP pro Level

function getLevelFromXP(xp) { return Math.floor(xp / XP_PER_LEVEL) + 1; }
function getRangFromLevel(level) {
  let rang = RÄNGE[0];
  for (const r of RÄNGE) { if (level >= r.minLevel) rang = r; }
  return rang;
}

const CHEST_TYPES = {
  holz:    { label: '🪵 Holztruhe',    itemCount: 1, rarities: ['common'] },
  bronze:  { label: '🥉 Bronze-Truhe', itemCount: 2, rarities: ['common', 'uncommon'] },
  silber:  { label: '🥈 Silber-Truhe', itemCount: 2, rarities: ['common', 'uncommon', 'rare'] },
  gold:    { label: '🥇 Gold-Truhe',   itemCount: 3, rarities: ['uncommon', 'rare', 'epic'] },
  diamant: { label: '💎 Diamant-Truhe',itemCount: 3, rarities: ['rare', 'epic', 'legendary'] }
};

// Alle Items – Schausteller Edition
const ALL_ITEMS = [
  // === KARTENRÜCKEN ===
  { id: 'cb-wohnwagen',    type: 'cardBack', name: 'Wohnwagen-Muster',     rarity: 'common',    icon: '🚐' },
  { id: 'cb-holz',         type: 'cardBack', name: 'Echtholz',             rarity: 'common',    icon: '🪵' },
  { id: 'cb-pferde-gold',  type: 'cardBack', name: 'Pferde-Gold',          rarity: 'uncommon',  icon: '🐴' },
  { id: 'cb-geige',        type: 'cardBack', name: 'Geigen-Ornament',      rarity: 'rare',      icon: '🎻' },
  { id: 'cb-glücksrad',    type: 'cardBack', name: 'Glücksrad',            rarity: 'rare',      icon: '🎡' },
  { id: 'cb-kristall',     type: 'cardBack', name: 'Kristallkugel',        rarity: 'epic',      icon: '🔮' },
  { id: 'cb-baro-gold',    type: 'cardBack', name: 'Baro Gold Edition',    rarity: 'legendary', icon: '👑' },

  // === AVATARE ===
  { id: 'av-schausteller',  type: 'avatar', name: 'Schausteller',          rarity: 'common',    icon: '🎪' },
  { id: 'av-wahrsagerin',   type: 'avatar', name: 'Wahrsagerin',           rarity: 'uncommon',  icon: '🔮' },
  { id: 'av-geigenspieler', type: 'avatar', name: 'Geigenspieler',         rarity: 'uncommon',  icon: '🎻' },
  { id: 'av-pferdehändler', type: 'avatar', name: 'Pferdehändler',         rarity: 'rare',      icon: '🐎' },
  { id: 'av-boxenbauer',    type: 'avatar', name: 'Boxenbauer',            rarity: 'rare',      icon: '🥊' },
  { id: 'av-rosenkönig',    type: 'avatar', name: 'Rosen-König',           rarity: 'epic',      icon: '🌹' },
  { id: 'av-baro',          type: 'avatar', name: 'Der Baro',              rarity: 'legendary', icon: '👑' },

  // === TISCH-DESIGNS ===
  { id: 'td-kirmes',        type: 'tableDesign', name: 'Kirmes-Lichter',   rarity: 'common',    icon: '🎠' },
  { id: 'td-holzwagen',     type: 'tableDesign', name: 'Wohnwagen-Holz',   rarity: 'uncommon',  icon: '🚐' },
  { id: 'td-lagerfeuer',    type: 'tableDesign', name: 'Lagerfeuer-Nacht', rarity: 'rare',      icon: '🔥' },
  { id: 'td-sternenacht',   type: 'tableDesign', name: 'Sternen-Nacht',    rarity: 'epic',      icon: '🌙' },
  { id: 'td-goldpalast',    type: 'tableDesign', name: 'Gold-Palast',      rarity: 'legendary', icon: '🏰' },

  // === RAHMEN ===
  { id: 'fr-holz',          type: 'frame', name: 'Holzrahmen',             rarity: 'common',    icon: '🪵' },
  { id: 'fr-hufeisen',      type: 'frame', name: 'Hufeisen',               rarity: 'uncommon',  icon: '🧲' },
  { id: 'fr-rosen',         type: 'frame', name: 'Rosenranken',            rarity: 'rare',      icon: '🌹' },
  { id: 'fr-gold-ornament', type: 'frame', name: 'Gold-Ornament',          rarity: 'epic',      icon: '✨' },
  { id: 'fr-flammen',       type: 'frame', name: 'Flammen',                rarity: 'legendary', icon: '🔥' },

  // === TITEL ===
  { id: 'ti-neuling',       type: 'title', name: 'Neuling',                rarity: 'common',    icon: '🌱' },
  { id: 'ti-kartenhai',     type: 'title', name: 'Kartenhai',              rarity: 'uncommon',  icon: '🦈' },
  { id: 'ti-glückspilz',    type: 'title', name: 'Glückspilz',             rarity: 'rare',      icon: '🍀' },
  { id: 'ti-tischlegende',  type: 'title', name: 'Tisch-Legende',         rarity: 'epic',      icon: '⭐' },
  { id: 'ti-poker-legende', type: 'title', name: 'Poker-Legende',         rarity: 'epic',      icon: '♠' },
  { id: 'ti-baro',          type: 'title', name: 'Baro',                   rarity: 'legendary', icon: '👑' },

  // === EMOTES ===
  { id: 'em-pferd',         type: 'emote', name: 'Pferd',                  rarity: 'common',    icon: '🐴' },
  { id: 'em-geige',         type: 'emote', name: 'Geige',                  rarity: 'common',    icon: '🎻' },
  { id: 'em-kristallkugel', type: 'emote', name: 'Kristallkugel',          rarity: 'uncommon',  icon: '🔮' },
  { id: 'em-feuer',         type: 'emote', name: 'Lagerfeuer',             rarity: 'uncommon',  icon: '🔥' },
  { id: 'em-krone',         type: 'emote', name: 'Krone',                  rarity: 'rare',      icon: '👑' },
  { id: 'em-rose',          type: 'emote', name: 'Rose',                   rarity: 'rare',      icon: '🌹' },
  { id: 'em-sterne',        type: 'emote', name: 'Sternregen',             rarity: 'epic',      icon: '🌟' },
  { id: 'em-diamant',       type: 'emote', name: 'Diamant',                rarity: 'legendary', icon: '💎' }
];

// Truhe öffnen – zufällige Items basierend auf Truhen-Typ
function openChest(chestType) {
  const chest = CHEST_TYPES[chestType];
  if (!chest) return [];
  const items = [];
  for (let i = 0; i < chest.itemCount; i++) {
    // Zufällige Rarität aus erlaubten
    const rarity = chest.rarities[Math.floor(Math.random() * chest.rarities.length)];
    const pool = ALL_ITEMS.filter(it => it.rarity === rarity);
    if (pool.length > 0) {
      items.push(pool[Math.floor(Math.random() * pool.length)]);
    }
  }
  return items;
}

// XP vergeben & Level-Up prüfen
function awardXP(user, amount) {
  const oldLevel = getLevelFromXP(user.xp);
  user.xp += amount;
  const newLevel = getLevelFromXP(user.xp);
  user.level = newLevel;
  user.rang = getRangFromLevel(newLevel).name;

  const results = { xpGained: amount, newXP: user.xp, newLevel, leveledUp: false, newChests: [] };

  // Level-Up Truhen vergeben
  if (newLevel > oldLevel) {
    results.leveledUp = true;
    for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
      let chestType = 'holz';
      if (lvl % 50 === 0) chestType = 'diamant';
      else if (lvl % 20 === 0) chestType = 'gold';
      else if (lvl % 10 === 0) chestType = 'silber';
      else if (lvl % 5 === 0) chestType = 'bronze';
      user.chestsReady.push(chestType);
      results.newChests.push({ type: chestType, label: CHEST_TYPES[chestType].label });
    }
  }
  return results;
}

// XP-Belohnungen
const XP_REWARDS = {
  roundPlayed: 10,      // Runde gespielt
  handWon: 25,          // Hand gewonnen
  dailyLogin: 50,       // Täglicher Login
  highscoreTop3: 100,   // Wochen-Top 3
  highscoreTop1: 250    // Wochen-Platz 1
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Geo-Blocking Middleware
app.use('/api', (req, res, next) => {
  // Skip geo-check in development
  if (process.env.NODE_ENV !== 'production') return next();

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const geo = geoip.lookup(ip);

  if (geo && BLOCKED_COUNTRIES.includes(geo.country)) {
    return res.status(403).json({
      error: 'REGION_BLOCKED',
      message: 'This service is not available in your region.'
    });
  }
  next();
});

// Auth Middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = db.users.get(decoded.userId);
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---------------------------------------------------------------------------
// AUTH ROUTES
// ---------------------------------------------------------------------------

// Register
app.post('/api/auth/register', async (req, res) => {
  const { phone, pin, username } = req.body;

  if (!phone || !pin || !username) {
    return res.status(400).json({ error: 'Phone, PIN and username required' });
  }

  // Check if phone already exists
  for (const [, user] of db.users) {
    if (user.phone === phone) {
      return res.status(409).json({ error: 'Phone already registered' });
    }
  }

  const userId = uuidv4();
  const hashedPin = await bcrypt.hash(pin, 10);

  const user = {
    id: userId,
    phone,
    username,
    pin: hashedPin,
    balance: 0,
    currency: 'EUR',
    createdAt: new Date().toISOString(),
    verified: false,
    // Progression System
    xp: 0,
    level: 1,
    rang: 'reisender',
    inventory: [],
    equipped: { avatar: 'default', cardBack: 'default', frame: 'default', title: 'Reisender', tableDesign: 'default', emote: null },
    chestsReady: [],       // Truhen die geöffnet werden können
    chestsOpened: 0,
    roundsPlayed: 0,
    handsWon: 0,
    highscoreAllTime: 0
  };

  db.users.set(userId, user);

  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });

  res.status(201).json({
    token,
    user: { id: userId, username, phone, balance: 0, currency: 'EUR' }
  });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { phone, pin } = req.body;

  let foundUser = null;
  for (const [, user] of db.users) {
    if (user.phone === phone) { foundUser = user; break; }
  }

  if (!foundUser) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPin = await bcrypt.compare(pin, foundUser.pin);
  if (!validPin) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ userId: foundUser.id }, JWT_SECRET, { expiresIn: '30d' });

  res.json({
    token,
    user: {
      id: foundUser.id,
      username: foundUser.username,
      phone: foundUser.phone,
      balance: foundUser.balance,
      currency: foundUser.currency
    }
  });
});

// ---------------------------------------------------------------------------
// WALLET ROUTES
// ---------------------------------------------------------------------------

// Get Balance
app.get('/api/wallet/balance', authMiddleware, (req, res) => {
  res.json({
    balance: req.user.balance,
    currency: req.user.currency
  });
});

// Deposit (Simulated - in production: crypto/payment provider webhook)
app.post('/api/wallet/deposit', authMiddleware, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  req.user.balance += amount;

  const tx = {
    id: uuidv4(),
    userId: req.user.id,
    type: 'deposit',
    amount,
    balanceAfter: req.user.balance,
    timestamp: new Date().toISOString()
  };
  db.transactions.set(tx.id, tx);

  res.json({ balance: req.user.balance, transaction: tx });
});

// Withdraw
app.post('/api/wallet/withdraw', authMiddleware, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (req.user.balance < amount) {
    return res.status(400).json({ error: 'Insufficient funds' });
  }

  req.user.balance -= amount;

  const tx = {
    id: uuidv4(),
    userId: req.user.id,
    type: 'withdrawal',
    amount,
    balanceAfter: req.user.balance,
    timestamp: new Date().toISOString()
  };
  db.transactions.set(tx.id, tx);

  res.json({ balance: req.user.balance, transaction: tx });
});

// Transaction History
app.get('/api/wallet/transactions', authMiddleware, (req, res) => {
  const userTx = [];
  for (const [, tx] of db.transactions) {
    if (tx.userId === req.user.id) userTx.push(tx);
  }
  userTx.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ transactions: userTx.slice(0, 50) });
});

// ---------------------------------------------------------------------------
// LEADERBOARD / TOPLISTE ROUTES
// ---------------------------------------------------------------------------

// Gewinn melden (nach jedem Spin mit Gewinn)
app.post('/api/leaderboard/submit', authMiddleware, (req, res) => {
  const { winAmount, game } = req.body;
  if (!winAmount || winAmount <= 0) {
    return res.status(400).json({ error: 'Invalid win amount' });
  }

  const weekKey = getWeekKey();
  if (!db.leaderboard.has(weekKey)) {
    db.leaderboard.set(weekKey, new Map());
  }

  const weekBoard = db.leaderboard.get(weekKey);
  const userId = req.user.id;

  if (!weekBoard.has(userId)) {
    weekBoard.set(userId, {
      userId,
      username: req.user.username,
      totalWin: 0,
      biggestWin: 0,
      spins: 0,
      lastGame: game || 'unknown'
    });
  }

  const entry = weekBoard.get(userId);
  entry.totalWin += winAmount;
  entry.spins += 1;
  if (winAmount > entry.biggestWin) entry.biggestWin = winAmount;
  entry.lastGame = game || entry.lastGame;
  entry.username = req.user.username; // falls geändert

  res.json({ success: true, yourTotal: entry.totalWin, yourRank: getRank(weekKey, userId) });
});

function getRank(weekKey, userId) {
  const weekBoard = db.leaderboard.get(weekKey);
  if (!weekBoard) return 0;
  const sorted = [...weekBoard.values()].sort((a, b) => b.totalWin - a.totalWin);
  return sorted.findIndex(e => e.userId === userId) + 1;
}

// Topliste abrufen (öffentlich)
app.get('/api/leaderboard', (req, res) => {
  const weekKey = getWeekKey();
  const weekBoard = db.leaderboard.get(weekKey);

  let entries = [];
  if (weekBoard) {
    entries = [...weekBoard.values()]
      .sort((a, b) => b.totalWin - a.totalWin)
      .slice(0, 20)
      .map((e, i) => ({
        rank: i + 1,
        username: e.username,
        totalWin: e.totalWin,
        biggestWin: e.biggestWin,
        spins: e.spins
      }));
  }

  res.json({
    week: weekKey,
    endsAt: getWeekEnd().toISOString(),
    prize: 'Wochenpreis für Platz 1!',
    entries
  });
});

// Eigene Position
app.get('/api/leaderboard/me', authMiddleware, (req, res) => {
  const weekKey = getWeekKey();
  const weekBoard = db.leaderboard.get(weekKey);

  if (!weekBoard || !weekBoard.has(req.user.id)) {
    return res.json({ rank: 0, totalWin: 0, spins: 0 });
  }

  const entry = weekBoard.get(req.user.id);
  res.json({
    rank: getRank(weekKey, req.user.id),
    totalWin: entry.totalWin,
    biggestWin: entry.biggestWin,
    spins: entry.spins
  });
});

// Vergangene Gewinner
app.get('/api/leaderboard/winners', (req, res) => {
  res.json({ winners: db.weeklyWinners.slice(-10).reverse() });
});

// Name-Verfügbarkeit prüfen
app.get('/api/check-name', (req, res) => {
  const name = (req.query.name || '').trim().toLowerCase();
  if (!name) return res.json({ available: false });
  // Registrierte User prüfen
  for (const [, user] of db.users) {
    if (user.username.toLowerCase() === name) {
      return res.json({ available: false });
    }
  }
  // Aktuell verbundene Spieler prüfen
  for (const [, sock] of io.sockets.sockets) {
    if (sock.user && sock.user.username.toLowerCase() === name) {
      return res.json({ available: false });
    }
  }
  res.json({ available: true });
});

// Live Online-Status
app.get('/api/online', (req, res) => {
  const total = io.sockets.sockets.size;
  // Spieler in Poker-Tischen
  let pokerPlayers = 0;
  for (const [, table] of tables.poker) {
    pokerPlayers += [...table.players.values()].filter(p => !p.spectator).length;
  }
  // Spieler in Blackjack-Tischen
  let bjPlayers = 0;
  for (const [, table] of tables.blackjack) {
    bjPlayers += [...table.players.values()].filter(p => !p.spectator).length;
  }
  res.json({ total, poker: pokerPlayers, blackjack: bjPlayers, slots: Math.max(0, total - pokerPlayers - bjPlayers) });
});

// Live Poker-Tische: aktuelle Spieler für Landing Page
app.get('/api/poker/tables', (req, res) => {
  const result = [];
  for (const [id, table] of tables.poker) {
    const seats = table.seats.map((pid, i) => {
      if (!pid) return null;
      const p = table.players.get(pid);
      if (!p) return null;
      return { seat: i, username: p.username, chips: p.chips, isBot: !!p.isBot };
    });
    result.push({
      id, phase: table.phase,
      pot: table.pot,
      playerCount: [...table.players.values()].filter(p => !p.spectator).length,
      seats
    });
  }
  res.json({ tables: result });
});

// Profil abrufen
app.get('/api/auth/profile', authMiddleware, (req, res) => {
  const weekKey = getWeekKey();
  const weekBoard = db.leaderboard.get(weekKey);
  let rank = 0, totalWin = 0;
  if (weekBoard && weekBoard.has(req.user.id)) {
    rank = getRank(weekKey, req.user.id);
    totalWin = weekBoard.get(req.user.id).totalWin;
  }

  const rangInfo = getRangFromLevel(req.user.level || 1);
  res.json({
    id: req.user.id,
    username: req.user.username,
    phone: req.user.phone,
    balance: req.user.balance,
    createdAt: req.user.createdAt,
    rank,
    weeklyWin: totalWin,
    // Progression
    xp: req.user.xp || 0,
    level: req.user.level || 1,
    rang: rangInfo.name,
    rangLabel: rangInfo.label,
    xpToNext: XP_PER_LEVEL - ((req.user.xp || 0) % XP_PER_LEVEL),
    equipped: req.user.equipped || {},
    chestsReady: req.user.chestsReady || [],
    inventoryCount: (req.user.inventory || []).length,
    roundsPlayed: req.user.roundsPlayed || 0,
    handsWon: req.user.handsWon || 0
  });
});

// Username ändern
app.put('/api/auth/profile', authMiddleware, (req, res) => {
  const { username } = req.body;
  if (!username || username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'Username muss 2-20 Zeichen sein' });
  }
  req.user.username = username;
  res.json({ success: true, username });
});

// ---------------------------------------------------------------------------
// TRUHEN & INVENTAR SYSTEM
// ---------------------------------------------------------------------------

// Inventar abrufen
app.get('/api/inventory', authMiddleware, (req, res) => {
  res.json({
    inventory: req.user.inventory || [],
    equipped: req.user.equipped || {},
    chestsReady: req.user.chestsReady || [],
    level: req.user.level || 1,
    xp: req.user.xp || 0,
    rang: getRangFromLevel(req.user.level || 1)
  });
});

// Truhe öffnen
app.post('/api/chest/open', authMiddleware, (req, res) => {
  if (!req.user.chestsReady || req.user.chestsReady.length === 0) {
    return res.status(400).json({ error: 'Keine Truhen verfügbar' });
  }

  const chestType = req.user.chestsReady.shift(); // Erste Truhe nehmen
  const items = openChest(chestType);

  // Items zum Inventar hinzufügen (keine Duplikate)
  const newItems = [];
  for (const item of items) {
    const alreadyHas = (req.user.inventory || []).some(i => i.id === item.id);
    if (!alreadyHas) {
      req.user.inventory.push(item);
      newItems.push({ ...item, isNew: true });
    } else {
      // Duplikat → Bonus-XP
      newItems.push({ ...item, isNew: false, bonusXP: 25 });
      req.user.xp += 25;
    }
  }

  req.user.chestsOpened = (req.user.chestsOpened || 0) + 1;

  res.json({
    chestType,
    chestLabel: CHEST_TYPES[chestType].label,
    items: newItems,
    chestsRemaining: req.user.chestsReady.length,
    inventory: req.user.inventory
  });
});

// Item ausrüsten
app.post('/api/inventory/equip', authMiddleware, (req, res) => {
  const { itemId } = req.body;
  const item = (req.user.inventory || []).find(i => i.id === itemId);
  if (!item) return res.status(400).json({ error: 'Item nicht im Inventar' });

  // Typ-Mapping: item.type → equipped-Slot
  const slotMap = { cardBack: 'cardBack', avatar: 'avatar', tableDesign: 'tableDesign', frame: 'frame', title: 'title', emote: 'emote' };
  const slot = slotMap[item.type];
  if (!slot) return res.status(400).json({ error: 'Unbekannter Item-Typ' });

  if (!req.user.equipped) req.user.equipped = {};
  req.user.equipped[slot] = item.id;

  // Titel speziell: den Namen als Wert
  if (item.type === 'title') req.user.equipped.titleName = item.name;

  res.json({ success: true, equipped: req.user.equipped });
});

// Item ablegen (zurück zu default)
app.post('/api/inventory/unequip', authMiddleware, (req, res) => {
  const { slot } = req.body;
  if (!req.user.equipped) req.user.equipped = {};
  req.user.equipped[slot] = 'default';
  if (slot === 'title') req.user.equipped.titleName = 'Reisender';
  res.json({ success: true, equipped: req.user.equipped });
});

// Alle Items-Katalog (für Frontend-Shop-Anzeige)
app.get('/api/items', (req, res) => {
  res.json({ items: ALL_ITEMS, chestTypes: CHEST_TYPES, ränge: RÄNGE });
});

// ---------------------------------------------------------------------------
// SHOP / MÜNZEN KAUFEN
// ---------------------------------------------------------------------------
const COIN_PACKAGES = {
  small:  { coins: 10000,  price: 1.99,  name: '10.000 Münzen' },
  medium: { coins: 60000,  price: 4.99,  name: '60.000 Münzen (inkl. Bonus)' },
  large:  { coins: 200000, price: 9.99,  name: '200.000 Münzen (inkl. Bonus)' },
  vip:    { coins: 700000, price: 24.99, name: '700.000 Münzen (inkl. Bonus)' }
};

// Kauf bestätigen (wird nach PayPal-Zahlung aufgerufen)
app.post('/api/shop/purchase', authMiddleware, (req, res) => {
  const { orderId, packageId, coins, amount, payerEmail } = req.body;

  if (!orderId || !packageId || !COIN_PACKAGES[packageId]) {
    return res.status(400).json({ error: 'Ungültiges Paket' });
  }

  const pkg = COIN_PACKAGES[packageId];

  // Transaktion speichern
  const tx = {
    id: uuidv4(),
    userId: req.user.id,
    type: 'coin_purchase',
    packageId,
    orderId,
    payerEmail: payerEmail || '',
    coins: pkg.coins,
    amountEur: pkg.price,
    timestamp: new Date().toISOString()
  };
  db.transactions.set(tx.id, tx);

  // Münzen gutschreiben
  req.user.balance += pkg.coins;

  console.log(`💰 KAUF: ${req.user.username} kaufte ${pkg.name} für ${pkg.price}€ (PayPal: ${orderId})`);

  res.json({
    success: true,
    coins: pkg.coins,
    newBalance: req.user.balance,
    transaction: tx
  });
});

// Kaufhistorie
app.get('/api/shop/history', authMiddleware, (req, res) => {
  const purchases = [];
  for (const [, tx] of db.transactions) {
    if (tx.userId === req.user.id && tx.type === 'coin_purchase') {
      purchases.push(tx);
    }
  }
  purchases.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ purchases: purchases.slice(0, 20) });
});

// Pakete anzeigen (öffentlich)
app.get('/api/shop/packages', (req, res) => {
  res.json({ packages: COIN_PACKAGES });
});

// ---------------------------------------------------------------------------
// GAME ROUTES (Hub88 / Aggregator compatible)
// ---------------------------------------------------------------------------

// Wallet callback - Balance
app.post('/api/hub88/user/balance', (req, res) => {
  const { user_id } = req.body;
  const user = db.users.get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    balance: Math.round(user.balance * 100),
    currency: user.currency
  });
});

// Wallet callback - Transaction (Bet/Win/Rollback)
app.post('/api/hub88/transaction', (req, res) => {
  const { user_id, amount, type, transaction_uuid, round_id } = req.body;
  const user = db.users.get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Idempotency check
  if (db.transactions.has(transaction_uuid)) {
    return res.json({
      balance: Math.round(user.balance * 100),
      transaction_uuid
    });
  }

  const amountEur = amount / 100;

  if (type === 'debit' || type === 'bet') {
    if (user.balance < amountEur) {
      return res.status(400).json({ error: 'RS_ERROR_NOT_ENOUGH_MONEY' });
    }
    user.balance -= amountEur;
  } else if (type === 'credit' || type === 'win') {
    user.balance += amountEur;
  } else if (type === 'rollback') {
    user.balance += amountEur;
  }

  const tx = {
    id: transaction_uuid,
    userId: user_id,
    type,
    amount: amountEur,
    roundId: round_id,
    balanceAfter: user.balance,
    timestamp: new Date().toISOString()
  };
  db.transactions.set(transaction_uuid, tx);

  res.json({
    balance: Math.round(user.balance * 100),
    transaction_uuid
  });
});

// ---------------------------------------------------------------------------
// DEMO: Game list (will be replaced by Hub88 Games API)
// ---------------------------------------------------------------------------
app.get('/api/games', (req, res) => {
  res.json({ games: DEMO_GAMES });
});

const DEMO_GAMES = [
  { id: 'big-bass', name: 'Big Bass Bonanza', provider: 'Pragmatic Play', rtp: 96.71, category: 'slots', badge: 'hot', img: '🎣' },
  { id: 'gates-olympus', name: 'Gates of Olympus', provider: 'Pragmatic Play', rtp: 96.50, category: 'slots', badge: 'hot', img: '⚡' },
  { id: 'book-of-baxt', name: 'Buch des Baxt', provider: 'Reisendes Casino', rtp: 96.21, category: 'slots', badge: 'exclusive', img: '📖', playable: true },
  { id: 'book-of-dead', name: 'Book of Dead', provider: "Play'n GO", rtp: 96.21, category: 'slots', badge: null, img: '📖' },
  { id: 'starburst', name: 'Starburst', provider: 'NetEnt', rtp: 96.09, category: 'slots', badge: null, img: '💎' },
  { id: 'sweet-bonanza', name: 'Sweet Bonanza', provider: 'Pragmatic Play', rtp: 96.51, category: 'slots', badge: 'hot', img: '🍬' },
  { id: 'wolf-gold', name: 'Wolf Gold', provider: 'Pragmatic Play', rtp: 96.01, category: 'slots', badge: 'jackpot', img: '🐺' },
  { id: 'gonzos-quest', name: "Gonzo's Quest", provider: 'NetEnt', rtp: 95.97, category: 'slots', badge: null, img: '🗿' },
  { id: 'reactoonz', name: 'Reactoonz', provider: "Play'n GO", rtp: 96.51, category: 'slots', badge: null, img: '👾' },
  { id: 'jammin-jars', name: "Jammin' Jars", provider: 'Push Gaming', rtp: 96.83, category: 'slots', badge: 'new', img: '🍓' },
  { id: 'dead-or-alive', name: 'Dead or Alive 2', provider: 'NetEnt', rtp: 96.80, category: 'slots', badge: null, img: '🤠' },
  { id: 'razor-shark', name: 'Razor Shark', provider: 'Push Gaming', rtp: 96.70, category: 'slots', badge: 'hot', img: '🦈' },
  { id: 'fire-joker', name: 'Fire Joker', provider: "Play'n GO", rtp: 96.15, category: 'slots', badge: null, img: '🃏' },
  { id: 'lucky-kirmes', name: 'Lucky Kirmes', provider: 'Reisendes Casino', rtp: 96.50, category: 'slots', badge: 'exclusive', img: '🎡' },
  { id: 'golden-wagen', name: 'Golden Wagen', provider: 'Reisendes Casino', rtp: 97.00, category: 'slots', badge: 'exclusive', img: '🚃' },
  { id: 'romani-fortune', name: 'Romani Fortune', provider: 'Reisendes Casino', rtp: 96.80, category: 'slots', badge: 'exclusive', img: '🔮' }
];

// ---------------------------------------------------------------------------
// Game Settings API (admin tuning — applies to all players)
// ---------------------------------------------------------------------------
const SETTINGS_FILE = path.join(__dirname, 'game-settings.json');

// Default settings
const DEFAULT_SETTINGS = {
  REEL_ACCEL_MS: 200,
  REEL_SHARED_MS: 1500,
  REEL_DECEL_MS: 1800,
  REEL_STAGGER_MS: 500,
  REEL_SPEED: 2.5,
  REEL_BOUNCE_MS: 550,
  REEL_BOUNCE_CELLS: 0.85,
  REEL_BOUNCE2: 0
};

// Valid setting keys and their ranges
const SETTING_RANGES = {
  REEL_ACCEL_MS:     { min: 50,  max: 800 },
  REEL_SHARED_MS:    { min: 500, max: 5000 },
  REEL_DECEL_MS:     { min: 300, max: 4000 },
  REEL_STAGGER_MS:   { min: 100, max: 1500 },
  REEL_SPEED:        { min: 0.5, max: 5.0 },
  REEL_BOUNCE_MS:    { min: 100, max: 800 },
  REEL_BOUNCE_CELLS: { min: 0,   max: 1.2 },
  REEL_BOUNCE2:      { min: 0,   max: 0.3 }
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch(e) {
    console.error('Error loading settings:', e.message);
  }
  return DEFAULT_SETTINGS;
}

// GET: load settings (all players)
app.get('/api/settings/reel-tuning', (req, res) => {
  res.json(loadSettings());
});

// POST: save settings (admin only, PIN protected)
app.post('/api/settings/reel-tuning', (req, res) => {
  const { pin, settings } = req.body;
  if (pin !== '1986') {
    return res.status(403).json({ error: 'Falscher PIN' });
  }
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Ungültige Einstellungen' });
  }

  // Validate and sanitize settings
  const sanitized = {};
  for (const [key, range] of Object.entries(SETTING_RANGES)) {
    const val = settings[key];
    if (val !== undefined && typeof val === 'number' && !isNaN(val)) {
      sanitized[key] = Math.min(range.max, Math.max(range.min, val));
    } else {
      sanitized[key] = DEFAULT_SETTINGS[key];
    }
  }

  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(sanitized, null, 2));
    res.json({ success: true, settings: sanitized });
  } catch(e) {
    res.status(500).json({ error: 'Speichern fehlgeschlagen' });
  }
});

// ---------------------------------------------------------------------------
// Catch-all: serve frontend
// ---------------------------------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ---------------------------------------------------------------------------
// MULTIPLAYER: BLACKJACK & POKER (Socket.IO)
// ---------------------------------------------------------------------------

// Karten-Deck
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
function createDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  // Shuffle
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
function cardValue(card) {
  if (['J','Q','K'].includes(card.rank)) return 10;
  if (card.rank === 'A') return 11;
  return parseInt(card.rank);
}
function handValue(cards) {
  let val = 0, aces = 0;
  for (const c of cards) {
    val += cardValue(c);
    if (c.rank === 'A') aces++;
  }
  while (val > 21 && aces > 0) { val -= 10; aces--; }
  return val;
}
function cardStr(c) { return c.rank + c.suit; }

// Table Storage
const tables = {
  blackjack: new Map(), // tableId -> { players, deck, dealer, phase, ... }
  poker: new Map()
};

// Socket auth
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = db.users.get(decoded.userId);
      if (user) { socket.user = user; return next(); }
    } catch(e) {}
  }
  // Gast-Spieler erlauben
  const guestName = socket.handshake.auth?.username;
  socket.user = { id: 'guest-' + uuidv4().slice(0,8), username: guestName || 'Gast-' + Math.floor(Math.random()*999), guest: true };
  next();
});

// ===================== BLACKJACK =====================
function createBJTable(id) {
  return {
    id, players: new Map(), seats: [null,null,null,null,null,null,null],
    deck: createDeck(), dealer: { cards: [], value: 0 },
    phase: 'waiting', // waiting, betting, playing, dealer, payout
    currentSeat: -1, minBet: 100, maxBet: 50000,
    timer: null
  };
}

function bjTableState(table, forSocket) {
  const seats = table.seats.map((pid, i) => {
    if (!pid) return null;
    const p = table.players.get(pid);
    if (!p) return null;
    return {
      seat: i, username: p.username, odgovor: p.odgovor || 0,
      bet: p.bet, cards: p.cards.map(cardStr), value: handValue(p.cards),
      status: p.status, isYou: forSocket && pid === forSocket.user.id
    };
  });
  const dealerCards = table.dealer.cards.map(cardStr);
  // Hide dealer hole card during play
  const showDealer = table.phase === 'dealer' || table.phase === 'payout' || table.phase === 'waiting';
  return {
    id: table.id,
    phase: table.phase,
    seats,
    dealer: {
      cards: showDealer ? dealerCards : [dealerCards[0], '??'],
      value: showDealer ? handValue(table.dealer.cards) : cardValue(table.dealer.cards[0] || {rank:'2'})
    },
    currentSeat: table.currentSeat,
    playerCount: [...table.players.values()].filter(p => !p.spectator).length
  };
}

function bjDraw(table) {
  if (table.deck.length < 10) table.deck = createDeck();
  return table.deck.pop();
}

function bjStartRound(table) {
  table.phase = 'betting';
  table.dealer = { cards: [], value: 0 };
  table.deck = createDeck();
  for (const [, p] of table.players) {
    p.cards = []; p.bet = 0; p.status = 'betting'; p.payout = 0;
  }
  emitBJState(table);

  // 15s zum Wetten
  if (table.timer) clearTimeout(table.timer);
  table.timer = setTimeout(() => bjDeal(table), 15000);
}

function bjDeal(table) {
  if (table.timer) clearTimeout(table.timer);
  // Spieler ohne Einsatz → spectator
  let activePlayers = 0;
  for (const [, p] of table.players) {
    if (p.bet > 0) { p.status = 'playing'; activePlayers++; }
    else { p.status = 'spectating'; }
  }
  if (activePlayers === 0) { table.phase = 'waiting'; emitBJState(table); return; }

  // Karten austeilen
  for (let round = 0; round < 2; round++) {
    for (let s = 0; s < 7; s++) {
      const pid = table.seats[s];
      if (!pid) continue;
      const p = table.players.get(pid);
      if (p.status !== 'playing') continue;
      p.cards.push(bjDraw(table));
    }
    table.dealer.cards.push(bjDraw(table));
  }

  table.phase = 'playing';
  // Ersten aktiven Spieler finden
  bjNextPlayer(table, -1);
}

function bjNextPlayer(table, afterSeat) {
  for (let s = afterSeat + 1; s < 7; s++) {
    const pid = table.seats[s];
    if (!pid) continue;
    const p = table.players.get(pid);
    if (p.status === 'playing' && handValue(p.cards) < 21) {
      table.currentSeat = s;
      emitBJState(table);
      // 30s Timer
      if (table.timer) clearTimeout(table.timer);
      table.timer = setTimeout(() => {
        p.status = 'stand';
        bjNextPlayer(table, s);
      }, 30000);
      return;
    }
    // Auto-stand bei 21
    if (p.status === 'playing') p.status = 'stand';
  }
  // Kein Spieler mehr → Dealer
  bjDealerPlay(table);
}

function bjDealerPlay(table) {
  if (table.timer) clearTimeout(table.timer);
  table.phase = 'dealer';
  table.currentSeat = -1;

  // Dealer zieht bis 17
  while (handValue(table.dealer.cards) < 17) {
    table.dealer.cards.push(bjDraw(table));
  }
  table.dealer.value = handValue(table.dealer.cards);

  // Auszahlung
  table.phase = 'payout';
  const dv = table.dealer.value;
  const dealerBust = dv > 21;

  for (const [, p] of table.players) {
    if (p.status === 'spectating' || p.status === 'betting') continue;
    const pv = handValue(p.cards);
    if (pv > 21) { p.payout = 0; p.status = 'bust'; }
    else if (pv === 21 && p.cards.length === 2) {
      // Blackjack!
      p.payout = Math.floor(p.bet * 2.5);
      p.status = 'blackjack';
    }
    else if (dealerBust || pv > dv) { p.payout = p.bet * 2; p.status = 'win'; }
    else if (pv === dv) { p.payout = p.bet; p.status = 'push'; }
    else { p.payout = 0; p.status = 'lose'; }
  }

  // XP vergeben für Blackjack
  for (const [pid, p] of table.players) {
    if (p.status === 'spectating' || p.status === 'betting') continue;
    const user = db.users.get(pid);
    if (user) {
      user.roundsPlayed = (user.roundsPlayed || 0) + 1;
      let xpAmount = XP_REWARDS.roundPlayed;
      if (p.status === 'win' || p.status === 'blackjack') {
        xpAmount = XP_REWARDS.handWon;
        user.handsWon = (user.handsWon || 0) + 1;
      }
      const xpResult = awardXP(user, xpAmount);
      const pSocket = [...io.sockets.sockets.values()].find(s => s.user?.id === pid);
      if (pSocket) pSocket.emit('xp:gained', xpResult);
    }
  }

  emitBJState(table);
  io.to('bj-' + table.id).emit('bj:results', {
    dealer: { cards: table.dealer.cards.map(cardStr), value: dv },
    results: [...table.players.values()].filter(p => p.status !== 'spectating').map(p => ({
      username: p.username, status: p.status, bet: p.bet, payout: p.payout
    }))
  });

  // Nächste Runde nach 5s
  table.timer = setTimeout(() => bjStartRound(table), 5000);
}

// ===================== POKER (Texas Hold'em) =====================
const BOT_NAMES = [
  'Django 🤖','Paco 🤖','Luca 🤖','Baro 🤖','Kalo 🤖',
  'Nuri 🤖','Sinto 🤖','Manusch 🤖','Pepe 🤖','Rico 🤖',
  'Valentino 🤖','Franco 🤖','Nando 🤖','Silvio 🤖','Drago 🤖'
];
const BOT_STYLES = ['vorsichtig','normal','aggressiv','verrückt'];
let botIdCounter = 0;

function createPokerTable(id) {
  return {
    id, players: new Map(), seats: [null,null,null,null,null,null],
    deck: [], community: [], pot: 0,
    phase: 'waiting', // waiting, preflop, flop, turn, river, showdown
    currentSeat: -1, dealerSeat: 0,
    minBet: 100, currentBet: 0,
    timer: null, round: 0
  };
}

// ===================== BOT AI =====================
function addBotToTable(table) {
  // Find empty seat
  let freeSeat = -1;
  for (let i = 0; i < 6; i++) {
    if (!table.seats[i]) { freeSeat = i; break; }
  }
  if (freeSeat < 0) return null; // Table full

  const botId = 'bot-' + (++botIdCounter);
  const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const style = BOT_STYLES[Math.floor(Math.random() * BOT_STYLES.length)];

  table.players.set(botId, {
    id: botId, username: name, socketId: null,
    cards: [], chips: 10000, folded: false, roundBet: 0,
    spectator: false, allIn: false, hasActed: false,
    isBot: true, botStyle: style
  });
  table.seats[freeSeat] = botId;

  io.to('pk-' + table.id).emit('poker:playerJoined', { username: name, seat: freeSeat });

  // Start game if enough players
  if (table.phase === 'waiting' && [...table.players.values()].filter(p => !p.spectator).length >= 2) {
    pokerStartRound(table);
  } else {
    emitPokerState(table);
  }
  return { name, seat: freeSeat, style };
}

function removeBotFromTable(table, botId) {
  const p = table.players.get(botId);
  if (!p || !p.isBot) return false;
  const seatIdx = table.seats.indexOf(botId);
  const wasCurrentSeat = (table.currentSeat === seatIdx);
  if (seatIdx >= 0) table.seats[seatIdx] = null;
  if (p) p.folded = true;
  table.players.delete(botId);
  io.to('pk-' + table.id).emit('poker:playerLeft', { username: p.username });
  const active = pokerActivePlayers(table);
  if (table.phase !== 'waiting' && active <= 1) {
    pokerShowdown(table);
  } else if (wasCurrentSeat && table.phase !== 'waiting') {
    // Bot war am Zug → nächsten Spieler finden
    pokerNextPlayer(table, seatIdx);
  } else {
    emitPokerState(table);
  }
  return true;
}

function botHandStrength(cards, community) {
  // Simple heuristic: 0.0 (trash) to 1.0 (amazing)
  if (!cards || cards.length < 2) return 0.2;

  const holeVals = cards.map(c => {
    if (c.rank === 'A') return 14; if (c.rank === 'K') return 13;
    if (c.rank === 'Q') return 12; if (c.rank === 'J') return 11;
    return parseInt(c.rank);
  });

  let strength = 0;

  // Pocket pair?
  if (holeVals[0] === holeVals[1]) {
    strength = 0.5 + (holeVals[0] / 14) * 0.4; // pair of 2s = 0.57, pair of As = 0.9
  } else {
    // High cards
    const high = Math.max(...holeVals);
    const low = Math.min(...holeVals);
    strength = (high + low) / 28 * 0.5; // normalize

    // Suited bonus
    if (cards[0].suit === cards[1].suit) strength += 0.08;

    // Connected bonus
    if (Math.abs(holeVals[0] - holeVals[1]) === 1) strength += 0.05;
    if (Math.abs(holeVals[0] - holeVals[1]) === 2) strength += 0.02;
  }

  // If community cards exist, evaluate actual hand
  if (community && community.length >= 3) {
    const hand = bestPokerHand(cards, community);
    // Boost based on hand rank
    const handBoost = [0.1, 0.3, 0.45, 0.55, 0.65, 0.75, 0.85, 0.92, 0.98];
    strength = Math.max(strength, handBoost[hand.rank] || 0.1);
  }

  return Math.min(1.0, Math.max(0.0, strength));
}

function botDecide(table, botPlayer) {
  const strength = botHandStrength(botPlayer.cards, table.community);
  const style = botPlayer.botStyle;
  const toCall = table.currentBet - botPlayer.roundBet;
  const potOdds = toCall > 0 ? toCall / (table.pot + toCall) : 0;
  const rng = Math.random();

  // Style modifiers
  let aggression = 0.5;  // base
  let foldThreshold = 0.3;
  let raiseThreshold = 0.6;
  let bluffChance = 0.08;

  switch (style) {
    case 'vorsichtig':
      foldThreshold = 0.4; raiseThreshold = 0.7; bluffChance = 0.03; aggression = 0.3; break;
    case 'normal':
      foldThreshold = 0.3; raiseThreshold = 0.6; bluffChance = 0.08; aggression = 0.5; break;
    case 'aggressiv':
      foldThreshold = 0.2; raiseThreshold = 0.45; bluffChance = 0.15; aggression = 0.7; break;
    case 'verrückt':
      foldThreshold = 0.1; raiseThreshold = 0.3; bluffChance = 0.25; aggression = 0.85; break;
  }

  // Decision
  if (toCall === 0) {
    // Can check for free
    if (strength > raiseThreshold || rng < bluffChance) {
      // Raise
      const raiseAmt = Math.floor(table.currentBet * 2 + (botPlayer.chips * strength * aggression * 0.3));
      return { action: 'raise', amount: Math.min(raiseAmt, botPlayer.chips) };
    }
    return { action: 'check' };
  }

  // Must pay to continue
  if (strength < foldThreshold && rng > bluffChance) {
    // Fold (but sometimes bluff)
    return { action: 'fold' };
  }

  if (strength > raiseThreshold || (rng < bluffChance && botPlayer.chips > toCall * 3)) {
    // Raise
    const raiseAmt = Math.max(table.currentBet * 2, Math.floor(table.currentBet + botPlayer.chips * strength * aggression * 0.25));
    if (strength > 0.85 && rng < aggression) {
      return { action: 'raise', amount: botPlayer.chips }; // All-in with strong hand
    }
    return { action: 'raise', amount: Math.min(raiseAmt, botPlayer.chips) };
  }

  // Call
  return { action: 'call' };
}

function executeBotAction(table, seat) {
  const pid = table.seats[seat];
  if (!pid) return;
  const p = table.players.get(pid);
  if (!p || !p.isBot || p.folded || p.spectator || p.allIn) return;

  const decision = botDecide(table, p);

  // Clear timer (bot acts, so no timeout needed)
  if (table.timer) clearTimeout(table.timer);

  switch (decision.action) {
    case 'fold':
      p.folded = true;
      p.hasActed = true;
      if (pokerActivePlayers(table) <= 1) pokerShowdown(table);
      else pokerNextPlayer(table, seat);
      break;

    case 'check':
      p.hasActed = true;
      pokerNextPlayer(table, seat);
      break;

    case 'call': {
      const toCall = table.currentBet - p.roundBet;
      if (toCall >= p.chips) {
        table.pot += p.chips; p.roundBet += p.chips; p.chips = 0; p.allIn = true;
      } else {
        p.chips -= toCall; p.roundBet = table.currentBet; table.pot += toCall;
      }
      p.hasActed = true;
      pokerNextPlayer(table, seat);
      break;
    }

    case 'raise': {
      const raise = Math.max(table.currentBet * 2, Math.min(decision.amount, p.chips + p.roundBet));
      const cost = raise - p.roundBet;
      p.chips -= cost; p.roundBet = raise; table.pot += cost;
      table.currentBet = raise;
      if (p.chips <= 0) p.allIn = true;
      for (const [otherId, op] of table.players) {
        if (otherId !== pid) op.hasActed = false;
      }
      p.hasActed = true;
      pokerNextPlayer(table, seat);
      break;
    }
  }
}

function pokerHandRank(cards) {
  // Simplified poker hand evaluator
  if (cards.length < 5) return { rank: 0, name: 'Unvollständig', high: 0 };
  const vals = cards.map(c => {
    if (c.rank === 'A') return 14;
    if (c.rank === 'K') return 13;
    if (c.rank === 'Q') return 12;
    if (c.rank === 'J') return 11;
    return parseInt(c.rank);
  }).sort((a,b) => b - a);

  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  // Count values
  const counts = {};
  vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const groups = Object.entries(counts).sort((a,b) => b[1] - a[1] || b[0] - a[0]);

  // Straight check
  let isStraight = false;
  const unique = [...new Set(vals)].sort((a,b) => b - a);
  if (unique.length >= 5) {
    for (let i = 0; i <= unique.length - 5; i++) {
      if (unique[i] - unique[i+4] === 4) { isStraight = true; break; }
    }
    // A-2-3-4-5
    if (unique.includes(14) && unique.includes(5) && unique.includes(4) && unique.includes(3) && unique.includes(2)) isStraight = true;
  }

  if (isFlush && isStraight) return { rank: 8, name: 'Straight Flush', high: vals[0] };
  if (groups[0][1] === 4) return { rank: 7, name: 'Vierling', high: parseInt(groups[0][0]) };
  if (groups[0][1] === 3 && groups[1] && groups[1][1] >= 2) return { rank: 6, name: 'Full House', high: parseInt(groups[0][0]) };
  if (isFlush) return { rank: 5, name: 'Flush', high: vals[0] };
  if (isStraight) return { rank: 4, name: 'Straße', high: vals[0] };
  if (groups[0][1] === 3) return { rank: 3, name: 'Drilling', high: parseInt(groups[0][0]) };
  if (groups[0][1] === 2 && groups[1] && groups[1][1] === 2) return { rank: 2, name: 'Zwei Paare', high: Math.max(parseInt(groups[0][0]), parseInt(groups[1][0])) };
  if (groups[0][1] === 2) return { rank: 1, name: 'Ein Paar', high: parseInt(groups[0][0]) };
  return { rank: 0, name: 'Höchste Karte', high: vals[0] };
}

function bestPokerHand(holeCards, community) {
  const all = [...holeCards, ...community];
  if (all.length < 5) return pokerHandRank(all);
  let best = { rank: -1 };
  // All 5-card combinations
  for (let i = 0; i < all.length; i++) {
    for (let j = i+1; j < all.length; j++) {
      for (let k = j+1; k < all.length; k++) {
        for (let l = k+1; l < all.length; l++) {
          for (let m = l+1; m < all.length; m++) {
            const hand = pokerHandRank([all[i],all[j],all[k],all[l],all[m]]);
            if (hand.rank > best.rank || (hand.rank === best.rank && hand.high > best.high)) best = hand;
          }
        }
      }
    }
  }
  return best;
}

function pokerTableState(table, forSocket) {
  const seats = table.seats.map((pid, i) => {
    if (!pid) return null;
    const p = table.players.get(pid);
    if (!p) return null;
    const isYou = forSocket && pid === forSocket.user.id;
    return {
      seat: i, username: p.username, chips: p.chips,
      bet: p.roundBet || 0, folded: p.folded,
      cards: isYou ? p.cards.map(cardStr) : (table.phase === 'showdown' && !p.folded ? p.cards.map(cardStr) : ['??','??']),
      isYou, isDealer: i === table.dealerSeat, isBot: !!p.isBot,
      botStyle: p.isBot ? p.botStyle : null,
      peeking: !!p.peeking,
      handName: table.phase === 'showdown' && !p.folded ? bestPokerHand(p.cards, table.community).name : null
    };
  });
  return {
    id: table.id, phase: table.phase, seats,
    community: table.community.map(cardStr),
    pot: table.pot, currentBet: table.currentBet,
    currentSeat: table.currentSeat,
    playerCount: [...table.players.values()].filter(p => !p.spectator).length
  };
}

function pokerActivePlayers(table) {
  return table.seats.filter(pid => {
    if (!pid) return false;
    const p = table.players.get(pid);
    return p && !p.folded && !p.spectator;
  }).length;
}

function pokerNextPlayer(table, afterSeat) {
  for (let i = 1; i <= 6; i++) {
    const s = (afterSeat + i) % 6;
    const pid = table.seats[s];
    if (!pid) continue;
    const p = table.players.get(pid);
    if (!p || p.folded || p.spectator || p.allIn) continue;

    // Check if this player already matched the current bet (and has acted)
    if (p.hasActed && p.roundBet >= table.currentBet) continue;

    table.currentSeat = s;
    emitPokerState(table);

    // Bot plays automatically with delay
    if (p.isBot) {
      const delay = 1500 + Math.floor(Math.random() * 2500); // 1.5-4s "thinking" time
      if (table.timer) clearTimeout(table.timer);
      table.timer = setTimeout(() => executeBotAction(table, s), delay);
      return;
    }

    if (table.timer) clearTimeout(table.timer);
    table.timer = setTimeout(() => {
      // Auto-fold bei Timeout
      p.folded = true;
      if (pokerActivePlayers(table) <= 1) pokerShowdown(table);
      else pokerNextPlayer(table, s);
    }, 30000);
    return;
  }
  // Alle haben gehandelt → nächste Phase
  pokerNextPhase(table);
}

function pokerNextPhase(table) {
  if (table.timer) clearTimeout(table.timer);
  // Reset round bets and hasActed
  for (const [, p] of table.players) { p.roundBet = 0; p.hasActed = false; }
  table.currentBet = 0;

  if (pokerActivePlayers(table) <= 1) { pokerShowdown(table); return; }

  if (table.phase === 'preflop') {
    table.phase = 'flop';
    table.community.push(table.deck.pop(), table.deck.pop(), table.deck.pop());
  } else if (table.phase === 'flop') {
    table.phase = 'turn';
    table.community.push(table.deck.pop());
  } else if (table.phase === 'turn') {
    table.phase = 'river';
    table.community.push(table.deck.pop());
  } else if (table.phase === 'river') {
    pokerShowdown(table);
    return;
  }
  // Start betting from after dealer
  pokerNextPlayer(table, table.dealerSeat);
}

function pokerShowdown(table) {
  if (table.timer) clearTimeout(table.timer);
  table.phase = 'showdown';
  table.currentSeat = -1;

  // Find winner
  let bestRank = -1, bestHigh = -1, winnerId = null;
  for (const [pid, p] of table.players) {
    if (p.folded || p.spectator) continue;
    const hand = bestPokerHand(p.cards, table.community);
    p.handResult = hand;
    if (hand.rank > bestRank || (hand.rank === bestRank && hand.high > bestHigh)) {
      bestRank = hand.rank; bestHigh = hand.high; winnerId = pid;
    }
  }

  if (winnerId) {
    const winner = table.players.get(winnerId);
    winner.chips += table.pot;
    io.to('pk-' + table.id).emit('poker:winner', {
      username: winner.username, pot: table.pot,
      hand: winner.handResult?.name || 'Gewinner'
    });

    // XP für Gewinner vergeben
    if (!winner.isBot) {
      const user = db.users.get(winnerId);
      if (user) {
        user.handsWon = (user.handsWon || 0) + 1;
        const xpResult = awardXP(user, XP_REWARDS.handWon);
        const winnerSocket = [...io.sockets.sockets.values()].find(s => s.user?.id === winnerId);
        if (winnerSocket) {
          winnerSocket.emit('xp:gained', xpResult);
        }
      }
    }
  }

  // XP für alle menschlichen Spieler (Runde gespielt)
  for (const [pid, p] of table.players) {
    if (p.isBot || p.spectator) continue;
    const user = db.users.get(pid);
    if (user) {
      user.roundsPlayed = (user.roundsPlayed || 0) + 1;
      if (pid !== winnerId) { // Gewinner hat schon XP bekommen
        const xpResult = awardXP(user, XP_REWARDS.roundPlayed);
        const pSocket = [...io.sockets.sockets.values()].find(s => s.user?.id === pid);
        if (pSocket) pSocket.emit('xp:gained', xpResult);
      }
    }
  }

  emitPokerState(table);

  // Nächste Runde nach 5s
  table.timer = setTimeout(() => pokerStartRound(table), 5000);
}

function pokerStartRound(table) {
  if (table.timer) clearTimeout(table.timer);
  // Remove players with no chips
  for (const [pid, p] of table.players) {
    if (p.chips <= 0 && !p.spectator) {
      p.spectator = true;
    }
  }

  const active = table.seats.filter(pid => {
    if (!pid) return false;
    const p = table.players.get(pid);
    return p && !p.spectator;
  });

  if (active.length < 2) {
    table.phase = 'waiting';
    emitPokerState(table);
    return;
  }

  table.deck = createDeck();
  table.community = [];
  table.pot = 0;
  table.currentBet = 0;
  table.phase = 'preflop';

  // Move dealer button
  do { table.dealerSeat = (table.dealerSeat + 1) % 6; }
  while (!table.seats[table.dealerSeat] || table.players.get(table.seats[table.dealerSeat])?.spectator);

  // Reset players, deal cards
  for (const [, p] of table.players) {
    p.cards = []; p.folded = false; p.roundBet = 0; p.allIn = false; p.hasActed = false;
    if (!p.spectator) {
      p.cards = [table.deck.pop(), table.deck.pop()];
    }
  }

  // Blinds
  const sb = table.minBet / 2;
  const bb = table.minBet;
  let blindCount = 0;
  for (let i = 1; i <= 6 && blindCount < 2; i++) {
    const s = (table.dealerSeat + i) % 6;
    const pid = table.seats[s];
    if (!pid) continue;
    const p = table.players.get(pid);
    if (!p || p.spectator) continue;
    blindCount++;
    const blind = blindCount === 1 ? sb : bb;
    p.chips -= blind; p.roundBet = blind; table.pot += blind;
    if (blindCount === 2) table.currentBet = bb;
  }

  // Start from after big blind
  pokerNextPlayer(table, (table.dealerSeat + 2) % 6);
}

function emitBJState(table) {
  const room = io.sockets.adapter.rooms.get('bj-' + table.id);
  if (room) {
    for (const sockId of room) {
      const sock = io.sockets.sockets.get(sockId);
      if (sock) sock.emit('bj:state', bjTableState(table, sock));
    }
  }
}

function emitPokerState(table) {
  const room = io.sockets.adapter.rooms.get('pk-' + table.id);
  if (room) {
    for (const sockId of room) {
      const sock = io.sockets.sockets.get(sockId);
      if (sock) sock.emit('poker:state', pokerTableState(table, sock));
    }
  }
}

// Default tables
['tisch-1', 'tisch-2', 'tisch-3'].forEach(id => {
  tables.blackjack.set(id, createBJTable(id));
});
['tisch-1', 'tisch-2'].forEach(id => {
  tables.poker.set(id, createPokerTable(id));
});

// ===================== SOCKET EVENTS =====================
io.on('connection', (socket) => {
  console.log(`🔌 ${socket.user.username} connected`);

  // --- LOBBY ---
  socket.on('lobby:tables', () => {
    const bj = [...tables.blackjack.values()].map(t => ({
      id: t.id, game: 'blackjack', players: [...t.players.values()].filter(p => !p.spectator).length,
      maxPlayers: 7, phase: t.phase, minBet: t.minBet
    }));
    const pk = [...tables.poker.values()].map(t => ({
      id: t.id, game: 'poker', players: [...t.players.values()].filter(p => !p.spectator).length,
      maxPlayers: 6, phase: t.phase, minBet: t.minBet
    }));
    socket.emit('lobby:tables', { blackjack: bj, poker: pk });
  });

  // --- BLACKJACK ---
  socket.on('bj:join', ({ tableId, seat }) => {
    const table = tables.blackjack.get(tableId);
    if (!table) return socket.emit('error', 'Tisch nicht gefunden');

    socket.join('bj-' + tableId);
    socket._bjTable = tableId;

    // Spectator mode (seat = -1)
    if (seat < 0 || seat > 6) {
      socket.emit('bj:state', bjTableState(table, socket));
      return;
    }

    if (table.seats[seat] && table.seats[seat] !== socket.user.id) return socket.emit('error', 'Platz belegt');

    // Remove from old seat if switching
    const oldSeat = table.seats.indexOf(socket.user.id);
    if (oldSeat >= 0 && oldSeat !== seat) {
      table.seats[oldSeat] = null;
    }

    if (!table.players.has(socket.user.id)) {
      table.players.set(socket.user.id, {
        id: socket.user.id, username: socket.user.username, socketId: socket.id,
        cards: [], bet: 0, status: 'waiting', payout: 0
      });
    }
    table.seats[seat] = socket.user.id;
    table.players.get(socket.user.id).socketId = socket.id;

    io.to('bj-' + tableId).emit('bj:playerJoined', { username: socket.user.username, seat });
    emitBJState(table);

    // Start game if enough players and waiting
    if (table.phase === 'waiting' && [...table.players.values()].filter(p => !p.spectator).length >= 1) {
      bjStartRound(table);
    }
  });

  socket.on('bj:bet', ({ amount }) => {
    const table = tables.blackjack.get(socket._bjTable);
    if (!table || table.phase !== 'betting') return;
    const p = table.players.get(socket.user.id);
    if (!p) return;
    p.bet = Math.max(table.minBet, Math.min(table.maxBet, amount));
    p.status = 'ready';
    emitBJState(table);

    // Check if all have bet
    const allReady = [...table.players.values()].every(p => p.status === 'ready' || p.status === 'spectating');
    if (allReady) bjDeal(table);
  });

  socket.on('bj:hit', () => {
    const table = tables.blackjack.get(socket._bjTable);
    if (!table || table.phase !== 'playing') return;
    const pid = table.seats[table.currentSeat];
    if (pid !== socket.user.id) return;
    const p = table.players.get(pid);
    p.cards.push(bjDraw(table));
    if (handValue(p.cards) >= 21) {
      p.status = handValue(p.cards) > 21 ? 'bust' : 'stand';
      bjNextPlayer(table, table.currentSeat);
    } else {
      emitBJState(table);
    }
  });

  socket.on('bj:stand', () => {
    const table = tables.blackjack.get(socket._bjTable);
    if (!table || table.phase !== 'playing') return;
    const pid = table.seats[table.currentSeat];
    if (pid !== socket.user.id) return;
    table.players.get(pid).status = 'stand';
    bjNextPlayer(table, table.currentSeat);
  });

  socket.on('bj:double', () => {
    const table = tables.blackjack.get(socket._bjTable);
    if (!table || table.phase !== 'playing') return;
    const pid = table.seats[table.currentSeat];
    if (pid !== socket.user.id) return;
    const p = table.players.get(pid);
    if (p.cards.length !== 2) return; // Only on first 2 cards
    p.bet *= 2;
    p.cards.push(bjDraw(table));
    p.status = handValue(p.cards) > 21 ? 'bust' : 'stand';
    bjNextPlayer(table, table.currentSeat);
  });

  // --- POKER ---
  socket.on('poker:join', ({ tableId, seat }) => {
    const table = tables.poker.get(tableId);
    if (!table) return socket.emit('error', 'Tisch nicht gefunden');

    socket.join('pk-' + tableId);
    socket._pkTable = tableId;

    // Spectator mode (seat = -1)
    if (seat < 0 || seat > 5) {
      socket.emit('poker:state', pokerTableState(table, socket));
      return;
    }

    if (table.seats[seat] && table.seats[seat] !== socket.user.id) return socket.emit('error', 'Platz belegt');

    // Remove from old seat if switching
    const oldSeat = table.seats.indexOf(socket.user.id);
    if (oldSeat >= 0 && oldSeat !== seat) {
      table.seats[oldSeat] = null;
    }

    if (!table.players.has(socket.user.id)) {
      table.players.set(socket.user.id, {
        id: socket.user.id, username: socket.user.username, socketId: socket.id,
        cards: [], chips: 10000, folded: false, roundBet: 0, spectator: false, allIn: false
      });
    }
    table.seats[seat] = socket.user.id;
    table.players.get(socket.user.id).socketId = socket.id;

    io.to('pk-' + tableId).emit('poker:playerJoined', { username: socket.user.username, seat });
    emitPokerState(table);

    if (table.phase === 'waiting' && [...table.players.values()].filter(p => !p.spectator).length >= 2) {
      pokerStartRound(table);
    }
  });

  socket.on('poker:call', () => {
    const table = tables.poker.get(socket._pkTable);
    if (!table || table.currentSeat < 0) return;
    const pid = table.seats[table.currentSeat];
    if (pid !== socket.user.id) return;
    const p = table.players.get(pid);
    const toCall = table.currentBet - p.roundBet;
    if (toCall >= p.chips) {
      table.pot += p.chips; p.roundBet += p.chips; p.chips = 0; p.allIn = true;
    } else {
      p.chips -= toCall; p.roundBet = table.currentBet; table.pot += toCall;
    }
    p.hasActed = true;
    pokerNextPlayer(table, table.currentSeat);
  });

  socket.on('poker:raise', ({ amount }) => {
    const table = tables.poker.get(socket._pkTable);
    if (!table || table.currentSeat < 0) return;
    const pid = table.seats[table.currentSeat];
    if (pid !== socket.user.id) return;
    const p = table.players.get(pid);
    const raise = Math.max(table.currentBet * 2, Math.min(amount, p.chips + p.roundBet));
    const cost = raise - p.roundBet;
    p.chips -= cost; p.roundBet = raise; table.pot += cost;
    table.currentBet = raise;
    if (p.chips <= 0) p.allIn = true;
    // Reset hasActed for all other players (they need to respond to the raise)
    for (const [otherId, op] of table.players) {
      if (otherId !== pid) op.hasActed = false;
    }
    p.hasActed = true;
    pokerNextPlayer(table, table.currentSeat);
  });

  socket.on('poker:fold', () => {
    const table = tables.poker.get(socket._pkTable);
    if (!table || table.currentSeat < 0) return;
    const pid = table.seats[table.currentSeat];
    if (pid !== socket.user.id) return;
    const p = table.players.get(pid);
    p.folded = true;
    p.hasActed = true;
    if (pokerActivePlayers(table) <= 1) pokerShowdown(table);
    else pokerNextPlayer(table, table.currentSeat);
  });

  socket.on('poker:check', () => {
    const table = tables.poker.get(socket._pkTable);
    if (!table || table.currentSeat < 0) return;
    const pid = table.seats[table.currentSeat];
    if (pid !== socket.user.id) return;
    const p = table.players.get(pid);
    if (p.roundBet < table.currentBet) return; // Can't check, must call
    p.hasActed = true;
    pokerNextPlayer(table, table.currentSeat);
  });

  // --- PEEK (Karten anschauen) ---
  socket.on('poker:peek', ({ peeking }) => {
    const table = tables.poker.get(socket._pkTable);
    if (!table) return;
    const p = table.players.get(socket.user.id);
    if (!p) return;
    p.peeking = !!peeking;
    emitPokerState(table);
  });

  // --- POKER BOTS ---
  socket.on('poker:addBot', ({ tableId }) => {
    const table = tables.poker.get(tableId || socket._pkTable);
    if (!table) return socket.emit('error', 'Tisch nicht gefunden');
    const result = addBotToTable(table);
    if (!result) return socket.emit('error', 'Tisch ist voll!');
    io.to('pk-' + table.id).emit('chat:msg', {
      username: '🎰 System', msg: `${result.name} (Stil: ${result.style}) setzt sich an den Tisch!`, time: Date.now()
    });
  });

  socket.on('poker:removeBot', ({ tableId }) => {
    const table = tables.poker.get(tableId || socket._pkTable);
    if (!table) return;
    // Remove last bot
    for (let i = 5; i >= 0; i--) {
      const pid = table.seats[i];
      if (pid && table.players.get(pid)?.isBot) {
        const bot = table.players.get(pid);
        io.to('pk-' + table.id).emit('chat:msg', {
          username: '🎰 System', msg: `${bot.username} verlässt den Tisch.`, time: Date.now()
        });
        removeBotFromTable(table, pid);
        return;
      }
    }
    socket.emit('error', 'Kein Bot am Tisch');
  });

  socket.on('poker:removeBots', ({ tableId }) => {
    const table = tables.poker.get(tableId || socket._pkTable);
    if (!table) return;
    const botIds = [...table.players.entries()].filter(([,p]) => p.isBot).map(([id]) => id);
    for (const id of botIds) removeBotFromTable(table, id);
    if (botIds.length > 0) {
      io.to('pk-' + table.id).emit('chat:msg', {
        username: '🎰 System', msg: `Alle Bots entfernt.`, time: Date.now()
      });
    }
  });

  // --- CHAT ---
  socket.on('chat:msg', ({ room, msg }) => {
    if (!msg || msg.length > 200) return;
    io.to(room).emit('chat:msg', { username: socket.user.username, msg, time: Date.now() });
  });

  // --- WEBRTC SIGNALING (Video/Sprach-Chat) ---
  socket.on('rtc:join', ({ room }) => {
    socket.join('rtc-' + room);
    socket._rtcRoom = room;
    // Alle anderen im Raum benachrichtigen
    socket.to('rtc-' + room).emit('rtc:peerJoined', {
      peerId: socket.id, username: socket.user.username
    });
    // Liste aller bestehenden Peers senden
    const rtcRoom = io.sockets.adapter.rooms.get('rtc-' + room);
    if (rtcRoom) {
      const peers = [];
      for (const sid of rtcRoom) {
        if (sid === socket.id) continue;
        const s = io.sockets.sockets.get(sid);
        if (s) peers.push({ peerId: sid, username: s.user.username });
      }
      socket.emit('rtc:peers', peers);
    }
  });

  socket.on('rtc:offer', ({ to, offer }) => {
    const target = io.sockets.sockets.get(to);
    if (target) target.emit('rtc:offer', {
      from: socket.id, username: socket.user.username, offer
    });
  });

  socket.on('rtc:answer', ({ to, answer }) => {
    const target = io.sockets.sockets.get(to);
    if (target) target.emit('rtc:answer', { from: socket.id, answer });
  });

  socket.on('rtc:ice', ({ to, candidate }) => {
    const target = io.sockets.sockets.get(to);
    if (target) target.emit('rtc:ice', { from: socket.id, candidate });
  });

  socket.on('rtc:leave', () => {
    if (socket._rtcRoom) {
      socket.to('rtc-' + socket._rtcRoom).emit('rtc:peerLeft', { peerId: socket.id });
      socket.leave('rtc-' + socket._rtcRoom);
      socket._rtcRoom = null;
    }
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    console.log(`🔌 ${socket.user.username} disconnected`);

    // WebRTC cleanup
    if (socket._rtcRoom) {
      socket.to('rtc-' + socket._rtcRoom).emit('rtc:peerLeft', { peerId: socket.id });
    }

    // Clean up BJ tables
    for (const [, table] of tables.blackjack) {
      if (table.players.has(socket.user.id)) {
        const seatIdx = table.seats.indexOf(socket.user.id);
        if (seatIdx >= 0) table.seats[seatIdx] = null;
        table.players.delete(socket.user.id);
        io.to('bj-' + table.id).emit('bj:playerLeft', { username: socket.user.username });
      }
    }
    // Clean up Poker tables
    for (const [, table] of tables.poker) {
      if (table.players.has(socket.user.id)) {
        const p = table.players.get(socket.user.id);
        if (p) p.folded = true;
        const seatIdx = table.seats.indexOf(socket.user.id);
        if (seatIdx >= 0) table.seats[seatIdx] = null;
        table.players.delete(socket.user.id);
        io.to('pk-' + table.id).emit('poker:playerLeft', { username: socket.user.username });
        if (table.phase !== 'waiting' && pokerActivePlayers(table) <= 1) pokerShowdown(table);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// START
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`\n🎰 Reisendes Casino Backend running on port ${PORT}`);
  console.log(`🃏 Multiplayer: Blackjack & Poker (Socket.IO)`);
  console.log(`🌍 Open: http://localhost:${PORT}\n`);
});
