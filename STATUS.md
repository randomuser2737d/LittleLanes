# Little Lanes — build status (Oct 12, version 32)

Single-file game: `index.html` (HTML + vanilla JS + Canvas 2D, no libraries). Plan and design decisions live in the "Little Lanes — Game Design & Build Plan" doc.

## Two modes in one app (version 13)
- Home screen with **Classic** (Mini Motorways-style essentials) and **Plus** (everything, "Free for now"; a one-time $1.99 or 1-month trial is a later idea, not built)
- Separate progress and save slots per mode (`littlelanes.classic.v1` / `littlelanes.v1`); shared settings (`littlelanes.settings`): theme Auto/Light/Dark, colorblind shapes, sound on/off
- Classic hides: ferries, metro, airports, warehouse/trucks, ambulances, rush hour/game days/carnival, road work, weather and floods, drawbridges and trains, apartments, Silver challenges, Gold themes, world tour, achievements/car styles, planning mode, map maker, sandbox, practice town, seasonal decorations. Classic keeps replay and photo mode
- `PLUS()` gates every Plus-only feature in the code

## Mini Motorways-style details (both modes)
- Start with 20 road tiles (10 with Tight budget); no free weekly roads. Each Sunday pick 1 of 2 upgrade sets: Road tiles +30; Bridges +2 with 15 roads; Tunnels +2 with 15 roads; Roundabouts +2 with 10 roads; Traffic lights +3 with 10 roads; Motorway +1; (Plus) Ferry +1 with 10, Metro +1 with 10. At least one of the two choices always includes roads
- Tools join the pool by week (bridges/tunnels week 1 if the terrain needs them, roundabouts 2, lights 3, motorway 4, Plus ferry 3, metro 7), weighted per city (UPG_BIAS)
- The first time a tool is offered in a game, a "New upgrade unlocked" card shows before the choice
- Erasing a road that cars are using turns it gray; it disappears once those cars have passed (pathfinding avoids gray roads)
- Houses have a driveway direction (stub shown when unconnected); roads connect only through it; drawing from or into a house turns its driveway; a busy old driveway goes gray until its cars are home
- Cars slow for corners, park in lot stalls a little longer; deliveries show a white pop ring and a floating +1; new pins bounce in

## Version 32 (real traffic jams)
- Cars no longer "ghost" through each other after waiting 5 s: a jam stays a jam until it clears (a 25 s safety valve remains only for genuine dead-ends)
- A car keeps a crossing blocked until it is fully through it (0.62 tiles past, was 0.32), and cars keep a bigger gap (0.62 tiles, was 0.5); a car can't enter a road until the car ahead has moved on
- Result: busy crossings, driveways and full parking lots now back traffic up, and badly planned roads can gridlock, as in the original. Roundabouts, traffic lights and motorways matter much more
- Removed the 3× speed button (and key); speeds are pause, 1× and 2×

## Version 31 (much harder, both modes)
- Cars drive at 1.15 tiles/s (was 1.6)
- The first city area is bigger (17×11 instead of 14×9) and grows in larger steps, so everything looks smaller and cars look slower, like the original
- Workplaces want visitors about twice as often (every 5 s at the start, down to 2.6 s later; was 9.5 s → 3.4 s). A workplace now needs 2–3 houses, not 1
- New houses always appear at least ~5 tiles from their own workplace
- A new workplace appears every week from week 2 (was every other week); new colors still every 3 weeks
- Houses appear faster (every 7 s at the start, down to 2.2 s)
- The red overflow timer fills in 30 s (was 38 s)
- Test bot now loses in week 3–4 instead of surviving easily

## Version 30 (installing and updating)
- Updates reach installed copies by themselves: the app checks for a new version every time it opens or comes back to the front, and shows "A new version of Little Lanes is ready · Update". Tapping Update saves your game and reloads into the new version. The game page is fetched network-first, so it still plays offline from the saved copy
- "Install app" button in Settings (home screen and pause menu): uses the browser's install prompt where there is one (Chrome, Edge, Android) and shows step-by-step instructions on iPhone/iPad and Mac Safari. Hidden once installed

