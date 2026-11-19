# Little Lanes: Planning Document

Free road-building puzzle PWA. Single-file vanilla JS + canvas, GitHub Pages, Supabase backend. Hobby project by Mark and Enoch (and Enoch's friends).

How to use: every idea has a continuous number. Reply "do 3, 7, 12" and we start there. Effort: **S** = under a day, **M** = a few days, **L** = a week or more. Each idea has a short risk note where one matters.

Guiding rules (apply to everything below):
- **Kid-safe by construction**: no free text ever, nickname-only accounts, pre-written content only, friends only by accepted friend code, strangers get preset emotes at most.
- **Cheap**: Supabase free tier (500 MB DB, 50k MAU, 2 GB egress, 200 concurrent realtime connections, 2M realtime messages per month). Design everything to degrade gracefully past those limits.
- **Its own game**: Little Lanes must never be mistaken for another game. See the "Identity guardrails" box in section 1.
- **Not legal or financial advice**: sections 4 and 5 are planning notes. Get a lawyer to review before collecting money or marketing to kids.

---

## 1. Art overhaul

### Identity guardrails (read first)
The reference game we must not resemble is known for: pastel flat top-down maps, round pin-shaped buildings in matching colors, a week dial, and Sunday upgrade cards. Little Lanes should break from every one of those:
- **No** pastel flat fills; **no** pin/teardrop house markers; **no** week dial; **no** end-of-week "pick 1 of 2 cards" screen.
- Use a different camera feel, different building silhouettes, different palette logic, different progress metaphor (see ideas below).

### Art direction options

**Option A. "Toy Diorama" (tilted isometric, chunky miniatures).** Maps look like a hand-built tabletop model: raised baseplate with a visible edge, tiny painted wooden/plastic buildings, soft contact shadows.
- Pros: instantly distinct, charming, great for screenshots, depth is cheap with 2:1 isometric projection in Canvas 2D.
- Cons: isometric hit-testing and draw order are more work; touch precision needs care.

**Option B. "Blueprint Noir" (dark navy map, glowing neon lanes).** Cities as night-time glowing circuit maps. Roads are light, cars are comet dots.
- Pros: very cheap to render (lines + glow), looks cool, great battery and perf, distinct from pastel.
- Cons: colder mood, less friendly for young kids, harder to make buildings charming, colorblind contrast needs care.

**Option C. "Paper Cut-out / Sticker Atlas" (layered paper, thick outlines, visible paper grain).** Everything is a die-cut paper shape with a drop shadow, on a craft-paper table.
- Pros: warm, kid-friendly, very unique, flat shapes are cheap to draw, easy to theme per city.
- Cons: can drift toward "flat pastel" if palettes are not strongly different; thick outlines hurt tiny-detail legibility.

**Recommendation: Option A (Toy Diorama), borrowing the paper-grain texture from C for the table surround.** It is the most clearly its own thing (tilted 3D-ish miniature, outlined chunky toys, wood/felt baseplate), and it makes the 18 real cities feel like collectible dioramas. Palette: warm saturated mid-tones with dark outlines, never pastel.

### Core look
1. **Diorama baseplate** (M). Each city sits on a thick tile slab with visible side edges, a wooden or felt table behind it, and a city-name plaque on the front edge. Why: instantly "a collectible", and unlike a flat map. Risk: needs a consistent draw-order system.
2. **2:1 isometric projection with a toggle to flat top-down** (L). Render in iso by default, keep a "flat view" accessibility option. Why: depth and distinctiveness; flat mode keeps precision for kids who struggle with iso. Risk: input mapping and every existing draw routine touched; do it behind a single `project(x,y)` function first.
3. **Strong dark outlines + soft inner shading on every object** (S). One 2 px outline, one lighter top-face, one darker side-face. Why: reads as "toy", never pastel-flat, very cheap.
4. **Own color system: "saturated toys, muted ground"** (S). Ground in desaturated earthy tones; buildings, cars, and UI in punchy saturated colors with dark outlines. Why: inverse of pastel-flat. Define 8 team colors as design tokens.
5. **Paper/felt grain texture on the table and baseplate** (S). Pre-render one 256 px noise tile, draw it with low alpha. Why: tactile, hides banding.
6. **Per-city "souvenir" identity** (M). Each city gets a signature baseplate trim color and a small landmark toy (an unlockable, drawn once into a sprite). Why: collection and shareable uniqueness.

### Buildings
7. **Chunky modular buildings from 3-4 parts** (M). Base, body, roof, and a "feature" (awning, chimney, sign). Combine procedurally for variety from ~40 sprites. Why: variety without huge assets. Risk: sprite sheet size; keep one atlas under 1 MB.
8. **Building "demand" shown as a bouncing sign board, not a pin** (S). A little flag-board on a pole with the car-color chip, bobbing when waiting. Why: communicates demand differently from pin markers and is readable.
9. **Rooftop details per building type** (S). Homes get tiny gardens and chimneys, shops get striped awnings, factories get steam puffs, offices get helipads. Why: charm, free storytelling.
10. **Buildings "pop up" when spawned** (S). Spring-scale from baseplate with dust puff and a small "pop" sound. Why: juice with no cost.
11. **Landmark buildings per city** (M). Hand-drawn toy versions of famous landmarks as decorations that boost nothing but look great. Why: marketing screenshots. Risk: avoid trademarked/protected designs; keep generic stylized.

### Cars
12. **Chunky toy cars with distinct silhouettes per color/role** (M). Hatchback, van, truck, bus, taxi, each drawn from 8 iso directions pre-rendered to a sprite sheet. Why: readable and distinctive. Risk: 8 directions x types x colors; use palette-swap by tinting a grayscale base.
13. **Squash and stretch on acceleration and turns** (S). Small body lean at corners, bounce on stops. Why: life.
14. **Headlights, brake lights, tiny exhaust puffs** (S). Dusk and night make this pop. Why: lighting payoff.
15. **Traffic-jam visual language** (S). Cars honk with small "!" bubbles and a vibrating shake; jammed roads get a red pulsing outline. Why: clear feedback for puzzle failure states.
16. **Pedestrian and cyclist ambience** (M). A few tiny walkers/bikes on sidewalks, non-interactive. Why: living-city feel. Risk: draw cost; cap at ~30 and skip on low-end devices.

### Roads and intersections
17. **Thick road ribbons with curb edges, lane dashes, and a subtle 3D lip** (M). Why: roads are the hero; they should look built, not drawn.
18. **Distinct intersection kinds: roundabouts, signal lights, stop signs, one-way arrows** (M). Placed tools get unique little props. Why: strategy readability and a different identity.
19. **"Construction" animation when placing road** (S). Tiny cone markers and a brief asphalt-roll sweep, then settle. Why: placing is the core action; make it feel great.
20. **Bridges and tunnels with real geometry** (M). Bridges rise with shadow beneath; tunnels have portal arches. Why: ferries/metro in Plus look cohesive.
21. **Metro and ferry as their own visual layer** (M). Metro lines drawn as translucent colored tubes under the surface when toggled; ferries as cute boats with wake lines. Why: makes Plus visually distinct from Classic.

### Terrain and water
22. **Layered water: animated gradient + foam edge + moving caustic strips** (M). Cheap with two scrolling offscreen tiles. Why: water is the first thing people notice.
23. **Terrain with height steps (hills as stacked slabs)** (M). Roads climb with ramps. Why: diorama depth and a natural puzzle constraint.
24. **Biome decoration pass** (S). Trees, rocks, reeds, sand dunes, snow caps by city climate. Why: each city has a feel (Reykjavik vs Cairo). Prebake into the terrain layer.
25. **Prebaked static layer** (S). Render terrain, water-edges, and decorations once to an offscreen canvas; redraw only dynamic stuff each frame. Why: biggest phone perf win.

### Lighting and day-night
26. **Day-night cycle tied to game time with color grading** (M). Overlay a multiply/screen gradient; windows light up at dusk; street lamps glow via additive "lighter" blend circles. Why: dramatic improvement for cheap. Risk: keep contrast accessible; offer "always day".
27. **Fake drop shadows with a single directional offset** (S). Elongated, blurred ellipse sprites (no real blur filter). Why: depth.
28. **Per-city golden hour presets** (S). Tokyo neon dusk, Reykjavik long-twilight, etc. Why: variety and shareable moods.

### Weather visuals (Plus)
29. **Rain: streak particles + puddle sheen + wet-road darkening** (M). Why: weather should change how the map looks, not just rules.
30. **Snow: soft particles, roads whiten gradually, plows as cute props** (M).
31. **Fog and wind: fog as a slow-moving alpha gradient band; wind as swaying trees** (S).
32. **Weather as a "weather rail" in the HUD with icon + timer** (S). Why: clarity.

### Particles and juice
33. **A tiny particle system with pooled objects** (S). Fixed-size arrays, no allocation per frame. Used for dust, confetti, sparkles, coins. Why: juice backbone.
34. **Screen shake and hit-stop for events (jam, bridge placed, level up)** (S). Keep intensity adjustable and off by default for "reduce motion".
35. **Score pop numbers that float up and fade** (S).
36. **Celebration: confetti cannon at personal best, fireworks for monthly top** (S).

### UI, typography, iconography
37. **Own typeface pairing** (S). One chunky rounded display face for titles and numbers, one clean sans for body. Use an OFL-licensed font self-hosted (e.g., a bold rounded display face). Why: typography is identity. Risk: font file size; subset it.
38. **Tool tray styled as a toy workbench** (M). Roads, bridges, signals look like wooden/plastic pieces in a tray, not flat buttons.
39. **Hand-made icon set in one stroke style** (M). 40-60 icons, SVG sprites, 3 px stroke, rounded caps. Why: consistency and avoids stock-icon look.
40. **Progress metaphor: "Build Level" ribbon instead of week dial** (S). A growing city skyline silhouette fills along the top as days/score progress. Why: clearly not a dial.
41. **Between-rounds reward: "Blueprint Drawer" (pick a stamp or sticker for your city postcard) instead of pick-1-of-2 upgrade cards** (M). Cosmetic and run-flavor modifiers appear as stamps on a postcard. Why: our own progression ritual. Risk: ensure it does not slow pacing; keep to one tap.
42. **Screen transitions: "slide the baseplate" and zoom-to-city** (S).

### Animations
43. **Easing library with 6 curves, used everywhere** (S). Why: consistency.
44. **Idle map breathing: gentle sway on trees, flags, water** (S). Why: alive menus.
45. **City-select as a rotating shelf of mini dioramas** (M). Why: the 18 cities become collectibles with progress stars.

### Sound and music
46. **Procedural WebAudio SFX (no big audio files)** (M). Pop, thunk, honk variants, coin, whoosh synthesized from oscillators/noise. Why: tiny download and pitch variation avoids repetition.
47. **Adaptive music: 3 looping stems that layer with traffic intensity** (L). Original tracks only (self-made or CC0 with licenses logged). Why: huge feel upgrade. Risk: licensing, file size; use short loops in OGG/MP3 under 1.5 MB total.
48. **City-flavored instrument swaps** (M). Same melody with different timbres per region.
49. **Sound settings: master, SFX, music, "calm mode"** (S).

### Accessibility
50. **Colorblind-safe patterns on every car and building color** (M). Each color gets a unique shape mark (stripe, dots, zigzag, checker, star, ring) plus the hue. Toggle in settings and default for tested palettes. Why: gameplay depends on color matching. Risk: must test with simulation filters.
51. **High-contrast and large-UI modes; reduce-motion switch** (S).
52. **Haptics on mobile (navigator.vibrate) with a toggle** (S).

### Canvas-2D techniques and phone performance
53. **Layer canvases**: static terrain, dynamic entities, FX, UI (S). Only redraw dirty layers.
54. **Sprite atlas + `drawImage` with integer coordinates; avoid `shadowBlur` and `filter`** (S). Both are slow on phones; prebake glows into sprites.
55. **Adaptive quality ladder**: measure frame time for 2 seconds, then drop particles, ambient pedestrians, then shadows automatically (M). Why: protects older phones.
56. **Cap devicePixelRatio at 2 and cap FPS at 60 with a "battery saver 30 fps" option** (S).
57. **OffscreenCanvas + worker for prebaking the terrain** (M). Optional; falls back to main thread.
58. **Keep the sim step fixed at 0.025 s, decoupled from render interpolation** (S). Renders interpolate for smoothness; this also protects deterministic replay (needed in section 3).

---

## 2. Friends and messaging (more fun, still secure)

### Ground rules for every feature below
- Content is always an ID from a fixed server-side catalog. The client sends `{type, item_id, params}`; Supabase RLS and an Edge Function validate against the catalog. No strings from clients are ever stored or shown.
- Only accepted friends can interact. Block is one tap, silent, and immediate. Report sends a preset reason code and the last N structured events to a review queue (for Mark).
- Per-user rate limits at the database level (e.g., 30 messages/min, 200/day) via a counter table or trigger.
- Parent controls: an optional "parent view" code lets a parent see the friend list, who messaged who (structured items only), and toggle features per child account.
- Retention: delete messages after 30 days with a scheduled job to keep the DB small and privacy tight.

### Message and social types
59. **Sticker packs earned by play** (M). Packs unlock by milestones (finish all Europe cities, 7-day streak). Stickers are catalog IDs. Safety: pure catalog, no uploads. Risk: art workload; start with 3 packs of 8.
60. **Reactions on messages and shares (6 preset emojis)** (S). Safety: fixed set, rate limited.
61. **Polls from a template list** ("Which city should we play?", "Classic or Plus?", "Duel or co-op?") (M). Options are catalog IDs; results live in the chat. Safety: no custom option text. Fun: decision tool for groups.
62. **Challenge cards: "beat my 412 in Tokyo"** (M). Structured card {city, edition, seed, score}; tap launches the game on that exact seed. Safety: numeric data only; server verifies score exists. Why: the best viral loop inside friends.
63. **Shared replays** (L). Share the moves log (compact) so a friend watches a replay of your city being built, using deterministic sim. Safety: replay is just inputs; validated and size-capped (e.g., 50 KB). Why: highly shareable and cheap since it is just data.
64. **Screenshot cards of your city** (M). Client renders a postcard PNG (city, score, your icon/motto) and shares it as a file or uploads to storage. Safety: do not allow arbitrary image upload; generate the image from a canned template in-game and store only metadata, or have the recipient regenerate from the replay. Risk: storage costs if uploaded; prefer regenerate-on-view.
65. **Gifting cosmetic items between friends** (M). Gift a sticker, car skin, or baseplate trim you already own, limit 1 per friend per day. Safety: no real-money gifts; no trading for value; one-way gifts only (prevents scams and pressure). Risk: pressure to "owe" gifts; keep gift counts hidden and cap them.
66. **Friend streaks** (S). Both players complete a daily challenge on the same day to extend the streak. Safety: no punishing language; streak "freezes" earned; do not message "you will lose your streak" at kids. Risk: dark-pattern concern; keep it gentle and optional.
67. **Friend leaderboards per city and per daily** (S). Only friends listed; ranked by score. Why: low-pressure competition.
68. **Activity feed** (M). Structured events: "Ava beat 500 in Paris", "Leo unlocked Stockholm". Safety: only friends see them; opt-out per kind in settings; no free text.
69. **In-chat buttons: invite to party, invite to duel** (S). Invite card with Accept/Decline; expires in 5 minutes. Safety: server verifies both are friends and that the sender has no pending flood of invites (max 3 pending).
70. **Presence "playing Tokyo wk 12"** (S). Presence payload is {city, mode, progress}, shown only to accepted friends, with a "show as invisible" option. Safety: no location, only game state.
71. **Spectate a friend live** (L). Friend streams state snapshots (e.g., 2/s of the road graph diff) via Supabase Realtime; the viewer renders the same sim. Safety: only accepted friends and only if the host allows. Risk: realtime message budget; cap spectators to 2 per player and 5 minutes sessions; fall back to replay.
72. **Best-friend badges** (S). Mutual opt-in; unlocks a shared pair badge and a tiny joint stat (games played together). Safety: mutual-only, limited to 3 best friends; no ranking of friends visible to others.
73. **Mood and status picker from a fixed list** (S). "Building!", "Taking a break", "Want a duel?". Safety: catalog only.
74. **Team crests for groups** (M). A group picks an emblem and color from presets, displayed on group chat and co-op score screens.
75. **Co-op "rescue ping"** (S). A friend taps "Need help!" preset in co-op; teammates see a flashing marker on the map position (a map cell reference). Safety: numeric only.
76. **Map pointer/emote marks in co-op** (S). Ping a spot with one of 6 symbols (build here, avoid, wait). Why: communication without text.
77. **Seasonal event stickers and limited packs** (S). Time-limited and always earnable via play, never purchasable in a way that creates FOMO for kids.
78. **"Surprise gift" from the game on friend milestones** (S). Instead of birthdays (no personal data), celebrate "friendiversary" (days since friending) with a free sticker. Why: birthday-free fun; no DOB collected.
79. **Friend code safety: codes rotate on demand and have a 24-hour expiry option** (S). A leaked code cannot be used forever; request needs acceptance. Safety: also limit incoming requests (max 10 per day).
80. **Mutual-friend confirmation for group invites** (S). You can only invite friends you are friends with; invitees must accept; group size max 8.
81. **Quiet hours and parent-set play windows** (M). Messages queue silently during set hours; optional parent PIN. Safety and trust win.
82. **Report/block UX** (S). One-tap block with confirmation, preset report reasons ("Mean emote spam", "Cheating", "Uncomfortable"), a calm "Thanks, we will look" screen. Reports queue goes to a simple admin page only Mark can read (RLS by admin role).
83. **Moderation dashboard** (M). Admin-only page listing reports with context and quick actions (mute 24 h, remove from leaderboards, ban).
84. **Abuse heuristics** (M). Auto-mute accounts that send the same preset 10x in a minute, get blocked by 3 different users, or have 5 reports; Mark reviews.

---

## 3. Public ranked queue for the daily challenge

### Design summary
Everyone plays the **same seeded daily map** (same seed for everyone), up to **3 ranked plays per day**. Because the sim is deterministic (seeded spawns, fixed 0.025 s steps), the client uploads a **moves log** and the server re-simulates to verify the score. Ranking is rating-based, so ties and skill gaps are handled fairly.

### Matchmaking and flow
85. **Two ranked formats** (decide early) (S). (a) **Async ranked daily**: everyone plays the same seed any time, compared on the leaderboard (the cheapest, the one to build first). (b) **Live ranked duels** from a queue (build later). Why: async needs no realtime and is nearly free.
86. **Async "ghost matches" for rating** (M). After your run, the server pairs your score against 5 nearby-rated players' runs for the same seed and updates rating as if you played each (a "virtual round robin"). Why: no waiting, no disconnect issues, no realtime cost.
87. **Live queue table `ranked_queue`** (M). Row: user, tier, queued_at, mode. A scheduled Edge Function (every 5 s; or a trigger on insert) pairs the two closest ratings within a widening window (±100, then ±200 after 15 s, ±400 after 30 s). Fallback: after 45 s, offer an async ghost match. Why: deterministic, simple, and easy to inspect.
88. **Realtime presence alternative** (M). Use Supabase Realtime presence on a `queue` channel and let clients self-match using a deterministic rule (lowest user_id proposes). Risk: client-trust issues and race conditions; prefer the table approach.
89. **Server-side play limit: 3 ranked plays/day** (S). A `ranked_attempts(user_id, day_utc, count)` row; a Postgres function `start_ranked_run()` atomically increments and returns a signed run token; the token is required to submit. Never enforced in the client. Reset at a fixed time announced in the UI (e.g., midnight Pacific) with a countdown.
90. **Run token with seed and expiry** (S). Token = {user, seed, started_at, nonce}; submit must arrive within a max duration. Prevents pre-simulating and submitting only the best of many tries.
91. **Best-of-3 scoring rule** (S). Daily rating uses the best of your 3 runs; the others are practice. Why: lower stress for kids.

### Rating system
92. **Simplified Glicko-2 or plain Elo with provisional boost** (M). Start at 1000; K=48 for the first 10 games, then 24. Glicko RD can be approximated by letting K decay with games played. Why: faster placement without full Glicko complexity. Implement in a Postgres function (single source of truth).
93. **Tiers: Bronze, Silver, Gold, Platinum, Diamond (each 3 divisions)** (S). Thresholds at e.g. 0/900/1100/1300/1500; tier shown with a diorama-style badge (consistent with art direction). Promotion without demotion shields to avoid sadness; soft floors per tier.
94. **Monthly seasons** (M). Season ends on the 1st; ratings soft-reset (new = 1000 + (old-1000)*0.5). Rewards by peak tier. A `seasons` table and snapshot job (pg_cron).
95. **Calibration: 5 placement runs shown as "Getting to know you"** (S). No scary rating number until done.
96. **Rating hidden from strangers; show tier only** (S). Reduces comparing and toxicity.

### Anti-cheat
97. **Server-side replay verification** (L). A Supabase Edge Function (Deno) imports the same sim module and re-runs the moves log with the seed; compare final score and hash of final state. Reject on mismatch. Important: the sim must be a pure module shared by client and server (no DOM, no Math.random, no Date). Risk: Edge Function CPU time limit (about 2 s CPU on free tier); a 10-minute game at 0.025 s steps is 24,000 steps, which should be OK if the sim is lean, but measure. Fallback: verify asynchronously in a queued job and mark scores "pending" until verified.
98. **Cheap pre-checks before full replay** (S). Reject if: moves log too large, timestamps not monotonic, actions faster than humanly possible (e.g., more than 15 per second), score above a theoretical cap for that seed, run duration outside bounds.
99. **Sampled verification** (S). Verify 100% of top-100 scores and a random 10% of the rest, to save compute. Anyone who tops the board must be fully verified before display.
100. **State hash checkpoints** (M). The client includes a hash every 600 steps; the server compares so a mismatch pinpoints tampering or a sim bug.
101. **Version-lock the sim** (S). Each run carries `sim_version`; the server only accepts supported versions, and daily seeds list their version. Why: a deterministic replay breaks across versions. Keep old sim builds for verification for 2 days.
102. **Float determinism care** (M). Fixed-point or consistent float ops; avoid `Math.sin` differences across engines in the sim (precompute lookup tables). Why: Chrome vs Safari float differences can break verification. Test in all engines.
103. **Report button on leaderboard entries** (S). Preset reason: "Looks impossible". Auto-triggers re-verification.
104. **Shadow ban for confirmed cheaters** (S). They see themselves on the board; others do not. Reduces retaliation and cat-and-mouse.

### Disconnects and fairness
105. **Async ghost format has no disconnect problem** (S). The run is local; submit when online; offline runs queue until a connection returns, as long as the token has not expired (grace of a few hours).
106. **Live duels: disconnect grace of 15 s, then forfeit with reduced rating loss** (M). If a disconnect is the opponent's, the player gets a win but with a small gain; repeated disconnects (3 in a day) pause the queue for 10 minutes. Avoid penalizing spotty phone connections too hard.
107. **Reconnect via run token** (M). A reconnecting client resumes the same duel with the stored moves log.

### Leaderboards and rewards
108. **Daily, weekly, and season leaderboards** (S). Top 100 + "around you" (10 above/below) + friends-only tab. Use a materialized view refreshed every minute or an index on (seed, score). Paginate to keep egress small.
109. **Cosmetic-only rewards** (S). Season banners, car trails, baseplate trims, and badges by tier. Never gameplay advantages. Rewards are also available to free players; Plus may add *extra* cosmetic variety only if clearly fair (see section 5).
110. **"Personal best" and "most improved" boards** (S). Gives non-top players something to win.
111. **Hall of Fame page of past season winners (nickname + icon)** (S).

### Anonymity and safety for kids
112. **Nickname-only, picked from a generator** (S). Two-word combos from a curated list (e.g., "Swift Otter 482") with a profanity-safe list; no free-typed names. Why: no accidental personal info.
113. **Strangers only see: nickname, icon, color, tier** (S). Motto only from a fixed list; no profile browsing beyond that.
114. **Strangers can only exchange preset emotes (6 max) in duels, with a "mute emotes" toggle** (S). Default for under-13 accounts: emotes off with strangers. Ranked daily is async, so there is no contact at all by default.
115. **Cannot friend strangers from the leaderboard without an explicit friend code exchanged outside** (S). Prevents grooming-style approaches; no "add friend" button on public boards.
116. **Parent switch to disable ranked entirely** (S).

### Cost estimates (free tier, rough)
117. **Storage per run**: moves log about 2-10 KB compressed. 1,000 daily players x 3 runs x 10 KB = 30 MB/day; keep only top runs and verified-score hash, delete other logs after 3 days (S). Stays comfortably under 500 MB.
118. **Edge Function invocations**: free tier allows 500k/month. 1,000 players x 3 runs x 30 days = 90k submits, fine. (S)
119. **Realtime**: async format uses almost none; live duels use ~10 msgs/s per match; budget about 2M messages/month means roughly 55 hours of continuous duel traffic. Throttle snapshots, send inputs (not state), and keep duels short. (S)
120. **Egress**: leaderboard fetches cached per minute on the client; top-100 about 10 KB. Fine. (S)
121. **Free-tier pausing risk**: Supabase pauses inactive free projects after a week of inactivity; keep a tiny scheduled ping (the daily seed job already does this) (S).

### Phased build order for ranked
- **Phase 0**: Extract the sim into a pure shared module and prove replay determinism across Chrome, Safari, Firefox (ideas 101-102).
- **Phase 1**: Server-limited async ranked daily with 3 runs and a leaderboard, pre-checks only (89-91, 98, 108).
- **Phase 2**: Edge Function replay verification and report button (97, 99, 103).
- **Phase 3**: Rating, tiers, placement (92-96) and cosmetic rewards (109).
- **Phase 4**: Monthly seasons and Hall of Fame (94, 111).
- **Phase 5**: Live queue for ranked duels with emotes only (87, 106-107, 114).

---

## 4. Marketing (low or no budget)

Principles: never name or compare to other games in any marketing copy or tags; describe Little Lanes on its own terms ("build roads, keep the city moving"). Never use other studios' art, names, or screenshots.

### Where to list it
122. **itch.io page** (S). Free, browser-playable embed, devlog, tags, screenshots, and a good "kid-friendly, no ads, no chat" blurb. Why: the friendliest place for hobby games.
123. **CrazyGames and Poki submissions** (M). Both accept HTML5 games, have their own review and SDK integration, and typically require their ad SDK and sometimes exclusivity. Risk: ad networks and kids; read their child-safety and data policies, and note that they may require removing your own links/accounts. Treat as a later experiment.
124. **Game portals comparison: Newgrounds, GameJolt** (S). Free, creative-friendly, with forums. Check their age rules.
125. **Reddit** (S). Post only in communities that explicitly allow self-promotion or have "Showoff Saturday"-type threads; read each rule; one post per community; be honest that you made it. Never spam or post from multiple accounts.
126. **Product Hunt / Hacker News "Show" posts** (S). Not targeted to kids but good for visibility and feedback. Risk: unpredictable traffic spike; make sure Supabase limits are comfortable.

### Content
127. **Satisfying traffic timelapse clips for Shorts, Reels, TikTok** (M). Record 15-30 s runs sped up with a calm music track (your own). Add a "Daily challenge #N" caption. Use a screen recorder, add the in-game share card. Why: this genre of visual is inherently watchable. Risk: TikTok and YouTube have kid-audience rules ("made for kids" labeling affects comments and features). Mark, as an adult, should own and run the accounts, not Enoch.
128. **"Watch the replay" links** (M). Because replays are deterministic data, each viral clip can link to a "watch and then try it" page. (Depends on idea 63.)
129. **Devlog** (S). A short post every 2 weeks on itch.io or a simple page: "how we built the diorama look", "how replay verification works". Why: SEO plus the "dad and son made this" story.
130. **Press kit page `/press`** (S). Logo, 6 screenshots, GIFs, one-paragraph description, fact sheet, contact email (a dedicated one, not personal), and a short "made by a dad and son in Seattle" bio. Only share what the family is comfortable with; keep Enoch's identity details minimal (first name or nickname only, no photos of him).

### Growth loops
131. **Wordle-style daily share card** (M). After the daily challenge: a small emoji/grid or tiny city-silhouette image with score and tier, copied as text or image with one tap, no names. Why: strongest free growth loop. Safety: contains no personal info; link includes only the seed.
132. **School/friend referral codes** (M). Your friend code doubles as a referral code; when a new player joins with it, both get a cosmetic. Rewards only cosmetic and capped (5 referrals/month). Safety: no real-world rewards and no collection of contact info.
133. **Classroom-friendly mode and teacher page** (M). A short page for teachers: free, no ads, no chat, nickname-only, how to run a class daily challenge with a class code. Why: schools are a natural, trust-based channel. Risk: school privacy policies; keep the data minimal and publish the privacy policy.
134. **Discord (use carefully)** (S). Discord requires users to be 13+. A community server would exclude Enoch's younger friends and needs moderation. Option: skip Discord, or run a small server for parents/teens 13+ only, with strict moderation. Prefer a moderated email newsletter or itch.io devlog instead.

### Distribution and discoverability
135. **PWA to Google Play via TWA (Bubblewrap/PWABuilder)** (M). Play requires a one-time developer fee (about $25), a privacy policy, a Data Safety form, and a Families Policy declaration if the app targets children (extra requirements). Apple's App Store via a wrapper costs $99/year and has stricter review (and a Kids category with strict rules). Recommendation: do the Play listing first; skip Apple until the game is mature. Risk: Google Play's Families Policy compliance (ads, data, accounts).
136. **SEO landing page** (S). A real static page with a title, description, a short "how to play", FAQ, screenshots with alt text, structured data (`VideoGame`/`SoftwareApplication`), and an OG image so shared links look good. Target phrases like "free road building puzzle game", "free browser puzzle game no download".
137. **Open Graph / Twitter card per daily challenge** (S). Share links preview the day's seed city. Why: free polish for every share.

### COPPA and kids-audience notes (planning only; not legal advice)
- COPPA (US) applies to online services directed to children under 13, or that knowingly collect personal info from them. Nickname-only accounts, no free text, and minimal data help a lot, but an account system with email makes it complicated. Plan for: no email from children; parent email only for purchases (section 5); a clear privacy policy; a data-deletion path; no behavioral ads; no third-party trackers. Have a lawyer review before wide marketing to kids. Washington State's laws and the FTC rules also apply.
138. **Decide the audience on purpose** (S). Either "general audience, mixed" or "directed to children". The second triggers stricter duties (including limits on analytics/ads). Choose and write it into the privacy policy.
139. **Privacy-friendly analytics only** (S). Use a cookieless, self-hosted or privacy-focused counter (no cross-site tracking, no ad IDs). Collect aggregate counts only.
140. **Marketing channels must not target under-13s directly with data collection** (S). Do not run targeted ads to kids; keep social accounts adult-run.

---

## 5. Monetizing Plus securely (with free trials)

Honest note: this is a planning outline, not legal or financial advice. Before charging real money, get a lawyer and an accountant to review the terms, privacy policy, COPPA approach, and sales-tax obligations. Treat payments as the riskiest part of the project.

### Pricing and model options
141. **Option 1: One-time unlock of Plus** (S to design). Simple, kid/parent-friendly, no recurring billing, no renewal complaints. Idea: $4.99-$7.99 one-time. Pros: easy to explain, low support, fewer legal issues. Cons: no recurring revenue; needs new content to justify later updates (new cities as free updates is fine).
142. **Option 2: Subscription (monthly/annual)** (M). Pros: steady revenue for hosting and art. Cons: parents dislike subscriptions for kids' games, more support, more rules (auto-renew disclosures, easy cancellation). Idea: $1.99/month or $14.99/year.
143. **Option 3: Cosmetic-only purchases** (M). Car skins, baseplates, sticker packs. Pros: keeps gameplay fair. Cons: more art needed; risk of kid-targeted spending pressure. Keep prices fixed, no loot boxes, no randomized paid rewards, no limited-time pressure.
144. **Recommendation**: One-time "Plus" unlock (about $5-8), optional cosmetic packs later, subscription only if costs demand it. Keeps the game honest and simple. Ranked and daily stay free for everyone; Plus adds modes (weather, events, ferries, metro, map maker, world tour, achievements) and extra cosmetics, not an unfair ranked edge.

### Payment providers
145. **Merchant of record (Lemon Squeezy or Paddle, verify current terms/fees)** (M). They are the seller, handle global sales tax/VAT, invoices, and refunds. Pros: far less tax work for a hobby dev. Cons: higher fees (roughly 5% + fixed fee) and payout rules; account approval needed. Recommended first choice for this reason.
146. **Stripe Checkout + Supabase Edge Function webhook** (M). Pros: lowest fees, flexible. Cons: you are the seller and responsible for sales tax (Stripe Tax can help but costs extra and you still register and remit). More legal work. Possible later.
147. **Flow**: client calls an Edge Function to create a Checkout session with `client_reference_id = user_id` (server derives user from the JWT); provider webhook (signature verified with the secret) writes to an `entitlements` table. Client never sets entitlement (S).
148. **Keep secrets server-side only** (S). Webhook secrets and API keys live in Supabase secrets; never in the GitHub Pages repo.

### Entitlements and security
149. **Server-side `entitlements` table** (S). Columns: user_id, product, status (trial/active/refunded/expired), source, granted_at, expires_at, provider_order_id (unique). RLS: users can SELECT their own row; no INSERT/UPDATE from the client. Only the service role (webhook function) writes.
150. **Server-enforced Plus features** (M). Anything that touches shared state (ranked, leaderboard categories, Plus-only maps in duels) checks the entitlement in a Postgres function. Client-side gating is only a UX hint; assume a hacked client can unlock local-only features, which is acceptable for a single-player item, but never accept ranked scores from Plus modes without a valid entitlement.
151. **Idempotent webhooks** (S). Store provider event IDs; ignore duplicates; handle out-of-order events; log everything in an `audit_log`.
152. **Offline grace** (S). Cache a signed entitlement token (e.g., a JWT with 7-day expiry) so Plus works offline in the PWA; refresh when online. Revocation applies at the next refresh. Why: kids play on planes, in cars.

### Free trial design
153. **7-day trial tied to the account** (S). `trial_started_at` is set by a server function on first request; one trial per account; countdown in UI. Plus unlocks for 7 days then reverts gently (progress and creations are kept; only the gated modes lock). No credit card for the trial (important for kids and COPPA simplicity).
154. **One trial per device and per account** (M). Store a random device ID in IndexedDB and send it with the request; the server records hashed device IDs and refuses a second trial. Not perfect (clearing storage), so combine with rate limits per IP range (soft) and make the trial low-stakes. Don't fingerprint aggressively (privacy and COPPA).
155. **Trial abuse monitoring** (S). Flag accounts created in bursts from the same device hash; disable trials for flagged devices; review manually.
156. **Gentle trial-end messaging** (S). Day 5 and day 7 friendly notice; never a guilt-trip, no countdown pressure aimed at kids; the notice also explains "ask a grown-up".

### Parental purchase flow
157. **Kids can't pay; a parent completes checkout** (M). In-game "Ask a grown-up" button creates a purchase request; a parent enters their email (never stored for marketing; used only for the receipt and a magic link). The parent gets an email with a link to the provider's hosted checkout page. Pros: no payment details touch the kid. Cons: email deliverability; use the provider's receipt emails or Supabase auth emails.
158. **Parental consent record** (S). Store: parent email hash, consent timestamp, product, order ID. Keep it minimal; give a deletion link.
159. **Alternative: gift codes** (M). Parent buys a code on a web page and the kid redeems it in the game. Codes are single-use, random, and stored hashed with an expiry.
160. **Spend safeguards** (S). No in-game currency, no stored cards, no random paid rewards, a clear price shown in plain language in the parent email.

### Refunds, sharing, support
161. **Refund handling** (S). Provider refunds trigger a webhook that sets the entitlement to `refunded`. Publish a simple policy: 14-day no-questions refund (check legal minimums by region). Don't claw back cosmetics already earned by play.
162. **Family sharing** (M). One purchase unlocks Plus for up to 3-4 linked child accounts under a parent "household" record. Implementation: `households` table with the parent email-linked owner; the owner invites kid accounts via a code. Risk: abuse by sharing publicly; cap members and rate-limit changes (one swap per 30 days).
163. **Account recovery for entitlement** (S). Because kids use nicknames, recovery is via the parent's receipt email link, not via kid email.
164. **Receipts and support email** (S). A dedicated support address and a short FAQ.

### Legal and compliance checklist
- Terms of Service (plain language, parent-addressed for purchases).
- Privacy Policy (what is collected: nickname, game data, device ID; nothing else; retention; deletion; contact).
- COPPA approach documented (audience decision, parental consent method for anything beyond minimal data, no ads, no tracking).
- Sales tax/VAT: use a merchant of record to avoid registering in many places, or learn the obligations if going direct. Washington State has its own rules on digital goods.
- Business setup: consider an LLC or at minimum a business bank account separate from family funds; keep records for taxes; get an accountant's view on reporting.
- App-store rules if wrapped (Google Play billing requirements for digital goods in apps can force Play Billing on the Android app, which would change fees; check before shipping a TWA that sells things).
- Do not resemble another game: art, UI structure, names and descriptions reviewed by someone before launch (see section 1 guardrails).
- **Get a lawyer's review before charging** (especially COPPA, consumer protection, auto-renewal laws if subscriptions).
165. **Legal pre-launch review package** (S). Prepare a one-page summary (data collected, flows, payments, kids' features) to bring to a lawyer; saves billable hours.
166. **Charge-ready gate** (S). Don't enable live payments until: lawyer review done, test-mode purchase and refund flows verified end to end, backups of the entitlements table scheduled, and a rollback plan (grant Plus free to all if payments fail) exists.

---

## 6. Suggested order

Rationale: build what makes the game look special first (it drives every share and listing), prove deterministic replay early (it unlocks ranked, replays, and sharing), then social, then money last.

- Step 1: **Foundations (1-2 weeks)**: 25, 53-58 (render layers, perf ladder, fixed step) and Phase 0 of ranked (101-102). These de-risk everything else.
- Step 2: **Identity art pass (3-5 weeks)**: 3, 4, 5, 17, 19, 33, 37, 40, 41, 50 first (cheap and distinctive, including colorblind patterns), then 1, 2, 7, 12, 22, 26. Decide the art direction (recommendation: Toy Diorama) before drawing anything.
- Step 3: **Fun and feedback (1-2 weeks)**: 10, 13, 15, 34-36, 46, 49 (juice and procedural sound).
- Step 4: **Share loops (1-2 weeks)**: 131 (daily share card), 62 (challenge cards), 137 (OG cards), 136 (SEO page), 122 (itch.io), 130 (press kit). Cheap growth, safe.
- Step 5: **Social upgrades (2-3 weeks)**: 60, 69, 70, 67, 73, 75-76, 79, 82-84 (safety tooling alongside), then 59, 61, 66, 68, 72.
- Step 6: **Async ranked (2-3 weeks)**: Phases 1-3 of section 3 (85-96, 98-99, 108-109, 112-116).
- Step 7: **Verified replays and sharing (2-3 weeks)**: 97, 100, 63, 128 (needs Phase 0).
- Step 8: **Seasons and live queue (later)**: 94, 111, 87, 106-107; plus spectate (71) only if the realtime budget is healthy.
- Step 9: **Monetization (last, once there is an audience)**: 165 first (lawyer), then 145, 147-149, 153, 157, 161, 152; ship the one-time unlock (141/144) in test mode, then go live after the gate (166).
- Step 10: **Stretch**: Google Play TWA (135), classroom page (133), adaptive music (47), spectate (71), CrazyGames/Poki (123).

Open questions for Mark:
- Which art direction (A, B, or C)? Recommended: A.
- Plus price and model (one-time vs subscription)?
- Audience decision: general vs directed to children (idea 138)?
- Who runs the public accounts (adult-run recommended)?

## Later: own domain + parent emails (decided Nov 18, 2026)
- Buy a domain only if the game grows. Best pick so far: **littlelanes.app** (~$8.20 first year, then $14.20/yr) from Cloudflare. Avoid .us (no WHOIS privacy), free/shared domains and spammy endings (emails land in spam).
- Then follow RESEND-GUIDE.md: Resend account (2FA) → add mail.littlelanes.app → DNS records in Cloudflare → Sending-access API key → Supabase Authentication → SMTP (key only goes there).
- Then Claude switches on parent-email confirmation and password-reset emails (the private storage and masked display are already built).
