// Settings Fab - Draggable with responsive percentage position persistence
(function(){
  // Make the gear more visible across all games by injecting a global style
  const style = document.createElement('style');
  style.innerHTML = `
    .settings-fab, .vc-fab {
      background: linear-gradient(135deg, #E67E22, #D35400) !important;
      border: 2px solid #FFF !important;
      box-shadow: 0 4px 16px rgba(230, 126, 34, 0.6) !important;
      color: #FFF !important;
      text-shadow: 0 2px 4px rgba(0,0,0,0.8) !important;
      opacity: 0.95 !important;
      z-index: 9999 !important;
    }
    .settings-fab:hover, .vc-fab:hover {
      opacity: 1 !important;
      transform: scale(1.1) !important;
      box-shadow: 0 6px 20px rgba(230, 126, 34, 0.9) !important;
    }
  `;
  document.head.appendChild(style);

  const fab = document.querySelector('.settings-fab') || document.querySelector('.vc-fab');
  if (!fab) return;
  const menu = document.querySelector('.settings-menu') || document.querySelector('.vc-controls');

  const KEY = 'settings-fab-pos';
  let dragging = false, wasDragged = false, startX, startY, origX, origY;
  const THRESHOLD = 8;

  function applySavedPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (!saved) return;
      
      let topPct, leftPct;
      if (typeof saved.topPct !== 'undefined') {
        topPct = saved.topPct;
        leftPct = saved.leftPct;
      } else if (typeof saved.top !== 'undefined') {
        // Fallback from old px-based save
        topPct = (saved.top / window.innerHeight) * 100;
        leftPct = (saved.left / window.innerWidth) * 100;
      } else return;
      
      // Ensure it's inside viewport (min 2%, max 90%)
      topPct = Math.max(2, Math.min(90, topPct));
      leftPct = Math.max(2, Math.min(90, leftPct));

      fab.style.top = topPct + '%';
      fab.style.right = 'auto';
      fab.style.left = leftPct + '%';
      
      if (menu) {
        menu.style.top = 'calc(' + topPct + '% + 50px)';
        menu.style.right = 'auto';
        menu.style.left = leftPct + '%';
      }
    } catch(e) {}
  }
  
  // Initial position setup
  applySavedPosition();

  // Make draggable
  fab.style.cursor = 'grab';
  fab.style.touchAction = 'none';

  function onStart(e) {
    if (e.type === 'mousedown') {
      // Verhindert, dass der Browser versucht Text zu selektieren oder native element drags auszuführen!
      e.preventDefault();
    }
    dragging = false; wasDragged = false;
    const t = e.touches ? e.touches[0] : e;
    startX = t.clientX; startY = t.clientY;
    const r = fab.getBoundingClientRect();
    origX = r.left; origY = r.top;
  }
  function onMove(e) {
    if (wasDragged === false && !dragging) {
      const t = e.touches ? e.touches[0] : e;
      if (Math.abs(t.clientX - startX) < THRESHOLD && Math.abs(t.clientY - startY) < THRESHOLD) return;
      dragging = true; wasDragged = true;
      fab.style.cursor = 'grabbing';
    }
    if (!dragging) return;
    if (e.cancelable) e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    
    // Keep inside boundaries during drag
    const nx = Math.max(0, Math.min(window.innerWidth - 50, origX + (t.clientX - startX)));
    const ny = Math.max(0, Math.min(window.innerHeight - 50, origY + (t.clientY - startY)));
    
    fab.style.right = 'auto';
    fab.style.left = nx + 'px';
    fab.style.top = ny + 'px';
    
    if (menu) {
      menu.style.right = 'auto';
      menu.style.left = nx + 'px';
      menu.style.top = (ny + 50) + 'px';
    }
  }
  function onEnd() {
    if (dragging) {
      dragging = false;
      fab.style.cursor = 'grab';
      
      // Calculate new percentage of viewport
      const rect = fab.getBoundingClientRect();
      const topPct = (rect.top / window.innerHeight) * 100;
      const leftPct = (rect.left / window.innerWidth) * 100;
      
      // Save it
      localStorage.setItem(KEY, JSON.stringify({
        topPct: topPct,
        leftPct: leftPct
      }));
      
      // Lock position permanently to percentages so resize logic works right away
      fab.style.top = topPct + '%';
      fab.style.left = leftPct + '%';
      if (menu) {
        menu.style.top = 'calc(' + topPct + '% + 50px)';
        menu.style.left = leftPct + '%';
      }
    }
  }

  fab.addEventListener('mousedown', onStart);
  fab.addEventListener('touchstart', onStart, {passive: true});
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, {passive: false});
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchend', onEnd);

  // Relocate after window resize
  window.addEventListener('resize', () => { setTimeout(applySavedPosition, 200); });

  // Block click when dragged
  fab.addEventListener('click', function(e) {
    if (wasDragged) { e.stopImmediatePropagation(); e.preventDefault(); wasDragged = false; }
  }, true);
})();
