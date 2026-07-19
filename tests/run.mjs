import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { console.error('  ✗', m); failed++; } };

console.log('Shape Train tests\n');
const req = [
  'index.html', 'css/style.css', 'js/config.js', 'js/save.js', 'js/audio.js',
  'js/particles.js', 'js/game.js', 'js/main.js', 'manifest.webmanifest', 'sw.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'apple-touch-icon.png', 'art/cover.jpg',
];
for (const f of req) ok(fs.existsSync(path.join(root, f)), `exists ${f}`);

const config = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const ver = config.match(/GAME_VERSION\s*=\s*['"]([^'"]+)['"]/);
ok(!!ver, 'GAME_VERSION');
if (ver) ok(sw.includes(`shape-train-${ver[1]}`), 'SW CACHE sync');
ok(config.includes('SHAPES') && config.includes('MODES'), 'config data');

const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
ok(man.display === 'standalone', 'manifest');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let last = -1;
for (const s of ['config.js', 'save.js', 'audio.js', 'particles.js', 'game.js', 'main.js']) {
  const i = html.indexOf(s);
  ok(i > last, `order ${s}`);
  last = i;
}

const game = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
ok(game.includes('startDrag') && game.includes('endDrag'), 'drag API');
ok(game.includes('startChugAway') || game.includes('chugging'), 'chug celebration');
ok(game.includes('hintTimer'), 'idle hint');

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
