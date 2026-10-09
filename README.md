# Shape Train

Drag shapes into the train car with the matching shape. When the train is full it whistles and chugs away. A gentle shape-matching game for ages 4–6.

Play at https://jmitchell238.github.io/shape-train/. It's one of the games in [Arcade Hub](https://jmitchell238.github.io/arcade-hub/).

## Modes

| Mode | Shapes | Stations |
|------|--------|----------|
| Free Ride | 2 | Endless |
| Easy | 3 | 4 |
| A Little More | 5 | 6 |
| Express | 8 | 8 |

## Features

- Shapes: circle, square, star, triangle, heart, diamond, moon and hexagon
- Drag the train sideways to see the rest of a long train (designed for portrait)
- A wrong drop bounces back and the right car is highlighted
- Mute and Calm motion settings
- Installable PWA that works offline

There are no lives, ads, accounts or fail screens.

## Running locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. The service worker needs `localhost` or HTTPS.

Plain HTML, CSS and canvas with no build step.

## Tests

```bash
node tests/run.mjs
```

## Versioning

When you bump `GAME_VERSION` in `js/config.js`, set `CACHE` in `sw.js` to `'shape-train-' + GAME_VERSION`.

## License

Personal project for the family.
