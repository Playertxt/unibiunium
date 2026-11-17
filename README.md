# UNBIUNIUM: Element 121 Air Combat

Named after element 121 (Unbiunium, symbol **Ubu**), the first element of the g-block. Nobody has made it yet; in this game it powers the UBU-121 prototype jet.

A browser-based 3D combat flight game: nine jets, heavy bombers, tanks, AA guns, ships, eleven worlds in different biomes, a 6-mission campaign, a Free Flight sandbox and online multiplayer with your friends. Built with Three.js (WebGL) and a small Python server.

## Quick start

You need **Python 3.9+** with **aiohttp** (`pip install aiohttp`) and a modern browser (Chrome, Edge or Firefox). The browser needs internet access the first time, because Three.js loads from a CDN.

```bash
python3 server.py
```

Then open **http://localhost:8080**. To use a different port, run `python3 server.py 9000`.

## Game modes

| Mode | What it is |
|---|---|
| **Campaign** | *Operation Iron Sky*, 6 missions: dogfight training, stop a tank column, intercept a bomber stream, a night strike on radar/fuel/hangars, front-line close air support, and the final assault on the enemy HQ and destroyer. Progress and ★ ratings are saved in the browser. |
| **Free Flight** | Sandbox with every jet unlocked: no score, no time limit, no boundaries. Optionally hunt roaming enemy tank columns (light and heavy tanks, optionally guarded by AA guns) and enemy fighters. Options for unlimited ammo and invincibility. Press **1–9** in flight to switch jets instantly. |
| **Quick Battle** | Offline Blue vs Red battle against AI, with a full ground war (tanks, AA, pillboxes, convoys, ships, bases). Pick the world and time of day. First team to 3000 points wins. |
| **Multiplayer** | Play with friends. Modes: **Team Battle** (Blue vs Red plus AI), **Co-op vs AI** (everyone on Blue), **Free-for-all Dogfight**. The host picks the world and time of day. |

## Worlds

| World | Terrain |
|---|---|
| **Iron Island** (temperate) | Farmland, forests and rugged mountains on one large island. |
| **Scorched Mesa** (desert) | A sandy basin ringed by red, terraced sandstone mesas. Little cover. |
| **Frost Fjords** (arctic) | Snowfields, frozen lakes, snowy pines and white-capped peaks along a fjord coast. |
| **Coral Archipelago** (tropical) | Jungle islands with palms and white beaches in a turquoise sea; each airfield is on its own island. |
| **Highland Valley** (alpine) | A long green valley walled in by snow-capped peaks. |
| **Ember Caldera** (volcanic) | Black basalt and jagged volcanic peaks in a glowing lava sea. No ships. |
| **Golden Savanna** (savanna) | Golden grassland with flat-topped acacias and granite boulders. |
| **Mire Bayou** (wetland) | Murky lakes, channels and willow forest, with thick mist. |
| **Amber Woods** (autumn) | Hills of red, orange and gold forest, with harvest fields. |
| **Ubu Crystal Expanse** (exotic) | Violet plains, terraced plateaus, a glowing cyan sea and giant crystal spires. |
| **Crimson Wastes** (Martian) | Red dust, impact craters and boulder fields under a butterscotch sky. No ships. |

Worlds are 36 × 36 km (twice the original size in each direction). Each has rivers that run downhill to the sea or into a lake, plus small lakes and ponds; on Ember Caldera they flow with lava. Airfields have a fully marked runway with edge, threshold, approach and PAPI lights, taxiways, a concrete apron with parking stands, parked jets in sandbag revetments, arched hangars with open doors and lit interiors, a control tower, windsock, ground vehicles, a perimeter fence and tree lines. Roads link the bases, airfields and towns and bridge any river they cross; towns have streets, a church tower and chimneys; bases have tents and flag masts.

Every world uses the same battlefield layout, so all modes and missions work on all of them. Destroyers appear only on worlds where both teams have open sea on their flank, and never on lava or Martian worlds. Campaign missions each take place on a fixed world.

## Aircraft

| Aircraft | Role | Weapons |
|---|---|---|
| FX-7 Falcon | Multirole jet fighter | 4× 20 mm cannon, 4 homing rockets, 2× 250 kg bombs, afterburner, **auto-lock** |
| IX-3 Kestrel | Interceptor | 2× 30 mm cannon, 8 rockets, **auto-lock**, fastest |
| AX-5 Hammerhead | Ground attack | Anti-tank cannon, 12 rockets, 4× 500 kg bombs, heavy armour |
| RX-8 Viper | Agile dogfighter (canard delta, fastest roll) | 2× 25 mm cannon, 6 rockets |
| NX-37 Corvid | Supermaneuverable (forward-swept wings) | 30 mm armour-piercing cannon, 8 rockets, 2 bombs, **auto-lock** |
| SX-21 Wraith | Stealth strike | 25 mm cannon, 4× 500 kg bombs, **auto-lock**. Enemies spot it at half range |
| VX-14 Vortex | Heavy air superiority (twin engine, twin tail) | 2× 30 mm cannon, 16 rockets, 2 bombs, **auto-lock** |
| BX-9 Titan | Heavy bomber | 16× 500 kg bombs, 3 automatic defensive turrets |
| UBU-121 Unbiunium | Element-121 prototype hyperjet | 4 armour-piercing **homing** plasma cannons, 12 **self-seeking** rockets, 4 **guided** bombs, fastest **auto-lock**; fastest airframe |

