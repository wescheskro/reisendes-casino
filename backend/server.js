// .env Datei laden (falls vorhanden)
try {
  const envPath = require('path').join(__dirname, '.env');
  if (require('fs').existsSync(envPath)) {
    require('fs').readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.substring(0, eq).trim();
        const val = trimmed.substring(eq + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
} catch(e) {}

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
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'reisendes-casino-secret-change-in-production';

// ---------------------------------------------------------------------------
// E-Mail & Google Auth Konfiguration
// ---------------------------------------------------------------------------
const EMAIL_USER = process.env.EMAIL_USER || '';       // z.B. dein-casino@gmail.com
const EMAIL_PASS = process.env.EMAIL_PASS || '';       // Gmail App-Passwort (16 Zeichen)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

// Nodemailer Transporter (Gmail)
const mailTransporter = EMAIL_USER && EMAIL_PASS ? nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
}) : null;

// Google OAuth2 Client
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Verification Codes (in-memory, auto-expire)
const verificationCodes = new Map(); // key: email -> { code, userId, type, expiresAt }

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-stellig
}

function cleanExpiredCodes() {
  const now = Date.now();
  for (const [key, val] of verificationCodes) {
    if (val.expiresAt < now) verificationCodes.delete(key);
  }
}
setInterval(cleanExpiredCodes, 60000); // Jede Minute aufräumen

async function sendMail(to, subject, html) {
  if (!mailTransporter) {
    console.warn('[MAIL] Kein E-Mail konfiguriert! Setze EMAIL_USER und EMAIL_PASS.');
    return false;
  }
  try {
    await mailTransporter.sendMail({
      from: `"Reisendes Casino 🦔" <${EMAIL_USER}>`,
      to,
      subject,
      html
    });
    return true;
  } catch (e) {
    console.error('[MAIL] Fehler:', e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// In-Memory DB mit JSON-Persistenz
// ---------------------------------------------------------------------------
const DB_FILE = path.join(__dirname, 'data', 'db.json');

const db = {
  users: new Map(),
  transactions: new Map(),
  sessions: new Map(),
  leaderboard: new Map(),
  weeklyWinners: []
};

// ── DB laden ──
function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    if (raw.users) for (const [k, v] of Object.entries(raw.users)) db.users.set(k, v);
    if (raw.transactions) for (const [k, v] of Object.entries(raw.transactions)) db.transactions.set(k, v);
    if (raw.leaderboard) for (const [k, v] of Object.entries(raw.leaderboard)) {
      const weekMap = new Map();
      for (const [uk, uv] of Object.entries(v)) weekMap.set(uk, uv);
      db.leaderboard.set(k, weekMap);
    }
    if (raw.weeklyWinners) db.weeklyWinners = raw.weeklyWinners;
    console.log(`[DB] ${db.users.size} User geladen aus ${DB_FILE}`);
  } catch (e) {
    console.error('[DB] Fehler beim Laden:', e.message);
  }
}

// ── DB speichern ──
let saveTimer = null;
function saveDB() {
  // Debounce: max alle 2 Sekunden speichern
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        users: Object.fromEntries(db.users),
        transactions: Object.fromEntries(db.transactions),
        leaderboard: {},
        weeklyWinners: db.weeklyWinners
      };
      for (const [wk, wMap] of db.leaderboard) {
        data.leaderboard[wk] = Object.fromEntries(wMap);
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[DB] Fehler beim Speichern:', e.message);
    }
  }, 2000);
}

// Beim Start laden
loadDB();

// Auto-Save: Periodisch alle 5 Sekunden + bei neuen Usern/Transaktionen
let dbDirty = false;
const origUsersSet = db.users.set.bind(db.users);
db.users.set = function(k, v) { origUsersSet(k, v); dbDirty = true; saveDB(); return db.users; };
const origTxSet = db.transactions.set.bind(db.transactions);
db.transactions.set = function(k, v) { origTxSet(k, v); dbDirty = true; saveDB(); return db.transactions; };

// Periodisches Speichern für Änderungen an bestehenden User-Objekten
setInterval(() => {
  if (db.users.size > 0) { dbDirty = true; saveDB(); }
}, 10000);

// Beim Beenden speichern
process.on('SIGINT', () => { saveTimer = null; saveDB(); setTimeout(() => process.exit(0), 500); });
process.on('SIGTERM', () => { saveTimer = null; saveDB(); setTimeout(() => process.exit(0), 500); });

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

  // Level-Up Truhen + Baxt Coins vergeben
  if (newLevel > oldLevel) {
    results.leveledUp = true;
    let totalBaxtBonus = 0;
    for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
      let chestType = 'holz';
      if (lvl % 50 === 0) chestType = 'diamant';
      else if (lvl % 20 === 0) chestType = 'gold';
      else if (lvl % 10 === 0) chestType = 'silber';
      else if (lvl % 5 === 0) chestType = 'bronze';
      user.chestsReady.push(chestType);
      results.newChests.push({ type: chestType, label: CHEST_TYPES[chestType].label });
      // Baxt Coins pro Level-Up (steigt mit Level)
      const levelBonus = BAXT_REWARDS.levelUp + (lvl * 10);
      totalBaxtBonus += levelBonus;
    }
    if (totalBaxtBonus > 0) {
      user.baxtCoins = (user.baxtCoins || 0) + totalBaxtBonus;
      results.baxtBonus = totalBaxtBonus;
      results.baxtTotal = user.baxtCoins;
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
// BAXT COINS SYSTEM – Interne Casino-Währung
// ---------------------------------------------------------------------------
const BAXT_REWARDS = {
  pokerWin: 50,         // Poker-Hand gewonnen
  blackjackWin: 30,     // Blackjack gewonnen
  blackjackBJ: 75,      // Blackjack (21 mit 2 Karten)
  roundPlayed: 5,       // Runde gespielt (egal welches Spiel)
  levelUp: 200,         // Level-Up Bonus
  dailyLogin: 500,      // Täglicher Login-Bonus
  slotBigWin: 40,       // Slot: großer Gewinn (>10x)
  guestWelcome: 500,    // Gast-Willkommensbonus
  registerBonus: 5000,  // Registrierungsbonus
};

// Nachschub-System (Refill Cooldowns)
const REFILL_TIERS = [
  { wait: 10 * 60 * 1000, amount: 200 },   // 1. Refill: 10 min → 200
  { wait: 30 * 60 * 1000, amount: 150 },   // 2. Refill: 30 min → 150
  { wait: 60 * 60 * 1000, amount: 100 },   // 3.+ Refill: 60 min → 100
];
const AD_REFILL_AMOUNT = 100; // Werbung schauen → 100 Baxt

// Baxt Coins vergeben
function awardBaxtCoins(user, amount, reason) {
  if (!user || amount <= 0) return null;
  user.baxtCoins = (user.baxtCoins || 0) + amount;

  // Transaktion loggen
  const tx = {
    id: uuidv4(),
    userId: user.id,
    type: 'earn',
    amount,
    reason,
    baxtAfter: user.baxtCoins,
    timestamp: new Date().toISOString()
  };

  if (!user.baxtHistory) user.baxtHistory = [];
  user.baxtHistory.unshift(tx);
  if (user.baxtHistory.length > 100) user.baxtHistory.length = 100; // Max 100 Einträge

  return { coins: amount, reason, total: user.baxtCoins };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// YOUTUBE SEARCH (für Jukebox) – muss vor static/catch-all stehen
// ---------------------------------------------------------------------------
app.get('/api/youtube/search', async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 2) return res.json([]);
  try {
    const ytSearch = require('youtube-search-api');
    const data = await ytSearch.GetListByKeyword(q, false, 8);
    const results = (data.items || [])
      .filter(i => i.type === 'video')
      .slice(0, 8)
      .map(v => ({
        id: v.id,
        title: v.title,
        channel: v.channelTitle || '',
        thumb: v.thumbnail?.thumbnails?.[0]?.url || ''
      }));
    res.json(results);
  } catch(e) {
    console.error('YouTube search error:', e.message);
    res.json([]);
  }
});

// Serve frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ===================== BESUCHER-TRACKING =====================
const visitorLog = new Map(); // dateKey -> Set of IPs

function getDateKey(d) {
  const dt = d || new Date();
  return dt.toISOString().slice(0, 10); // YYYY-MM-DD
}

function trackVisitor(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const today = getDateKey();
  if (!visitorLog.has(today)) visitorLog.set(today, new Set());
  visitorLog.get(today).add(ip);
  // Alte Tage aufräumen (nur letzte 30 Tage behalten)
  for (const [key] of visitorLog) {
    if ([...visitorLog.keys()].indexOf(key) < visitorLog.size - 30) visitorLog.delete(key);
  }
}

// Jeden Seitenaufruf tracken
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) trackVisitor(req);
  next();
});

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

