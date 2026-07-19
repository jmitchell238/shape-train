'use strict';

const particles = [];
const floatTexts = [];

function spawnBurst(x, y, color, count = 16) {
  if (save.reducedMotion) count = Math.min(count, 6);
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 70 + Math.random() * 160;
    particles.push({
      x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 50,
      life: 0.5 + Math.random() * 0.4, max: 0.5 + Math.random() * 0.4,
      r: 2 + Math.random() * 5, color: color || '#FFD56A',
    });
  }
}

function spawnSmoke(x, y) {
  const n = save.reducedMotion ? 2 : 5;
  for (let i = 0; i < n; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y,
      vx: (Math.random() - 0.5) * 20,
      vy: -30 - Math.random() * 40,
      life: 0.5 + Math.random() * 0.4,
      max: 0.5 + Math.random() * 0.4,
      r: 6 + Math.random() * 8,
      color: 'rgba(220,220,230,0.7)',
    });
  }
}

function spawnPraise(x, y, text) {
  floatTexts.push({
    x, y, text: text || PRAISE[Math.floor(Math.random() * PRAISE.length)],
    life: 0.95, max: 0.95, vy: -48,
  });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy += 180 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
  }
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const t = floatTexts[i];
    t.life -= dt;
    if (t.life <= 0) { floatTexts.splice(i, 1); continue; }
    t.y += t.vy * dt;
  }
}

function drawParticles(ctx) {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.9;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const t of floatTexts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, t.life / t.max);
    ctx.font = 'bold 26px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = '#fff';
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }
}

function clearParticles() {
  particles.length = 0;
  floatTexts.length = 0;
}
