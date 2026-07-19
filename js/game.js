'use strict';

/** @type {'menu'|'play'|'win'} */
let state = 'menu';

/** @type {{ shape: object, x: number, y: number, filled: boolean, pulse: number }[]} */
let cars = [];
/** @type {{ shape: object, x: number, y: number, homeX: number, homeY: number, r: number, placed: boolean, bounce: number, returning: boolean, wiggle: number }[]} */
let cargo = [];
let drag = null;

let modeId = 'easy';
let station = 0;
let stationsTarget = 0;
let sessionLoads = 0;
let winFlash = 0;
let hintTimer = 0;
let skyPhase = 0;
let trainOffset = 0;
let chugging = false;
let wrongGlow = null;
let engineBob = 0;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function currentMode() {
  return MODES[modeId] || MODES.easy;
}

/**
 * Pure train layout: engine leads on the LEFT (nose faces right), cars trail behind.
 * Whole consist is centered on the canvas. Returns { engine, cars, carW }.
 * @param {object[]} palette - shape defs for each car (front car first)
 * @param {number} [width=W]
 */
function layoutTrain(palette, width = W) {
  const n = palette.length;
  const carW = n >= 5 ? 52 : (n >= 4 ? 58 : 66);
  const carH = 70;
  const carsWidth = n * carW + Math.max(0, n - 1) * CAR_GAP;
  // Engine left edge → rear coupler → gap → first car left edge → … → last car right
  const consistW = ENGINE_BODY_W + ENGINE_GAP + carsWidth;
  const left = (width - consistW) / 2;

  // Engine: left edge at `left`; nose (front) is on the right side of the body
  const engine = {
    x: left,                 // left edge of engine body (for drawing)
    y: TRACK_Y,              // vertical center (aligned with cars)
    w: ENGINE_BODY_W,
    h: ENGINE_BODY_H,
    // front = right, rear = left
    frontX: left + ENGINE_BODY_W,
    rearX: left,
  };

  const firstCarLeft = left + ENGINE_BODY_W + ENGINE_GAP;
  const carList = palette.map((shape, i) => {
    const carLeft = firstCarLeft + i * (carW + CAR_GAP);
    return {
      shape,
      x: carLeft + carW / 2,
      y: TRACK_Y,
      w: carW,
      h: carH,
      filled: false,
      pulse: i * 0.7,
    };
  });

  return { engine, cars: carList, carW };
}

/**
 * Pure cargo layout under the platform.
 * @param {object[]} palette
 * @param {number} [width=W]
 * @param {number} [height=H]
 */
function layoutCargo(palette, width = W, height = H) {
  const n = palette.length;
  const kinds = shuffle(palette);
  return kinds.map((shape, i) => {
    const cellW = (width - 48) / n;
    const x = 24 + cellW * i + cellW / 2;
    const y = height - 110;
    return {
      shape,
      x, y,
      homeX: x,
      homeY: y,
      r: n >= 5 ? 28 : 34,
      placed: false,
      bounce: 0,
      returning: false,
      wiggle: i * 0.9,
    };
  });
}

/** Whether cargo can load into this car (same shape, empty). */
function canLoad(cargoItem, car) {
  if (!cargoItem || !car) return false;
  if (cargoItem.placed || car.filled) return false;
  return cargoItem.shape && car.shape && cargoItem.shape.id === car.shape.id;
}

/** Engine must sit left of every car and be tightly coupled to the first car. */
function assertTrainOrder(engine, carList) {
  if (!engine || !carList || !carList.length) return false;
  const first = carList[0];
  const last = carList[carList.length - 1];
  // Engine rear is left edge; front is right edge — must be left of first car
  if (engine.frontX > first.x - first.w / 2 + 0.5) return false;
  // Gap between engine rear-of-front and first car left should be ~ENGINE_GAP
  const gap = (first.x - first.w / 2) - engine.frontX;
  if (gap < 0 || gap > ENGINE_GAP + 4) return false;
  // Cars left-to-right order
  for (let i = 1; i < carList.length; i++) {
    if (carList[i].x <= carList[i - 1].x) return false;
  }
  // Last car is rightmost piece of the consist
  if (last.x + last.w / 2 < engine.frontX) return false;
  // Vertical alignment with track
  if (Math.abs(engine.y - TRACK_Y) > 0.5) return false;
  if (carList.some(c => Math.abs(c.y - TRACK_Y) > 0.5)) return false;
  return true;
}