// Gast-Status prüfen (kein Login nötig)
app.get('/api/guest/status', (req, res) => {
  res.json({
    guestWelcomeBonus: BAXT_REWARDS.guestWelcome,
    registerBonus: BAXT_REWARDS.registerBonus,
    dailyBonus: BAXT_REWARDS.dailyLogin
  });
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const { phone, pin, username, email } = req.body;

  if (!phone || !pin || !username) {
    return res.status(400).json({ error: 'Phone, PIN and username required' });
  }

  // Check if phone already exists
  for (const [, user] of db.users) {
    if (user.phone === phone) {
      return res.status(409).json({ error: 'Phone already registered' });
    }
    if (email && user.email && user.email.toLowerCase() === email.toLowerCase()) {
      return res.status(409).json({ error: 'Email already registered' });
    }
  }

  const userId = uuidv4();
  const hashedPin = await bcrypt.hash(pin, 10);

  const user = {
    id: userId,
    phone,
    email: email || null,
    username,
    pin: hashedPin,
    balance: 0,
    currency: 'EUR',
    createdAt: new Date().toISOString(),
    verified: false,
    emailVerified: false,
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
    highscoreAllTime: 0,
    // Baxt Coins
    baxtCoins: BAXT_REWARDS.registerBonus, // Registrierungsbonus: 5000 Baxt Coins
    baxtHistory: [],       // Transaktionshistorie
    lastDailyBaxt: null,   // Letzter Daily-Login Bonus
    // Friends
    friends: [],           // Array von User-IDs
    friendRequests: [],    // Eingehende Anfragen
    friendRequestsSent: [] // Gesendete Anfragen
  };

  db.users.set(userId, user);

  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });

  // Automatisch Verifizierungs-Code senden wenn E-Mail angegeben
  if (email && mailTransporter) {
    const code = generateCode();
    verificationCodes.set(email.toLowerCase(), {
      code, userId, type: 'verify', expiresAt: Date.now() + 15 * 60 * 1000
    });
    sendMail(email, 'Dein Verifizierungscode – Reisendes Casino', `
      <div style="font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:20px;background:#1a1a2e;color:#fff;border-radius:12px;border:2px solid #D4AF37">
        <h2 style="color:#D4AF37;text-align:center">🦔 Reisendes Casino</h2>
        <p>Hallo <strong>${username}</strong>,</p>
        <p>Dein Verifizierungscode:</p>
        <div style="text-align:center;font-size:32px;font-weight:bold;color:#D4AF37;letter-spacing:8px;padding:16px;background:#0a0a12;border-radius:8px;margin:16px 0">${code}</div>
        <p style="color:#aaa;font-size:12px">Code gültig für 15 Minuten.</p>
      </div>
    `);
  }

  res.status(201).json({
    token,
    user: { id: userId, username, phone, email: email || null, balance: 0, currency: 'EUR', baxtCoins: BAXT_REWARDS.registerBonus },
    emailSent: !!(email && mailTransporter)
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
      currency: foundUser.currency,
      baxtCoins: foundUser.baxtCoins || 0
    }
  });
});

// Logout
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  // Token-basiert → Client löscht Token, Server bestätigt nur
  res.json({ success: true, message: 'Erfolgreich abgemeldet' });
});

// ---------------------------------------------------------------------------
// E-MAIL VERIFIZIERUNG & PASSWORT-RESET
// ---------------------------------------------------------------------------

// Verifizierungscode erneut senden
app.post('/api/auth/send-code', authMiddleware, async (req, res) => {
  const email = req.user.email;
  if (!email) return res.status(400).json({ error: 'Keine E-Mail hinterlegt' });
  if (req.user.emailVerified) return res.json({ success: true, message: 'Bereits verifiziert' });

  const code = generateCode();
  verificationCodes.set(email.toLowerCase(), {
    code, userId: req.user.id, type: 'verify', expiresAt: Date.now() + 15 * 60 * 1000
  });

  const sent = await sendMail(email, 'Dein Verifizierungscode – Reisendes Casino', `
    <div style="font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:20px;background:#1a1a2e;color:#fff;border-radius:12px;border:2px solid #D4AF37">
      <h2 style="color:#D4AF37;text-align:center">🦔 Reisendes Casino</h2>
      <p>Hallo <strong>${req.user.username}</strong>,</p>
      <p>Dein Verifizierungscode:</p>
      <div style="text-align:center;font-size:32px;font-weight:bold;color:#D4AF37;letter-spacing:8px;padding:16px;background:#0a0a12;border-radius:8px;margin:16px 0">${code}</div>
      <p style="color:#aaa;font-size:12px">Code gültig für 15 Minuten.</p>
    </div>
  `);

  res.json({ success: sent, message: sent ? 'Code gesendet!' : 'E-Mail konnte nicht gesendet werden' });
});

// E-Mail verifizieren
app.post('/api/auth/verify-email', authMiddleware, (req, res) => {
  const { code } = req.body;
  const email = req.user.email;
  if (!email) return res.status(400).json({ error: 'Keine E-Mail hinterlegt' });

  const stored = verificationCodes.get(email.toLowerCase());
  if (!stored || stored.type !== 'verify') {
    return res.status(400).json({ error: 'Kein Code angefordert' });
  }
  if (stored.expiresAt < Date.now()) {
    verificationCodes.delete(email.toLowerCase());
    return res.status(400).json({ error: 'Code abgelaufen – bitte neu anfordern' });
  }
  if (stored.code !== code) {
    return res.status(400).json({ error: 'Falscher Code' });
  }

  req.user.emailVerified = true;
  req.user.verified = true;
  verificationCodes.delete(email.toLowerCase());
  saveDB();

  res.json({ success: true, message: 'E-Mail verifiziert!' });
});

// Passwort vergessen – Code an E-Mail senden
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'E-Mail erforderlich' });

  let foundUser = null;
  for (const [, user] of db.users) {
    if (user.email && user.email.toLowerCase() === email.toLowerCase()) {
      foundUser = user; break;
    }
  }

  // Immer "erfolgreich" antworten (Sicherheit: kein User-Enumeration)
  if (!foundUser) return res.json({ success: true, message: 'Falls ein Konto existiert, wurde ein Code gesendet' });

  const code = generateCode();
  verificationCodes.set(email.toLowerCase(), {
    code, userId: foundUser.id, type: 'reset', expiresAt: Date.now() + 15 * 60 * 1000
  });

  await sendMail(email, 'PIN zurücksetzen – Reisendes Casino', `
    <div style="font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:20px;background:#1a1a2e;color:#fff;border-radius:12px;border:2px solid #D4AF37">
      <h2 style="color:#D4AF37;text-align:center">🦔 PIN zurücksetzen</h2>
      <p>Hallo <strong>${foundUser.username}</strong>,</p>
      <p>Dein Reset-Code:</p>
      <div style="text-align:center;font-size:32px;font-weight:bold;color:#D4AF37;letter-spacing:8px;padding:16px;background:#0a0a12;border-radius:8px;margin:16px 0">${code}</div>
      <p style="color:#aaa;font-size:12px">Code gültig für 15 Minuten. Falls du das nicht warst, ignoriere diese E-Mail.</p>
    </div>
  `);

  res.json({ success: true, message: 'Falls ein Konto existiert, wurde ein Code gesendet' });
});

// PIN zurücksetzen mit Code
app.post('/api/auth/reset-pin', async (req, res) => {
  const { email, code, newPin } = req.body;
  if (!email || !code || !newPin) return res.status(400).json({ error: 'Alle Felder erforderlich' });
  if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) return res.status(400).json({ error: 'PIN muss 4 Ziffern sein' });

  const stored = verificationCodes.get(email.toLowerCase());
  if (!stored || stored.type !== 'reset') {
    return res.status(400).json({ error: 'Kein Reset angefordert' });
  }
  if (stored.expiresAt < Date.now()) {
    verificationCodes.delete(email.toLowerCase());
    return res.status(400).json({ error: 'Code abgelaufen' });
  }
  if (stored.code !== code) {
    return res.status(400).json({ error: 'Falscher Code' });
  }

  const user = db.users.get(stored.userId);
  if (!user) return res.status(400).json({ error: 'User nicht gefunden' });

  user.pin = await bcrypt.hash(newPin, 10);
  verificationCodes.delete(email.toLowerCase());
  saveDB();

  res.json({ success: true, message: 'PIN wurde zurückgesetzt!' });
});

// ---------------------------------------------------------------------------
// GOOGLE SIGN-IN
// ---------------------------------------------------------------------------

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential fehlt' });

  if (!googleClient) {
    return res.status(503).json({ error: 'Google Sign-In nicht konfiguriert' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const googleEmail = payload.email;
    const googleName = payload.name || payload.given_name || googleEmail.split('@')[0];

    // Suche ob User mit dieser E-Mail existiert
    let foundUser = null;
    for (const [, user] of db.users) {
      if (user.email && user.email.toLowerCase() === googleEmail.toLowerCase()) {
        foundUser = user; break;
      }
      if (user.googleId === payload.sub) {
        foundUser = user; break;
      }
    }

    if (foundUser) {
      // Existierender User → Login
      if (!foundUser.googleId) foundUser.googleId = payload.sub;
      if (!foundUser.emailVerified) {
        foundUser.emailVerified = true;
        foundUser.verified = true;
      }
      saveDB();

      const token = jwt.sign({ userId: foundUser.id }, JWT_SECRET, { expiresIn: '30d' });
      return res.json({
        token,
        user: {
          id: foundUser.id, username: foundUser.username,
          phone: foundUser.phone, email: foundUser.email,
          balance: foundUser.balance, currency: foundUser.currency,
          baxtCoins: foundUser.baxtCoins || 0
        }
      });
    }

    // Neuer User via Google → Auto-Register
    const userId = uuidv4();
    const user = {
      id: userId,
      phone: null,
      email: googleEmail,
      googleId: payload.sub,
      username: googleName.substring(0, 20),
      pin: null,  // Kein PIN bei Google-Login
      balance: 0,
      currency: 'EUR',
      createdAt: new Date().toISOString(),
      verified: true,
      emailVerified: true,
      xp: 0, level: 1, rang: 'reisender',
      inventory: [],
      equipped: { avatar: 'default', cardBack: 'default', frame: 'default', title: 'Reisender', tableDesign: 'default', emote: null },
      chestsReady: [], chestsOpened: 0,
      roundsPlayed: 0, handsWon: 0, highscoreAllTime: 0,
      baxtCoins: BAXT_REWARDS.registerBonus, baxtHistory: [], lastDailyBaxt: null,
      friends: [], friendRequests: [], friendRequestsSent: []
    };

    db.users.set(userId, user);

    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({
      token,
      user: { id: userId, username: user.username, phone: null, email: googleEmail, balance: 0, currency: 'EUR', baxtCoins: BAXT_REWARDS.registerBonus },
      isNewUser: true
    });
  } catch (e) {
    console.error('[GOOGLE] Verify error:', e.message);
    res.status(401).json({ error: 'Google-Token ungültig' });
  }
});