## Version 29 (harsher traffic, both modes)
- Cars are slower (speed 2.1 → 1.6 tiles/s), closer to Mini Motorways
- A car that gets home rests in its driveway for 3.5 s before it can leave again, so one house can't clear a whole workplace by bouncing back and forth (each house still has 2 cars)
- Cars stay parked at work 1.6 s (was 0.9)
- Turns are slower (corner speed 62% → 50%), and every crossing slows cars a little even going straight (roundabouts don't)
- Result: a house about 7 tiles from its workplace now delivers roughly half as many trips per minute as before

## Version 28 (Plus extras)
Three optional Plus toggles in the toolbar (remembered between games, hidden in Classic):
- Traffic view: every road with cars on it glows yellow / orange / red by how busy it is, and jammed junctions pulse red
- Live stats: a panel under the score with trips in the last week, average trip time, cars driving, cars stuck in traffic, and the busiest workplace
- Day and night: night falls twice a week; the city darkens, workplace windows light up and cars switch on headlights

## Version 27 (City Pack 4 + Classic challenges)
- New cities in both modes (Pack 4, unlocks after Rio at 800 trips each):
  - Seoul (drives right): the wide Han River across the middle, Bukhansan, Namsan and Gwanak peaks
  - Cape Town (drives left): Table Bay, Table Mountain and Lion's Head, False Bay
  - Toronto (drives right): Lake Ontario and the Toronto Islands, the Don and Humber rivers
- Each has two challenges, a Gold map theme (Plus) and its own upgrade leanings. 18 cities total
- Classic now has city challenges too, unlocked per city at 1,000 trips (like the original)

## Version 26 (City Pack 3)
- New cities in both modes (Pack 3, unlocks after Hong Kong at 800 trips each):
  - New York (drives right): Manhattan between the Hudson and East River, harbor to the south, Liberty Island
  - Paris (drives right): the winding Seine, Montmartre and Belleville hills, Eiffel Tower and Arc de Triomphe
  - Singapore (drives left): island city with the Johor Strait, Singapore River, Marina Bay, Kallang Basin, Bukit Timah hill and Sentosa
- Each has two challenges, a Gold map theme (Plus), and its own upgrade leanings
- New-workplace pulse now only marks spots where the whole building fits on land

## Version 25 (Mini Motorways mechanics)
- Roundabouts are a 5-tile plus shape: tap a road or open ground and it fills the center and 4 arms (no road tiles used), drawn as a big circle; cars enter only from the 4 sides and drive around the ring. Erasing any part removes the whole roundabout and gives it back. Upgrade gives 1 roundabout + 20 roads. Old saves: single-tile roundabouts are returned to your stock
- Motorways can't cross mountains and can't start or end at a roundabout or traffic light; traffic lights can't go on a motorway end, bridge or tunnel
- Bridges like the original: no junctions on a bridge, and houses can't connect straight onto a bridge or tunnel
- Road upgrades: every tool comes with 20 road tiles (motorway 10). Fixed: version 24 said this but the bridge/tunnel/roundabout/light sets still gave 15/10. The road-only pick is now "skip the tool" and gives 30, sometimes 40
- Endless reworked: overflowing workplaces lose their 3 oldest visitors and you lose 3 points, no game over. New Endless section in the city menu (for cities you've played) with its own best scores
- Cars a little slower (speed 2.4 → 2.1)
- GPS routing in both modes: cars pick the fastest route by travel time (motorway speed, junction delays: lights > plain crossings > roundabouts) with live traffic, and re-route mid-trip when a jam makes another way at least 18% faster

## Version 24 (closer to Mini Motorways + Plus extras)
Classic and Plus:
- Capacity like the original: a workplace holds 6 waiting pins (8 once it grows); one more starts the red timer
- Parking lots have 3 spaces (grown workplaces get a second lot, 6 total)
- Grown workplaces become big round buildings
- Every tool upgrade comes with 20 road tiles (motorway 10); the road-only pick stays 30
- Expert mode: roads lock 30 seconds after you build them (was 2 weeks), and there's no undo
Plus only:
- "Trips each week" bar chart on the game-over card
- Second chance: once per game (not in daily/weekly), clear 4 pins from the overflowing workplace and keep playing

## Version 23
- Menus and panels are fully solid now; locked city cards and unearned achievements fade their contents instead of the whole card, so the game no longer shows through them
- Long-game fuzz: 4 games to week 9–10 (Classic and Plus, endless) with random building/erasing/undo every few seconds: no rule violations, no errors, save/reload intact
- All 12 cities start cleanly with valid parking lots across 5 seeds each

## Version 22
- Fixed a freeze: about 1 in 8 game starts locked up the page right after tapping a city. Traced it (breadcrumb logging) to the blurred-glass effect behind menus and panels; removed the blur (panels are now slightly more solid). 0 freezes in 80 test starts afterwards, versus ~12% before. This likely also helps slower phones
- Fuzz testing extended: 10 games × 140 random actions in both modes, plus a road-count conservation check (draw/erase/undo can't create or lose road tiles, bridges, tunnels, roundabouts or lights)

## Version 21
- Phones held upright: the city now grows tall instead of wide (same area per stage; the final stage is still the whole map), so the play area fills the screen. Saved with the game
- Compact toolbar on narrow phones: icon-only buttons with count badges, rows align neatly

## Version 20
- New workplaces are announced: a pulsing ring in the new color marks the spot about 5 seconds before the building appears (saved with the game)
- Road counter bumps when you get more roads, turns yellow at 5 or fewer, and shakes when you run out
- 3× speed button (and key 3)

## Version 14 (Classic polish, research-based)
- Smart traffic lights: sensor-based; green ≥3 s, ≤9 s when both sides wait; switches only when the other side waits and this side has been empty 1 s; green → yellow 1.2 s → all-red 0.6 s → other side. Signal heads with red/yellow/green lamps and stop bars on every approach. Cars only stop on red/yellow
- Diagonal driveways: houses face any of 8 directions; drag from a house diagonally to turn it
- Houses redesigned: set back from a driveway pad, idle cars parked on the driveway facing the road; turning animates
- Workplace lots framed in the building's color (reads as that building's garage); capacity shown as empty pin rings (7 on a new building), overflow pins tinted red
- Capacity like the original: red timer starts above 7 pins, max 10; cars prefer buildings whose timer is running
- Every upgrade set includes road tiles (motorway now +10 roads)
- Car horns when a car is stuck ~2 s (rate-limited)
- Dismissable 4-step tutorial cards with Got it (per mode)
- Toolbar count badges

## Version 19 (check-up and hardening)
- Fixed: the colorblind-shapes setting was wiped every time the game loaded
- Fixed: Undo could reconnect a road to a house or parking lot on its old driveway side after the driveway had been turned
- Fixed: Undo right after picking a Sunday upgrade could take the upgrade back; undo history now resets each Sunday
- Security: shared map codes and saved maps are rebuilt from checked fields only (names stripped of HTML characters, ids, sizes and terrain checked, must have land near the center, codes capped at 20,000 characters), so a map code can't inject code into the menus
- Security: saved data is cleaned on load (scores forced to numbers, settings limited to known values, no prototype tricks); a corrupted save no longer breaks the game
- App package adds a Content Security Policy (no outside scripts, no outside connections except Google Fonts)
- Tested with a random-input fuzzer (drags in all directions, erases, undos, upgrades, save/reload) checking road-network rules after every action, plus attack tests with hostile map codes and tampered storage
- Known limit: daily score codes are checked only with a simple checksum, since there's no server; a determined player could make a fake one

## Version 18
- Toolbar buttons for roundabouts, traffic lights, motorways, bridges, tunnels (and Plus ferries/metro) stay hidden until you first get that tool in the current game, then pop in with a bounce. They stay visible after you use them up. Saved games remember which ones you've received

## Version 17 (driveways and diagonal drawing)
- Diagonal roads now come from how you drag: the road follows your finger in 8 directions, so a 45° drag makes a diagonal road (before, the drag went tile by tile and always made staircases)
- House driveways turn when you drag from a house in any of 8 directions, or draw a road into it
- Workplace parking lots have one dedicated driveway (a paved stub with an arrow); roads only join a lot there. Drag from a lot, or draw a road into it from another open side, to move its driveway (blocked while cars are heading in)
- New lots point their driveway toward that color's houses; the tile in front of a driveway is kept free of new buildings
- Each lot has 4 stalls shared across its 2 tiles; cars queue at the driveway when it's full
- Faint grid dots show while drawing
- Old saves are converted (lots get a driveway automatically)

## Version 16 (Mini Motorways-style parking lots)
- Every workplace has a 2-tile parking lot along one side of the building, joined to it by a strip in the building's color, with 4 painted stalls and a lane on the open side
- Roads can connect to either lot tile; cars use whichever is closer
- Each lot tile holds 2 parked cars; when both stalls are full, the next car waits at the entrance (more lots = more throughput, like the original)
- Cars glide into a stall nose-first toward the building, wait, then back out smoothly
- When a workplace grows (after 30 trips), it gets a second full parking lot on another side
- Airport and warehouse (Plus) keep their 1-tile lot; old saves with 1-tile lots still load

## Version 15 (Classic polish)
- Game over keeps the city visible: the camera centers on the overflowing workplace, the score card slides in from the side (bottom on phones), the toolbar hides; title reads "The red workplace overflowed"
- Classic hides the bronze/silver/gold medal badges and medal toasts (Plus keeps them)
- Tutorial cards sit in the bottom-left corner on wide screens and at the top on phones, so they don't cover the middle of the map
- Roads meet house driveways at full width (no more round blobs on short stubs)
- New workplaces and houses avoid the very edge of the play area

## Plus: traffic-aware routing
- Edge cost = free-flow time (motorway/metro faster, ferry slower, lights slight penalty) × (1 + 0.75 × cars on that lane + 0.35 × cars queued at the next crossing)
- Traffic measured every second; cars re-check their route every 2 s and switch if the new one is ≥18% faster
- Verified: jamming a straight road makes cars take the detour

## Working now
- Core loop: houses, destinations, pins, cars with A* routing, car following, intersection reservation, fail timer, game over
- Drawing: diagonal roads are free and default (roads follow the pointer in 8 directions; diagonals can't cross without an intersection; houses and lots connect straight); drag roads (auto-connect), erase (right-click or eraser), undo (Ctrl+Z / button, 30 steps)
- Pieces: bridges, tunnels, diagonal roads, roundabouts, traffic lights, motorways, ferries
- Weekly upgrades: +12 roads each week plus a choice of 2 (1 in Expert): Road crew +30, Bridges +2, Tunnels +2, Roundabouts +2, Traffic lights +3, Ferry +1, Motorway +1 (bridge/tunnel/ferry/motorway come with bonus roads); big icon cards with 'You have N' and a hold-to-see-map button
- Zoom-out stages (5 per city) with the reveal wave and smooth camera
- Driving side per city (London drives left)
- 4 starter cities with simplified real geography, landmarks, and airports at real locations; Practice town (no game over)
- Unlock chain (trips in the previous city): Amsterdam 300 (Seattle), London 400 (Amsterdam), Cairo 500 (London); both packs open from London: Bangkok 600 then Tokyo 700, Mumbai 750, Hong Kong 800; Istanbul 800 then Sydney, San Francisco, Rio 800 each; game over shows trips left to the next unlock
- Medals: Bronze 300; Silver 600 unlocks 2 city challenges; Gold 1000 unlocks Expert mode and a city map theme
- Endless mode after any game over
- Daily puzzle (first run is official, shareable score code) and Weekly challenge (best run counts), local high scores; friend-code checker on the menu
- Events: rush hour, stadium game day, road work, ambulances (+2/+5 bonus, other cars yield), warehouse with delivery trucks (week 7+)
- Visuals: soft coastlines and hills, trees, outlined roads with smooth joins, house driveways, parking lots at workplaces, roofed houses with parked cars, car shapes with cabins, ambulance lights, trucks, clock-style week dial
- City Pack 1: Bangkok, Tokyo, Mumbai, Hong Kong (all drive left), each with landmark, airport, 2 Silver challenges, Gold theme; Bangkok opens with Cairo
- City Pack 2: Istanbul, Sydney (left), San Francisco, Rio de Janeiro, each with landmark, airport, challenges, theme; Istanbul opens with Cairo
- City twists: Amsterdam drawbridges lift for boats (bridge roads blocked ~6 s, every ~24 s from week 2); Tokyo has a train line across the city and level crossings that stop cars while a train passes
- More city twists: London and San Francisco fog weeks (cars 15% slower), Cairo sandstorms (30% slower), Hong Kong typhoons and Sydney storms (35% slower, floods in Bangkok/Mumbai too), Rio carnival (game days much more common), Seattle starts with 1 ferry, Istanbul with 2, Sydney with 1
- Metro line (upgrade from week 8, +8 roads): tap a road and drag to another road 4+ tiles away; cars ride underground at 3.2x speed; purple M stations
- Organic terrain: city shapes are traced at 4× resolution from each city's real-geography formula, lightly blurred, and drawn with marching-squares contours (deep-water and hill-contour layers); custom maps use a blurred tile field. Gameplay still uses the tile grid
- Workplaces: each has a designated parking-lot driveway; after 30 trips a workplace grows (level 2: second parking lot, +2 pin limit, more demand, star badge), after 100 trips it becomes a big office (level 3); cars use whichever lot is closer and park in stalls
- Rounder houses
- Replay: game over has 'Watch replay', a time-lapse of the city growing (frames every 1.5 s, tap to skip)
- Map maker: paint land/water/hills on the 44×28 grid with small or big brush, set the start point (shows the first-stage area), name, drive side; save and play; My maps list with play/edit/share/delete; share codes (LLMAP:...) that friends paste into the menu
- Planning mode (plan button or P): pauses the city, new roads glow while you sketch, Build plan keeps them, Cancel plan (or Esc) restores the roads and road count
- Sandbox mode: any unlocked city, whole map revealed, 999 roads and 20–50 of every piece, 3 colors, no game over, nothing scored
- City twist: monsoon floods in Bangkok and Mumbai close riverside roads for a few seconds during rainy weeks
- Houses grow into apartments (4 cars) after 14 trips
- Weather by real climate: rainy weeks (cars 10% slower) and winter snow (25% slower); autumn trees and pumpkins in Sep–Nov
- World tour: play every unlocked city back to back, total score carries over
- 14 achievements; car styles (Classic, Sporty, Retro, Minivan) unlock at 0/3/6/9 achievements
- Photo mode (menu → Photo mode, tap to exit)
- Polish: terrain pre-rendered (no seams, faster), smooth car turning, hover preview on desktop, empty tools dimmed, map thumbnails on city cards, game over zooms to the overflowing building before the results
- Game-over stats: roads built, longest trip, busiest crossing, ambulance bonus, deliveries
- Save and resume, colorblind shapes, pinch / scroll zoom, middle-drag pan, F to reset view, light and dark themes
- PWA: manifest + offline service worker (bump VERSION in sw.js on every update)

## Balance notes
- CAP 6 pins before the timer starts, timer fills in 38 s, pin interval starts at 9.5 s
- A simple bot reaches weeks 7–11; it can't plan water crossings, so early losses in Seattle are bot-specific

## Next up (ranked list in the plan)
- Side-by-side ghost replay (optional)
- Tier 3: photo mode, timelapse export, easter eggs
- New-ideas list: school zones, planning mode, trams, city sounds, controller support
- more city packs (ideas: New York, Paris, Singapore, Cape Town)
- Music (to be made by us)
- Portrait phones: consider rotating wide maps

## Debug hook
`window.__LL` exposes `G` (game state), `cam()`, and `expand()` for testing in the browser console.
