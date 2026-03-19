// ===== DOOR SOUND =====
// Spielt den Tür-Sound wenn jemand ein Spiel betritt oder verlässt
// Wird in allen Spielen eingebunden

(function() {
  'use strict';

  // Skip in embed mode
  if (new URLSearchParams(window.location.search).get('embed') === '1') return;
  if (new URLSearchParams(window.location.search).get('silent') === '1') return;

  let doorAudio = null;
  let doorReady = false;

  // Preload door sound
  function initDoorSound() {
    if (doorAudio) return;
    try {
      doorAudio = new Audio('/games/sounds/door.mp3');
      doorAudio.volume = 0.4;
      doorAudio.preload = 'auto';
      doorReady = true;
    } catch(e) {}
  }

  // Init on first user interaction
  document.addEventListener('click', initDoorSound, { once: true });
  document.addEventListener('touchstart', initDoorSound, { once: true });
  // Also try immediate
  initDoorSound();

  let lastPlayTime = 0;
  function playDoorSound() {
    if (!doorAudio || !doorReady) return;
    // Debounce: Nicht doppelt abspielen innerhalb 1.5s
    var now = Date.now();
    if (now - lastPlayTime < 1500) return;
    lastPlayTime = now;
    try {
      doorAudio.currentTime = 0;
      doorAudio.play().catch(() => {});
    } catch(e) {}
  }

  // Expose globally
  window.playDoorSound = playDoorSound;
})();
