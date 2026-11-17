# Little Lanes: Classic vs Plus split plan

Status: **built in version 13** as one app with two modes on the home screen. Decisions from Enoch are below; the original plan follows.

## Decisions (Oct 11)
- Names: **Classic** and **Plus**.
- One app; the home screen has two mode buttons.
- Plus is free for now. A one-time $1.99 (or a 1-month free trial) is a later idea and is not built.
- Progress stays separate: unlocking a city in one mode doesn't unlock it in the other.
- Classic keeps replay and photo mode.
- Road deletes and house driveway turns work like this: a road in use turns gray and disappears after its cars pass.
- Plus cars route by travel time with live traffic.
- Upgrade unlocks follow the core rules: pick 1 of 2 sets each Sunday, roads come in bundles, and bigger tools join later with a reveal card.

## The idea

Some players want the calm, simple puzzle. Others like all the extras. So the game becomes two editions built from the same code:

- **Little Lanes Classic**: plays like the core formula. Roads, houses, workplaces, weekly upgrades, growing cities. Nothing else.
- **Little Lanes Plus**: everything in Classic, plus all the extras we've built (events, weather, metro, map maker, and so on).

**Recommended way to build it:** one code file with an `EDITION` switch at the top (`'classic'` or `'plus'`). Each extra feature checks the switch before it runs or shows up. A build step outputs two files: `little-lanes-classic.html` and `little-lanes-plus.html`.

Why one file instead of two copies:
- A bug fix or new city only has to be made once.
- The two editions can't slowly drift apart.
- Each edition saves its progress separately, so playing one doesn't unlock things in the other.

## What each edition keeps

