const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const geoip = require('geoip-lite');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'reisendes-casino-secret-change-in-production';

// ---------------------------------------------------------------------------
// In-Memory DB (später PostgreSQL)
// ---------------------------------------------------------------------------
const db = {
  users: new Map(),
  transactions: new Map(),
  sessions: new Map()
};

// ---------------------------------------------------------------------------
// Blocked Countries (GlüStV compliance)
// ---------------------------------------------------------------------------
const BLOCKED_COUNTRIES = ['DE', 'AT', 'US', 'GB', 'FR', 'NL', 'ES', 'AU', 'IT'];

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
    verified: false
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
// START
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🎰 Reisendes Casino Backend running on port ${PORT}`);
  console.log(`🌍 Open: http://localhost:${PORT}\n`);
});