// E-Mail nachträglich hinzufügen
app.put('/api/auth/email', authMiddleware, async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Gültige E-Mail erforderlich' });

  // Check ob E-Mail schon vergeben
  for (const [, user] of db.users) {
    if (user.email && user.email.toLowerCase() === email.toLowerCase() && user.id !== req.user.id) {
      return res.status(409).json({ error: 'E-Mail bereits vergeben' });
    }
  }

  req.user.email = email;
  req.user.emailVerified = false;
  saveDB();

  // Direkt Verifizierungscode senden
  const code = generateCode();
  verificationCodes.set(email.toLowerCase(), {
    code, userId: req.user.id, type: 'verify', expiresAt: Date.now() + 15 * 60 * 1000
  });

  const sent = await sendMail(email, 'Dein Verifizierungscode – Reisendes Casino', `
    <div style="font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:20px;background:#1a1a2e;color:#fff;border-radius:12px;border:2px solid #D4AF37">
      <h2 style="color:#D4AF37;text-align:center">🦔 Reisendes Casino</h2>
      <p>Hallo <strong>${req.user.username}</strong>,</p>
      <p>Dein Verifizierungscode:</p>
      <div style="text-align:center;font-size:32px;font-weight:bold;color:#D4AF37;letter-spacing:8px;padding:16px;background:#0a0a12;border-radius:8px;margin:16px 0">${code}</div>
      <p style="color:#aaa;font-size:12px">Code gültig für 15 Minuten.</p>
    </div>
  `);

  res.json({ success: true, email, codeSent: sent });
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
// FRIENDS SYSTEM
// ---------------------------------------------------------------------------

// Online-Status Tracking: userId -> { socketId, lastSeen }
const onlineUsers = new Map();

// Freundschaftsanfrage senden
app.post('/api/friends/request', authMiddleware, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username erforderlich' });

  const me = req.user;
  if (username.toLowerCase() === me.username.toLowerCase()) {
    return res.status(400).json({ error: 'Du kannst dir nicht selbst eine Anfrage schicken' });
  }

  // Zieluser finden
  let target = null;
  for (const [, u] of db.users) {
    if (u.username.toLowerCase() === username.toLowerCase()) { target = u; break; }
  }
  if (!target) return res.status(404).json({ error: 'Spieler nicht gefunden' });

  // Init arrays
  if (!me.friends) me.friends = [];
  if (!me.friendRequests) me.friendRequests = [];
  if (!me.friendRequestsSent) me.friendRequestsSent = [];
  if (!target.friends) target.friends = [];
  if (!target.friendRequests) target.friendRequests = [];
  if (!target.friendRequestsSent) target.friendRequestsSent = [];

  // Schon befreundet?
  if (me.friends.includes(target.id)) {
    return res.status(400).json({ error: 'Ihr seid bereits Freunde' });
  }

  // Anfrage schon gesendet?
  if (me.friendRequestsSent.includes(target.id)) {
    return res.status(400).json({ error: 'Anfrage wurde bereits gesendet' });
  }

  // Gegenseitige Anfrage? -> Direkt befreunden
  if (target.friendRequestsSent.includes(me.id)) {
    me.friends.push(target.id);
    target.friends.push(me.id);
    target.friendRequestsSent = target.friendRequestsSent.filter(id => id !== me.id);
    me.friendRequests = me.friendRequests.filter(id => id !== target.id);

    // Echtzeit-Benachrichtigung
    const targetSocket = [...io.sockets.sockets.values()].find(s => s.user && s.user.id === target.id);
    if (targetSocket) targetSocket.emit('friends:accepted', { userId: me.id, username: me.username });

    return res.json({ status: 'accepted', message: `${target.username} und du seid jetzt Freunde!` });
  }

  me.friendRequestsSent.push(target.id);
  target.friendRequests.push(me.id);

  // Echtzeit-Benachrichtigung
  const targetSocket = [...io.sockets.sockets.values()].find(s => s.user && s.user.id === target.id);
  if (targetSocket) {
    targetSocket.emit('friends:request', { userId: me.id, username: me.username });
  }

  res.json({ status: 'sent', message: `Anfrage an ${target.username} gesendet` });
});

// Freundschaftsanfrage annehmen
app.post('/api/friends/accept', authMiddleware, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId erforderlich' });

  const me = req.user;
  if (!me.friendRequests) me.friendRequests = [];
  if (!me.friends) me.friends = [];

  if (!me.friendRequests.includes(userId)) {
    return res.status(400).json({ error: 'Keine Anfrage von diesem Spieler' });
  }

  const sender = db.users.get(userId);
  if (!sender) return res.status(404).json({ error: 'Spieler nicht gefunden' });
  if (!sender.friends) sender.friends = [];
  if (!sender.friendRequestsSent) sender.friendRequestsSent = [];

  // Befreunden
  me.friends.push(userId);
  sender.friends.push(me.id);
  me.friendRequests = me.friendRequests.filter(id => id !== userId);
  sender.friendRequestsSent = sender.friendRequestsSent.filter(id => id !== me.id);

  // Benachrichtigung
  const senderSocket = [...io.sockets.sockets.values()].find(s => s.user && s.user.id === userId);
  if (senderSocket) senderSocket.emit('friends:accepted', { userId: me.id, username: me.username });

  res.json({ status: 'accepted', username: sender.username });
});

// Freundschaftsanfrage ablehnen
app.post('/api/friends/decline', authMiddleware, (req, res) => {
  const { userId } = req.body;
  const me = req.user;
  if (!me.friendRequests) me.friendRequests = [];

  me.friendRequests = me.friendRequests.filter(id => id !== userId);

  const sender = db.users.get(userId);
  if (sender && sender.friendRequestsSent) {
    sender.friendRequestsSent = sender.friendRequestsSent.filter(id => id !== me.id);
  }

  res.json({ status: 'declined' });
});

// Freund entfernen
app.post('/api/friends/remove', authMiddleware, (req, res) => {
  const { userId } = req.body;
  const me = req.user;
  if (!me.friends) me.friends = [];

  me.friends = me.friends.filter(id => id !== userId);

  const other = db.users.get(userId);
  if (other && other.friends) {
    other.friends = other.friends.filter(id => id !== me.id);
  }

  res.json({ status: 'removed' });
});

// Freundesliste abrufen (mit Online-Status)
app.get('/api/friends', authMiddleware, (req, res) => {
  const me = req.user;
  if (!me.friends) me.friends = [];
  if (!me.friendRequests) me.friendRequests = [];

  const friends = me.friends.map(fId => {
    const u = db.users.get(fId);
    if (!u) return null;
    const online = onlineUsers.has(fId);
    return {
      id: u.id,
      username: u.username,
      level: u.level || 1,
      rang: getRangFromLevel(u.level || 1).label,
      baxtCoins: u.baxtCoins || 0,
      online,
      lastSeen: online ? null : (onlineUsers.get(fId + '_lastSeen') || null)
    };
  }).filter(Boolean);

  const requests = me.friendRequests.map(rId => {
    const u = db.users.get(rId);
    if (!u) return null;
    return { id: u.id, username: u.username, level: u.level || 1 };
  }).filter(Boolean);

  res.json({ friends, requests });
});

// Spieler suchen (für Freund hinzufügen)
app.get('/api/friends/search', authMiddleware, (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (q.length < 2) return res.json({ results: [] });

  const results = [];
  for (const [, u] of db.users) {
    if (u.id === req.user.id) continue;
    if (u.username.toLowerCase().includes(q)) {
      const isFriend = (req.user.friends || []).includes(u.id);
      const isPending = (req.user.friendRequestsSent || []).includes(u.id);
      results.push({
        id: u.id,
        username: u.username,
        level: u.level || 1,
        isFriend,
        isPending
      });
    }
    if (results.length >= 10) break;
  }

  res.json({ results });
});

// ---------------------------------------------------------------------------
// BAXT COINS ROUTES
// ---------------------------------------------------------------------------