| Feature | Classic | Plus |
|---|---|---|
| Roads (grid + free diagonals), erase, undo | Yes | Yes |
| Houses, workplaces, pins, fail timer | Yes | Yes |
| Bridges, tunnels, roundabouts, traffic lights, motorways | Yes | Yes |
| Weekly upgrade choice (pick 1 of 2) | Yes | Yes |
| Zoom-out city growth | Yes | Yes |
| Real cities, driving side per country | Yes | Yes |
| City unlock chain (300 / 400 / 500 ...) | Yes | Yes |
| Workplace upgrades (second parking lot) | Yes | Yes |
| Daily and weekly challenges | Yes | Yes |
| Endless mode after game over | Yes | Yes |
| Expert mode (unlocked at a high score) | Yes | Yes |
| Light / dark mode | Yes | Yes |
| Colorblind shapes | Yes | Yes |
| Save and resume | Yes | Yes |
| Ferries | No | Yes |
| Metro lines | No | Yes |
| Airports | No | Yes |
| Warehouse and delivery trucks | No | Yes |
| Ambulances | No | Yes |
| Rush hour, game days, carnival | No | Yes |
| Road work closures | No | Yes |
| Weather (rain, snow, fog, sandstorm, storms, floods) | No | Yes |
| Drawbridges (Amsterdam), trains (Tokyo) | No | Yes |
| Apartments (houses growing) | No | Yes |
| Silver city challenges, Gold map themes | No | Yes |
| World tour | No | Yes |
| Achievements and car styles | No | Yes |
| Planning mode | No | Yes |
| Map maker and share codes | No | Yes |
| Sandbox | No | Yes |
| Practice town | Simple tutorial instead | Yes |
| Replay at game over | Yes (it's just a nice extra) | Yes |
| Photo mode | Yes | Yes |
| Seasonal decorations (pumpkins, snow trees) | No | Yes |

## Fixes for both editions: the small details that matter

These are the Core rules Enoch asked for. They go into the shared code, so both editions get them.

### 1. Light and dark mode switch
- A clear switch on the menu: Light, Dark, or Match my device. It's saved.
- Right now the game only follows the device setting.
- Check every color in both modes, including roads, cars, lots, the fog outside the city, and the menus.

### 2. Start with 20 road tiles
- Every city starts with **20 roads** instead of 30.
- Each week still adds more on top of the upgrade you pick.
- The "Tight budget" modifier becomes 10.

### 3. Upgrades depend on the map
- Each city gets its own upgrade list, for example:
  - Amsterdam leans on bridges.
  - Hong Kong and San Francisco lean on tunnels.
  - London leans on roundabouts and traffic lights.
- An upgrade that can't help yet never shows up. Example: no tunnels until a hill is inside the play area.

### 4. Upgrades have to be "unlocked" each game
- Each game starts with only the basics in the upgrade pool: Road crew, and Bridges if there's water.
- New upgrade types join the pool as the game goes on, at set weeks per city. Example: roundabouts from week 2, traffic lights from week 3, motorways from week 5.
- When a new type joins, a full card pops up before the normal choice: **"New upgrade unlocked: Motorway"**. It has a short animation and one line of how-to.
- After that it can appear in the weekly pick of 2.
- The game remembers this per game, not forever. Every new game starts the reveals over.

### 5. Better car animations
- **Leaving home:** the car rolls out of the house's driveway onto the road. It doesn't pop into the middle of the road.
- **Arriving at work:** the car turns into the parking lot, picks a stall, and parks facing the building. It waits a moment, backs out, then drives home.
- **Pin delivery:** the pin above the workplace goes "pop" when a car parks. A small +1 floats up, and the bubble count goes down.
- **Demand bubble:** each workplace shows its pins in a rounded bubble above the building. The bubble swells a little as it fills. When it's too full, a ring timer wraps around it.
- **Returning home:** the car pulls back into its driveway and parks beside the house.
- **Turning:** cars slow down for corners and speed up on straights. Turns follow curves instead of sharp corners.
- **Queues:** waiting cars bunch up with small gaps. They don't overlap.

### 6. Drag a house to change its driveway
- Press on a house and drag toward a neighboring tile to point its driveway that way.
- Only directions with an open tile, or a road, are allowed.
- The house reconnects to whatever road is on that side.
- It's free, like rotating a building.

### 7. Other small details to match the feel
- **Houses come in pairs:** a new color shows up as its workplace plus two houses close by. Later houses appear near houses of the same color.
- **New color warning:** when a new color is about to arrive, a soft pulse shows on the map where it will appear.
- **Week clock:** the day ticks Mon to Sun. The game auto-pauses when the week ends and the upgrade screen opens.
- **Road preview:** while dragging, a faint ghost line shows the path before it's placed. A red X shows where it can't go (no bridges left, landmark in the way).
- **Erase undoes driveways cleanly:** erasing a road next to a house never leaves a stub.
- **Road counter feedback:** the road number briefly flashes when you get more, and shakes when you run out.
- **Gentle sound design:** one soft note per delivery, a chime at week end, and a low hum when a ring timer starts. All sounds can be muted from the menu.
- **Score screen:** final trips, weeks survived, best score for this city, and progress to the next unlock.
- **Tutorial:** in Classic, the first game in Seattle shows 3 short tips:
  1. Drag a road from a house to the workplace.
  2. Each week you choose an upgrade.
  3. Don't let a workplace overflow.

## Brainstorm: new ideas

These aren't in the plan yet. Mark the ones you like.

### For both editions
- **Speed 3×** for long games.
- **Undo the last 3 roads** after a game over, then keep playing once. Like a second chance, but only one per game.
- **Per-city high-score ghost:** a faint line on the clock shows the week you reached last time.
- **Road counter warning** when you're down to 5 tiles.
- **Accessibility:** bigger UI option for phones and tablets, plus a high-contrast mode.
- **Controller support** for playing on a TV.
- **Left-handed layout:** the toolbar on the other side for phones held sideways.

### For Plus only
- **School zones:** schools want cars only on weekday mornings, and cars slow down nearby.
- **Hospitals:** a white workplace that any color can visit, but only a few at a time.
- **Bus lines:** draw a loop. A bus carries 4 people from a stop to a workplace.
- **Bike lanes in Amsterdam:** cheaper roads that only bikes use, and bikes take some trips off the road.
- **Night shift:** some workplaces only want cars at night, shown by a moon on the building.
- **Tolls:** a road tile that gives +1 score per car but makes cars avoid it when it's busy.
- **Parks:** spend road tiles to place a park, and houses near parks send cars a bit less often.
- **Earthquake event in San Francisco:** one road cracks and has to be rebuilt.
- **Fireworks in Sydney:** a New Year's event with a huge demand spike at one destination.
- **City Pack 3:** New York, Paris, Singapore, Cape Town, Mexico City, Seoul.
- **Online leaderboard** for the daily puzzle. This needs a small server, so it's a later project.
- **Two-player mode on one screen:** each player gets half the map, and the first to overflow loses.
- **Custom car colors** earned by finishing cities.
- **Map maker extras:** place landmarks, airports, and train lines, and set your own unlock score.

## Build order once you say go

1. Add the `EDITION` switch and the build step that outputs two files.
2. Gate every Plus-only feature behind the switch. Test that Classic shows none of them.
3. Do the shared fixes in this order:
   1. 20 starting roads.
   2. Light/dark switch.
   3. Upgrade unlock reveals and map-based upgrade lists.
   4. Car animations: driveways, parking, pin pop, demand bubble.
   5. House driveway dragging.
   6. Road preview and the small details.
   7. Classic tutorial.
4. Balance check both editions with the test bot. Classic should feel a little easier, since it has fewer tools.
5. Publish both as separate artifacts, and ship two app packages (or one app with an edition picker; see the questions).

## Open questions for Enoch

1. **Names:** "Little Lanes Classic" and "Little Lanes Plus", or something else?
2. **One app or two?** Two separate installable apps, or one app that asks "Classic or Plus?" on the first screen?
3. **Shared progress?** Should unlocking London in Classic also unlock it in Plus, or keep them fully separate?
4. **Replay and photo mode in Classic:** keep them (they don't change gameplay) or remove them too?
5. **Upgrade reveal timing:** should each upgrade unlock at the same week in every city, or at different weeks per city?
6. **House dragging:** free and unlimited, or only before the house's first car leaves?
7. Which brainstorm ideas do you want added?
