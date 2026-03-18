// Settings Fab - Draggable with position persistence (Admin only)
(function(){
  const fab = document.querySelector('.settings-fab') || document.querySelector('.vc-fab');
  if (!fab) return;
  const menu = document.querySelector('.settings-menu') || document.querySelector('.vc-controls');

  // Hide by default — show only for admins
  fab.style.display = 'none';
  if (menu) menu.style.display = 'none';

  // Check admin status
  function checkAdmin() {
    const token = localStorage.getItem('casinoToken');
    if (!token) return;
    const API = window.API || (location.origin.includes('localhost') ? 'http://localhost:3000' : '');
    fetch((API || '') + '/api/admin/check', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(r => r.json())
      .then(d => {
        if (d.isAdmin) {
          fab.style.display = '';
          window._isAdmin = true;
        }
      })
      .catch(() => {});
  }
  checkAdmin();

  const KEY = 'settings-fab-pos';
  let dragging = false, wasDragged = false, startX, startY, origX, origY;
  const THRESHOLD = 8;

  // Restore saved position
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) {
    fab.style.top = saved.top + 'px';
    fab.style.right = 'auto';
    fab.style.left = saved.left + 'px';
    if (menu) {
      menu.style.top = (saved.top + 50) + 'px';
      menu.style.right = 'auto';
      menu.style.left = saved.left + 'px';
    }
  }

  // Make draggable
  fab.style.cursor = 'grab';
  fab.style.touchAction = 'none';

  function onStart(e) {
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
      localStorage.setItem(KEY, JSON.stringify({
        top: parseInt(fab.style.top),
        left: parseInt(fab.style.left)
      }));
    }
  }

  fab.addEventListener('mousedown', onStart);
  fab.addEventListener('touchstart', onStart, {passive: true});
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, {passive: false});
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchend', onEnd);

  // Block click when dragged
  fab.addEventListener('click', function(e) {
    if (wasDragged) { e.stopImmediatePropagation(); e.preventDefault(); wasDragged = false; }
  }, true);
})();
