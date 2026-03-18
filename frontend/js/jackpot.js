// ===== GLOBAL JACKPOT TICKER =====
// Visueller Ticker — rein dekorativ, kein echter Pool.
// Zeitbasiert: alle Seiten zeigen synchron denselben Wert.

(function() {
  const JACKPOT_EPOCH = 1742169600000; // 2025-03-17T00:00:00Z
  const BASE_VALUE = 8437.62;
  const RATE_PER_SEC = 0.083; // ~300 B/Stunde

  function getJackpotValue() {
    const elapsed = (Date.now() - JACKPOT_EPOCH) / 1000;
    return BASE_VALUE + (elapsed * RATE_PER_SEC);
  }

  function fmt(v) {
    return v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20BF';
  }

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = `
    .jackpot-banner {
      width: 90%; max-width: 520px;
      margin: 8px auto 10px; padding: 10px 16px;
      background: linear-gradient(135deg, rgba(20,12,8,.92), rgba(40,20,5,.92));
      border: 2px solid rgba(212,175,55,.5);
      border-radius: 14px; text-align: center;
      position: relative; overflow: hidden;
      box-shadow: 0 0 25px rgba(212,175,55,.12), 0 6px 24px rgba(0,0,0,.4);
      z-index: 50;
    }
    .jackpot-banner::before {
      content: ''; position: absolute; inset: -2px;
      border-radius: 16px;
      background: linear-gradient(90deg, transparent, rgba(212,175,55,.3), transparent);
      background-size: 200% 100%;
      animation: jpShimmer 3s ease-in-out infinite;
      z-index: 0; pointer-events: none;
    }
    @keyframes jpShimmer {
      0%, 100% { background-position: -200% 0; }
      50% { background-position: 200% 0; }
    }
    .jp-coin { perspective:200px; display:inline-block; }
    .jp-coin .jpc { position:relative; transform-style:preserve-3d; animation:baxt-spin 4s linear infinite; }
    .jp-coin .jpf { position:absolute;inset:0;backface-visibility:hidden;border-radius:50%;overflow:hidden;transform:translateZ(3px); }
    .jp-coin .jpf img { width:100%;height:100%;object-fit:cover; }
    .jp-coin .jpf.jpb { transform:rotateY(180deg) translateZ(3px); }
    .jp-coin .jpe { position:absolute;inset:0;border-radius:50%;background:linear-gradient(180deg,#F4D03F,#D4AF37 25%,#8a6d0b 50%,#D4AF37 75%,#F4D03F); }
    @keyframes baxt-spin {
      0% { transform: rotateY(0deg); }
      100% { transform: rotateY(360deg); }
    }
    .jackpot-label {
      font-size: 10px; color: rgba(212,175,55,.8);
      letter-spacing: 3px; text-transform: uppercase;
      margin-bottom: 2px; position: relative; z-index: 1;
    }
    .jackpot-value {
      font-size: 28px; font-weight: 900;
      background: linear-gradient(135deg, #D4AF37, #F4D03F, #FFD700, #D4AF37);
      background-size: 300% 100%;
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: jpGold 4s ease-in-out infinite;
      position: relative; z-index: 1; line-height: 1.2;
    }
    @keyframes jpGold {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    .jackpot-sub {
      font-size: 9px; color: rgba(240,230,211,.35);
      letter-spacing: 2px; text-transform: uppercase;
      margin-top: 1px; position: relative; z-index: 1;
    }
  `;
  document.head.appendChild(style);

  // Inject HTML — find a good mount point
  function mount() {
    // Don't show in embed mode
    if (new URLSearchParams(window.location.search).get('embed') === '1') return;

    const banner = document.createElement('div');
    banner.className = 'jackpot-banner';
    banner.id = 'jackpotBanner';
    banner.innerHTML = `
      <div class="jackpot-label">\uD83C\uDFB0 Globaler Jackpot \uD83C\uDFB0</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:8px">
        <div class="jp-coin" style="width:32px;height:32px"><div class="jpc" style="width:100%;height:100%"><div class="jpf"><img src="/img/baxt-coin.png" alt="₿"></div><div class="jpf jpb"><img src="/img/baxt-coin.png" alt="₿"></div><div class="jpe" style="transform:translateZ(-2px)"></div><div class="jpe" style="transform:translateZ(-1px)"></div><div class="jpe" style="transform:translateZ(0)"></div><div class="jpe" style="transform:translateZ(1px)"></div></div></div>
        <div class="jackpot-value" id="jackpotValue">0,00 \u20BF</div>
        <div class="jp-coin" style="width:32px;height:32px"><div class="jpc" style="width:100%;height:100%;animation-delay:2s"><div class="jpf"><img src="/img/baxt-coin.png" alt="₿"></div><div class="jpf jpb"><img src="/img/baxt-coin.png" alt="₿"></div><div class="jpe" style="transform:translateZ(-2px)"></div><div class="jpe" style="transform:translateZ(-1px)"></div><div class="jpe" style="transform:translateZ(0)"></div><div class="jpe" style="transform:translateZ(1px)"></div></div></div>
      </div>
      <div class="jackpot-sub">Steigt mit jedem Spin</div>
    `;

    // Try to insert after header/nav or at top of body
    const nav = document.querySelector('.top-bar, .game-header, nav, header');
    if (nav && nav.parentNode) {
      nav.parentNode.insertBefore(banner, nav.nextSibling);
    } else {
      document.body.insertBefore(banner, document.body.firstChild);
    }

    // Start ticker
    let displayed = getJackpotValue();
    const el = document.getElementById('jackpotValue');
    el.textContent = fmt(displayed);

    setInterval(() => {
      const target = getJackpotValue() + (Math.random() * 0.4);
      const step = (target - displayed) / 12;
      let i = 0;
      const tick = setInterval(() => {
        displayed += step;
        el.textContent = fmt(displayed);
        if (++i >= 12) clearInterval(tick);
      }, 80);
    }, 2500 + Math.random() * 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
