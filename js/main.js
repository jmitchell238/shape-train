'use strict';

const cv = document.getElementById('cv');
let ctx = null;
let last = performance.now();
let activePointerId = null;

function resizeCanvas() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.min(vw / W, vh / H);
  cv.style.width = Math.floor(W * scale) + 'px';
  cv.style.height = Math.floor(H * scale) + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.floor(W * dpr);
  cv.height = Math.floor(H * dpr);
  ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function eventToStage(e) {
  const rect = cv.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * W,
    y: ((e.clientY - rect.top) / rect.height) * H,
  };
}

function setScreen(name) {
  document.querySelectorAll('.screen').forEach(el => {
    el.classList.toggle('hidden', el.dataset.screen !== name);
  });
  document.querySelectorAll('.play-chrome').forEach(el => {
    el.classList.toggle('hidden', name !== 'play');
  });
}

function updateMenuStats() {
  const l = document.getElementById('statLoads');
  const s = document.getElementById('statStations');
  if (l) l.textContent = String(save.loads | 0);
  if (s) s.textContent = String(save.stationsDone | 0);
  const muteBtn = document.getElementById('muteBtn');
  if (muteBtn) muteBtn.textContent = save.muted ? '🔇 Sound off' : '🔊 Sound on';
  const motionBtn = document.getElementById('motionBtn');
  if (motionBtn) motionBtn.textContent = save.reducedMotion ? 'Calm motion' : 'Full motion';
  document.querySelectorAll('.mode-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === save.mode);
  });
}

function showMenu() {
  enterMenu();
  updateMenuStats();
  setScreen('menu');
  if (window.__pendingReload) {
    window.__pendingReload = false;
    window.__reloaded = true;
    location.reload();
  }
}

function showPlay() {
  enterPlay(save.mode);
  setScreen('play');
}

function showWin() {
  setScreen('win');
  document.getElementById('winLoads').textContent = String(sessionLoads);
  document.getElementById('winAll').textContent = String(save.loads | 0);
  if (window.__pendingReload) {
    window.__pendingReload = false;
    window.__reloaded = true;
    location.reload();
  }
}

const _enterWin = enterWin;
enterWin = function () {
  _enterWin();
  showWin();
};

function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (!ctx) resizeCanvas();

  if (state === 'play') updatePlay(dt);
  else if (state === 'win') updateWin(dt);
  else {
    skyPhase += dt;
    engineBob += dt * 2;
    updateParticles(dt);
  }

  ctx.clearRect(0, 0, W, H);
  if (state === 'play') drawPlay(ctx);
  else if (state === 'win') drawWinScene(ctx);
  else drawMenuBackdrop(ctx);

  requestAnimationFrame(frame);
}

function onPointerDown(e) {
  if (state !== 'play') return;
  if (activePointerId != null) return;
  activePointerId = e.pointerId;
  try { cv.setPointerCapture(e.pointerId); } catch { /* */ }
  const { x, y } = eventToStage(e);
  startDrag(x, y);
  e.preventDefault();
}

function onPointerMove(e) {
  if (state !== 'play' || e.pointerId !== activePointerId) return;
  const { x, y } = eventToStage(e);
  moveDrag(x, y);
  e.preventDefault();
}

function onPointerUp(e) {
  if (e.pointerId !== activePointerId) return;
  activePointerId = null;
  const { x, y } = eventToStage(e);
  endDrag(x, y);
  e.preventDefault();
}

function wireUi() {
  document.getElementById('btnPlay')?.addEventListener('click', () => {
    ensureAudio();
    sfxClick();
    showPlay();
  });
  document.getElementById('btnHow')?.addEventListener('click', () => {
    document.getElementById('howPanel')?.classList.toggle('hidden');
    sfxClick();
  });
  document.getElementById('muteBtn')?.addEventListener('click', () => {
    setMuted(!save.muted);
    if (!save.muted) { ensureAudio(); sfxClick(); }
    updateMenuStats();
  });
  document.getElementById('motionBtn')?.addEventListener('click', () => {
    setReducedMotion(!save.reducedMotion);
    sfxClick();
    updateMenuStats();
  });
  document.querySelectorAll('.mode-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      setMode(btn.dataset.mode);
      sfxClick();
      updateMenuStats();
    });
  });
  document.getElementById('btnMenu')?.addEventListener('click', () => {
    sfxClick();
    showMenu();
  });
  document.getElementById('btnAgain')?.addEventListener('click', () => {
    ensureAudio();
    sfxClick();
    showPlay();
  });
  document.getElementById('btnMenuWin')?.addEventListener('click', () => {
    sfxClick();
    showMenu();
  });
  document.getElementById('btnHub')?.addEventListener('click', () => {
    window.location.href = 'https://jmitchell238.github.io/arcade-hub/';
  });

  cv.addEventListener('pointerdown', onPointerDown, { passive: false });
  cv.addEventListener('pointermove', onPointerMove, { passive: false });
  cv.addEventListener('pointerup', onPointerUp, { passive: false });
  cv.addEventListener('pointercancel', onPointerUp, { passive: false });
  cv.addEventListener('touchstart', e => {
    if (state === 'play') e.preventDefault();
  }, { passive: false });

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (state === 'play' || state === 'win')) showMenu();
  });
}

function setVersionTags() {
  const label = GAME_NAME + ' ' + GAME_VERSION_LABEL;
  document.querySelectorAll('#versionTag, #versionMenu, #versionWin').forEach(el => {
    if (el) el.textContent = label;
  });
}

function registerSw() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('[sw]', err));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!window.__reloaded) window.__pendingReload = true;
    });
  });
}

wireUi();
setVersionTags();
resizeCanvas();
showMenu();
requestAnimationFrame(frame);
registerSw();