Tanks and bunkers are armoured. Machine guns and light cannon barely scratch them, so use rockets, bombs or an armour-piercing cannon (Hammerhead, Corvid, UBU-121). Heavy tanks take about twice the punishment of normal tanks.

## Controls

These are the defaults. You can change every one in **Settings → Key bindings**.

| Input | Action |
|---|---|
| Mouse | Aim. The aircraft flies toward the white circle (mouse-aim) |
| Left mouse | Guns |
| Right mouse / Space | Drop bomb (aim with the orange bomb sight on the ground) |
| R | Rockets |
| W / S (or Shift / Ctrl, mouse wheel) | Throttle. Above 100% is afterburner |
| A / D (or ← / →), Q / E, ↑ / ↓ | Manual roll, yaw, pitch |
| C (hold) | Free look |
| V | Camera: chase / cockpit / far |
| X | Bomb camera |
| Tab | Scoreboard |
| Enter / T | Chat (multiplayer) |
| J | Rearm: refill guns, bombs and rockets (15 s between uses outside Free Flight) |
| K | Bail out / respawn |
| Z (hold) | Boost: a burst of extra thrust; the meter recharges |
| B (hold) | Air brake: slow down fast and turn tighter |
| F | Evasive barrel roll with a sideways jink |
| G | Immelmann U-turn: half loop and half roll, reversing direction |
| Y | Cobra: nose snaps up while the jet keeps flying straight and bleeds speed |
| H | Hover mode (VTOL, not on the Titan). W/S climb and descend, A/D strafe, ↑/↓ move forward and back, the nose follows your aim. Touch down gently to land. Press H again to fly normally |
| 1–9 | Free Flight: switch jet in mid-air |
| Esc | Pause |

To hit a moving plane, shoot at the **red lead circle** in front of it, not at the plane itself.

**Auto-lock** (Falcon, Kestrel, Corvid, Wraith, Vortex, UBU-121): keep an enemy near your nose and the radar locks it after about a second (closing brackets, then a red diamond and a LOCK tone). While locked, rockets home in on the target, and your guns fire at the **lead point** (where the target will be when the rounds arrive) as long as that point is within about 9° of your nose, so moving tanks and turning aircraft are led for you. The red lead circle shows that point for locked ground targets too. The lock holds through a wider cone than it takes to acquire, and drops if the target gets away.

**UBU-121 homing weapons:** its plasma rounds curve toward the locked target in flight, bombs dropped while locked on a ground target steer onto it as they fall, and its rockets pick the enemy nearest the nose by themselves, even before the radar has locked.

