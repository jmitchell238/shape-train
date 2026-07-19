# Shape Train

Drag shapes into matching train cars — whistle, chug, confetti. Soft shape matching for ages **4–6**.

**Play:** https://jmitchell238.github.io/shape-train/

Part of [Arcade Hub](https://jmitchell238.github.io/arcade-hub/).

## Modes

| Mode | Shapes | Stations |
|------|--------|----------|
| Free Ride | 2 | Endless |
| Easy | 3 | 4 |
| A Little More | 5 | 6 |
| Express | 8 | 8 |

## Features

- Circle, square, star, triangle, heart, diamond, moon, hex
- Drag the train left/right to scroll long consists (portrait-first)
- Soft wrong-drop bounce + correct-car hint
- Full train chugs away with whistle + smoke
- Sound mute + reduced motion
- Offline PWA

## Stack

Static HTML / CSS / Canvas. No build step.

## Tests

```bash
node tests/run.mjs
```

VM-loaded unit tests (layout, match rules, drag flow, save) plus PWA shell checks — same style as bottle-sort / maze-adventure.

## Versioning

`GAME_VERSION` in `js/config.js` ↔ `CACHE` in `sw.js`.

## Local preview

```bash
python3 -m http.server 8080
```

## Parents

No lives, ads, accounts, or fail screens.

## License

Personal project for family Arcade Hub.
