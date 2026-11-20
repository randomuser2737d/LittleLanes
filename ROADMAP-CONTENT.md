# Little Lanes: Content Roadmap (v3.23 baseline, written 2026-11-19)

Effort: **S** = under a day, **M** = a few days, **L** = a week or more. Ideas are numbered 1-N across the whole document.

## 0. What exists today (read from `index.html`)

- **Editions:** Classic (simple) and Plus (everything), separate saves (`littlelanes.classic.v1` / `littlelanes.v1`). Classic hides ferries, metro, airports, trucks, ambulances, weather, floods, drawbridges, trains, apartments, Silver challenges, Gold themes.
- **Cities (18 + Practice town), unlock chain by best score (`after` / `need`):** Seattle -> Amsterdam -> London -> Cairo; Bangkok, Tokyo, Mumbai, Hong Kong (Pack 1); Istanbul, Sydney, San Francisco, Rio de Janeiro (Pack 2); New York, Paris, Singapore (Pack 3); Seoul, Cape Town, Toronto (Pack 4).
- **City quirks already in data:** left-drive (London, Bangkok, Tokyo, Mumbai, Hong Kong, Sydney, Singapore, Cape Town), drawbridges (Amsterdam), trains (Tokyo `rail`), floods (Bangkok, Mumbai), fog (London, San Francisco), sandstorms (Cairo), typhoons (Hong Kong, Sydney), carnival (Rio), snow (Toronto 0.45, Seoul 0.3, New York 0.25), ferries (Seattle, Istanbul, Sydney, New York), airports, tunnels, per-city landmark `marks`, per-city colour theme (`THEMES`).
- **Modifiers (`MODS`, 6):** Rush hour (`rush`), Tight budget (`tight`), No-bridge start (`nobridge`), Rainbow city (`rainbow`), Grid only (`diag`), Busy streets (`busy`). Tiers for generated puzzles: easy `diag/rainbow`, mid `busy/nobridge`, hard `rush/tight`.
- **Challenges:** `CHALLENGES` = 2 fixed city challenges per city (36 total, goals 180-250). Daily/weekly come from `challengeFor(kind, key)`: a hand-made table (`DEC2026`, 31 dailies + 5 weeklies) first, else `genChallenge` (seeded random city, 2 mods by day-of-month difficulty, weekend bump, finale = rush + tight + one more, names from `MONTH_THEMES[month].names`, repeating with "II/III" after 12).
- **Month themes (`MONTH_THEMES`):** Jan Fresh start, Feb Heart of the city, Mar Spring rain, Apr Blossom bridges, May Garden routes, Jun Summer holidays, Jul Heatwave, Aug Beach traffic, Sep Back to the city, Oct Autumn leaves, Nov Fog and lanterns, Dec Winter lights.
- **Hiding:** `challengeLocked` / `challengeEnded` use the **device date** only, so future puzzles are hidden but still present in the shipped JS (fine for a kids' game; a determined kid can read the file). `monthPlan()` renders the calendar with lock icons.
- **Modes:** classic/endless, Expert, World Tour, Sandbox, City challenges, Daily/Weekly, Duels (S survival, W sprint to week 10; codes `DUEL-...`), live duels, co-op parties (2-4), friends/chat, leaderboards (online.js, duel.js, coop.js, chat.js, account.js; Supabase).
- **Map editor:** players paint Land/Water/Hills + start point, share map codes (`readMapCode`, `customCities`, `cleanMap`).
- **Board themes (`BOARDS`):** Sunny, Pastel Candy, Snowy Winter, Autumn, Desert Sand, Ocean Blue, Neon Night, Classic Toy, Original (flat). Stage growth sizes 17x11 up to 60x38 over 23 weeks.
- **Observations that shape the plan:** (a) the generator picks a random city, so a month can feel samey; hand-made months are clearly better. (b) Southern-hemisphere cities with seasonal names (e.g. "Frozen harbour") can clash, so put season words only on matching cities. (c) Daily keys use the device's local date, so a daily rolls over at different moments for different players; leaderboards per daily need a tolerance or a UTC key. (d) Only 6 modifiers means 15 pairs; more modifiers (section 1) widen the puzzle space far more than more cities.

---

## 1. Monthly content process

### 1A. Authoring pipeline

1. **Move month data out of `index.html` into `months/YYYY-MM.json`** (S). Same shape as DEC2026 plus optional fields; a tiny build step inlines or lazy-loads it. Keeps `index.html` from growing by 6 KB a month.
2. **JSON format v2** (S): `{month:"2027-01", theme:"Fresh start", daily:{"01":{name,city,mods,seed?,goal?,note?,tag?}}, weekly:{"2027-W01":{...}}, finale:{...}, community:{...}}`. Add `tag` for special days and `note` for the playtest log (not shipped).
3. **Table/CSV export of a month** (S): one row per day (date, name, city, mods, difficulty 1-5, tag). Easy to review at a glance and sort by city to spot repeats.
4. **`tools/draft-month.mjs` script** (M): input theme + month; outputs a draft JSON using a difficulty curve, city rotation (no city twice in 3 days, each city 1-2 times), mod-pair rotation (no identical pair within 5 days), and a name pool. A human then edits.
5. **In-browser month editor ("Puzzle Desk", admin-code only)** (L): calendar grid, dropdowns for city/mods, live difficulty badge, "play this puzzle" button, export JSON. Reuses `challengeFor` so what you preview is what ships.
6. **Rule checker (`tools/lint-month.mjs`)** (S): fails on missing days, unknown city/mod ids, duplicate names, same city 3 days in a row, finale not hardest, season word on a wrong-hemisphere city, name over 28 characters.
7. **Name pool per theme (60+ names each)** (S): the generator's 12 names per month run out fast; keep a bigger pool in the theme file so fallback months never show "Frosty morning II" by day 13.
8. **Fix fallback quality** (S): when no hand-made month exists, `genChallenge` should rotate through cities in a shuffled bag rather than independent random picks, so no city repeats within 4 days.
9. **Goal field per puzzle** (S): optional trip goal and medal thresholds, so a hard day can say "Reach 150" and feel fair; today dailies are score-chasing only.
10. **Seed override per puzzle** (S): already supported (`hand.seed`); document it so a designer can re-roll a bad layout without renaming anything.
11. **UTC day key option** (M): decide once whether dailies roll at local midnight or a shared moment; matters for fair daily leaderboards and for duels on "today's puzzle".

### 1B. Difficulty curve per month

12. **Monthly arc** (S): week 1 easy (1-2 stars), week 2 mid, week 3 mid-hard, week 4 hard, finale hardest; weekends one step easier so families can play together.
13. **Five-point difficulty score** (S): sum of mod weights (diag 1, rainbow 1, busy 2, nobridge 2, rush 3, tight 3) plus city weight (big maps with water 1-2). Used by the lint and the editor.
14. **Rule of one new thing** (S): each day teaches or tests at most one unusual constraint; hard days stack mods but never also use a brand-new map.
15. **Weeklies as bigger versions** (S): a weekly is the "boss" of the week: 3 mods or a special rule, goal visible, medal rewards, and always a city the player has unlocked by then (check the unlock chain).
16. **Unlock-aware picks** (S): only schedule cities in the first 6 days that most players already have (Seattle, Amsterdam, London, Cairo, Bangkok), later days can use later packs. Or let any puzzle be played regardless of unlock (decision needed; see `unlocked(c)`).

### 1C. Playtest checklist (run per puzzle, 2 minutes each, per month)

17. **Checklist doc `PLAYTEST.md`** (S): loads without error; name fits on the calendar card; mods listed match JSON; start has at least one legal first move; 3 plays by a person: casual, careful, reckless; score spread makes sense for medals.
18. **Automated sim pass** (M): `llsimtest` hook already exists; run each puzzle headless with a dumb bot (build nearest road) and check it survives week 5+ and does not overflow instantly. Flags impossible puzzles.
19. **Left-drive and mirror check** (S): glance at roundabouts and junction priority on left-drive cities in the month.
20. **Kid pass** (S): one child tests the week 1 puzzles; note anything confusing (wording of names, unclear goal).
21. **Colour-blind pass** (S): run the month with the `cb` setting on; make sure the rainbow mod days stay readable.
22. **Sign-off table in the JSON** (S): `"checked":{"sim":true,"human":"MC","date":"2026-12-20"}`; lint warns on unchecked days.

### 1D. Special days (neutral and inclusive; no religious or national framing, themes are about seasons, nature, community, transport)

23. **Tag set** (S): `finale`, `weekend`, `community`, `seasonal`, `world-day`, `new-city`, `throwback`.
24. **Calendar-neutral names** (S): use "Lantern night", "Longest night", "Harvest market", "Spring fair", "Midsummer", "Year-end rush"; no named holidays or flags. Keep gift/celebration words generic.
25. **Nature and science days** (S): equinox/solstice puzzles ("Longest day", "Longest night"), Earth Day-style "Green routes" (tight budget plus park hills), International Day of Friendship style "Kind corner". Phrase without the official day names.
26. **Transport-nerd days** (S): "Bridge builders' day" (nobridge), "Ferry day" (Seattle/Istanbul/Sydney/New York with ferries), "Roundabout day" (goal: no crossings).
27. **Throwback day** (S): once a month replay a fan-favourite from an earlier month with a fresh seed.
28. **New-city debut day** (S): the day a new map ships, the daily uses it with gentle mods.
29. **Month finale** (M): last day plus last week get a bespoke puzzle: custom seed, 3 mods, a unique name ("Month finale · Winter lights" today), a finale medal sticker for the month.
30. **Month stickers / badge strip** (M): complete 20 of the month's dailies to earn a themed sticker shown in the profile; Classic gets the sticker only, Plus gets stickers plus car paint.

### 1E. Community puzzle of the month

31. **Community-chosen puzzle (2 per month)** (M): during week 3, players submit a map code from the editor to `community_entries`; moderators shortlist 5; players vote in-app (one vote per account, friends-only voting for under-13s); the winner becomes the 15th daily with credit "by ..." (first name or nickname only, moderated).
32. **Safe credit rules** (S): show only a moderated nickname from a fixed list or a preset emblem; never free text from children on the public calendar.
33. **Fallback if nobody submits** (S): rotate a staff-made "Fan favourite" from the previous month.
34. **Idea-box button** (S): preset choices (city, a mod, a theme) as a vote for next month's theme; no typing.

### 1F. Shipping a month ahead, hidden until its date

35. **Ship at least 4 weeks ahead** (S): month N+1 JSON goes out in the update on the 1st of month N (one small 3.xx patch). The existing lock logic hides future days by device date.
36. **Server-side release** (L): move future months to a Supabase table with `release_at`, fetched only when due (cached for offline, by the service worker). Kids can no longer read future puzzles in the JS; also lets you fix a broken puzzle without an app update. Needs an offline fallback to `genChallenge`.
37. **Cheap obfuscation** (S): store future months as base64 in the JSON and decode at date; not security, just no accidental spoilers in view-source.
38. **Hot-fix path** (M): a tiny `patches.json` fetched at start (`network-first`, cached) that can replace one day's entry; avoids a full release for a bad seed.
39. **Clock-tamper guard for leaderboards** (M): leaderboard submissions check the server date; offline play still works, scores sync later and count only for the correct day.
40. **"Coming soon" teaser** (S): the locked calendar cell for tomorrow shows the theme word only ("Tomorrow: Ice bridge"), not the city or mods.
41. **Catch-up pass** (S): allow replaying the last 3 days as practice (no leaderboard) so a family that missed a day is not locked out; today they just show "Ended".

### 1G. New modifiers to widen the puzzle space (each is small data plus one rule)

42. **Ferry fleet / "Ferry only"** (M): no starting bridges but 3 ferries; pairs with island cities.
43. **Night shift** (S): night rendering on (`SET.night` already exists), reduced view of far tiles.
44. **Fewer lanes / "One-way weekend"** (M): a set of existing roads is one-way (needs rule in pathing; determinism safe if the set comes from the seed).
45. **Slow start / "Sleepy city"** (S): destinations ask 30% slower (inverse of rush) for relaxed puzzles.
46. **Small garden / "No hills"** (S): hills treated as water for tile placement; tests creativity.
47. **Double colour start** (S): begin with two house colours at once.
48. **Park and ride** (M): a limited number of "parking" tiles; connects with the airport/warehouse features.
49. **Roadworks** (M): random tile closes for 10 s each week (reuses `G.closed`).

---

## 2. Calendar: 12 months of themes with example puzzles

Format: **Name** - City - modifiers - twist. All use existing cities/mods (new modifiers from 42-49 are marked **[new]**). Season wording is checked against hemisphere.

### January: Fresh start
50. **Clean slate** - Seattle - tight + diag - the first daily of the year; gentle, small town to start.
51. **Resolution route** - Toronto - busy + rainbow - a goal of 100 trips shown up front ("one goal for the year").
52. **Summer commute** - Sydney - nobridge + busy - southern-hemisphere counterpoint to frost names.
53. **Fresh tracks** - Tokyo - rush + tight - weekly boss, trains cross the city.
54. **Open road finale** - Paris - rush + tight + nobridge - end-of-month finale, five stars.

### February: Heart of the city
55. **Neighbours helping** - Amsterdam - busy + diag - goal framed as "connect every house".
56. **Carpool day** - London - rush + rainbow - left-drive practice.
57. **Warm welcome** - Cairo - busy + nobridge - bridges only over the Nile.
58. **Shared ride duel** - Singapore - rush - the Valentine-free friend duel: pick any friend, same seed.
59. **Heart finale** - Seoul - tight + rush + busy - a Han river boss.

### March: Spring rain
60. **Puddle jumper** - Bangkok - rush + busy - rain floods riverside roads.
61. **Umbrella weather** - Seattle - tight + rainbow - classic Seattle drizzle.
62. **Rainbow after rain** - Rio - rainbow + diag - colourful easy day.
63. **Muddy boots** - Mumbai - tight + nobridge - monsoon preview.
64. **Clearing skies finale** - London - rush + tight + busy - fog lifts in week 4 [needs scripted weather].

### April: Blossom bridges
65. **Petal path** - Tokyo - diag + rainbow - Sakura board theme suggested.
66. **Cherry lane** - Seoul - busy + diag - blossom board.
67. **Bridge week** - Amsterdam - nobridge + tight - weekly: the bridges are the puzzle.
68. **Kite weather** - San Francisco - rush + diag - hills and wind.
69. **Blossom finale** - Hong Kong - rush + tight + nobridge - harbour crossing boss.

### May: Garden routes
70. **Flower market** - Amsterdam - busy + rainbow - tulip theme.
71. **Hedge maze** - Paris - tight + diag - grid-only winding streets.
72. **Picnic traffic** - Toronto - busy + rush - park gates, island ferries [Plus].
73. **Park gates** - Singapore - tight + rainbow - green city board.
74. **Bloom finale** - Cape Town - rush + tight + diag - fynbos theme.

### June: Summer holidays (northern summer; southern cities get "winter" names)
75. **School is out** - Seattle - busy + rush - longer days; lighter early week.
76. **Ice cream run** - Sydney - rainbow + busy - "cool winter" name there ("Winter sun").
77. **Road trip** - New York - nobridge + rush - island hopping.
78. **Midsummer** - Helsinki **(new, idea 104)** - diag + busy - sun never sets (no night).
79. **Holiday finale** - Istanbul - rush + tight + busy - two continents boss.

### July: Heatwave
80. **Shimmering streets** - Cairo - busy + rainbow - sandstorm weather on.
81. **Cool shade** - Cape Town - tight + diag - mild.
82. **Fan season** - Bangkok - rush + diag - hot and humid.
83. **Sunset rush** - Rio - rush + busy - carnival crowds.
84. **Heat finale** - Mumbai - rush + tight + nobridge - no bridge on the peninsula.

### August: Beach traffic
85. **Boardwalk rush** - Sydney - busy + rush - coastal.
86. **Pier parking** - San Francisco - tight + nobridge - fog and bridges.
87. **Tide times** - Amsterdam - drawbridge + busy - boats pass often.
88. **Seagull alley** - Hong Kong - rainbow + diag - easy harbour.
89. **Lifeguard finale** - Rio - rush + tight + busy.

### September: Back to the city
(Ideas continue; see section 3 for the numbered new maps. A new map debuts in the first week of each quarter.)
- **First bell** - London - diag + rainbow; **School run** - Tokyo - rush + busy (school-zone rush at two points); **Bus stop shuffle** - Paris - tight + busy; **Library lane** - Toronto - diag + tight; **Term finale** - New York - rush + tight + busy.

### October: Autumn leaves
- **Leaf pile** - Seattle - tight + rainbow; **Golden avenue** - Paris - diag + busy; **Pumpkin patch** - Toronto - nobridge + busy (neutral produce theme only); **Harvest market** - Istanbul - busy + rush; **Windy way finale** - Seoul - rush + tight + diag. Autumn board recommended.

### November: Fog and lanterns
- **Foggy bridge** - San Francisco - nobridge + rush; **Lantern walk** - Hong Kong - rainbow + diag; **Misty harbour** - London - busy + tight (fog weather); **Glowing windows** - Amsterdam - night shift **[new]**; **Cosy finale** - Singapore - rush + tight + busy.

### December: Winter lights
- Already made (`DEC2026`). Improvements: swap "Summer break" and "Cape breeze" checks (good), keep "Quiet morning" in Singapore; add a "Year in review" screen showing your best 5 puzzles (idea 91).

91. **Year in review screen** (M): December finale summary: puzzles played, best city, favourite mod; shareable card with no personal data.
92. **Per-hemisphere naming flag** (S): in the JSON, `season:"north"|"south"|"any"`; lint checks name words against city.
93. **Theme boards per month** (S): suggest a default board theme per month (Candy in Feb, Snowy in Dec/Jan, Autumn in Oct, Ocean in Aug), applied only when the player has "auto board" on.

---

## 3. New maps

All need terrain via the `decodeT` run-length format (60x38 grid), unlock chain slot (`after` / `need`), a `THEMES` palette, landmarks, `drive`, and a note. Duel/co-op fit: **D** duels, **C** co-op, both = D+C. Existing chain is linear per pack; the new packs below would be Pack 5-8.

### 3A. Real cities

94. **Vancouver (Canada)** (M) - right - Burrard Inlet, Stanley Park, False Creek, mountains north; bridges 3; mix of water and hills; difficulty 3; **D+C**. Hook: Lions Gate bridge, SkyTrain.
95. **Los Angeles (USA)** (M) - right - flat basin, concrete rivers, hills; highways dominate (motorway bonus); difficulty 3; **D**. Hook: a free-flow motorway grid; tests rush.
96. **Chicago (USA)** (M) - right - Lake Michigan edge, Chicago River splitting the loop, drawbridges; difficulty 3; **D+C**. Hook: drawbridges that lift in a cycle, "L" elevated trains.
97. **Mexico City (Mexico)** (M) - right - ancient lake bed, canals, a ring road and mountain rim; difficulty 3; **C**. Hook: giant central plaza roundabout; hills ring.
98. **Buenos Aires (Argentina)** (M) - right - Río de la Plata coast, giant grid, wide diagonal avenues; difficulty 2; **D**. Hook: diagonal avenues cut the grid (a gentle map, good for diag mod).
99. **Lima (Peru)** (M) - right - desert coast cliffs, fog, hills; difficulty 3; **C**. Hook: cliffs act as hills along the shoreline; garúa fog.
100. **Reykjavik (Iceland)** (S) - right - small peninsula, volcanic hills, harbour; difficulty 1-2; beginner-friendly; **D**. Hook: snow and northern lights board; ferry to Viðey.
101. **Lisbon (Portugal)** (M) - right - Tagus estuary, seven hills, 25 de Abril bridge; difficulty 3; **D**. Hook: tram line on hills.
102. **Venice (Italy)** (L) - right/no cars - a lagoon of islands and canals, bridges only; difficulty 4; **C**. Hook: "boat-and-bridge" mode where roads can cross water only on bridges and ferries are free; stress test for pathing.
103. **Berlin (Germany)** (M) - right - Spree river, parks, ring rail; difficulty 2; **D+C**. Hook: ring railway, a long straight avenue.
104. **Moscow (Russia, optional)** (M) - right - ring roads, Moskva river bends; skip if politically sensitive; difficulty 3. Safer replacement: **Helsinki** (S) - coast with islands; difficulty 2.
105. **Dubai (UAE)** (M) - right - Creek, palm-shaped islands, desert; difficulty 3; **D**. Hook: artificial islands connected by one bridge each.
106. **Delhi (India)** (M) - left - Yamuna river on the east, circular roads around a central hub; difficulty 4 (very busy); **C**. Hook: ring roads, roundabout-heavy.
107. **Shanghai (China)** (M) - right - Huangpu river with a bend, Pudong across; difficulty 3; **D+C**. Hook: river tunnels; Pudong towers as `marks`.
108. **Lagos (Nigeria)** (M) - right - lagoon islands connected by long bridges, mainland across; difficulty 4; **C**. Hook: three famous long bridges; flood weather.
109. **Nairobi (Kenya)** (S) - left - inland city with a national park edge (no building zone); difficulty 2; **D**. Hook: a "park" no-build zone along the south, giraffe crossing event.
110. **Marrakesh (Morocco)** (S) - right - walled medina in the middle (tight streets, no new roads inside), ring road outside; difficulty 3; **D**. Hook: the medina is a prebuilt dense district.
111. **Auckland (New Zealand)** (M) - left - isthmus between two harbours, volcanic cone hills; difficulty 3; **D+C**. Hook: two harbours with a narrow land bridge.
112. **Hobart or Wellington** (S) - left - small harbour town, wind; difficulty 2; **D**; beginner map for the southern hemisphere.
113. **Rome (Italy)** (M) - right - Tiber loop, seven hills, central ruins you cannot build over; difficulty 3; **C**. Hook: protected ruins tiles (no-build) like Marrakesh medina.
114. **Vienna or Prague** (S) - right - Danube / Vltava with islands and many bridges; difficulty 2-3; **D**. Hook: bridge-rich maps that reward `nobridge` puzzles.

### 3B. Fictional and fantasy maps

115. **Island archipelago "Pebble Isles"** (M) - right - 8 small islands; difficulty 3; **C**. Hook: ferries are central; connects with idea 42.
116. **Mountain pass "Switchback"** (M) - right - narrow valley with hills on both sides and a winding single route; difficulty 4; **D**. Hook: only a few legal corridors, great for duels because both players see the same choke points.
117. **River delta "Braided Bay"** (M) - left - a river split into five channels; difficulty 4; **C**. Hook: lots of small bridges; flood weather.
118. **Ski resort "Snowpeak"** (M) - right - hill-heavy, snow always on, lift-station landmark; difficulty 3; **D**. Hook: hills everywhere, snow slows traffic, Snowy board.
119. **Crater lake "Moonbowl"** (S) - right - a ring road around a lake, hills outside; difficulty 2; beginner. Hook: round layout teaches roundabouts.
120. **Desert oasis "Palm Wells"** (S) - right - dry land with three green patches; difficulty 2; **D**. Hook: sandstorms from Cairo reused.
121. **Floating market town "Lotus Canals"** (M) - left - a canal grid; difficulty 3; **C**. Hook: boats cross every few seconds (drawbridge reuse).
122. **Space station "Orbit Ring"** (L) - right - a ring and spokes, no hills or water; difficulty 4; **D+C**. Hook: low gravity wobble, "airlock" tiles; a pure-geometry competitive map (a perfect fit for duels because no terrain luck).
123. **Candy land "Sugar Bay"** (S) - right - pastel hills and a chocolate river; difficulty 1; **C**; for the youngest players; pairs with the Candy board.
124. **Dino valley "Fern Flats"** (M) - right - volcano and swamp; difficulty 3; **C**. Hook: dinosaur crossing events pause roads for a few seconds.

### 3C. Community maps

125. **Map-maker codes in the menu** (exists: `readMapCode`); add a **gallery of featured codes** (M): staff-picked, each with a name and preview thumbnail.
126. **Featured map of the week** (M): a staff or community map unlocks as a playable city for 7 days with its own weekly challenge; supports `Weekly` from section 1.
127. **Map validity check** (S): minimum land, one start point, no isolated start; the editor refuses to share a broken map.
128. **Map rating (thumbs only) and report** (M): kids rate with a thumbs-up; reports go to moderation; no free text.
129. **Map-of-the-month contest** (M): ties to idea 31; the winner becomes a permanent "Community Pack" city.
130. **Terrain presets in editor** (S): brush for river, lake, island, mountain ridge; copies from real cities (a stamp of a bay or a bend).

---

## 4. New game modes

Determinism note for every mode: the sim is seeded and runs fixed 0.025 s steps; any new randomness must come from the seeded RNG (`mulberry32`) and any time-based event must use sim time, not wall clock, or live duels and ranked replays will diverge.

131. **Rush Delivery / Time attack** (M) - Rules: 3-minute run, destinations keep coming, score = deliveries. Why fun: short sessions on a phone. Online: leaderboard only. Risks: pacing must be sim-time, not real-time, to be fair across devices.
132. **Zen sandbox, no fail** (S) - Rules: cars never overflow, no game over; relaxing building and watching traffic. Exists partly as Sandbox; add camera screenshots and a "photo mode". Online: none. Risk: none. Nice for the youngest players and for map-maker testing.
133. **Puzzle mode with fixed houses, limited tiles and stars** (L) - Rules: pre-placed houses and destinations, a tile budget, goal "connect all in under N tiles", 1-3 stars; 100 handmade levels in packs of 10 by city. Why fun: no luck, true puzzle, great for kids who dislike pressure; levels fit the daily format. Online: leaderboards of tile counts. Risk: needs a level editor; seeded-sim not needed (static).
134. **Mirror duel** (M) - Rules: both players play the same seed, one board mirrored left-right so neither sees the other's layout identical but the puzzle is the same; compare score. Why fun: stops copying a friend's screen. Online: existing duel codes plus a mirror flag in the rule letter (S/W + M). Risk: pathing symmetry must be exact; test left-drive.
135. **Relay co-op (take turns)** (M) - Rules: 2-4 players, 30 seconds each, only the active player can place roads; pass to next. Why fun: shared planning and tension. Online: needs turn authority and a sync; co-op already exists (`coop.js`). Risk: lag handing off turns; run turn order on the host.
136. **Shared-city co-op with turns (owner asked before)** (L) - Rules: a persistent city shared by 2-4 friends; each takes a daily turn (say 5 moves) and the city lives on over days; a weekly "city report". Why fun: slow, social, kid-safe. Online: a Supabase table of city state with turn locks; server validates moves. Risks: determinism (replay each day's moves with the seed), griefing (friends only, undo by owner), and children's chat (preset emotes only).
137. **Survival marathon** (S) - Rules: Endless with rising difficulty, goal to survive week 40+; tracks longest run by city. Exists as Endless; add a weekly marathon board and a "week 50" badge. Online: leaderboard. Risk: very long runs and save size; autosave.
138. **Storm mode** (M) - Rules: weather events every week (floods, fog, snow, sandstorms combined), one city. Why fun: reuses existing weather systems. Online: seeded weather list identical in duels. Risk: weather uses seeded RNG only.
139. **Night city** (S) - Rules: dark board, headlights visible only, destinations glow; reuses `SET.night` and Neon board. Why fun: mood. Online: works in all modes as a modifier. Risk: readability and colour-blind mode; keep contrast.
140. **Public ranked daily queue** (L) - Rules (from PLANS.md section 3): same seeded daily for everyone, at most 3 ranked runs per day, ranks by best score, server verifies a move log. Phase 1 async only. Why fun: shared goal and leaderboard. Online: `ranked_attempts`, run token, replay validation. Risks: determinism (the entire plan hinges on fixed-step sim and logging moves), cheating (server replay), under-13 safety (no public chat; presets only), parent switch to disable ranked.
141. **Tournament weekend** (L) - Rules: Saturday-Sunday event; players play 3 set puzzles (different cities); the total ranks. Bracket variant: live duels bracket among friends or classroom codes. Online: event table, scoring function. Risks: server clock (use server time), fairness for different time zones.
142. **Story / career "Mayor" campaign** (L) - Rules: 12 chapters across the world map, each a city with a goal, a tiny story (a kid mascot and a mayor), unlocking a district sticker; teaches mods one at a time. Why fun: a reason to play for beginners and a path through the 18+ cities. Online: none (offline friendly). Risk: needs writing and art; keep text short and read-aloud friendly.
143. **Kid-friendly tutorial island** (M) - Rules: a tiny 17x11 island with guided steps (draw a road, bridge, roundabout, ferry), friendly arrows, no fail. Why fun: first run success. Online: none. Risk: existing "tut" store key; extend rather than replace.
144. **Co-op boss weeks** (M) - Rules: party of 2-4 faces a weekly "boss" city with a shared goal (e.g. 600 trips together). Online: reuse `coop.js`. Risk: sync cost with 4 players; cap at 4.
145. **Photo mode and city postcards** (S) - Rules: take a stylised postcard of your city with the board theme; share as an image (no personal data). Why fun: sharing without chat. Online: none (local share). Risk: none.

---

## 5. Suggested order for the next 3 months

Versioning rule: **3.xx small** (data or tweak, shippable in a day), **3.x0 medium** (new mode or map pack), **4.00 big** (large change). Current: **v3.23**.

### Late November to mid-December 2026

146. **v3.24 (S)** - Move month data to `months/*.json`; add lint + draft script (ideas 1-4, 6, 8). No visible change; makes everything after it faster.
147. **v3.25 (S)** - January 2027 hand-made month (ideas 50-54 plus the remaining 26 days) hidden by date; add "Tomorrow: theme" teaser (40). Ship by 1 Dec so January is 4 weeks ahead.
148. **v3.26 (S)** - Catch-up pass (41) and playtest checklist doc (17); UTC day key decision (11).
149. **v3.30 (M)** - First new maps: **Vancouver, Reykjavik, Buenos Aires** (94, 100, 98) as Pack 5, easiest to author; plus **Crater lake "Moonbowl"** (119) as a beginner map. Each with a THEME and 2 city challenges.

### Mid-December to mid-January

150. **v3.31 (S)** - December year-in-review (91) and Dec 31 finale polish; February 2027 month shipped.
151. **v3.32 (S)** - New modifier **Sleepy city** (45) and **Night shift** (43); lint updates; two new puzzle days use them.
152. **v3.40 (M)** - **Kid-friendly tutorial island** (143) and **Puzzle mode** pilot: 10 levels in Seattle (133). Smallest version with a level data JSON.
153. **v3.41 (S)** - Zen/photo mode (132, 145).

### Mid-January to mid-February

154. **v3.42 (S)** - March 2027 month; community idea-box (34).
155. **v3.50 (M)** - **Mirror duel** (134) and **Rush delivery** (131): both use existing duel/leaderboard plumbing; run determinism tests first (`test-duel.mjs`).
156. **v3.51 (S)** - Featured community map of the week (126) with validity check (127); map gallery (125).
157. **v3.60 (M)** - Pack 6: **Chicago, Auckland, Berlin** (96, 111, 103); one fictional **Pebble Isles** (115) with the ferry modifier (42).
158. **4.00 (L, target Q2 2027)** - Public ranked daily (140) phase 1 + Story campaign start (142); needs server replay validation; do not rush.

### Principles for every release

159. **One content drop a week, one system change a month**, so the daily puzzles never depend on a risky feature.
160. **Never change the sim and a mode in the same release**; run `test-duel.mjs` and `test-december.mjs` before shipping.
161. **Every new map ships with**: terrain, THEME, 2 CHALLENGES, `note`, a landmark, a duel-fit tag, and a drive side checked by a human.
162. **Classic stays simple**: new modifiers and weather are Plus-only; maps and puzzle mode are in both.
