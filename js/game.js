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
let trainOffset = 0;   // chug-away animation offset (rightward)
let trainPan = 0;      // user scroll: positive shifts train right on screen
let chugging = false;
let wrongGlow = null;
let engineBob = 0;
/** Last layout metrics (for pan bounds) */
let trainLayout = null;

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
 * Portrait-first train sizing: keep cars chunky for little hands.
 * Long consists may be wider than the canvas — player pans by dragging the train.
 * @param {number} n - car count
 * @param {number} [width=W]
 */
function trainMetrics(n, width = W) {
  const count = Math.max(1, n | 0);
  const pad = TRAIN_PAD;
  const nose = ENGINE_NOSE_EXTRA;

  // Preferred kid-friendly sizes (do not squash just to fit — pan instead)
  let carW = count >= 7 ? 50 : (count >= 5 ? 54 : (count >= 4 ? 58 : 66));
  let carH = count >= 7 ? 62 : (count >= 5 ? 66 : 70);
  let carGap = count >= 6 ? 6 : CAR_GAP;
  let engW = count >= 7 ? 68 : ENGINE_BODY_W;
  let engH = count >= 7 ? 44 : ENGINE_BODY_H;
  let engGap = ENGINE_GAP;

  const carsWidth = count * carW + Math.max(0, count - 1) * carGap;
  const consistBody = carsWidth + engGap + engW;
  const visualW = consistBody + nose;
  const available = width - pad * 2;
  const overflows = visualW > available + 0.5;
  // Overflow: pin left edge to pad so pan reveals the engine on the right.
  // Fits: center the consist in the portrait frame.
  const left = overflows ? pad : Math.max(pad, (width - consistBody - nose) / 2);

  return {
    n: count,
    carW,
    carH,
    carGap,
    engW,
    engH,
    engGap,
    carsWidth,
    consistBody,
    left,
    pad,
    nose,
    overflows,
    visualW,
    visualRight: left + consistBody + nose,
    visualLeft: left,
  };
}

/**
 * Pure train layout for departure to the RIGHT:
 *   [car][car][car] … [engine→]
 * Engine leads on the RIGHT. Long trains may overflow — use trainPan to scroll.
 * @param {object[]} palette - shape defs for each car (leftmost car first)
 * @param {number} [width=W]
 */