/** @type {{ x: number, y: number, w: number, h: number, frontX: number, rearX: number } | null} */
let engine = null;

function layoutStation() {
  const m = currentMode();
  const n = Math.min(SHAPES.length, m.shapes | 0);
  const palette = shuffle(SHAPES).slice(0, n);

  const laid = layoutTrain(palette);
  engine = laid.engine;
  cars = laid.cars;
  cargo = layoutCargo(palette);

  hintTimer = 0;
  wrongGlow = null;
  drag = null;
  trainOffset = 0;
  chugging = false;
}

function enterPlay(forceMode) {
  state = 'play';
  modeId = forceMode || save.mode || 'easy';
  const m = currentMode();
  stationsTarget = m.stations | 0;
  station = 0;
  sessionLoads = 0;
  winFlash = 0;
  clearParticles();
  layoutStation();
}

function enterMenu() {
  state = 'menu';
  drag = null;
  clearParticles();
}

function enterWin() {
  state = 'win';
  winFlash = 1.5;
  sfxWin();
  spawnBurst(W / 2, H * 0.4, '#FFD56A', 28);
  spawnBurst(W / 2, H * 0.4, '#EF5350', 16);
  spawnPraise(W / 2, H * 0.28, 'Express done!');
  recordStation();
}

function allLoaded() {
  return cars.length > 0 && cars.every(c => c.filled);
}

function nextStationOrWin() {
  const m = currentMode();
  if (!m.stations) {
    sfxWhistle();
    spawnPraise(W / 2, 120, 'Next stop!');
    layoutStation();
    return;
  }
  station++;
  if (station >= stationsTarget) {
    enterWin();
  } else {
    sfxWhistle();
    spawnPraise(W / 2, 100, 'Station ' + (station + 1) + '!');
    layoutStation();
  }
}

function startChugAway() {
  if (chugging) return;
  chugging = true;
  sfxWhistle();
  sfxChug();
  spawnBurst(W / 2, 250, '#FFD56A', 20);
  spawnPraise(W / 2, 180, 'Choo-choo!');
  recordStation();

  const dur = save.reducedMotion ? 0.6 : 1.2;
  const start = performance.now();
  const tick = (now) => {
    if (state !== 'play') return;
    const t = Math.min(1, (now - start) / (dur * 1000));
    trainOffset = t * (W + 120);
    if (t < 0.3 || Math.floor(t * 8) !== Math.floor((t - 0.02) * 8)) {
      spawnSmoke(60 + trainOffset * 0.3, 200);
    }
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      nextStationOrWin();
    }
  };
  requestAnimationFrame(tick);
}

function hitCargo(x, y) {
  for (let i = cargo.length - 1; i >= 0; i--) {
    const c = cargo[i];
    if (c.placed) continue;
    const dx = x - c.x;
    const dy = y - c.y;
    if (dx * dx + dy * dy <= (c.r * 1.25) ** 2) return c;
  }
  return null;
}

function hitCar(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const car of cars) {
    if (car.filled) continue;
    const halfW = car.w * 0.7;
    const halfH = car.h * 0.7;
    if (Math.abs(x - car.x) <= halfW && Math.abs(y - car.y) <= halfH) {
      const d = Math.hypot(x - car.x, y - car.y);
      if (d < bestD) { best = car; bestD = d; }
    }
  }
  return best;
}

function startDrag(x, y) {
  if (state !== 'play' || chugging) return;
  const c = hitCargo(x, y);
  if (!c) return;
  drag = { cargo: c, ox: x - c.x, oy: y - c.y };
  sfxPickup();
  c.bounce = 0.2;
  hintTimer = 0;
}

function moveDrag(x, y) {
  if (!drag) return;
  drag.cargo.x = x - drag.ox;
  drag.cargo.y = y - drag.oy;
}

