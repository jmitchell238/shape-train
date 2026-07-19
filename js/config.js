'use strict';

// Shape Train — Keep CACHE in sw.js in sync: 'shape-train-' + GAME_VERSION
const GAME_VERSION = '1.0.002';
const GAME_VERSION_LABEL = 'v' + GAME_VERSION;
const GAME_NAME = 'Shape Train';

const W = 390;
const H = 700;
const SAVE_KEY = 'shape-train-save-v1';

const MODES = {
  free:  { id: 'free',  name: 'Free Ride', tagline: '2 shapes · cozy', shapes: 2, stations: 0 },
  easy:  { id: 'easy',  name: 'Easy',      tagline: '3 shapes · short', shapes: 3, stations: 4 },
  more:  { id: 'more',  name: 'A Little More', tagline: '4 shapes', shapes: 4, stations: 6 },
  pro:   { id: 'pro',   name: 'Express',   tagline: '5–6 shapes', shapes: 6, stations: 8 },
};
const MODE_ORDER = ['free', 'easy', 'more', 'pro'];

/** Track + locomotive geometry (shared by layout + draw) */
const TRACK_Y = 280;       // vertical center of car bodies
const ENGINE_BODY_W = 78;
const ENGINE_BODY_H = 48;
const ENGINE_GAP = 10;     // gap between engine rear and first car coupler
const CAR_GAP = 8;
const PLATFORM_Y = H - 110;

const HINT_AFTER = 6;

const PRAISE = ['All aboard!', 'Yay!', 'Nice!', 'Match!', 'Choo!', 'Yes!', 'Great!', 'Woo!'];

/** Distinct shapes for little kids */
const SHAPES = [
  { id: 'circle',   label: 'Circle',   color: '#EF5350', color2: '#C62828' },
  { id: 'square',   label: 'Square',   color: '#42A5F5', color2: '#1565C0' },
  { id: 'star',     label: 'Star',     color: '#FFEE58', color2: '#F9A825' },
  { id: 'triangle', label: 'Triangle', color: '#66BB6A', color2: '#2E7D32' },
  { id: 'heart',    label: 'Heart',    color: '#EC407A', color2: '#AD1457' },
  { id: 'diamond',  label: 'Diamond',  color: '#AB47BC', color2: '#6A1B9A' },
];
