# Team Game Project

A collaborative game project.

## DUSTLINE prototype

A medium-paced, low-poly Wild West FPS built with HTML, CSS, JavaScript and Three.js. Includes a flat base plate, bean cowboys with sphere hands, low-poly revolvers, hip-fire only, a wide helmet/bodycam-style view, free-aim weapon inertia, six-round cylinders, 1.8-second reloads, health, three-second respawns and a scoreboard. The hidden free-aim point moves the hand and revolver independently within a bounded range while a fixed share of mouse movement turns the helmet. A fired revolver uses the actual delayed barrel direction. Movement and Q/E leaning add weapon motion. Movement is 4.5 units/second; three hits eliminate a player. No aiming-down-sights mode.

### Run multiplayer

The gun is normally held with one hand. Double-click or click rapidly (within 300 ms) to fan the hammer with the other hand, firing up to eight shots per second while clicks continue, with 12% more recoil per shot. A very fast second click is buffered briefly instead of discarded; there is no automatic burst. The six-round cylinder advances 60 degrees for each shot, and fanning is also visible on other players. Free aim allows 16 degrees to either side normally and 32 degrees with RMB, which slows camera turning to 30% speed. The revolver's anchor remains 0.78 units from the eye with spring-driven wrist recoil.

Three reactive bullseye targets stand in the center in both practice and multiplayer. Target hits use server hit detection in multiplayer and stop shots before they reach a player behind the target.

The gun now rests on the horizontal centerline for equal left/right travel. A small portion of mouse movement always turns the camera, including when reversing across the free-aim area; RMB reduces this contribution further. Gun following uses local offsets to stay consistent across repeated full turns. Shots briefly split the rendered red/blue color channels near the screen edges, alongside the flash vignette.

Holding RMB shows a bright amber beam along the actual barrel direction, stopping at the nearest surface or player. The rendered beam and each bullet share a captured muzzle position and direction before recoil, and multiplayer validates and uses that same origin. The beam briefly holds the shot path while the barrel kicks up. Heat shimmer stays around the beam rather than bending it. Muzzle flashes use a larger warm-white core, radial flame jets, bright-pass bloom, a soft lens halo and small cylinder-gap jets. The rotating cylinder has a plain outer surface, without decorative stripes or grooves. Smoke is shorter-lived and much fainter. Lighting is slightly darker and warmer for a late-day Western atmosphere. Hit markers remain removed.

Camera sensitivity is constant across the entire hand range, with RMB selecting a slower rate. Camera turning follows mouse distance directly without acceleration, speed caps or continued rotation after stopping. Raw mouse input is requested where supported. Hand sensitivity is linear up to its physical stop, with a fixed 35 ms follow time that is consistent across frame rates. RMB selects its slower sensitivity immediately; the beam appearance eases separately. Walking accelerates and stops smoothly using identical integration on the server and client. Network correction velocity also eases in. The camera stays level, with walking bob on the gun only. Camera recoil uses a gentle spring impulse while the gun kicks harder. One rendering path stays active and the muzzle light stays registered to avoid shot-time shader changes. Local game files are served without caching so a refresh loads the latest controls.

Install Node.js 22 or newer, then run `node server.mjs` and open `http://localhost:3000`. No package installation or build is needed. Players on the same network can open `http://YOUR-LAN-IP:3000` and enter the same room name. Each room supports 12 players. To play over the internet, deploy this Node server to a host supporting long-lived HTTP/SSE connections and share its HTTPS URL. Allow the server port through your firewall only as needed.

Controls: WASD move, mouse free-aim/turn, hold RMB for the aiming beam, left click fire, double-click/rapid clicks fan-fire, Q/E lean, R reload, 1 revolver, 2 shotgun, F launch a clay, Space jump, Esc pause/release mouse. Desktop keyboard/mouse and WebGL are required. Click Join again if the browser requires a second gesture to capture the mouse.

The Node server owns movement, ammunition, fire rate, barrel-direction hit detection and respawns. The local client renders each shot as a fast physical-looking round rather than an instant tracer line. This is an early prototype: no accounts, persistence, matchmaking, lag compensation or production anti-abuse protections. The arena is intentionally an open base plate for the team's later map/environment work.

### Static HTML / GitHub Pages

Serve the repository as static files to use local practice mode with three target characters. GitHub Pages cannot run the multiplayer server; pushing source does not itself deploy a playable multiplayer service. Do not open `index.html` through `file://` because browser module loading needs HTTP.

### Checks and dependencies

Run `node --test tests/*.test.mjs`. Three.js 0.180.0 is vendored in `vendor/` under its included MIT license, so the game does not rely on a third-party CDN at runtime.

## Team responsibilities

- Hervongle: Game logic
- Project lead: Walls and related environment work
- jingston: Character design
- brain : Web development
- rooster: Map design

## Collaboration

Team members can clone the repository, create a branch for their work, and open a pull request when ready.

> Responsibilities are based on the initial discussion and can be updated as the project plan becomes clearer.

## Vercel
Import this repository into Vercel. The included vercel.json builds the browser game automatically with node build-static.mjs and serves dist/. This deployment supports local practice. Multiplayer still requires the persistent Node server (node server.mjs); its in-memory rooms and continuous simulation are not deployed as Vercel Functions.

The small rectangular skeet machine ahead of spawn launches one clay when you press F. Flights go upward and away with varied left/right angles (about ±18 degrees), varied elevation (about 32–48 degrees), and a faster 14-unit/second launch, gravity and drag. Shot clays break into pooled tumbling fragments that inherit momentum and bounce on the floor; missed clays break when they land. Launches are limited to one per 650 ms and three active clays. Multiplayer shares the machine within each room; practice flight timers stop when paused.

Press 2 for the side-by-side double-barrel shotgun (1 returns to the revolver). One click fires both barrels simultaneously: 24 pellets total, 12 per muzzle, in a 2.8-degree half-angle spread cone. Each shot consumes both shells; R starts a 2.4-second break-action reload. RMB slows the camera and expands independent hand aim, exactly like the revolver; it never raises or locks the shotgun into an aiming-down-sights pose. The shotgun has no aiming line or heat-wave beam; normal muzzle flash, bloom, recoil and shot vignette remain. Pellet directions and muzzle positions match client/server prediction, with one instanced draw for visible pellets. Weapon switching preserves each weapon's ammo and cannot interrupt reloads.