// Baxt Coins Balance
app.get('/api/baxt/balance', authMiddleware, (req, res) => {
  res.json({
    baxtCoins: req.user.baxtCoins || 0,
    username: req.user.username
  });
});

// Baxt Coins an anderen Spieler senden
app.post('/api/baxt/transfer', authMiddleware, (req, res) => {
  const { recipientUsername, amount } = req.body;
  if (!recipientUsername || !amount || amount <= 0 || !Number.isInteger(amount)) {
    return res.status(400).json({ error: 'Ungültiger Betrag oder Empfänger' });
  }
  if (amount < 10) {
    return res.status(400).json({ error: 'Mindestens 10 Baxt Coins zum Senden' });
  }

  const senderCoins = req.user.baxtCoins || 0;
  if (senderCoins < amount) {
    return res.status(400).json({ error: 'Nicht genug Baxt Coins' });
  }

  // Empfänger finden
  let recipient = null;
  for (const [, user] of db.users) {
    if (user.username.toLowerCase() === recipientUsername.toLowerCase() && user.id !== req.user.id) {
      recipient = user;
      break;
    }
  }
  if (!recipient) {
    return res.status(404).json({ error: 'Spieler nicht gefunden' });
  }

  // Transfer durchführen
  req.user.baxtCoins -= amount;
  recipient.baxtCoins = (recipient.baxtCoins || 0) + amount;

  // Sender-History
  const senderTx = {
    id: uuidv4(), userId: req.user.id, type: 'transfer_out',
    amount, to: recipient.username, baxtAfter: req.user.baxtCoins,
    timestamp: new Date().toISOString()
  };
  if (!req.user.baxtHistory) req.user.baxtHistory = [];
  req.user.baxtHistory.unshift(senderTx);

  // Empfänger-History
  const recipientTx = {
    id: uuidv4(), userId: recipient.id, type: 'transfer_in',
    amount, from: req.user.username, baxtAfter: recipient.baxtCoins,
    timestamp: new Date().toISOString()
  };
  if (!recipient.baxtHistory) recipient.baxtHistory = [];
  recipient.baxtHistory.unshift(recipientTx);

  // Echtzeit-Benachrichtigung an Empfänger via Socket
  const recipientSocket = [...io.sockets.sockets.values()].find(s => s.user?.id === recipient.id);
  if (recipientSocket) {
    recipientSocket.emit('baxt:received', {
      from: req.user.username,
      amount,
      total: recipient.baxtCoins
    });
  }

  res.json({
    success: true,
    sent: amount,
    to: recipient.username,
    baxtCoins: req.user.baxtCoins
  });
});

// Baxt Coins Transaktionshistorie
app.get('/api/baxt/history', authMiddleware, (req, res) => {
  res.json({
    history: (req.user.baxtHistory || []).slice(0, 50),
    baxtCoins: req.user.baxtCoins || 0
  });
});

// Daily Login Bonus (Baxt Coins)
app.post('/api/baxt/daily', authMiddleware, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  if (req.user.lastDailyBaxt === today) {
    return res.status(400).json({ error: 'Heute schon abgeholt', nextReset: 'morgen 00:00' });
  }

  req.user.lastDailyBaxt = today;
  const result = awardBaxtCoins(req.user, BAXT_REWARDS.dailyLogin, 'daily_login');

  // Auch XP für Daily Login
  const xpResult = awardXP(req.user, XP_REWARDS.dailyLogin);

  res.json({
    success: true,
    baxtEarned: BAXT_REWARDS.dailyLogin,
    baxtCoins: req.user.baxtCoins,
    xpResult
  });
});

// ---------------------------------------------------------------------------
// NACHSCHUB-SYSTEM (Refill mit Cooldowns)
// ---------------------------------------------------------------------------

app.get('/api/baxt/refill-status', authMiddleware, (req, res) => {
  const user = req.user;
  const today = new Date().toISOString().split('T')[0];

  // Tagesreset: refillCount zurücksetzen
  if (user.refillDate !== today) {
    user.refillCount = 0;
    user.refillDate = today;
  }

  const tierIdx = Math.min(user.refillCount || 0, REFILL_TIERS.length - 1);
  const tier = REFILL_TIERS[tierIdx];
  const lastRefill = user.lastRefill || 0;
  const elapsed = Date.now() - lastRefill;
  const remaining = Math.max(0, tier.wait - elapsed);

  res.json({
    canRefill: remaining === 0 && (user.baxtCoins || 0) === 0,
    remaining,       // ms bis Nachschub verfügbar
    amount: tier.amount,
    refillCount: user.refillCount || 0,
    baxtCoins: user.baxtCoins || 0,
    canWatchAd: remaining > 0 && (user.baxtCoins || 0) === 0
  });
});

app.post('/api/baxt/refill', authMiddleware, (req, res) => {
  const user = req.user;
  const today = new Date().toISOString().split('T')[0];

  // Tagesreset
  if (user.refillDate !== today) {
    user.refillCount = 0;
    user.refillDate = today;
  }

  // Nur wenn wirklich pleite
  if ((user.baxtCoins || 0) > 0) {
    return res.status(400).json({ error: 'Du hast noch Baxt Coins!' });
  }

  const tierIdx = Math.min(user.refillCount || 0, REFILL_TIERS.length - 1);
  const tier = REFILL_TIERS[tierIdx];
  const lastRefill = user.lastRefill || 0;
  const elapsed = Date.now() - lastRefill;

  if (elapsed < tier.wait) {
    const remaining = tier.wait - elapsed;
    return res.status(400).json({
      error: 'Noch nicht bereit',
      remaining,
      canWatchAd: true
    });
  }

  // Nachschub geben
  const result = awardBaxtCoins(user, tier.amount, 'refill');
  user.lastRefill = Date.now();
  user.refillCount = (user.refillCount || 0) + 1;
  saveDB();

  res.json({
    success: true,
    amount: tier.amount,
    baxtCoins: user.baxtCoins,
    refillCount: user.refillCount
  });
});

// Werbung schauen → Cooldown überspringen
app.post('/api/baxt/ad-refill', authMiddleware, (req, res) => {
  const user = req.user;

  // Nur wenn wirklich pleite
  if ((user.baxtCoins || 0) > 0) {
    return res.status(400).json({ error: 'Du hast noch Baxt Coins!' });
  }

  // Hier wäre echte Ad-Verification (z.B. Google AdMob callback)
  // Für jetzt: einfach geben
  const result = awardBaxtCoins(user, AD_REFILL_AMOUNT, 'ad_refill');
  user.lastRefill = Date.now();
  const today = new Date().toISOString().split('T')[0];
  if (user.refillDate !== today) {
    user.refillCount = 0;
    user.refillDate = today;
  }
  user.refillCount = (user.refillCount || 0) + 1;
  saveDB();

  res.json({
    success: true,
    amount: AD_REFILL_AMOUNT,
    baxtCoins: user.baxtCoins
  });
});

// Baxt Coins aufladen
app.post('/api/baxt/topup', authMiddleware, (req, res) => {
  const user = req.user;
  if (!user) return res.status(404).json({ error: 'User nicht gefunden' });
  const { amount } = req.body;
  const allowed = [1000, 5000, 10000, 50000, 100000];
  if (!allowed.includes(amount)) return res.status(400).json({ error: 'Ungültiger Betrag' });
  awardBaxtCoins(user, amount, 'topup');
  res.json({ baxtCoins: user.baxtCoins });
});

// Slot: Einsatz abziehen (vor jedem Spin)
app.post('/api/baxt/slot-bet', authMiddleware, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    return res.status(400).json({ error: 'Ungültiger Einsatz' });
  }
  const user = req.user;
  if ((user.baxtCoins || 0) < amount) {
    return res.status(400).json({ error: 'Nicht genug Baxt Coins', baxtCoins: user.baxtCoins || 0 });
  }
  user.baxtCoins -= amount;

  const tx = {
    id: uuidv4(), userId: user.id, type: 'slot_bet',
    amount, reason: 'slot_bet', baxtAfter: user.baxtCoins,
    timestamp: new Date().toISOString()
  };
  if (!user.baxtHistory) user.baxtHistory = [];
  user.baxtHistory.unshift(tx);
  if (user.baxtHistory.length > 100) user.baxtHistory.length = 100;

  res.json({ baxtCoins: user.baxtCoins });
});

// Slot: Gewinn gutschreiben (nach Spin mit Gewinn)
app.post('/api/baxt/slot-win', authMiddleware, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Ungültiger Gewinn' });
  }
  const user = req.user;
  const result = awardBaxtCoins(user, Math.round(amount), 'slot_win');
  res.json({ baxtCoins: user.baxtCoins });
});

// Avatar speichern/abrufen (einheitlich für alle Spiele)
app.get('/api/user/avatar', authMiddleware, (req, res) => {
  res.json({
    avatarUrl: req.user.avatarUrl || null,
    avatarConfig: req.user.avatarConfig || null,
    equipped: req.user.equipped || {}
  });
});

app.put('/api/user/avatar', authMiddleware, (req, res) => {
  const { avatarUrl, avatarConfig } = req.body;
  if (avatarUrl !== undefined) req.user.avatarUrl = avatarUrl;
  if (avatarConfig !== undefined) req.user.avatarConfig = avatarConfig;
  res.json({
    success: true,
    avatarUrl: req.user.avatarUrl || null,
    avatarConfig: req.user.avatarConfig || null
  });
});

