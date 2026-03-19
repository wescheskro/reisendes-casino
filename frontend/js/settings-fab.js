// ═══════════════════════════════════════════════════════════════════
// Floating Audio/Video Toolbar — Polished, Draggable, Collapsible
// ═══════════════════════════════════════════════════════════════════
(function(){
  const style = document.createElement('style');
  style.innerHTML = `
    /* ── Hide legacy gear button ── */
    .settings-fab, .vc-fab {
      display: none !important;
    }

    /* ── Toolbar Container ── */
    .settings-menu, .vc-controls {
      position: fixed !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      display: flex !important;
      flex-direction: row !important;
      gap: 8px !important;
      align-items: center !important;
      background: rgba(10, 10, 18, 0.45) !important;
      padding: 6px 12px !important;
      border-radius: 28px !important;
      border: 1px solid rgba(212,175,55, 0.12) !important;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3) !important;
      backdrop-filter: blur(16px) saturate(1.4) !important;
      -webkit-backdrop-filter: blur(16px) saturate(1.4) !important;
      z-index: 99999 !important;
      cursor: grab !important;
      transition: padding 0.25s ease, gap 0.25s ease, border-radius 0.25s ease,
                  box-shadow 0.25s ease, background 0.25s ease !important;
      user-select: none !important;
    }
    .settings-menu:active, .vc-controls:active {
      cursor: grabbing !important;
    }

    /* ── Buttons (Mic / Cam / Speaker) ── */
    .settings-menu-btn, .vc-btn {
      width: 38px !important;
      height: 38px !important;
      border-radius: 50% !important;
      background: rgba(255,255,255,0.06) !important;
      border: 1px solid rgba(255,255,255,0.08) !important;
      color: rgba(240,230,211,0.75) !important;
      font-size: 18px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
      box-shadow: none !important;
      flex-shrink: 0 !important;
    }
    .settings-menu-btn:hover, .vc-btn:hover {
      background: rgba(212,175,55,0.15) !important;
      border-color: rgba(212,175,55,0.4) !important;
      color: #FFF !important;
      transform: scale(1.1) !important;
      box-shadow: 0 0 10px rgba(212,175,55,0.15) !important;
    }
    .settings-menu-btn:active, .vc-btn:active {
      transform: scale(0.95) !important;
    }
    .settings-menu-btn.active, .vc-btn.active {
      background: rgba(76,175,80,0.2) !important;
      border-color: rgba(76,175,80,0.5) !important;
      color: #7dff8a !important;
      box-shadow: 0 0 8px rgba(76,175,80,0.25) !important;
    }

    /* ── Drag Handle ── */
    .drag-handle {
      color: rgba(212,175,55,0.25);
      font-size: 14px;
      margin-right: 2px;
      user-select: none;
      pointer-events: none;
      font-family: monospace;
      letter-spacing: -2px;
      transition: color 0.2s;
    }
    .settings-menu:hover .drag-handle,
    .vc-controls:hover .drag-handle {
      color: rgba(212,175,55,0.5);
    }

    /* ── Collapse/Expand Toggle ── */
    .toolbar-toggle {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      color: rgba(240,230,211,0.45);
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.25s;
      flex-shrink: 0;
      pointer-events: auto;
      margin-left: -2px;
    }
    .toolbar-toggle:hover {
      background: rgba(212,175,55,0.15);
      color: #FFF;
      border-color: rgba(212,175,55,0.3);
    }

    /* ── Collapsed State ── */
    .settings-menu.collapsed, .vc-controls.collapsed {
      padding: 5px 6px !important;
      gap: 0 !important;
      border-radius: 50% !important;
      background: rgba(10,10,18,0.55) !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
    }
    .settings-menu.collapsed .settings-menu-btn,
    .settings-menu.collapsed .vc-btn,
    .vc-controls.collapsed .settings-menu-btn,
    .vc-controls.collapsed .vc-btn,
    .settings-menu.collapsed .drag-handle,
    .vc-controls.collapsed .drag-handle,
    .settings-menu.collapsed input,
    .vc-controls.collapsed input {
      display: none !important;
    }
    .settings-menu.collapsed .toolbar-toggle,
    .vc-controls.collapsed .toolbar-toggle {
      width: 28px;
      height: 28px;
      font-size: 13px;
      margin: 0;
      color: rgba(212,175,55,0.6);
    }

    /* ── Mobile Responsive ── */
    @media (max-width: 480px) {
      .settings-menu-btn, .vc-btn {
        width: 34px !important;
        height: 34px !important;
        font-size: 16px !important;
      }
      .settings-menu, .vc-controls {
        gap: 6px !important;
        padding: 5px 10px !important;
      }
    }
  `;
  document.head.appendChild(style);

  // ── Find the menu container ──
  const menu = document.querySelector('.settings-menu') || document.querySelector('.vc-controls');
  if (!menu) return;

  // ── Drag Handle ──
  const handle = document.createElement('div');
  handle.className = 'drag-handle';
  handle.innerHTML = '⋮⋮';
  menu.insertBefore(handle, menu.firstChild);

  // ── Collapse/Expand Toggle ──
  const toggleBtn = document.createElement('div');
  toggleBtn.className = 'toolbar-toggle';
  toggleBtn.title = 'Einklappen / Ausklappen';
  const wasCollapsed = localStorage.getItem('toolbar-collapsed') === '1';
  toggleBtn.textContent = wasCollapsed ? '◂' : '▾';
  if (wasCollapsed) menu.classList.add('collapsed');
  menu.appendChild(toggleBtn);

  toggleBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    const isCollapsed = menu.classList.toggle('collapsed');
    toggleBtn.textContent = isCollapsed ? '◂' : '▾';
    localStorage.setItem('toolbar-collapsed', isCollapsed ? '1' : '0');
  });

  // ── Volume slider horizontal (for Bar) ──
  const slider = document.getElementById('volumeSlider');
  if (slider) {
    slider.style.cssText = 'width:70px;height:10px;writing-mode:horizontal-tb;direction:ltr;accent-color:#D4AF37;cursor:pointer;margin:0 2px;';
  }

  // ═══════════════════════════════════════════════════════════════
  // DRAG LOGIC — Percentage-based position persistence
  // ═══════════════════════════════════════════════════════════════
  const KEY = 'toolbar-pos-v2';
  let isDown = false, dragging = false, wasDragged = false, startX, startY, origX, origY;
  const THRESHOLD = 8;

  function applySavedPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (!saved) {
        menu.style.top = '12px';
        menu.style.right = 'auto';
        menu.style.left = '50%';
        menu.style.transform = 'translateX(-50%)';
        return;
      }
      let topPct = Math.max(1, Math.min(94, saved.topPct));
      let leftPct = Math.max(1, Math.min(94, saved.leftPct));
      menu.style.transform = 'none';
      menu.style.top = topPct + '%';
      menu.style.right = 'auto';
      menu.style.left = leftPct + '%';
    } catch(e) {}
  }

  applySavedPosition();

  function onStart(e) {
    if (e.target.closest('button') || e.target.closest('.toolbar-toggle')
        || e.target.tagName.toLowerCase() === 'input') return;
    if (e.type === 'mousedown') e.preventDefault();
    isDown = true;
    dragging = false; wasDragged = false;
    const t = e.touches ? e.touches[0] : e;
    startX = t.clientX; startY = t.clientY;
    const r = menu.getBoundingClientRect();
    origX = r.left; origY = r.top;
    menu.style.transform = 'none';
    menu.style.top = origY + 'px';
    menu.style.left = origX + 'px';
  }

  function onMove(e) {
    if (e.type === 'mousemove' && e.buttons === 0) {
      isDown = false; dragging = false; return;
    }
    if (!isDown) return;
    if (!wasDragged && !dragging) {
      const t = e.touches ? e.touches[0] : e;
      if (Math.abs(t.clientX - startX) < THRESHOLD && Math.abs(t.clientY - startY) < THRESHOLD) return;
      dragging = true; wasDragged = true;
    }
    if (!dragging) return;
    if (e.cancelable) e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
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
      localStorage.setItem(KEY, JSON.stringify({ topPct, leftPct }));
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
  window.addEventListener('resize', () => setTimeout(applySavedPosition, 200));

  menu.addEventListener('click', function(e) {
    if (wasDragged) { e.stopImmediatePropagation(); e.preventDefault(); wasDragged = false; }
  }, true);

})();