Some embedded browsers (such as the Claude app's browser pane) block mouse capture. The game then switches to **free-cursor steering**: the cursor works like a joystick, so move it away from the centre circle to turn (further means faster) and click the view to fire. For the full mouse-aim feel, play in Chrome, Edge or Firefox.

## Playing on a phone or tablet

1. Run `python3 server.py` on your PC. Then open the `http://192.168.x.x:8080` address it prints on the phone's browser (same Wi-Fi). Chrome on Android and Safari on iOS both work.
2. Hold the phone sideways. In portrait the game shows a rotate prompt and pauses.
3. Touch controls turn on by themselves on phones and tablets. On Android the game also goes fullscreen when you take off. On iPhone, use Share → **Add to Home Screen** and start the game from there to get fullscreen.

| Touch | Action |
|---|---|
| Left thumb (lower-left area) | Floating stick: it appears under your thumb. Push to turn the aim; further means faster. In hover mode it moves the jet |
| Drag anywhere else | Aim precisely, like the mouse |
| Bar on the far left | Throttle. Above the red line is afterburner. In hover mode it becomes a centre-sprung lift lever |
| FIRE · RKT · BOMB · BOOST · BRAKE (right) | Weapons, boost and air brake. Hold to keep firing |
| ROLL · U-TURN · COBRA · HOVER · JET (bottom) | Manoeuvres, hover mode, and switching jets in Free Flight |
| BAIL · CAM · SCORE · ❚❚ (top right) | Bail out, camera, scoreboard (hold) and pause |

On phones, **Auto** graphics uses mobile presets: no bloom, shadows or MSAA, and the screen's pixel density is capped at 1.25×. Flagship phones get Medium; the rest get Low. Dynamic resolution stays on to hold 60 FPS. Under **Settings → Controls** you can set touch controls to Auto, Always on or Off, and change touch aim sensitivity.

## Playing with friends

1. One person runs `python3 server.py`. The console prints addresses such as `http://192.168.1.20:8080`.
2. **Same Wi-Fi/LAN:** friends open that address. If they can't connect, allow port 8080 through the host's firewall.
3. **Over the internet**, use either of these:
   - Forward TCP port 8080 on your router to the host PC, then friends open `http://<your-public-ip>:8080`.
   - Use a tunnel, for example `cloudflared tunnel --url http://localhost:8080`, and share the HTTPS link it prints. WebSockets work through it automatically.
4. Everyone clicks **Multiplayer**. One player clicks **Create room** and shares the 4-letter **room code**. The others join with that code (or from the room list).
5. Choose a team and an aircraft, click **Ready**, and the host clicks **Start match**. Late joiners drop straight into a running battle. If the host leaves, another player becomes host automatically.

## Settings

Settings are saved in the browser and apply immediately.

- **Graphics.** On first launch the game detects your graphics card, CPU and memory and chooses a preset (**Auto**). You can also pick Low, Medium, High or Ultra, or change any option on its own: render resolution (50–200%), shadows, view distance, forest density, clouds, explosion and smoke detail, bloom, anti-aliasing and an FPS counter.
  - **Dynamic resolution** lowers the resolution automatically when the frame rate falls below your target (30–144 FPS). It never lowers it when the limit is your display's refresh rate.
- **Controls.** Choose the steering mode: mouse aim, or a free-cursor joystick. You can also set mouse-aim sensitivity (default raised to 1.8), joystick turn speed and dead zone, field of view, invert-Y, mouse-wheel throttle and camera shake.
- **Key bindings.** Every action has a primary and a secondary binding. Click a box and press a key, or click the box with the mouse button you want. A key moves away from whatever action used it before. **Reset to defaults** restores everything.
- **Audio & HUD.** Master, engine and weapons volume, plus toggles for the minimap, kill feed, and pilot and target names.

## Project layout

```
server.py              aiohttp web server + WebSocket lobby/relay (rooms, host, chat)
public/index.html      page, menus, import map
public/css/style.css   UI styling
public/js/
  main.js        app bootstrap, game-flow (menus ⇄ campaign / quick / multiplayer)
  engine.js      renderer, sky, sun & shadows, bloom, hardware detection, dynamic resolution
  worlds.js      the 11 world definitions (terrain shape, biome colours, vegetation, water, atmosphere)
  world.js       terrain generator (island / archipelago / valley, mesas, lakes), terrain mesh, water
  scenery.js     trees (conifer, snowy pine, broadleaf, palm, shrub, cactus), clouds, towns, airfields
  models.js      procedural aircraft models + camo textures
  models_ground.js tanks, AA, trucks, bunkers, depot, radar, hangar, HQ, destroyer
  aircraft.js    flight model, mouse-aim autopilot, guns/bombs/rockets/turrets, damage
  ground.js      ground unit movement, turret aiming, tank shells and flak
  weapons.js     bullets/tracers, bombs, rockets, hit detection
  effects.js     GPU particles: explosions, fire, smoke, sparks, splashes, craters
  ai.js          AI pilots: dogfighting, ground attack, level bombing, terrain avoidance
  battle.js      battlefield layout, reinforcements, AI bot manager
  campaign.js    the 6 campaign missions and progress saving
  freeflight.js  Free Flight tank hunt (roaming tank columns) and unlimited-ammo rearming
  game.js        match controller: entities, damage, scoring, camera, player input
  net.js         WebSocket client + multiplayer state sync
  hud.js         HUD: reticles, lead indicator, bomb sight, markers, minimap, kill feed
  ui.js          menus, world pickers, settings tabs, key rebinding, lobby, results
  input.js       keyboard/mouse with rebindable actions, mouse capture or joystick steering
  touch.js       on-screen touch controls for phones and tablets (stick, drag aim, throttle, buttons)
  audio.js       procedural engine, gun and explosion sounds
```

## How multiplayer works

- Each player's own aircraft is simulated in their own browser and streamed at 20 Hz. The other players see it smoothly interpolated.
- The room host simulates all AI aircraft and ground units, broadcasts them at 10 Hz, and keeps the score.
- When you hit something, your browser sends a hit to whoever owns the target: the host for AI and ground units, or the other player for their aircraft. That owner applies the damage and announces the kill.
- The server only manages lobbies and relays messages, so it uses very little CPU.
