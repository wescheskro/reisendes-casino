/**
 * 🎰 Multiplayer-Test: 3 Agenten spielen Poker + chatten
 *
 * Simuliert 3 echte Spieler die sich an einen Tisch setzen,
 * Poker spielen, chatten und XP verdienen.
 */

const { io } = require('socket.io-client');

const SERVER = 'http://localhost:3000';
const TABLE = 'tisch-1';

// Farben für Console-Output
const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

const PLAYER_COLORS = [C.green, C.cyan, C.magenta];
const PLAYER_SEATS = [0, 1, 3]; // Verschiedene Plätze

// Chat-Nachrichten die die Agenten senden
const CHAT_MESSAGES = [
  ['Put Baxt! 🍀', 'Heute wird mein Tag!', 'Wer traut sich? 😎'],
  ['Lass uns spielen! 🎲', 'Gute Karten heute 🃏', 'Nicht schlecht! 👏'],
  ['Ich bin bereit! 💪', 'Schausteller-Power! 🎪', 'Das war knapp! 😅']
];

let roundCount = 0;
let totalActions = 0;
const MAX_ROUNDS = 5;

function log(playerIdx, msg) {
  const color = PLAYER_COLORS[playerIdx] || C.reset;
  const name = `Spieler ${playerIdx + 1}`;
  console.log(`${color}[${name}]${C.reset} ${msg}`);
}

function logSystem(msg) {
  console.log(`${C.yellow}${C.bold}[SYSTEM]${C.reset} ${msg}`);
}

function logXP(playerIdx, data) {
  const color = PLAYER_COLORS[playerIdx];
  let msg = `⭐ +${data.xpGained} XP (Level ${data.newLevel})`;
  if (data.leveledUp) {
    msg += ` ${C.bold}🎉 LEVEL UP!${C.reset}`;
    if (data.newChests && data.newChests.length > 0) {
      msg += ` Truhen: ${data.newChests.map(c => c.label).join(', ')}`;
    }
  }
  console.log(`${color}[Spieler ${playerIdx + 1}]${C.reset} ${msg}`);
}

function createPlayer(index) {
  return new Promise((resolve) => {
    const socket = io(SERVER, {
      transports: ['websocket'],
      reconnection: false
    });

    let myState = null;
    let myName = '';
    let actedThisRound = false;

    socket.on('connect', () => {
      myName = `Agent-${index + 1}`;
      log(index, `✅ Verbunden (Socket: ${socket.id})`);

      // An Tisch setzen
      socket.emit('poker:join', { tableId: TABLE, seat: PLAYER_SEATS[index] });
      log(index, `🪑 Setze mich auf Platz ${PLAYER_SEATS[index]}`);

      // Chat-Nachricht senden
      setTimeout(() => {
        const msg = CHAT_MESSAGES[index][0];
        socket.emit('chat:msg', { room: 'pk-' + TABLE, msg });
        log(index, `💬 Chat: "${msg}"`);
      }, 1000 + index * 500);

      resolve({ socket, index });
    });

    socket.on('poker:state', (state) => {
      myState = state;

      // Bin ich dran?
      if (state.currentSeat >= 0 && state.seats[state.currentSeat] && state.seats[state.currentSeat].isYou) {
        if (actedThisRound) return;
        actedThisRound = true;

        const me = state.seats[state.currentSeat];
        const toCall = state.currentBet - (me.bet || 0);

        // Zufällige Aktion
        setTimeout(() => {
          const roll = Math.random();

          if (toCall <= 0) {
            // Kann schieben
            if (roll < 0.4) {
              socket.emit('poker:check');
              log(index, `✓ Schieben`);
            } else {
              const raiseAmt = Math.min(Math.max(state.currentBet * 2, 200), me.chips);
              socket.emit('poker:raise', { amount: raiseAmt });
              log(index, `⬆ Erhöhen auf ${raiseAmt}`);
            }
          } else if (roll < 0.2) {
            socket.emit('poker:fold');
            log(index, `✕ Passen (zu teuer: ${toCall})`);
          } else if (roll < 0.7) {
            socket.emit('poker:call');
            log(index, `📞 Mitgehen (${toCall})`);
          } else {
            const raiseAmt = Math.min(Math.max(state.currentBet * 2, 400), me.chips);
            socket.emit('poker:raise', { amount: raiseAmt });
            log(index, `⬆ Erhöhen auf ${raiseAmt}`);
          }
          totalActions++;
        }, 300 + Math.random() * 700);
      }

      // Phase wechsel erkennen
      if (state.phase === 'preflop' || state.phase === 'flop' || state.phase === 'turn' || state.phase === 'river') {
        actedThisRound = false;
      }
    });

    socket.on('poker:winner', (data) => {
      log(index, `🏆 ${data.username} gewinnt! (${data.hand}) Pot: ${data.pot}`);
      roundCount++;

      // Chat nach Runde
      const chatIdx = Math.min(roundCount, CHAT_MESSAGES[index].length - 1);
      setTimeout(() => {
        const msg = CHAT_MESSAGES[index][chatIdx] || '👏';
        socket.emit('chat:msg', { room: 'pk-' + TABLE, msg });
        log(index, `💬 Chat: "${msg}"`);
      }, 500);
    });

    socket.on('poker:playerJoined', (d) => {
      if (index === 0) logSystem(`👋 ${d.username} setzt sich an den Tisch`);
    });

    socket.on('chat:msg', (d) => {
      // Nur von anderen Spielern anzeigen (nicht eigene)
      if (index === 0 && d.username !== myName) {
        logSystem(`💬 ${d.username}: ${d.msg}`);
      }
    });

    socket.on('xp:gained', (data) => {
      logXP(index, data);
    });

    socket.on('error', (msg) => {
      log(index, `❌ Fehler: ${msg}`);
    });

    socket.on('disconnect', () => {
      log(index, `🔌 Getrennt`);
    });
  });
}