function endDrag(x, y) {
  if (!drag) return;
  const c = drag.cargo;
  const car = hitCar(c.x, c.y);
  drag = null;

  if (canLoad(c, car)) {
    c.placed = true;
    c.x = car.x;
    c.y = car.y - 4;
    car.filled = true;
    c.bounce = 0.35;
    sfxLoad();
    spawnBurst(car.x, car.y, c.shape.color, 14);
    spawnPraise(car.x, car.y - 50);
    recordLoad();
    sessionLoads++;
    hintTimer = 0;

    if (allLoaded()) {
      setTimeout(() => {
        if (state === 'play' && allLoaded()) startChugAway();
      }, save.reducedMotion ? 300 : 550);
    }
  } else {
    sfxWrong();
    if (car) {
      spawnPraise(car.x, car.y - 40, c.shape.label + ' car!');
      const correct = cars.find(p => p.shape.id === c.shape.id && !p.filled);
      if (correct) wrongGlow = { car: correct, t: 0.75, good: true };
    }
    c.returning = true;
    c.bounce = 0.25;
  }
}

function updatePlay(dt) {
  skyPhase += dt;
  engineBob += dt * 3;
  if (!chugging) hintTimer += dt;

  for (const c of cargo) {
    if (c.bounce > 0) c.bounce = Math.max(0, c.bounce - dt);
    c.wiggle += dt * 2;
    if (c.returning) {
      const k = save.reducedMotion ? 10 : 7;
      c.x += (c.homeX - c.x) * Math.min(1, k * dt);
      c.y += (c.homeY - c.y) * Math.min(1, k * dt);
      if (Math.hypot(c.x - c.homeX, c.y - c.homeY) < 2) {
        c.x = c.homeX;
        c.y = c.homeY;
        c.returning = false;
      }
    } else if (!c.placed && (!drag || drag.cargo !== c)) {
      c.y = c.homeY + Math.sin(c.wiggle) * 2;
    }
  }

  for (const car of cars) car.pulse += dt * 1.5;

  if (wrongGlow) {
    wrongGlow.t -= dt;
    if (wrongGlow.t <= 0) wrongGlow = null;
  }

  updateParticles(dt);
}

function updateWin(dt) {
  winFlash = Math.max(0, winFlash - dt);
  updateParticles(dt);
}

// ---- Drawing ----

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawShapePath(ctx, id, r) {
  if (id === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  } else if (id === 'square') {
    roundRect(ctx, -r * 0.85, -r * 0.85, r * 1.7, r * 1.7, 6);
  } else if (id === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      const a2 = a + Math.PI / 5;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a2) * r * 0.42, Math.sin(a2) * r * 0.42);
    }
    ctx.closePath();
  } else if (id === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.95, r * 0.75);
    ctx.lineTo(-r * 0.95, r * 0.75);
    ctx.closePath();
  } else if (id === 'heart') {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.7);
    ctx.bezierCurveTo(-r * 1.1, r * 0.05, -r * 0.7, -r * 0.85, 0, -r * 0.35);
    ctx.bezierCurveTo(r * 0.7, -r * 0.85, r * 1.1, r * 0.05, 0, r * 0.7);
    ctx.closePath();
  } else {
    // diamond
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.75, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.75, 0);
    ctx.closePath();
  }
}

