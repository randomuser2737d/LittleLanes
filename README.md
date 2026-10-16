# Little Lanes

A calm road-building puzzle game for every device. Draw roads between houses and workplaces in real cities, keep the traffic moving, and see how many weeks your city can last.

Made by Enoch (game design) with help from Claude (code). Inspired by the style of Mini Motorways; all code, maps and art here are original.

## Play
- Open the game's web address in any browser, or install it as an app (see [INSTALL.md](INSTALL.md)).
- It works offline once it has been opened or installed.

## Two modes
- **Classic:** the pure puzzle, close to Mini Motorways. Roads, diagonal roads, bridges, tunnels, 5-tile roundabouts, smart traffic lights and motorways. You get a weekly upgrade choice, and the city grows. There are daily and weekly puzzles, Endless and Expert modes, and city challenges at 1,000 trips.
- **Plus:** everything in Classic, plus extras:
  - ferries, metro lines, airports, warehouse trucks and ambulances
  - weather, rush hour and events
  - a map maker, sandbox and world tour
  - achievements, car styles and Gold map themes
  - traffic view, live stats, day and night
  - a second chance once per game
- Each mode keeps its own progress.

## Cities (18)
- **Starter cities:** Seattle, Amsterdam, London, Cairo.
- **Pack 1:** Bangkok, Tokyo, Mumbai, Hong Kong.
- **Pack 2:** Istanbul, Sydney, San Francisco, Rio de Janeiro.
- **Pack 3:** New York, Paris, Singapore.
- **Pack 4:** Seoul, Cape Town, Toronto.

Cities unlock by reaching trip goals in the city before them.

## How to play
1. Drag from a house to the driveway of the same-colored parking lot (the little arrow).
2. Cars drive to work and back. Each delivery is one trip.
3. Don't let a workplace's pins overflow: a red timer starts, and when it fills, the game ends.
4. Every Sunday, pick an upgrade. New tools unlock as the weeks go by.
5. Drag from a house or lot to turn its driveway. Right-click or use the eraser to remove roads; Ctrl+Z undoes.

## Files
| File | What it is |
|---|---|
| `index.html` | The whole game: HTML, CSS and JavaScript in one file, with no libraries |
| `sw.js` | Offline support and automatic updates |
| `manifest.json` and icons | Let it install as an app |
| `INSTALL.md` | How players install the game on each device |
| `PUBLISHING.md` | For the owner: putting the game online and uploading updates |
| `STATUS.md` | Change log for each version |

## Updating
Upload the new files over the old ones. Each new build raises `VERSION` in `sw.js`. Installed copies notice the change and offer an **Update** button.

## Play it locally
Service workers need a web server. From this folder, run `python3 -m http.server 8000` and open http://localhost:8000.

## License
All rights reserved. See [LICENSE](LICENSE).
