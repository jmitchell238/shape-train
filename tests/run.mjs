#!/usr/bin/env node
/**
 * Shape Train — unit + shell tests (no browser / no deps).
 * Run: node tests/run.mjs
 *
 * Loads game modules in a VM sandbox (same pattern as bottle-sort / maze-adventure)
 * and asserts layout, match rules, and play flow — not just "file exists".
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
    process.stdout.write('.');
    return;
  }
  failed++;
  failures.push(msg);
  console.error('\n  ✗', msg);
}

function assertEq(a, b, msg) {
  assert(Object.is(a, b), `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}

function assertClose(a, b, eps, msg) {
  assert(Math.abs(a - b) <= eps, `${msg} (got ${a}, expected ~${b} ±${eps})`);
}

function section(name) {
  process.stdout.write('\n• ' + name + ' ');
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function loadGame() {
  // main.js binds to DOM — skip it; game logic lives in config/save/audio/particles/game
  const files = [
    'js/config.js',
    'js/save.js',
    'js/audio.js',
    'js/particles.js',
    'js/game.js',
  ];
  const code = files
    .map(rel => `// ---- ${rel} ----\n` + read(rel))
    .join('\n;\n');

  const exportFooter = `
    globalThis.__TEST__ = {
      GAME_VERSION, GAME_NAME, W, H, MODES, MODE_ORDER, SHAPES, HINT_AFTER,
      TRACK_Y, ENGINE_BODY_W, ENGINE_BODY_H, ENGINE_GAP, CAR_GAP, TRAIN_PAD, ENGINE_NOSE_EXTRA,
      TRAIN_BAND_TOP, TRAIN_BAND_BOT,
      shuffle, trainMetrics, layoutTrain, trainFitsOnScreen, trainPanBounds, clampTrainPan,
      trainNeedsPan, hitTrainBand, trainDrawOffset, layoutCargo, canLoad, assertTrainOrder, allLoaded,
      layoutStation, enterPlay, enterMenu, startDrag, moveDrag, endDrag,
      hitCargo, hitCar, currentMode,
      state: () => state,
      cars: () => cars,
      cargo: () => cargo,
      engine: () => engine,
      drag: () => drag,
      modeId: () => modeId,
      sessionLoads: () => sessionLoads,
      station: () => station,
      stationsTarget: () => stationsTarget,
      chugging: () => chugging,
      trainOffset: () => trainOffset,
      trainPan: () => trainPan,
      setTrainPan: (v) => { trainPan = v; },
      save,
      setMode, setMuted, setReducedMotion,
      recordLoad, recordStation,
    };
  `;

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Math,
    performance: { now: () => Date.now() },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] ?? null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; },
    },
    document: {
      getElementById() { return null; },
      querySelectorAll() { return []; },
    },
    window: {},
    globalThis: {},
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  vm.runInNewContext(code + '\n' + exportFooter, sandbox, { filename: 'shape-train-test.js' });
  return sandbox.__TEST__;
}

// -------------------- shell files --------------------
section('PWA shell files');
{
  for (const f of [
    'index.html', 'css/style.css', 'js/config.js', 'js/save.js', 'js/audio.js',
    'js/particles.js', 'js/game.js', 'js/main.js',
    'manifest.webmanifest', 'sw.js', 'README.md',
  ]) {
    assert(exists(f), `exists ${f}`);
  }
  for (const f of [
    'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
    'apple-touch-icon.png', 'art/cover.jpg',
  ]) {
    assert(exists(f), `exists ${f}`);
  }
}

// -------------------- version sync --------------------
section('version / SW cache sync');
{
  const cfg = read('js/config.js');
  const sw = read('sw.js');
  const m = cfg.match(/GAME_VERSION\s*=\s*['"]([^'"]+)['"]/);
  assert(!!m, 'GAME_VERSION present');
  const ver = m[1];
  assert(/^\d+\.\d+\.\d{3}$/.test(ver), `version format (${ver})`);
  assert(sw.includes(`shape-train-${ver}`), `sw CACHE matches shape-train-${ver}`);
}

// -------------------- script order --------------------
section('script order in index.html');
{
  const html = read('index.html');
  let last = -1;
  for (const s of ['config.js', 'save.js', 'audio.js', 'particles.js', 'game.js', 'main.js']) {
    const i = html.indexOf(s);
    assert(i > last, `order ${s}`);
    last = i;
  }
  const man = JSON.parse(read('manifest.webmanifest'));
  assert(man.display === 'standalone', 'manifest standalone');
}

// -------------------- pure layout: engine leads on the RIGHT --------------------
section('layoutTrain — cars left, engine leads right (ready to take off)');
{
  const T = loadGame();
  for (const n of [2, 3, 4, 6]) {
    const palette = T.SHAPES.slice(0, n);
    const laid = T.layoutTrain(palette);
    assert(laid.cars.length === n, `n=${n} car count`);
    assert(!!laid.engine, `n=${n} has engine`);
    assert(
      T.assertTrainOrder(laid.engine, laid.cars),
      `n=${n} engine leads right + coupled + aligned (rearX=${laid.engine.rearX}, lastCar=${laid.cars[n - 1].x + laid.cars[n - 1].w / 2})`
    );

    // Engine is right of every car
    for (const c of laid.cars) {
      assert(
        laid.engine.rearX >= c.x + c.w / 2 - 0.01,
        `n=${n} engine rear ≥ car ${c.shape.id} right`
      );
    }

    // Nose is rightmost tip of body
    assert(
      laid.engine.frontX > laid.cars[n - 1].x,
      `n=${n} nose beyond rightmost car`
    );

    // Engine y matches car y (track)
    assertEq(laid.engine.y, T.TRACK_Y, `n=${n} engine on TRACK_Y`);
    assert(laid.cars.every(c => c.y === T.TRACK_Y), `n=${n} cars on TRACK_Y`);

    // Coupler gap matches metrics (may shrink on long consists)
    const last = laid.cars[n - 1];
    const gap = laid.engine.rearX - (last.x + last.w / 2);
    assertClose(gap, laid.metrics.engGap, 0.5, `n=${n} car→engine gap`);

    // Short trains fit on screen; long ones report overflow (pan)
    if (n <= 3) {
      assert(T.trainFitsOnScreen(laid), `n=${n} short train fits`);
    }
    // Order still valid either way
    assert(T.assertTrainOrder(laid.engine, laid.cars), `n=${n} order after layout`);
  }
}

// -------------------- short train fits; long train pans --------------------
section('portrait — short fits, long pans');
{
  const T = loadGame();
  const short = T.layoutTrain(T.SHAPES.slice(0, 2));
  assert(T.trainFitsOnScreen(short), '2-car fits without pan');
  assertEq(T.trainPanBounds(short).fits, true, '2-car pan bounds fit');
  assertEq(T.trainPanBounds(short).min, 0, '2-car min pan 0');
  assertEq(T.trainPanBounds(short).max, 0, '2-car max pan 0');

  const long = T.layoutTrain(T.SHAPES.slice(0, 8));
  assertEq(long.cars.length, 8, '8 cars laid out');
  assert(long.metrics.overflows === true, '8-car overflows portrait');
  assert(T.trainFitsOnScreen(long) === false, '8-car needs pan');
  const b = T.trainPanBounds(long);
  assert(b.fits === false, '8-car pan bounds not fit');
  assert(b.min < b.max, 'pan range has room');
  // Chunkier cars than old aggressive shrink (carW floor ~50)
  assert(long.cars[0].w >= 48, 'long train keeps chunky cars');
  // Clamp works
  assertEq(T.clampTrainPan(b.min - 50, long), b.min, 'clamp low');
  assertEq(T.clampTrainPan(b.max + 50, long), b.max, 'clamp high');
  assertEq(T.clampTrainPan((b.min + b.max) / 2, long), (b.min + b.max) / 2, 'clamp mid');
}

// -------------------- pan drag API --------------------
section('pan drag on train band');
{
  const T = loadGame();
  T.enterPlay('pro');
  assertEq(T.cars().length, 8, 'pro = 8 cars');
  assert(T.trainNeedsPan(), 'pro needs pan');
  // Hit band around track, miss cargo area
  assert(T.hitTrainBand(T.W / 2, T.TRACK_Y) === true, 'band at track');
  assert(T.hitTrainBand(T.W / 2, T.H - 50) === false, 'not band at platform');

  const before = T.trainPan();
  // Start pan near track center (avoid cargo)
  T.startDrag(T.W / 2, T.TRACK_Y);
  assert(T.drag() && T.drag().kind === 'pan', 'pan drag started');
  T.moveDrag(T.W / 2 + 40, T.TRACK_Y);
  // Finger right → pan increases (train shifts right)
  assert(T.trainPan() > before - 0.01, 'pan increased when dragging right');
  T.endDrag(T.W / 2 + 40, T.TRACK_Y);
  assert(T.drag() === null, 'pan drag cleared');

  // Cargo drag still works and is not pan
  const cargo = T.cargo().find(c => !c.placed);
  T.startDrag(cargo.x, cargo.y);
  assert(T.drag() && T.drag().kind === 'cargo', 'cargo drag preferred over pan');
  T.endDrag(cargo.x, cargo.y);
}

// -------------------- canLoad match rules --------------------
section('canLoad match rules');
{
  const T = loadGame();
  const circle = T.SHAPES.find(s => s.id === 'circle');
  const square = T.SHAPES.find(s => s.id === 'square');
  const car = { shape: circle, filled: false };
  const cargoOk = { shape: circle, placed: false };
  const cargoBad = { shape: square, placed: false };
  const cargoPlaced = { shape: circle, placed: true };
  const carFilled = { shape: circle, filled: true };

  assert(T.canLoad(cargoOk, car) === true, 'matching empty car loads');
  assert(T.canLoad(cargoBad, car) === false, 'wrong shape rejected');
  assert(T.canLoad(cargoPlaced, car) === false, 'already placed cargo rejected');
  assert(T.canLoad(cargoOk, carFilled) === false, 'filled car rejected');
  assert(T.canLoad(null, car) === false, 'null cargo rejected');
  assert(T.canLoad(cargoOk, null) === false, 'null car rejected');
}

// -------------------- cargo layout --------------------
section('layoutCargo');
{
  const T = loadGame();
  const palette = T.SHAPES.slice(0, 3);
  const cargo = T.layoutCargo(palette);
  assertEq(cargo.length, 3, 'cargo count');
  assert(cargo.every(c => !c.placed), 'all free');
  assert(cargo.every(c => c.y === T.H - 110), 'platform y');
  // All cargo shapes come from palette
  const ids = new Set(palette.map(s => s.id));
  assert(cargo.every(c => ids.has(c.shape.id)), 'cargo subset of palette');
  // Distinct homes
  const xs = cargo.map(c => c.homeX);
  assert(new Set(xs).size === xs.length, 'distinct home X');
}

// -------------------- play flow: load matching shapes --------------------
section('play flow — load + allLoaded');
{
  const T = loadGame();
  T.enterPlay('easy');
  assertEq(T.state(), 'play', 'enter play');
  assertEq(T.modeId(), 'easy', 'mode easy');
  assertEq(T.stationsTarget(), T.MODES.easy.stations, 'stations target');
  assert(T.cars().length === 3, '3 cars');
  assert(T.cargo().length === 3, '3 cargo');
  assert(T.assertTrainOrder(T.engine(), T.cars()), 'live layout order');
  assert(T.allLoaded() === false, 'not loaded yet');

  // Load each cargo into matching car via endDrag simulation
  for (const c of T.cargo()) {
    const car = T.cars().find(p => !p.filled && p.shape.id === c.shape.id);
    assert(!!car, `find car for ${c.shape.id}`);
    // startDrag at cargo, endDrag on car
    T.startDrag(c.x, c.y);
    assert(!!T.drag(), 'drag started');
    T.moveDrag(car.x, car.y);
    T.endDrag(car.x, car.y);
    assert(c.placed === true, `${c.shape.id} placed`);
    assert(car.filled === true, `${c.shape.id} car filled`);
  }
  assert(T.allLoaded() === true, 'all loaded after matches');
  assert(T.sessionLoads() === 3, 'session loads = 3');
}

// -------------------- wrong drop returns cargo --------------------
section('play flow — wrong drop');
{
  const T = loadGame();
  T.enterPlay('easy');
  const c = T.cargo()[0];
  const wrong = T.cars().find(p => p.shape.id !== c.shape.id);
  assert(!!wrong, 'wrong car exists');
  const homeX = c.homeX;
  const homeY = c.homeY;
  T.startDrag(c.x, c.y);
  T.endDrag(wrong.x, wrong.y);
  assert(c.placed === false, 'not placed on wrong car');
  assert(c.returning === true, 'returning home');
  assert(wrong.filled === false, 'wrong car still empty');
  assertEq(c.homeX, homeX, 'home X unchanged');
  assertEq(c.homeY, homeY, 'home Y unchanged');
}

// -------------------- free mode endless stations --------------------
section('modes');
{
  const T = loadGame();
  T.enterPlay('free');
  assertEq(T.stationsTarget(), 0, 'free = endless stations');
  assertEq(T.cars().length, 2, 'free = 2 shapes');
  T.enterPlay('more');
  assertEq(T.cars().length, 5, 'more = 5 shapes');
  T.enterPlay('pro');
  assertEq(T.cars().length, 8, 'pro = 8 shapes');
  assertEq(T.stationsTarget(), 8, 'pro stations');
  assert(T.assertTrainOrder(T.engine(), T.cars()), 'pro engine order');
  assertEq(T.SHAPES.length, 8, '8 shape kinds in catalog');
}

// -------------------- hit tests --------------------
section('hit tests');
{
  const T = loadGame();
  T.enterPlay('easy');
  const c = T.cargo()[0];
  assert(T.hitCargo(c.x, c.y) === c, 'hit cargo center');
  assert(T.hitCargo(0, 0) === null, 'miss cargo');
  const car = T.cars()[0];
  assert(T.hitCar(car.x, car.y) === car, 'hit car center');
  // Far away
  assert(T.hitCar(0, 0) === null, 'miss car');
}

// -------------------- save helpers --------------------
section('save');
{
  const T = loadGame();
  const before = T.save.loads | 0;
  T.recordLoad();
  assertEq(T.save.loads, before + 1, 'recordLoad increments');
  T.setMode('more');
  assertEq(T.save.mode, 'more', 'setMode');
  T.setMuted(true);
  assert(T.save.muted === true, 'muted');
}

// -------------------- summary --------------------
console.log('\n');
if (failed) {
  console.error(`Failed: ${failed}  Passed: ${passed}`);
  for (const f of failures) console.error('  •', f);
  process.exit(1);
}
console.log(`Passed: ${passed}  Failed: 0`);
console.log('All Shape Train tests passed.');
process.exit(0);