function drawShape(ctx, shape, x, y, r, opts = {}) {
  const { silhouette = false, scale = 1, label = false } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  if (!silhouette) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(2, r * 0.75, r * 0.7, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawShapePath(ctx, shape.id, r);
  if (silhouette) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = shape.color;
    ctx.fill();
    ctx.strokeStyle = shape.color2;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.28, r * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (label) {
    ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = silhouette ? shape.color : '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.strokeText(shape.label, 0, r + 14);
    ctx.fillText(shape.label, 0, r + 14);
  }

  ctx.restore();
}

function drawStationBg(ctx) {
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, '#81D4FA');
  sky.addColorStop(1, '#E3F2FD');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Clouds
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [cx, cy, s] of [[60, 70, 1], [200, 50, 0.8], [320, 80, 1.1]]) {
    const ox = Math.sin(skyPhase * 0.3 + cx) * 6;
    ctx.beginPath();
    ctx.arc(cx + ox, cy, 18 * s, 0, Math.PI * 2);
    ctx.arc(cx + 22 * s + ox, cy + 4, 14 * s, 0, Math.PI * 2);
    ctx.arc(cx - 18 * s + ox, cy + 6, 12 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hills
  ctx.fillStyle = '#81C784';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.48);
  ctx.quadraticCurveTo(W * 0.3, H * 0.4, W * 0.55, H * 0.48);
  ctx.quadraticCurveTo(W * 0.8, H * 0.55, W, H * 0.46);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // Platform
  ctx.fillStyle = '#8D6E63';
  ctx.fillRect(0, H - 160, W, 160);
  ctx.fillStyle = '#A1887F';
  ctx.fillRect(0, H - 160, W, 14);
  // Platform stripes
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  for (let i = 0; i < 10; i++) {
    ctx.fillRect(i * 42 + 4, H - 148, 28, 6);
  }

  // Rails
  const railY = 320;
  ctx.strokeStyle = '#546E7A';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-20, railY);
  ctx.lineTo(W + 20, railY);
  ctx.moveTo(-20, railY + 18);
  ctx.lineTo(W + 20, railY + 18);
  ctx.stroke();
  // Ties
  ctx.strokeStyle = '#6D4C41';
  ctx.lineWidth = 4;
  for (let x = 10; x < W; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, railY - 4);
    ctx.lineTo(x + 8, railY + 22);
    ctx.stroke();
  }

  // Station sign
  ctx.fillStyle = '#EF5350';
  roundRect(ctx, W / 2 - 70, 90, 140, 36, 8);
  ctx.fill();
  ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Shape Station', W / 2, 108);
}

/**
 * Draw locomotive. Nose faces RIGHT; body left edge is eng.x.
 * Vertical center of body matches car centers (TRACK_Y).
 */
function drawEngine(ctx, ox, eng) {
  const e = eng || engine;
  if (!e) return;
  const bob = Math.sin(engineBob) * (chugging ? 2.5 : 1.2);
  // Body: centered vertically on TRACK_Y like cars
  const x = e.x + ox;
  const y = e.y - e.h / 2 + bob;
  const w = e.w;
  const h = e.h;

  // Body
  ctx.fillStyle = '#EF5350';
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  // Cab at REAR (left) — standard steam layout when nose faces right
  ctx.fillStyle = '#C62828';
  roundRect(ctx, x + 6, y - 26, 34, 30, 6);
  ctx.fill();
  // Cab window
  ctx.fillStyle = '#81D4FA';
  roundRect(ctx, x + 12, y - 20, 22, 16, 3);
  ctx.fill();
  // Boiler / nose at FRONT (right)
  ctx.fillStyle = '#B71C1C';
  ctx.beginPath();
  ctx.arc(x + w, y + h / 2, 20, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  // Chimney toward front
  ctx.fillStyle = '#455A64';
  ctx.fillRect(x + w - 28, y - 38, 14, 16);
  // Wheels — sit near car wheel line (car: y + h/2 + 4)
  const wheelY = e.y + 35 + bob;
  ctx.fillStyle = '#37474F';
  ctx.beginPath();
  ctx.arc(x + 18, wheelY, 11, 0, Math.PI * 2);
  ctx.arc(x + w - 22, wheelY, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#90A4AE';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + 18, wheelY, 5, 0, Math.PI * 2);
  ctx.arc(x + w - 22, wheelY, 5, 0, Math.PI * 2);
  ctx.stroke();
  // Face on the nose (front / right)
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + w + 6, y + h * 0.32, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + w + 6, y + h * 0.55, 6, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  // Coupler toward cars (right / rear-of-nose side? cars are to the RIGHT of engine
  // Wait: engine is LEFT of cars, so coupler is on the RIGHT of the engine body
  ctx.fillStyle = '#607D8B';
  ctx.fillRect(x + w - 2, e.y - 4 + bob, 10, 8);

  if (chugging && Math.random() > 0.7) spawnSmoke(x + w - 22, y - 40);
}

function drawCar(ctx, car, ox) {
  const x = car.x + ox;
  const y = car.y;
  const w = car.w;
  const h = car.h;

  // Car body
  ctx.fillStyle = car.filled ? car.shape.color : '#ECEFF1';
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = car.filled ? car.shape.color2 : '#90A4AE';
  ctx.lineWidth = 2.5;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 10);
  ctx.stroke();

  // Couplers (left toward engine / previous car, right toward next)
  ctx.fillStyle = '#607D8B';
  ctx.fillRect(x - w / 2 - 6, y - 4, 8, 8);
  ctx.fillRect(x + w / 2 - 2, y - 4, 8, 8);

  // Wheels
  ctx.fillStyle = '#37474F';
  ctx.beginPath();
  ctx.arc(x - w * 0.28, y + h / 2 + 4, 9, 0, Math.PI * 2);
  ctx.arc(x + w * 0.28, y + h / 2 + 4, 9, 0, Math.PI * 2);
  ctx.fill();

  // Silhouette slot if empty
  if (!car.filled) {
    drawShape(ctx, car.shape, x, y - 2, Math.min(22, w * 0.28), { silhouette: true });
  }

  // Glow helper
  if (wrongGlow && wrongGlow.car === car && wrongGlow.good) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(car.pulse * 4);
    ctx.strokeStyle = car.shape.color;
    ctx.lineWidth = 4;
    roundRect(ctx, x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 12);
    ctx.stroke();
    ctx.restore();
  }
}

