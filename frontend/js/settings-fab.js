// Gemeinsame Toolbar für Video-/Audio-Chat - Draggable mit prozentualer Speicherung
(function(){
  // Wir blendet das Zahnrad aus und machen stattdessen das Menü dauerhaft als eine schicke Toolbar sichtbar!
  const style = document.createElement('style');
  style.innerHTML = `
    .settings-fab, .vc-fab {
      display: none !important; /* RIP Zahnrad */
    }
    .settings-menu, .vc-controls {
      position: fixed !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      display: flex !important;
      flex-direction: row !important;
      gap: 12px !important;
      align-items: center !important;
      background: rgba(0,0,0,0.15) !important;
      padding: 10px 18px !important;
      border-radius: 40px !important;
      border: 1px solid rgba(255,255,255,0.08) !important;
      box-shadow: none !important;
      backdrop-filter: blur(8px) !important;
      z-index: 99999 !important;
      cursor: grab !important;
      transition: none !important; /* Animationen für Sichtbarkeit deaktivieren */
    }
    .settings-menu:active, .vc-controls:active {
      cursor: grabbing !important;
    }
    .settings-menu-btn, .vc-btn {
      width: 44px !important;
      height: 44px !important;
      border-radius: 50% !important;
      background: rgba(255,255,255,0.05) !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
      color: #F0E6D3 !important;
      font-size: 20px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
      box-shadow: none !important;
    }
    .settings-menu-btn:hover, .vc-btn:hover {
      background: rgba(212,175,55,0.2) !important;
      border-color: rgba(212,175,55,0.6) !important;
      transform: scale(1.08) !important;
      color: #FFF !important;
    }
    .settings-menu-btn.active, .vc-btn.active {
      background: rgba(76,175,80,0.25) !important;
      border-color: #4CAF50 !important;
      color: #fff !important;
      box-shadow: 0 0 12px rgba(76,175,80,0.4) !important;
    }
    /* Greet Handle for usability */
    .drag-handle {
      color: rgba(212,175,55,0.4);
      font-size: 18px;
      margin-right: 4px;
      user-select: none;
      pointer-events: none;
      font-family: monospace;
    }
  `;
  document.head.appendChild(style);

  // Finde das Menu-Container (Bar, Poker, Blackjack etc.)
  const menu = document.querySelector('.settings-menu') || document.querySelector('.vc-controls');
  if (!menu) return;

  // Füge einen Drag-Handle hinzu zur besseren Orientierung
  const handle = document.createElement('div');
  handle.className = 'drag-handle';
  handle.innerHTML = '⋮⋮';
  menu.insertBefore(handle, menu.firstChild);

  // Lautstärke-Regler in der Bar horizontalisieren
  const slider = document.getElementById('volumeSlider');
  if (slider) {
    slider.style.cssText = 'width:80px;height:12px;writing-mode:horizontal-tb;direction:ltr;accent-color:#D4AF37;cursor:pointer;margin:0 4px;';
  }

  const KEY = 'toolbar-pos-v2';
  let isDown = false, dragging = false, wasDragged = false, startX, startY, origX, origY;
  const THRESHOLD = 8;

  function applySavedPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (!saved) {
        // Fallback: Initially am oberen Bildschirmrand platzieren (Mitte)
        menu.style.top = '20px';
        menu.style.right = 'auto';
        menu.style.left = '50%';
        menu.style.transform = 'translateX(-50%)';
        return;
      }
      
      let topPct = saved.topPct;
      let leftPct = saved.leftPct;
      
      topPct = Math.max(2, Math.min(92, topPct));
      leftPct = Math.max(2, Math.min(92, leftPct));

      menu.style.transform = 'none'; // Transform aufheben
      menu.style.top = topPct + '%';
      menu.style.right = 'auto';
      menu.style.left = leftPct + '%';
    } catch(e) {}
  }
  
  applySavedPosition();

  function onStart(e) {
    // Falls auf ein interaktives Element (Button/Slider) geklickt wurde, kein Drag!
    if (e.target.closest('button') || e.target.tagName.toLowerCase() === 'input') return;

    if (e.type === 'mousedown') {
      e.preventDefault(); // Nativer Browser-Drag Fehler
    }
    
    isDown = true;
    dragging = false; wasDragged = false;
    const t = e.touches ? e.touches[0] : e;
    startX = t.clientX; startY = t.clientY;
    
    // Wir müssen die aktuelle px-Position auslesen
    const r = menu.getBoundingClientRect();
    origX = r.left; origY = r.top;
    
    // Wenn transform genutzt wurde (initial state), löschen wir es für reine L/T-Werte
    menu.style.transform = 'none';
    menu.style.top = origY + 'px';
    menu.style.left = origX + 'px';
  }

  function onMove(e) {
    // Ultramassiver Sicherheit-Check gegen festklebende Maus:
    if (e.type === 'mousemove' && e.buttons === 0) {
      isDown = false;
      dragging = false;
      return;
    }
    if (!isDown) return;
    if (wasDragged === false && !dragging) {
      const t = e.touches ? e.touches[0] : e;
      if (Math.abs(t.clientX - startX) < THRESHOLD && Math.abs(t.clientY - startY) < THRESHOLD) return;
      dragging = true; wasDragged = true;
    }
    if (!dragging) return;
    if (e.cancelable) e.preventDefault();
    
    const t = e.touches ? e.touches[0] : e;
    
    // Constraints für den Bildschirm
    const maxX = window.innerWidth - menu.offsetWidth;
    const maxY = window.innerHeight - menu.offsetHeight;
    
    const nx = Math.max(0, Math.min(maxX, origX + (t.clientX - startX)));
    const ny = Math.max(0, Math.min(maxY, origY + (t.clientY - startY)));
    
    menu.style.right = 'auto';
    menu.style.left = nx + 'px';
    menu.style.top = ny + 'px';
  }

  function onEnd() {
    isDown = false;
    if (dragging) {
      dragging = false;
      const rect = menu.getBoundingClientRect();
      const topPct = (rect.top / window.innerHeight) * 100;
      const leftPct = (rect.left / window.innerWidth) * 100;
      
      localStorage.setItem(KEY, JSON.stringify({
        topPct: topPct,
        leftPct: leftPct
      }));
      
      menu.style.top = topPct + '%';
      menu.style.left = leftPct + '%';
    }
  }

  menu.addEventListener('mousedown', onStart);
  menu.addEventListener('touchstart', onStart, {passive: true});
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, {passive: false});
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchend', onEnd);

  // Resize-Listener
  window.addEventListener('resize', () => { setTimeout(applySavedPosition, 200); });

  // Falls doch noch Clicks auf den Container abgefangen werden sollen
  menu.addEventListener('click', function(e) {
    if (wasDragged) { e.stopImmediatePropagation(); e.preventDefault(); wasDragged = false; }
  }, true);

})();