function layoutTrain(palette, width = W) {
  const n = palette.length;
  const m = trainMetrics(n, width);
  const { carW, carH, carGap, engW, engH, engGap, carsWidth, left } = m;

  const carList = palette.map((shape, i) => {
    const carLeft = left + i * (carW + carGap);
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

  const engineLeft = left + carsWidth + engGap;
  const engine = {
    x: engineLeft,
    y: TRACK_Y,
    w: engW,
    h: engH,
    frontX: engineLeft + engW,
    rearX: engineLeft,
  };

  return { engine, cars: carList, carW, metrics: m };
}

/** True when the whole consist fits without panning (pan bounds collapse to 0). */
function trainFitsOnScreen(laid, width = W) {
  if (!laid || !laid.engine || !laid.cars || !laid.cars.length) return false;
  const b = trainPanBounds(laid, width);
  return b.fits;
}

/**
 * Pan limits so the train can be scrolled but never leaves empty dead zones.
 * Pan positive → train moves right on screen.
 * @returns {{ min: number, max: number, fits: boolean }}
 */
function trainPanBounds(laid, width = W) {
  if (!laid || !laid.engine || !laid.cars || !laid.cars.length) {
    return { min: 0, max: 0, fits: true };
  }
  const pad = TRAIN_PAD;
  const left = laid.cars[0].x - laid.cars[0].w / 2;
  const right = laid.engine.frontX + ENGINE_NOSE_EXTRA;
  const contentW = right - left;
  const viewW = width - pad * 2;
  if (contentW <= viewW + 0.5) {
    // Centered layout already fits — lock pan
    return { min: 0, max: 0, fits: true };
  }
  // max: left edge of consist at pad; min: right tip at width-pad
  const max = pad - left;
  const min = (width - pad) - right;
  return { min, max, fits: false };
}

function clampTrainPan(p, laid, width = W) {
  const b = trainPanBounds(laid || liveTrainLayout(), width);
  return Math.max(b.min, Math.min(b.max, p));
}

/** Live layout snapshot for pan bounds (cars + engine currently in play). */
function liveTrainLayout() {
  if (trainLayout) return trainLayout;
  if (!engine || !cars.length) return null;
  return { engine, cars, metrics: trainMetrics(cars.length) };
}

function trainDrawOffset() {
  return trainPan + trainOffset;
}

/** Vertical band around the track where horizontal pan drags work. */
function hitTrainBand(x, y) {
  return y >= TRAIN_BAND_TOP && y <= TRAIN_BAND_BOT;
}

function trainNeedsPan(laid) {
  const b = trainPanBounds(laid || liveTrainLayout());
  return !b.fits;
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
  // Two rows when many shapes so platform stays tappable in portrait
  const cols = n <= 4 ? n : Math.ceil(n / 2);
  const rows = n <= 4 ? 1 : 2;
  const r = n >= 7 ? 24 : (n >= 5 ? 28 : 34);
  const topY = height - (rows === 2 ? 145 : 110);
  const rowGap = 56;
  return kinds.map((shape, i) => {
    const row = rows === 1 ? 0 : Math.floor(i / cols);
    const col = rows === 1 ? i : (i % cols);
    const inRow = rows === 1 ? n : Math.min(cols, n - row * cols);
    const cellW = (width - 40) / inRow;
    const x = 20 + cellW * col + cellW / 2;
    const y = topY + row * rowGap;
    return {
      shape,
      x, y,
      homeX: x,
      homeY: y,
      r,
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

/**
 * Engine must sit RIGHT of every car (leading departure to the right)
 * and be tightly coupled to the rightmost car.
 * Gap may be smaller than ENGINE_GAP when portrait scaling shrinks the consist.
 */
function assertTrainOrder(engine, carList) {
  if (!engine || !carList || !carList.length) return false;
  const first = carList[0];
  const last = carList[carList.length - 1];
  // Engine rear (left edge) must be right of the last car
  if (engine.rearX < last.x + last.w / 2 - 0.5) return false;
  // Positive coupler gap (scaled layouts may use a smaller gap than ENGINE_GAP)
  const gap = engine.rearX - (last.x + last.w / 2);
  if (gap < 0 || gap > ENGINE_GAP + 6) return false;
  // Nose is the rightmost tip of the consist body
  if (engine.frontX < engine.rearX) return false;
  // Cars left-to-right order (first = leftmost/rearmost, last = nearest engine)
  for (let i = 1; i < carList.length; i++) {
    if (carList[i].x <= carList[i - 1].x) return false;
  }
  // Every car is left of the engine rear
  for (const c of carList) {
    if (c.x + c.w / 2 > engine.rearX + 0.5) return false;
  }
  // First car is leftmost piece of the consist
  if (first.x - first.w / 2 > engine.rearX) return false;
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
  trainLayout = laid;
  cargo = layoutCargo(palette);

  hintTimer = 0;
  wrongGlow = null;
  drag = null;
  trainOffset = 0;
  trainPan = 0;
  // Start panned so engine (right) is in view for long trains; user can drag left for caboose
  if (laid.metrics && laid.metrics.overflows) {
    trainPan = clampTrainPan(trainPanBounds(laid).min, laid); // show engine first
  }
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
  drag = null;
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
    trainOffset = t * (W + 160);
    if (t < 0.3 || Math.floor(t * 8) !== Math.floor((t - 0.02) * 8)) {
      const smokeX = engine
        ? engine.x + engine.w - 22 + trainDrawOffset()
        : W * 0.7 + trainOffset * 0.3;
      spawnSmoke(smokeX, 200);
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
  // Screen coords → train world (undo pan / chug)
  const ox = trainDrawOffset();
  let best = null;
  let bestD = Infinity;
  for (const car of cars) {
    if (car.filled) continue;
    const cx = car.x + ox;
    const cy = car.y;
    const halfW = car.w * 0.7;
    const halfH = car.h * 0.7;
    if (Math.abs(x - cx) <= halfW && Math.abs(y - cy) <= halfH) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestD) { best = car; bestD = d; }
    }
  }
  return best;
}

function startDrag(x, y) {
  if (state !== 'play' || chugging) return;
  // Cargo first (platform shapes)
  const c = hitCargo(x, y);
  if (c) {
    drag = { kind: 'cargo', cargo: c, ox: x - c.x, oy: y - c.y };
    sfxPickup();
    c.bounce = 0.2;
    hintTimer = 0;
    return;
  }
  // Horizontal pan on the track band when the train is longer than the screen
  if (hitTrainBand(x, y) && trainNeedsPan()) {
    drag = { kind: 'pan', lastX: x };
    hintTimer = 0;
  }
}

function moveDrag(x, y) {
  if (!drag) return;
  if (drag.kind === 'pan') {
    const dx = x - drag.lastX;
    drag.lastX = x;
    trainPan = clampTrainPan(trainPan + dx);
    return;
  }
  if (drag.kind === 'cargo' && drag.cargo) {
    drag.cargo.x = x - drag.ox;
    drag.cargo.y = y - drag.oy;
  }
}

function endDrag(x, y) {
  if (!drag) return;
  if (drag.kind === 'pan') {
    drag = null;
    return;
  }
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
    const ox = trainDrawOffset();
    spawnBurst(car.x + ox, car.y, c.shape.color, 14);
    spawnPraise(car.x + ox, car.y - 50);
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
      const ox = trainDrawOffset();
      spawnPraise(car.x + ox, car.y - 40, c.shape.label + ' car!');
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
    } else if (!c.placed && (!drag || drag.kind !== 'cargo' || drag.cargo !== c)) {
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
  } else if (id === 'moon') {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.closePath();
  } else if (id === 'hex') {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 3;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
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
    // Crescent cutout for moon silhouette
    if (shape.id === 'moon') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(r * 0.35, -r * 0.1, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  } else {
    ctx.fillStyle = shape.color;
    ctx.fill();
    ctx.strokeStyle = shape.color2;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Crescent cutout for moon
    if (shape.id === 'moon') {
      ctx.fillStyle = silhouette ? 'rgba(0,0,0,0.22)' : '#81D4FA';
      // Use sky-ish punch only when not silhouette — on car filled bg differs
      // Soft shadow crescent instead of true cutout (works on any bg)
      ctx.save();
      ctx.beginPath();
      ctx.arc(r * 0.32, -r * 0.08, r * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fill();
      ctx.restore();
    }
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
 * Draw locomotive. Nose faces RIGHT (leads departure); body left edge is eng.x.
 * Cab/coupler sit at the REAR (left) where cars attach. Scales with eng.w/h for portrait fit.
 */
function drawEngine(ctx, ox, eng) {
  const e = eng || engine;
  if (!e) return;
  const bob = Math.sin(engineBob) * (chugging ? 2.5 : 1.2);
  const s = Math.max(0.55, e.w / ENGINE_BODY_W); // draw-scale vs preferred body
  // Body: centered vertically on TRACK_Y like cars
  const x = e.x + ox;
  const y = e.y - e.h / 2 + bob;
  const w = e.w;
  const h = e.h;

  // Body
  ctx.fillStyle = '#EF5350';
  roundRect(ctx, x, y, w, h, 8 * s);
  ctx.fill();
  // Cab at REAR (left) — toward the cars trailing behind
  ctx.fillStyle = '#C62828';
  roundRect(ctx, x + 6 * s, y - 26 * s, 34 * s, 30 * s, 6 * s);
  ctx.fill();
  // Cab window
  ctx.fillStyle = '#81D4FA';
  roundRect(ctx, x + 12 * s, y - 20 * s, 22 * s, 16 * s, 3 * s);
  ctx.fill();
  // Boiler / nose at FRONT (right) — leads the takeoff
  const noseR = 20 * s;
  ctx.fillStyle = '#B71C1C';
  ctx.beginPath();
  ctx.arc(x + w, y + h / 2, noseR, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  // Chimney toward front
  ctx.fillStyle = '#455A64';
  ctx.fillRect(x + w - 28 * s, y - 38 * s, 14 * s, 16 * s);
  // Wheels — sit near car wheel line
  const wheelY = e.y + e.h * 0.72 + bob;
  const wr = 11 * s;
  ctx.fillStyle = '#37474F';
  ctx.beginPath();
  ctx.arc(x + 18 * s, wheelY, wr, 0, Math.PI * 2);
  ctx.arc(x + w - 22 * s, wheelY, wr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#90A4AE';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.arc(x + 18 * s, wheelY, 5 * s, 0, Math.PI * 2);
  ctx.arc(x + w - 22 * s, wheelY, 5 * s, 0, Math.PI * 2);
  ctx.stroke();
  // Face on the nose (front / right)
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + w + 6 * s, y + h * 0.32, 4 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.arc(x + w + 6 * s, y + h * 0.55, 6 * s, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  // Coupler toward cars (REAR / left — cars trail on the left)
  ctx.fillStyle = '#607D8B';
  ctx.fillRect(x - 8 * s, e.y - 4 * s + bob, 10 * s, 8 * s);

  if (chugging && Math.random() > 0.7) spawnSmoke(x + w - 22 * s, y - 40 * s);
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

  // Couplers (left toward previous car / caboose, right toward engine / next)
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

function drawPanHints(ctx) {
  if (chugging || !trainNeedsPan()) return;
  const b = trainPanBounds(liveTrainLayout());
  const y = TRACK_Y;
  ctx.save();
  ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  // ‹ = more train to the left (increase pan); › = more train to the right (decrease pan)
  if (trainPan < b.max - 2) {
    ctx.globalAlpha = 0.45 + 0.25 * Math.sin(skyPhase * 3);
    ctx.fillText('‹', 18, y);
  }
  if (trainPan > b.min + 2) {
    ctx.globalAlpha = 0.45 + 0.25 * Math.sin(skyPhase * 3 + 1);
    ctx.fillText('›', W - 18, y);
  }
  ctx.restore();
}

function drawPlay(ctx) {
  drawStationBg(ctx);

  const ox = trainDrawOffset();

  // Cars trail on the left; engine leads on the right (nose faces takeoff direction)
  for (const car of cars) drawCar(ctx, car, ox);
  drawEngine(ctx, ox, engine);
  drawPanHints(ctx);

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
    if (drag && drag.kind === 'cargo' && drag.cargo === c) continue;
    if (c.placed) {
      const bounce = c.bounce > 0 ? Math.sin((1 - c.bounce / 0.35) * Math.PI) * 0.15 : 0;
      drawShape(ctx, c.shape, c.x + ox, c.y - 2, c.r * 0.7, { scale: 1 + bounce });
    } else {
      const bounce = c.bounce > 0 ? Math.sin((1 - c.bounce / 0.35) * Math.PI) * 0.15 : 0;
      drawShape(ctx, c.shape, c.x, c.y, c.r, { scale: 1 + bounce, label: true });
    }
  }
  if (drag && drag.kind === 'cargo' && drag.cargo) {
    const c = drag.cargo;
    drawShape(ctx, c.shape, c.x, c.y, c.r, { scale: 1.12, label: true });
  }

  drawParticles(ctx);
  drawHud(ctx);

  if (!chugging) {
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'center';
    const tip = trainNeedsPan()
      ? 'Drag shapes onto cars · drag train to scroll'
      : 'Drag shapes into matching cars';
    ctx.fillText(tip, W / 2, H - 28);
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
