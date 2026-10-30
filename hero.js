// Nexform hero: drives the scroll choreography, the scroll badge, the entrances and the menu.
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  const scene = document.querySelector('.scene');
  const ledes = document.querySelectorAll('.lede');
  const badge = document.querySelector('.badge');
  const ring = badge.querySelector('.badge__ring');

  // Shared with world.js, which reads the same smoothed progress each frame.
  const state = (window.nexformScroll = { p: 0 });

  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // ---------- Entrances ----------
  // A reload starts at the top, so the spheres gather into the cat again instead of opening mid-scroll.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-in')));

  // ---------- Scroll: the hero holds while the scene scrolls past ----------
  let target = 0;
  let p = 0;
  let applied = -1;
  let turn = 0;
  let last = performance.now();

  const run = () => scene.offsetHeight - innerHeight;

  function measure() {
    const r = run();
    target = r > 0 ? clamp01(-scene.getBoundingClientRect().top / r) : 0;
  }

  function apply(v) {
    // The two corner lines lift away first, leaving the cat, the title and the world it becomes.
    const f = clamp01(v / 0.22);
    for (const el of ledes) {
      el.style.opacity = (1 - f).toFixed(3);
      el.style.transform = `translate3d(0, ${(-f * 40).toFixed(1)}px, 0)`;
      el.style.visibility = f >= 1 ? 'hidden' : '';
    }
  }

  function tick(now) {
    const dt = Math.min(now - last, 64) / 1000;
    last = now;
    measure();
    const was = p;
    p += (target - p) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - p) < 0.0005) p = target;
    state.p = reduce.matches ? 0 : p;
    if (state.p !== applied) {
      applied = state.p;
      apply(applied);
    }
    // The badge turns slowly on its own and winds on as the page scrolls.
    if (!reduce.matches) {
      turn += dt * 14 + (p - was) * 540;
      ring.style.transform = `rotate(${turn.toFixed(2)}deg)`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // The badge carries you through the scroll in one go, and back to the top from the end.
  badge.addEventListener('click', () => {
    const top = state.p > 0.98 ? 0 : scene.offsetTop + run();
    window.scrollTo({ top, behavior: reduce.matches ? 'auto' : 'smooth' });
  });

  // ---------- Menu ----------
  const menu = document.getElementById('menu');
  const openBtn = document.querySelector('.top .menu-btn');
  const closeBtn = menu.querySelector('.menu-btn--close');

  function setMenu(open) {
    if (open) {
      const r = openBtn.getBoundingClientRect();
      menu.style.setProperty('--mx', `${r.left + r.width / 2}px`);
      menu.style.setProperty('--my', `${r.top + r.height / 2}px`);
    }
    menu.dataset.open = String(open);
    menu.inert = !open;
    openBtn.setAttribute('aria-expanded', String(open));
    (open ? closeBtn : openBtn).focus({ preventScroll: true });
  }

  openBtn.addEventListener('click', () => setMenu(true));
  closeBtn.addEventListener('click', () => setMenu(false));
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.dataset.open === 'true') setMenu(false);
  });
})();