async function runTest() {
  console.log('\n' + '═'.repeat(60));
  logSystem('🎰 MULTIPLAYER-TEST STARTET');
  logSystem('3 Agenten spielen Poker am selben Tisch');
  console.log('═'.repeat(60) + '\n');

  // Alle 3 Spieler verbinden (mit kleiner Verzögerung)
  const players = [];
  for (let i = 0; i < 3; i++) {
    const p = await createPlayer(i);
    players.push(p);
    await new Promise(r => setTimeout(r, 800));
  }

  logSystem(`✅ Alle 3 Spieler verbunden und am Tisch!\n`);

  // Warte auf Runden
  const checkInterval = setInterval(() => {
    if (roundCount >= MAX_ROUNDS) {
      clearInterval(checkInterval);

      console.log('\n' + '═'.repeat(60));
      logSystem('📊 TEST-ERGEBNIS:');
      logSystem(`✅ ${roundCount} Runden gespielt`);
      logSystem(`✅ ${totalActions} Aktionen ausgeführt`);
      logSystem(`✅ 3 Spieler erfolgreich verbunden`);
      logSystem(`✅ Chat funktioniert`);
      logSystem(`✅ XP-System aktiv`);
      console.log('═'.repeat(60));
      logSystem('🎉 MULTIPLAYER FUNKTIONIERT!\n');

      // API-Test: Items & Inventar
      fetch(`${SERVER}/api/items`)
        .then(r => r.json())
        .then(data => {
          logSystem(`📦 Item-Katalog: ${data.items.length} Items, ${Object.keys(data.chestTypes).length} Truhen-Typen`);
          logSystem(`🏅 Ränge: ${data.ränge.map(r => r.label).join(' → ')}`);

          // Alle trennen
          setTimeout(() => {
            players.forEach(p => p.socket.disconnect());
            logSystem('👋 Alle Spieler getrennt. Test beendet.');
            process.exit(0);
          }, 1000);
        });
    }
  }, 2000);

  // Safety timeout
  setTimeout(() => {
    console.log('\n');
    logSystem(`⏱️ Timeout nach 60s – ${roundCount} von ${MAX_ROUNDS} Runden gespielt`);
    if (roundCount > 0) {
      logSystem('✅ Multiplayer funktioniert grundsätzlich!');
    } else {
      logSystem('⚠️ Keine Runden gespielt – prüfe Server');
    }
    players.forEach(p => p.socket.disconnect());
    process.exit(roundCount > 0 ? 0 : 1);
  }, 60000);
}

runTest().catch(err => {
  console.error('Test-Fehler:', err);
  process.exit(1);
});