// Baxt Coins Rangliste (Top 20)
app.get('/api/baxt/leaderboard', (req, res) => {
  const allUsers = [];
  for (const [, user] of db.users) {
    allUsers.push({
      username: user.username,
      baxtCoins: user.baxtCoins || 0,
      level: user.level || 1,
      rang: getRangFromLevel(user.level || 1).label
    });
  }
  allUsers.sort((a, b) => b.baxtCoins - a.baxtCoins);
  res.json({ leaderboard: allUsers.slice(0, 20) });
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

// Besucher-Statistik
app.get('/api/stats/visitors', (req, res) => {
  const result = {};
  for (const [date, ips] of visitorLog) {
    result[date] = ips.size;
  }
  const today = getDateKey();
  const todayCount = visitorLog.has(today) ? visitorLog.get(today).size : 0;
  res.json({ today: todayCount, history: result });
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

// Frontend Config (Google Client ID etc.)
app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID || null,
    emailEnabled: !!mailTransporter
  });
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
  // Spieler in Bar-Räumen
  let barPlayers = 0;
  if (global.barRooms) {
    for (const room of Object.values(global.barRooms)) {
      barPlayers += room.filter(s => s !== null).length;
    }
  }
  // Spieler in Roulette (Socket-Räume die mit 'roulette' beginnen)
  let roulettePlayers = 0;
  for (const [, socket] of io.sockets.sockets) {
    if (socket.rooms && socket.rooms.has('roulette')) roulettePlayers++;
  }
  res.json({ total, poker: pokerPlayers, blackjack: bjPlayers, bar: barPlayers, roulette: roulettePlayers, slots: Math.max(0, total - pokerPlayers - bjPlayers - barPlayers - roulettePlayers) });
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
    email: req.user.email || null,
    emailVerified: req.user.emailVerified || false,
    googleId: req.user.googleId ? true : false,
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
    handsWon: req.user.handsWon || 0,
    // Baxt Coins
    baxtCoins: req.user.baxtCoins || 0
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
  const guestBaxt = parseInt(socket.handshake.auth?.guestBaxt) || BAXT_REWARDS.guestWelcome;
  socket.user = { id: 'guest-' + uuidv4().slice(0,8), username: guestName || 'Gast-' + Math.floor(Math.random()*999), guest: true, guestBaxt };
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
    // Avatar-URL aus User-Profil laden (wenn vorhanden)
    const userObj = db.users.get(pid);
    return {
      seat: i, username: p.username, odgovor: p.odgovor || 0,
      bet: p.bet, cards: p.cards.map(cardStr), value: handValue(p.cards),
      status: p.status, isYou: forSocket && pid === forSocket.user.id,
      isBot: !!p.isBot,
      avatarUrl: (userObj && userObj.avatarUrl) || p.avatarUrl || null,
      avatarConfig: (userObj && userObj.avatarConfig) || null,
      rang: p.isBot ? 'KI' : (getRangFromLevel(getLevelFromXP((userObj || {}).xp || 0)).label || 'Reisender')
    };
  });
  const dealerCards = table.dealer.cards.map(cardStr);
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
  // Bots setzen automatisch nach 1-3s
  for (const [, p] of table.players) {
    if (p.isBot) {
      setTimeout(() => {
        if (table.phase !== 'betting') return;
        const bets = [500, 1000, 2000, 5000];
        p.bet = bets[Math.floor(Math.random() * bets.length)];
        p.status = 'ready';
        emitBJState(table);
        // Check if all ready
        const allReady = [...table.players.values()].every(pp => pp.status === 'ready' || pp.status === 'spectating');
        if (allReady) bjDeal(table);
      }, 1000 + Math.random() * 2000);
    }
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

      // Bot spielt automatisch
      if (p.isBot) {
        if (table.timer) clearTimeout(table.timer);
        bjBotPlay(table, s);
        return;
      }

      // 30s Timer für echte Spieler
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

function bjBotPlay(table, seat) {
  const pid = table.seats[seat];
  const p = table.players.get(pid);
  if (!p || !p.isBot) return;

  function botTurn() {
    const val = handValue(p.cards);
    if (val >= 21) {
      p.status = val > 21 ? 'bust' : 'stand';
      emitBJState(table);
      setTimeout(() => bjNextPlayer(table, seat), 600);
      return;
    }
    // Simple strategy: hit on 16 or less, stand on 17+
    if (val <= 16 || (val === 17 && Math.random() < 0.15)) {
      p.cards.push(bjDraw(table));
      emitBJState(table);
      setTimeout(botTurn, 800 + Math.random() * 800);
    } else {
      p.status = 'stand';
      emitBJState(table);
      setTimeout(() => bjNextPlayer(table, seat), 600);
    }
  }
  setTimeout(botTurn, 1000 + Math.random() * 1000);
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

  // XP + Baxt Coins vergeben für Blackjack
  for (const [pid, p] of table.players) {
    if (p.status === 'spectating' || p.status === 'betting') continue;
    const user = db.users.get(pid);
    if (user) {
      user.roundsPlayed = (user.roundsPlayed || 0) + 1;
      let xpAmount = XP_REWARDS.roundPlayed;
      let baxtAmount = BAXT_REWARDS.roundPlayed;
      if (p.status === 'blackjack') {
        xpAmount = XP_REWARDS.handWon;
        baxtAmount = BAXT_REWARDS.blackjackBJ;
        user.handsWon = (user.handsWon || 0) + 1;
      } else if (p.status === 'win') {
        xpAmount = XP_REWARDS.handWon;
        baxtAmount = BAXT_REWARDS.blackjackWin;
        user.handsWon = (user.handsWon || 0) + 1;
      }
      const xpResult = awardXP(user, xpAmount);
      const baxtResult = awardBaxtCoins(user, baxtAmount, p.status === 'blackjack' ? 'blackjack_bj' : p.status === 'win' ? 'blackjack_win' : 'blackjack_round');
      const pSocket = [...io.sockets.sockets.values()].find(s => s.user?.id === pid);
      if (pSocket) {
        pSocket.emit('xp:gained', xpResult);
        if (baxtResult) pSocket.emit('baxt:earned', baxtResult);
      }
    }
  }

  // Gäste: Baxt-Update nach Payout
  for (const [pid, p] of table.players) {
    if (p.isGuest && p.guestBaxt !== undefined) {
      // Netto-Ergebnis: payout - bet (oder 0 bei bust/lose)
      const netResult = (p.payout || 0) - p.bet;
      p.guestBaxt = Math.max(0, p.guestBaxt + netResult);
      const gSocket = [...io.sockets.sockets.values()].find(s => s.user?.id === pid);
      if (gSocket) {
        gSocket.emit('guest:baxtUpdate', { baxt: p.guestBaxt });
        if (p.guestBaxt <= 0) gSocket.emit('guest:broke', { baxt: 0 });
      }
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
      handName: table.phase === 'showdown' && !p.folded ? bestPokerHand(p.cards, table.community).name : null,
      avatarUrl: p.avatarUrl || (db.users.get(pid) || {}).avatarUrl || null,
      avatarConfig: (db.users.get(pid) || {}).avatarConfig || null,
      rang: p.isBot ? 'KI' : (getRangFromLevel(getLevelFromXP((db.users.get(pid) || {}).xp || 0)).label || 'Reisender')
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

    // XP + Baxt Coins für Gewinner vergeben
    if (!winner.isBot) {
      const user = db.users.get(winnerId);
      if (user) {
        user.handsWon = (user.handsWon || 0) + 1;
        const xpResult = awardXP(user, XP_REWARDS.handWon);
        const baxtResult = awardBaxtCoins(user, BAXT_REWARDS.pokerWin, 'poker_win');
        const winnerSocket = [...io.sockets.sockets.values()].find(s => s.user?.id === winnerId);
        if (winnerSocket) {
          winnerSocket.emit('xp:gained', xpResult);
          if (baxtResult) winnerSocket.emit('baxt:earned', baxtResult);
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
      if (pid !== winnerId) { // Gewinner hat schon XP/Baxt bekommen
        const xpResult = awardXP(user, XP_REWARDS.roundPlayed);
        const baxtResult = awardBaxtCoins(user, BAXT_REWARDS.roundPlayed, 'poker_round');
        const pSocket = [...io.sockets.sockets.values()].find(s => s.user?.id === pid);
        if (pSocket) {
          pSocket.emit('xp:gained', xpResult);
          if (baxtResult) pSocket.emit('baxt:earned', baxtResult);
        }
      }
    }
  }

  // Gäste: Baxt-Update senden
  for (const [pid, p] of table.players) {
    if (p.isGuest) {
      const gSocket = [...io.sockets.sockets.values()].find(s => s.user?.id === pid);
      if (gSocket) gSocket.emit('guest:baxtUpdate', { baxt: p.chips });
    }
  }

  emitPokerState(table);

  // Nächste Runde nach 5s
  table.timer = setTimeout(() => pokerStartRound(table), 5000);
}

function pokerStartRound(table) {
  if (table.timer) clearTimeout(table.timer);
  // Remove players with no chips (Bots bekommen Nachschub)
  for (const [pid, p] of table.players) {
    if (p.chips <= 0 && !p.spectator) {
      if (p.isBot) {
        p.chips = 10000; // Bot-Reset
      } else {
        p.spectator = true;
        // Gast: Broke-Signal senden
        if (p.isGuest) {
          const gSocket = [...io.sockets.sockets.values()].find(s => s.user?.id === pid);
          if (gSocket) gSocket.emit('guest:broke', { baxt: 0 });
        }
      }
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
['tisch-1', 'tisch-2', 'embed-preview'].forEach(id => {
  tables.poker.set(id, createPokerTable(id));
});

// ===================== AUTO-BOTS (Showcase-Tisch) =====================
// Tisch 1 bekommt automatisch Bots damit immer was los ist
function ensureShowcaseBots() {
  const showcaseTable = tables.poker.get('tisch-1');
  if (!showcaseTable) return;

  const realPlayers = [...showcaseTable.players.values()].filter(p => !p.isBot && !p.spectator).length;
  const botCount = [...showcaseTable.players.values()].filter(p => p.isBot && !p.spectator).length;
  const totalActive = [...showcaseTable.players.values()].filter(p => !p.spectator).length;

  // Wenn keine echten Spieler: 3 Bots sollen spielen (max 4 Bots insgesamt)
  if (realPlayers === 0 && botCount < 3) {
    const needed = Math.min(3 - botCount, 4 - botCount);
    for (let i = 0; i < needed; i++) {
      // Bots einzeln hinzufügen OHNE direkt die Runde zu starten
      const freeSeat = showcaseTable.seats.findIndex(s => !s);
      if (freeSeat < 0) break;
      const botId = 'bot-' + (++botIdCounter);
      const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      const style = BOT_STYLES[Math.floor(Math.random() * BOT_STYLES.length)];
      showcaseTable.players.set(botId, {
        id: botId, username: name, socketId: null,
        cards: [], chips: 10000, folded: false, roundBet: 0,
        spectator: false, allIn: false, hasActed: false,
        isBot: true, botStyle: style
      });
      showcaseTable.seats[freeSeat] = botId;
    }
    console.log(`🤖 Showcase: ${needed} Bot(s) zu Tisch 1 hinzugefügt`);
    // JETZT erst Runde starten wenn genug da
    const nowActive = [...showcaseTable.players.values()].filter(p => !p.spectator).length;
    if (nowActive >= 2 && showcaseTable.phase === 'waiting') {
      pokerStartRound(showcaseTable);
    }
  }

  // Wenn ein echter Spieler da ist aber zu wenig Gegner: Bot dazu
  if (realPlayers >= 1 && totalActive < 3 && botCount < 2) {
    addBotToTable(showcaseTable);
  }

  // Wenn echte Spieler genug sind (3+), Bots entfernen
  if (realPlayers >= 3) {
    const botIds = [...showcaseTable.players.entries()].filter(([, p]) => p.isBot).map(([id]) => id);
    botIds.forEach(id => removeBotFromTable(showcaseTable, id));
  }

  // Bots mit 0 Chips resetten
  for (const [, p] of showcaseTable.players) {
    if (p.isBot && (p.chips <= 0 || p.spectator)) {
      p.chips = 10000;
      p.spectator = false;
    }
  }

  // Falls Runde steckengeblieben ist (waiting obwohl genug Spieler da)
  const readyPlayers = [...showcaseTable.players.values()].filter(p => !p.spectator).length;
  if (readyPlayers >= 2 && showcaseTable.phase === 'waiting') {
    pokerStartRound(showcaseTable);
  }
}

// Beim Start Bots einsetzen
setTimeout(() => {
  ensureShowcaseBots();
  // Regelmäßig prüfen ob Bots gebraucht werden / Spiel läuft
  setInterval(ensureShowcaseBots, 15000);
}, 3000);

// ===================== BAR BOTS (Server-seitig) =====================
if (!global.barRooms) global.barRooms = {};
const BAR_BOT_NAMES_SRV = ['Lucky Lena','Max Müller','Roulette Rita','Casino Carlo','Glücks-Gabi','Poker Pete','Fortuna Finn'];
function _initBarBots(room) {
  const seats = global.barRooms[room];
  if (!seats) return;
  const count = 1 + Math.floor(Math.random() * 3); // max 3 Bots
  const shuffled = [...BAR_BOT_NAMES_SRV].sort(() => Math.random() - .5);
  for (let i = 0; i < count; i++) {
    const free = seats.findIndex(s => !s);
    if (free >= 0) {
      seats[free] = { username: shuffled[i], id: 'bot-' + shuffled[i].replace(/\s/g, ''), video: false, isBot: true };
    }
  }
}
// Raum 1 sofort initialisieren (damit LIVE-Anzeige Bots zeigt)
global.barRooms['1'] = Array(8).fill(null);
_initBarBots('1');

// ===================== SOCKET EVENTS =====================
io.on('connection', (socket) => {
  console.log(`🔌 ${socket.user.username} connected`);
  // Besucher-Tracking auch für Socket-Verbindungen
  const sockIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() || socket.handshake.address || 'unknown';
  const today = getDateKey();
  if (!visitorLog.has(today)) visitorLog.set(today, new Set());
  visitorLog.get(today).add(sockIp);

  // --- LIVE PREVIEW (Landingpage Spectator) ---
  socket.on('poker:livePreview', () => {
    // Finde den Tisch mit den meisten Spielern
    let bestTable = null;
    let bestCount = 0;
    for (const [, table] of tables.poker) {
      const count = [...table.players.values()].filter(p => !p.spectator).length;
      if (count > bestCount) { bestCount = count; bestTable = table; }
    }
    if (bestTable && bestCount > 0) {
      // Spectator-State senden (keine eigenen Karten sichtbar)
      const state = pokerTableState(bestTable, null);
      socket.emit('poker:livePreview', { active: true, state, tableId: bestTable.id });
      // In den Room joinen für Live-Updates
      socket.join('pk-' + bestTable.id);
      socket._livePreview = bestTable.id;
    } else {
      socket.emit('poker:livePreview', { active: false });
    }
  });

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
        cards: [], bet: 0, status: 'waiting', payout: 0,
        isGuest: !!socket.user.guest,
        guestBaxt: socket.user.guest ? (socket.user.guestBaxt || BAXT_REWARDS.guestWelcome) : undefined
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

  socket.on('bj:addBot', ({ tableId }) => {
    const table = tables.blackjack.get(tableId);
    if (!table) return;
    // Find empty seat
    let freeSeat = -1;
    for (let i = 0; i < 7; i++) { if (!table.seats[i]) { freeSeat = i; break; } }
    if (freeSeat < 0) return socket.emit('error', 'Tisch voll');

    const BJ_BOT_NAMES = ['Django 🤖','Paco 🤖','Luca 🤖','Baro 🤖','Kalo 🤖','Nuri 🤖','Sinto 🤖','Manusch 🤖','Pepe 🤖','Rico 🤖'];
    const botId = 'bjbot-' + (++botIdCounter);
    const name = BJ_BOT_NAMES[Math.floor(Math.random() * BJ_BOT_NAMES.length)];

    table.players.set(botId, {
      id: botId, username: name, socketId: null,
      cards: [], bet: 0, status: 'waiting', payout: 0, isBot: true
    });
    table.seats[freeSeat] = botId;

    io.to('bj-' + tableId).emit('bj:playerJoined', { username: name, seat: freeSeat });

    // Start game if waiting
    if (table.phase === 'waiting' && [...table.players.values()].filter(p => p.status !== 'spectating').length >= 1) {
      bjStartRound(table);
    } else {
      emitBJState(table);
    }
  });

  socket.on('bj:removeBots', ({ tableId }) => {
    const table = tables.blackjack.get(tableId);
    if (!table) return;
    const botIds = [...table.players.keys()].filter(id => id.startsWith('bjbot-'));
    for (const botId of botIds) {
      const seatIdx = table.seats.indexOf(botId);
      if (seatIdx >= 0) table.seats[seatIdx] = null;
      table.players.delete(botId);
      io.to('bj-' + tableId).emit('bj:playerLeft', { username: 'Bot' });
    }
    emitBJState(table);
  });

  // --- POKER ---
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

  socket.on('poker:join', ({ tableId, seat, avatarUrl }) => {
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
      // Gäste bekommen ihre Baxt als Chips, registrierte User bekommen serverseitige Balance oder 10000
      let startChips = 10000;
      if (socket.user.guest) {
        startChips = socket.user.guestBaxt || BAXT_REWARDS.guestWelcome;
      } else if (socket.user.baxtCoins !== undefined) {
        startChips = Math.max(socket.user.baxtCoins, 100); // Mindestens 100
      }
      table.players.set(socket.user.id, {
        id: socket.user.id, username: socket.user.username, socketId: socket.id,
        cards: [], chips: startChips, folded: false, roundBet: 0, spectator: false, allIn: false,
        avatarUrl: avatarUrl || null, isGuest: !!socket.user.guest
      });
    }
    table.seats[seat] = socket.user.id;
    table.players.get(socket.user.id).socketId = socket.id;

    io.to('pk-' + tableId).emit('poker:playerJoined', { username: socket.user.username, seat });
    emitPokerState(table);

    // Gästen ihre aktuelle Chip-Zahl als Baxt-Update senden
    if (socket.user.guest) {
      socket.emit('guest:baxtUpdate', { baxt: table.players.get(socket.user.id).chips });
    }

    if (table.phase === 'waiting' && [...table.players.values()].filter(p => !p.spectator).length >= 2) {
      pokerStartRound(table);
    }

    // Showcase-Bots anpassen wenn echter Spieler kommt
    if (tableId === 'tisch-1') setTimeout(ensureShowcaseBots, 500);
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
    const botCount = [...table.players.values()].filter(p => p.isBot).length;
    if (botCount >= 4) return socket.emit('error', 'Maximal 4 Bots erlaubt');
    const freeSeats = table.seats.filter(s => !s).length;
    if (freeSeats <= 2) return socket.emit('error', 'Mindestens 2 Plätze bleiben frei');
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

  // --- JUKEBOX (globale Musik-Sync) ---
  socket.on('jukebox:join', () => {
    socket.join('jukebox');
    // Aktuellen State mit geschätzter Spielzeit senden
    if (global.jukeboxState && global.jukeboxState.videoId) {
      const state = { ...global.jukeboxState };
      if (state.playing && state.startedAt) {
        state.time = Math.floor((Date.now() - state.startedAt) / 1000) + (state.timeOffset || 0);
      }
      socket.emit('jukebox:sync', state);
    }
  });

  socket.on('jukebox:play', (data) => {
    global.jukeboxState = {
      videoId: data.videoId, idx: data.idx, title: data.title,
      playing: true, time: 0, startedAt: Date.now(), timeOffset: 0,
      playlist: data.playlist || global.jukeboxState?.playlist || []
    };
    socket.to('jukebox').emit('jukebox:play', data);
  });

  socket.on('jukebox:pause', () => {
    if (global.jukeboxState) {
      if (global.jukeboxState.startedAt) {
        global.jukeboxState.timeOffset = Math.floor((Date.now() - global.jukeboxState.startedAt) / 1000) + (global.jukeboxState.timeOffset || 0);
      }
      global.jukeboxState.playing = false;
      global.jukeboxState.startedAt = null;
    }
    socket.to('jukebox').emit('jukebox:pause');
  });

  socket.on('jukebox:resume', () => {
    if (global.jukeboxState) {
      global.jukeboxState.playing = true;
      global.jukeboxState.startedAt = Date.now();
    }
    socket.to('jukebox').emit('jukebox:resume');
  });

  socket.on('jukebox:add', (data) => {
    if (!global.jukeboxState) global.jukeboxState = { playlist: [] };
    if (!global.jukeboxState.playlist) global.jukeboxState.playlist = [];
    const exists = global.jukeboxState.playlist.some(s => s.id === data.videoId);
    if (!exists) global.jukeboxState.playlist.push({ id: data.videoId, title: data.title });
    socket.to('jukebox').emit('jukebox:add', data);
  });

  // Playlist-Sync: Client sendet seine volle Playlist beim Join
  socket.on('jukebox:syncPlaylist', (data) => {
    if (!global.jukeboxState) global.jukeboxState = { playlist: [] };
    if (data.playlist && data.playlist.length > 0) {
      // Merge: füge fehlende Songs hinzu
      for (const song of data.playlist) {
        if (!global.jukeboxState.playlist.some(s => s.id === song.id)) {
          global.jukeboxState.playlist.push(song);
        }
      }
    }
  });

  // --- RAUM-JUKEBOXEN (Bar Räume 2+, jeder Raum eigene Musik) ---
  if (!global.roomJukeboxes) global.roomJukeboxes = {};
  function getRoomJukebox(room) {
    if (!global.roomJukeboxes[room]) global.roomJukeboxes[room] = { playlist: [] };
    return global.roomJukeboxes[room];
  }

  // Dynamisch Raum-Jukebox-Events registrieren für alle Räume
  // Format: jukebox:r{N}:join, jukebox:r{N}:play, etc.
  socket.onAny((event, data) => {
    const match = event.match(/^jukebox:r(\d+):(.+)$/);
    if (!match) return;
    const room = match[1];
    const action = match[2];
    const roomKey = 'jukebox-room-' + room;
    const state = getRoomJukebox(room);

    switch (action) {
      case 'join':
        socket.join(roomKey);
        if (state.videoId) {
          const sync = { ...state };
          if (sync.playing && sync.startedAt) {
            sync.time = Math.floor((Date.now() - sync.startedAt) / 1000) + (sync.timeOffset || 0);
          }
          socket.emit('jukebox:r' + room + ':sync', sync);
        }
        break;
      case 'play':
        global.roomJukeboxes[room] = {
          videoId: data.videoId, idx: data.idx, title: data.title,
          playing: true, time: 0, startedAt: Date.now(), timeOffset: 0,
          playlist: data.playlist || state.playlist || []
        };
        socket.to(roomKey).emit('jukebox:r' + room + ':play', data);
        break;
      case 'pause':
        if (state.startedAt) {
          state.timeOffset = Math.floor((Date.now() - state.startedAt) / 1000) + (state.timeOffset || 0);
        }
        state.playing = false;
        state.startedAt = null;
        socket.to(roomKey).emit('jukebox:r' + room + ':pause');
        break;
      case 'resume':
        state.playing = true;
        state.startedAt = Date.now();
        socket.to(roomKey).emit('jukebox:r' + room + ':resume');
        break;
      case 'add':
        if (!state.playlist) state.playlist = [];
        if (!state.playlist.some(s => s.id === data.videoId)) {
          state.playlist.push({ id: data.videoId, title: data.title });
        }
        socket.to(roomKey).emit('jukebox:r' + room + ':add', data);
        break;
      case 'syncPlaylist':
        if (data.playlist && data.playlist.length > 0) {
          if (!state.playlist) state.playlist = [];
          for (const song of data.playlist) {
            if (!state.playlist.some(s => s.id === song.id)) {
              state.playlist.push(song);
            }
          }
        }
        break;
    }
  });

  // --- BAR (Video-Chat Räume / Wohnwagen) ---
  // ─── ROULETTE ───
  if (!global.rouletteTables) global.rouletteTables = {};
  function getRlTable(id) {
    if (!global.rouletteTables[id]) global.rouletteTables[id] = { players: [], history: [] };
    return global.rouletteTables[id];
  }

  const RL_NUMBERS = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

  socket.on('rl:join', (data) => {
    const tid = (data && data.tableId) || 'tisch-1';
    socket.rlTable = tid;
    socket.rlUsername = data.username || 'Gast';
    socket.join('rl:' + tid);
    const table = getRlTable(tid);
    // Avatar-URL aus User-Profil laden
    const rlAvatarUrl = socket.user ? socket.user.avatarUrl || null : null;
    if (!table.players.find(p => p.id === socket.id)) {
      table.players.push({ id: socket.id, username: socket.rlUsername, video: false, audio: false, isYou: false, avatarUrl: rlAvatarUrl });
    }
    // Send state to this player
    const myPlayers = table.players.map(p => ({ ...p, isYou: p.id === socket.id }));
    socket.emit('rl:state', { players: myPlayers, history: table.history, phase: table.phase || 'betting', countdown: table._countdownLeft || 0, bettors: table.bettors || [] });
    // Notify others
    socket.to('rl:' + tid).emit('rl:playerJoined', { id: socket.id, username: socket.rlUsername, avatarUrl: rlAvatarUrl });
  });

  // Roulette: Spieler setzt Wetten → Countdown startet → alle drehen gemeinsam
  socket.on('rl:placeBets', (data) => {
    const tid = socket.rlTable || 'tisch-1';
    const table = getRlTable(tid);
    if (table.phase === 'spinning') return; // Während Spin keine neuen Wetten

    // Wetten speichern
    if (!table.pendingBets) table.pendingBets = {};
    table.pendingBets[socket.id] = { username: socket.rlUsername, bets: data.bets || [] };

    // Bettors-Liste updaten und broadcasten
    if (!table.bettors) table.bettors = [];
    if (!table.bettors.includes(socket.rlUsername)) table.bettors.push(socket.rlUsername);
    io.to('rl:' + tid).emit('rl:betPlaced', { username: socket.rlUsername, bettors: table.bettors });

    // Countdown starten (wenn noch nicht läuft)
    if (!table._countdownTimer) {
      table.phase = 'countdown';
      table._countdownLeft = 15;
      io.to('rl:' + tid).emit('rl:countdown', { seconds: 15 });

      table._countdownTimer = setInterval(() => {
        table._countdownLeft--;
        if (table._countdownLeft <= 0) {
          clearInterval(table._countdownTimer);
          table._countdownTimer = null;
          // SPIN!
          table.phase = 'spinning';
          const number = RL_NUMBERS[Math.floor(Math.random() * RL_NUMBERS.length)];
          table.history.unshift(number);
          if (table.history.length > 20) table.history.pop();
          io.to('rl:' + tid).emit('rl:spin', { number, bets: table.pendingBets });
          // Nach Spin: Reset (nach Animation-Zeit)
          setTimeout(() => {
            table.phase = 'betting';
            table.pendingBets = {};
            table.bettors = [];
            io.to('rl:' + tid).emit('rl:roundReset');
          }, 12000); // 12s für Spin-Animation + Ergebnis
        } else {
          io.to('rl:' + tid).emit('rl:countdown', { seconds: table._countdownLeft });
        }
      }, 1000);
    }
  });

  // Altes rl:spin als Fallback (Solo-Modus wenn nicht connected)
  socket.on('rl:spin', (data) => {
    const tid = socket.rlTable || 'tisch-1';
    const table = getRlTable(tid);
    if (table.phase === 'spinning') return;
    const number = RL_NUMBERS[Math.floor(Math.random() * RL_NUMBERS.length)];
    table.history.unshift(number);
    if (table.history.length > 20) table.history.pop();
    io.to('rl:' + tid).emit('rl:spin', { number });
  });

  socket.on('rl:media', (data) => {
    const tid = socket.rlTable;
    if (!tid) return;
    const table = getRlTable(tid);
    const p = table.players.find(pl => pl.id === socket.id);
    if (p) { p.video = data.video; p.audio = data.audio; }
    socket.to('rl:' + tid).emit('rl:media', { id: socket.id, video: data.video, audio: data.audio });
  });

  socket.on('rl:chat', (data) => {
    if (!data.msg || data.msg.length > 200) return;
    const tid = socket.rlTable;
    if (tid) socket.to('rl:' + tid).emit('rl:chat', { username: socket.rlUsername, msg: data.msg });
  });

  // Roulette WebRTC Signaling
  socket.on('rl:offer', (data) => {
    io.to(data.to).emit('rl:offer', { from: socket.id, offer: data.offer });
  });
  socket.on('rl:answer', (data) => {
    io.to(data.to).emit('rl:answer', { from: socket.id, answer: data.answer });
  });
  socket.on('rl:ice', (data) => {
    io.to(data.to).emit('rl:ice', { from: socket.id, candidate: data.candidate });
  });

  // Roulette cleanup on disconnect (added to existing disconnect handler below)
  socket.on('disconnect', () => {
    const tid = socket.rlTable;
    if (tid && global.rouletteTables[tid]) {
      global.rouletteTables[tid].players = global.rouletteTables[tid].players.filter(p => p.id !== socket.id);
      socket.to('rl:' + tid).emit('rl:playerLeft', { id: socket.id, username: socket.rlUsername });
    }
  });

  // ─── BAR ───
  function getBarRoom(room) {
    if (!global.barRooms[room]) {
      global.barRooms[room] = Array(8).fill(null);
      if (room === '1') _initBarBots(room);
    }
    return global.barRooms[room];
  }

  socket.on('bar:join', (data) => {
    const room = (data && data.room) || '1';
    socket.barRoom = room;
    socket.join('bar:' + room);
    socket.emit('bar:state', { seats: getBarRoom(room) });
  });

  socket.on('bar:sit', (data) => {
    const room = socket.barRoom || '1';
    const seats = getBarRoom(room);
    const barAvatar = socket.user ? socket.user.avatarUrl || null : null;
    const barAvatarConfig = socket.user ? socket.user.avatarConfig || null : null;
    if (data.idx >= 0 && data.idx < 8 && !seats[data.idx]) {
      seats[data.idx] = { username: data.username, id: socket.id, video: false, avatar: barAvatar, avatarConfig: barAvatarConfig };
      socket.to('bar:' + room).emit('bar:sit', { idx: data.idx, username: data.username, id: socket.id, avatar: barAvatar, avatarConfig: barAvatarConfig });
    }
  });

  socket.on('bar:leave', (data) => {
    const room = socket.barRoom || '1';
    const seats = getBarRoom(room);
    if (data.idx >= 0 && data.idx < 8 && seats[data.idx]?.id === socket.id) {
      seats[data.idx] = null;
      socket.to('bar:' + room).emit('bar:leave', { idx: data.idx });
    }
  });

  socket.on('bar:media', (data) => {
    const room = socket.barRoom || '1';
    const seats = getBarRoom(room);
    if (data.idx >= 0 && data.idx < 8 && seats[data.idx]?.id === socket.id) {
      seats[data.idx].video = data.video;
      socket.to('bar:' + room).emit('bar:media', { idx: data.idx, video: data.video, audio: data.audio });
    }
  });

  socket.on('bar:chat', (data) => {
    if (!data.msg || data.msg.length > 200) return;
    const room = socket.barRoom || '1';
    socket.to('bar:' + room).emit('bar:chat', { username: data.username, msg: data.msg });
  });

  // WebRTC Signaling für Bar
  socket.on('bar:offer', (data) => {
    io.to(data.to).emit('bar:offer', { from: socket.id, offer: data.offer });
  });
  socket.on('bar:answer', (data) => {
    io.to(data.to).emit('bar:answer', { from: socket.id, answer: data.answer });
  });
  socket.on('bar:ice', (data) => {
    io.to(data.to).emit('bar:ice', { from: socket.id, candidate: data.candidate });
  });

  // Bar: Platz freigeben bei Disconnect
  socket.on('disconnect', () => {
    const room = socket.barRoom;
    if (room && global.barRooms[room]) {
      global.barRooms[room].forEach((seat, i) => {
        if (seat && seat.id === socket.id) {
          global.barRooms[room][i] = null;
          io.to('bar:' + room).emit('bar:leave', { idx: i });
        }
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

  // --- FRIENDS & ONLINE STATUS ---
  if (!socket.user.guest) {
    onlineUsers.set(socket.user.id, { socketId: socket.id, since: Date.now() });
    // Freunde benachrichtigen
    const myFriends = socket.user.friends || [];
    myFriends.forEach(fId => {
      const fSocket = [...io.sockets.sockets.values()].find(s => s.user && s.user.id === fId);
      if (fSocket) fSocket.emit('friends:online', { userId: socket.user.id, username: socket.user.username });
    });
  }

  // --- VIDEO/AUDIO CALL SIGNALING ---
  socket.on('call:initiate', ({ targetUserId, callType }) => {
    // callType: 'video' oder 'audio'
    if (socket.user.guest) return;
    const me = socket.user;
    if (!me.friends || !me.friends.includes(targetUserId)) {
      return socket.emit('call:error', { message: 'Nur Freunde können angerufen werden' });
    }

    const targetSocket = [...io.sockets.sockets.values()].find(s => s.user && s.user.id === targetUserId);
    if (!targetSocket) {
      return socket.emit('call:error', { message: 'Spieler ist offline' });
    }

    const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    socket._activeCall = callId;
    targetSocket._activeCall = callId;

    targetSocket.emit('call:incoming', {
      callId,
      callType,
      callerId: me.id,
      callerName: me.username
    });

    socket.emit('call:ringing', { callId, targetUsername: db.users.get(targetUserId)?.username });
  });

  socket.on('call:accept', ({ callId, callerId }) => {
    const callerSocket = [...io.sockets.sockets.values()].find(s => s.user && s.user.id === callerId);
    if (callerSocket) {
      // Beide in einen Call-Room stecken
      const roomName = 'call-' + callId;
      socket.join(roomName);
      callerSocket.join(roomName);
      socket._callRoom = roomName;
      callerSocket._callRoom = roomName;

      callerSocket.emit('call:accepted', { callId, peerId: socket.id });
      socket.emit('call:connected', { callId, peerId: callerSocket.id });
    }
  });

  socket.on('call:decline', ({ callId, callerId }) => {
    const callerSocket = [...io.sockets.sockets.values()].find(s => s.user && s.user.id === callerId);
    if (callerSocket) {
      callerSocket.emit('call:declined', { callId });
    }
    socket._activeCall = null;
  });

  socket.on('call:end', ({ callId }) => {
    const roomName = 'call-' + callId;
    socket.to(roomName).emit('call:ended', { callId });
    // Alle aus dem Room entfernen
    const room = io.sockets.adapter.rooms.get(roomName);
    if (room) {
      room.forEach(sid => {
        const s = io.sockets.sockets.get(sid);
        if (s) { s.leave(roomName); s._activeCall = null; s._callRoom = null; }
      });
    }
  });

  // WebRTC Signaling für Calls
  socket.on('call:offer', ({ peerId, offer }) => {
    const peer = io.sockets.sockets.get(peerId);
    if (peer) peer.emit('call:offer', { peerId: socket.id, offer });
  });

  socket.on('call:answer', ({ peerId, answer }) => {
    const peer = io.sockets.sockets.get(peerId);
    if (peer) peer.emit('call:answer', { peerId: socket.id, answer });
  });

  socket.on('call:ice-candidate', ({ peerId, candidate }) => {
    const peer = io.sockets.sockets.get(peerId);
    if (peer) peer.emit('call:ice-candidate', { peerId: socket.id, candidate });
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    console.log(`🔌 ${socket.user.username} disconnected`);

    // Friends offline tracking
    if (!socket.user.guest) {
      onlineUsers.delete(socket.user.id);
      onlineUsers.set(socket.user.id + '_lastSeen', new Date().toISOString());
      const myFriends = socket.user.friends || [];
      myFriends.forEach(fId => {
        const fSocket = [...io.sockets.sockets.values()].find(s => s.user && s.user.id === fId);
        if (fSocket) fSocket.emit('friends:offline', { userId: socket.user.id });
      });
    }

    // Active call cleanup
    if (socket._callRoom) {
      socket.to(socket._callRoom).emit('call:ended', { reason: 'disconnect' });
    }

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
        // Showcase-Bots nachfüllen wenn Spieler geht
        if (table.id === 'tisch-1') setTimeout(ensureShowcaseBots, 2000);
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