function drawHud(ctx) {
  const m = currentMode();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, 14, 12, W - 28, 52, 14);
  ctx.fill();

  ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(m.name, W / 2, 30);

  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  if (m.stations) {
    ctx.fillText('Station ' + (station + 1) + ' / ' + stationsTarget + ' · Loads ' + sessionLoads, W / 2, 48);
  } else {
    ctx.fillText('Load the train · ' + sessionLoads + ' loads', W / 2, 48);
  }
}

function drawPlay(ctx) {
  drawStationBg(ctx);

  const ox = trainOffset;

  // Engine leads on the left; cars trail to the right
  drawEngine(ctx, ox, engine);
  for (const car of cars) drawCar(ctx, car, ox);

  // Idle hint on correct car for first free cargo
  if (hintTimer > HINT_AFTER && !drag && !chugging) {
    const free = cargo.find(c => !c.placed);
    if (free) {
      const car = cars.find(p => !p.filled && p.shape.id === free.shape.id);
      if (car) {
        const a = 0.3 + 0.3 * Math.sin(hintTimer * 4);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        roundRect(ctx, car.x - car.w / 2 - 6 + ox, car.y - car.h / 2 - 6, car.w + 12, car.h + 12, 12);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Cargo (skip if placed and train is chugging — they ride with cars)
  for (const c of cargo) {
    if (drag && drag.cargo === c) continue;
    if (c.placed) {
      const bounce = c.bounce > 0 ? Math.sin((1 - c.bounce / 0.35) * Math.PI) * 0.15 : 0;
      drawShape(ctx, c.shape, c.x + ox, c.y - 2, c.r * 0.7, { scale: 1 + bounce });
    } else {
      const bounce = c.bounce > 0 ? Math.sin((1 - c.bounce / 0.35) * Math.PI) * 0.15 : 0;
      drawShape(ctx, c.shape, c.x, c.y, c.r, { scale: 1 + bounce, label: true });
    }
  }
  if (drag) {
    const c = drag.cargo;
    drawShape(ctx, c.shape, c.x, c.y, c.r, { scale: 1.12, label: true });
  }

  drawParticles(ctx);
  drawHud(ctx);

  if (!chugging) {
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText('Drag shapes into matching cars', W / 2, H - 28);
  }
}

function drawWinScene(ctx) {
  drawStationBg(ctx);
  if (!engine || !cars.length) {
    const demo = layoutTrain(SHAPES.slice(0, 3));
    engine = demo.engine;
    cars = demo.cars;
  }
  drawEngine(ctx, 0, engine);
  for (const car of cars) {
    car.filled = true;
    drawCar(ctx, car, 0);
  }
  drawParticles(ctx);
  if (winFlash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.14 * Math.min(1, winFlash)) + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

function drawMenuBackdrop(ctx) {
  drawStationBg(ctx);
  const demo = layoutTrain(SHAPES.slice(0, 3));
  drawEngine(ctx, 0, demo.engine);
  demo.cars.forEach((car) => {
    car.filled = true;
    drawCar(ctx, car, 0);
    drawShape(ctx, car.shape, car.x, car.y - 2, 16, {});
  });
  ctx.fillStyle = 'rgba(20, 40, 60, 0.4)';
  ctx.fillRect(0, 0, W, H);
}
