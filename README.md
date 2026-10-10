# Team Game Project

A collaborative game project.

## DUSTLINE prototype

A medium-paced, low-poly Wild West FPS built with HTML, CSS, JavaScript and Three.js. Includes a flat base plate, bean cowboys with sphere hands, low-poly revolvers, hip-fire only, a wide helmet/bodycam-style view, free-aim weapon inertia, six-round cylinders, 1.8-second reloads, health, three-second respawns and a scoreboard. The hidden free-aim point moves the hand and revolver independently within a bounded range while a fixed share of mouse movement turns the helmet. A fired revolver uses the actual delayed barrel direction. Movement adds weapon motion. Leaning has been removed. Movement is 4.5 units/second; two standard revolver body hits eliminate a player. No aiming-down-sights mode.

### Run multiplayer

The gun is normally held with one hand. Double-click or click rapidly (within 300 ms) to fan the hammer with the other hand, firing up to eight shots per second while clicks continue, with 12% more recoil per shot. A very fast second click is buffered briefly instead of discarded; there is no automatic burst. The six-round cylinder advances 60 degrees for each shot, and fanning is also visible on other players. Free aim allows 16 degrees to either side normally and 32 degrees with RMB, which slows camera turning to 30% speed. The revolver's anchor remains 0.78 units from the eye with spring-driven wrist recoil.

Three reactive bullseye targets stand in the center in both practice and multiplayer. Target hits use server hit detection in multiplayer and stop shots before they reach a player behind the target.

The gun now rests on the horizontal centerline for equal left/right travel. A small portion of mouse movement always turns the camera, including when reversing across the free-aim area; RMB reduces this contribution further. Gun following uses local offsets to stay consistent across repeated full turns. Shots briefly split the rendered red/blue color channels near the screen edges, alongside the flash vignette.

Holding RMB shows a bright amber beam along the actual barrel direction, stopping at the nearest surface or player. The rendered beam and each bullet share a captured muzzle position and direction before recoil, and multiplayer validates and uses that same origin. The beam briefly holds the shot path while the barrel kicks up. Heat shimmer stays around the beam rather than bending it. Muzzle flashes use a larger warm-white core, radial flame jets, bright-pass bloom, a soft lens halo and small cylinder-gap jets. The rotating cylinder has a plain outer surface, without decorative stripes or grooves. Smoke is shorter-lived and much fainter. Lighting is slightly darker and warmer for a late-day Western atmosphere. Hit markers remain removed.

Camera sensitivity is constant across the entire hand range, with RMB selecting a slower rate. Camera turning follows mouse distance directly without acceleration, speed caps or continued rotation after stopping. Raw mouse input is requested where supported. Hand sensitivity is linear up to its physical stop, with a fixed 35 ms follow time that is consistent across frame rates. RMB selects its slower sensitivity immediately; the beam appearance eases separately. Walking accelerates and stops smoothly using identical integration on the server and client. Network correction velocity also eases in. The camera stays level, with walking bob on the gun only. Camera recoil uses a gentle spring impulse while the gun kicks harder. One rendering path stays active and the muzzle light stays registered to avoid shot-time shader changes. Local game files are served without caching so a refresh loads the latest controls.

Install Node.js 22 or newer, then run `node server.mjs` and open `http://localhost:3000`. No package installation or build is needed. Players on the same network can open `http://YOUR-LAN-IP:3000` and enter a username. Press Play to host a game; an admin can join directly from the player list. Each lobby supports two players and includes the three practice cans. To play over the internet, deploy this Node server to a host supporting long-lived HTTP/SSE connections and share its HTTPS URL. Allow the server port through your firewall only as needed.

Controls: WASD move, mouse free-aim/turn, hold RMB for the aiming beam, left click fire, double-click/rapid clicks fan-fire, R reload, 1 revolver, 2 shotgun, F launch a clay, E open GUNZ at the counter, Space jump, Esc pause/release mouse. Desktop keyboard/mouse and WebGL are required. Click Resume again if the browser requires a second gesture to capture the mouse.

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
Import this repository into Vercel. The included vercel.json builds the browser game automatically with node build-static.mjs and serves dist/. LAN play uses a shared Redis directory and direct WebRTC connections. Without the configured directory, the site offers solo practice. The persistent Node server remains an optional alternative.

The small rectangular skeet machine ahead of spawn launches one clay when you press F. Flights go upward and away with varied left/right angles (about ±18 degrees), varied elevation (about 32–48 degrees), and a faster 14-unit/second launch, gravity and drag. Shot clays break into pooled tumbling fragments that inherit momentum and bounce on the floor; missed clays break when they land. Launches are limited to one per 650 ms and three active clays. Multiplayer shares the machine within each room; practice flight timers stop when paused.

Press 2 for the sawed-off side-by-side double-barrel shotgun (1 returns to the revolver). Left-click fires one barrel; right-click fires both loaded barrels together. A single-barrel shot emits 12 pellets in a 7.5-degree half-angle spread cone (15 degrees total), followed by the other barrel on the next left click (24 pellets across both shots, or 24 in one right-click). Each shot consumes one shell and drops its own visible hammer; R starts a 2.4-second break-action reload. Reloading visibly opens the breech, ejects the old shells, inserts two new shells, closes the action and recocks the hammers. The closely joined twin barrels share their spacing with the shot simulation, and the shotgun is held at a closer fixed reach of .62 units. The shotgun retains independent free aim without ADS; its right button fires instead of entering focus. The revolver still uses RMB for slower camera movement. The shotgun has no aiming line or heat-wave beam; normal muzzle flash, bloom, recoil and shot vignette remain. Pellet directions and muzzle positions match client/server prediction, with one instanced draw for bright short pellet tracers smaller than the revolver projectile, with at least 120 ms of visible flight. Weapon switching preserves each weapon's ammo and cannot interrupt reloads.

Ejected shotgun shells use world-space gravity, tumble, bounce and settle on the floor. The most recent 128 remain visible; settled shells sleep, and physics pauses with the game.


## Usernames, admin panel and damage

Enter a username (1–16 characters) before joining. A first-party `dustline_username` cookie remembers it for one year on that browser; it uses SameSite=Lax and Secure on HTTPS. The cookie stores only the display name, not admin access. Press Esc to return to the menu. Q/E no longer lean.

Open **Admin**, enter **0310**, and choose **Unlock**. On a multiplayer server, code validation happens on the server and yields an eight-hour admin session. Five login attempts per minute are allowed per connection IP. The server can override the default code with `ADMIN_CODE`. The panel lists players and refreshes every four seconds. Press **Play** to appear in the list. Only an admin can select **Join** beside another player; there are no lobby-code controls. Each game supports two players and keeps all three bean cans.

After pressing Play, the panel offers **Get all weapons**, **No recoil**, **Infinite ammo**, **Infinite health**, **No shot cooldown**, and **Full auto** for your player. With Admin unlocked, press **B** during gameplay to select ammo for the equipped weapon for free. Full auto holds the trigger while the left mouse button is down; enabling no shot cooldown removes normal gun timing. Automated fire is bounded at 20 shots per second. Infinite ammo and health retain their existing behavior. Weapon grants and ammo selection do not spend beans.

**Reset cookie** beside a player's Join button clears only that player's saved DUSTLINE username when their browser next polls. It does not erase beans, other site cookies, or their current game. They will enter a username again on their next page load. The server checks admin access, targets the selected player, and retains the command until their browser acknowledges it.

Players have 100 HP. The upper capsule above 1.38 units counts as the head; hat decoration does not extend the hitbox.

| Ammo | Body damage | Head damage | Body hits to eliminate |
| --- | ---: | ---: | ---: |
| Standard revolver | 50 | 100 | 2 |
| Small revolver | 25 | 100 | 4 |
| Buckshot | 12 per pellet | 100 per pellet | 9 pellets |
| Birdshot | 2 per pellet | 2 per pellet | 50 of 80 pellets per barrel |
| Slug | 100 | 100 | 1 |

## Admin-only P2P play (no player installation)

1. Connect an Upstash Redis database to the Vercel project. Use the Free plan if available; do not enable paid upgrades automatically. The database keeps expiring player sessions, codes, admin sessions and connection messages. No gameplay positions or shots are sent through Redis.
2. The integration must provide `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or the compatible `KV_REST_API_URL` and `KV_REST_API_TOKEN`, to the Vercel Function. These credentials stay server-side. Redeploy after connecting it.
3. The browser uses the same-origin P2P directory exclusively. `GET /api/multiplayer` returns `{multiplayer:true,transport:"webrtc"}`. An unconfigured database returns 503 with `NOT_CONFIGURED` and the game falls back to local practice.
4. Enter a username and press **Play**. This creates a discoverable game with the original three bean cans, GUNZ shop and physics.
5. The admin unlocks **Admin**, finds the other player and presses **Join P2P**. Both the directory and game authority enforce a two-player limit; joining another game requires admin access.
6. Damage, respawns, bean rewards, walls and movement are shared. Keep the hosting player's browser open. **Leave** returns to local practice. A failed join displays an error.


The browsers still need internet access to the Vercel directory for discovery and periodic presence checks. Gameplay travels directly between browser peers over WebRTC. STUN discovers direct routes; there is no TURN or gameplay relay. The service does not scan the local network. Wi-Fi client isolation, blocked WebRTC or a VPN can prevent direct connections even on the same Wi-Fi; a failed join reports this instead of silently putting players in separate games. The admin directory lists site players, but direct joining still requires a reachable peer. Restrictive NATs may prevent a connection. The public connection-check page can test a local WebRTC round trip, but cannot prove connectivity to another computer.

Lobby sessions expire after 90 seconds without a heartbeat. Only the username and solo-practice bean progress are remembered between page loads; P2P progress lasts for the current session. Directory tokens and Redis credentials are not exposed in player lists. The host browser is authoritative, so this friend-game prototype does not defend against a modified host client. Free service usage limits still apply to directory requests; reaching them can interrupt discovery and presence.

### Development and legacy server

The Node server remains available for development and legacy transport tests, but the browser menu no longer selects its HTTP/SSE multiplayer path or an external `MULTIPLAYER_URL`. The published game uses P2P only. No player installation or npm dependencies are required. `node --test tests/*.test.mjs` validates admin-only joining, cookie resets, loadouts, firing rules, authorization, simulation and networking lifecycle.

## Projectile combat and can characters

Shots now spawn traveling rounds (160 units/s revolver, 220 units/s shotgun). Each simulation step sweeps only the distance traveled against current targets and walls; damage happens at impact, not on the trigger press. Ammo modifiers are captured when firing, so changing guns cannot change a round already in flight. Standard buckshot has six-cell penetration like the revolver, with a smaller central hole and edge chips per pellet.

Characters are faceted baked-bean, tomato-soup and sweet-corn cans, with matching closed-cylinder hitboxes. Hits remove surface triangles and expose torn metal; food and metal fragments bounce and expire from a bounded particle pool. Killed practice cans tumble, bounce and settle, then respawn after three active seconds. Multiplayer clients receive authoritative impact events for the same damage effects.

Can damage openings now scale with each projectile's ammo damage: tiny birdshot, small revolver holes, and large slug tears. Penetrating rounds cut matching entry and exit holes, including lid/base hits, and can continue into targets behind the first can. Contents drain from submerged holes into short-lived droplets and floor splats (7 seconds); food pieces expire after 5–6.5 seconds and have distinct kidney-bean and tapered-kernel shapes. Can falls use contact impulses, cylinder inertia, and a fill-dependent mass center. Cowboy hats tumble off separately on death.


## GUNZ shack and beans

The weathered wooden shack sits on the left side of the range. Walk through the front doorway, face the blue penguin behind the counter, and press **E**. The wooden ammo board sells permanent ammo unlocks: small revolver rounds cost 400 beans, birdshot costs 450, and slugs cost 500. Standard revolver rounds and buckshot are starter ammo; owned types can be equipped again at the shop without another charge. Pick up the shotgun before buying its ammo.

Each can elimination pays 125 beans; each newly broken wall block pays one bean. Empty holes and repeat damage to an already dead can pay nothing. Reloads stay free. B opens free ammo selection only while Admin is unlocked; regular players use the shop. Beans and unlocks survive deaths; solo-practice progress also survives reloads in this browser. P2P balances are held by the host browser for the current player session, and proximity, health, inventory and funds are checked by that host. Vercel P2P play requires the shared directory configuration described above.

### Checking a connection

Open `/connection-check.html` to test player registration without WebGL. The admin check asks for the admin code, registers two players, verifies that joining requires admin access, joins directly, confirms all three cans are present, and checks live game updates. It then closes both test players and logs out the test admin session. A successful check in one browser does not verify Wi-Fi reachability between separate computers.


### Startup and bean jumpscare

Play requests mouse capture during the click; slow or unavailable audio no longer blocks starting a game. Admin weapon and power buttons can prepare your session directly after you enter a username, without pressing Play first.

Bean jumpscares never trigger during normal gameplay. Only the unlocked Admin menu has a **Bean jumpscare** preview, limited to once per 25 seconds. It closes after 1.4 seconds, with Escape/Dismiss, or when Admin is locked. Reduced-motion preferences disable the pop-in animation.

Play waits for connection detection before starting, so an early click cannot accidentally create an undiscoverable solo game. Temporary directory errors can be retried with Play. Changing games waits for any previous signaling poll to finish, preserving the new host handshake. Joining another player requires server-verified admin access; ordinary players simply press Play and remain available for an admin to join.


## Dustyard 1v1 and bow

In a P2P game, unlock Admin, select **Dustyard · 1v1**, and press **Set map**. Admins can switch the current shared room even when they are the guest. The arena follows the supplied overhead layout: mirrored end courts, stairs, side lanes, central parapets, stacked cover and a small block-built wagon. Ground and cover are destructible voxels; enclosing boundaries remain solid. A kill awards one point, briefly shows the victim's ragdoll from a camera that pulls back, then restores the map and both opposite-end spawns. Each round starts with a three-second loadout intermission. One player alone waits for an opponent.

Pick revolver ammo plus exactly one secondary (shotgun or bow). **1** equips the revolver; **2** equips the selected secondary. In practice, **3** equips an admin-granted bow. Hold **LMB** to draw the bow and release it to fire. **RMB** cancels the draw. Full draw takes 1.1 seconds. Arrow speed increases from 40 to 100 units/second, torso damage from 30 to 100, and head damage is always 100. Surviving hits bleed for three bursts of five damage. Arrows follow gravity with a 120-unit travel budget. Penetration rises from 0 to 12 points with charge: each small destructible block costs one point, each can costs two. Blocks reduce speed by 4% and body damage by 6%; passing through a can reduces both by 10%. Headshots retain lethal damage. Solid boundaries stop arrows. Stopped arrows embed 0.18–0.36 units and remain visible for 15 seconds. The host measures charge time. Interrupted draws cancel. A local surface cross predicts the first ballistic impact against the current scene, with a fixed world size that appears smaller at distance. Above 10% draw, a private thin line traces that curved flight path to the cross; release, cancellation and pause hide it. Quick arrows drop more steeply; the prediction changes continuously with charge. It cannot predict where a moving target will be in the future. The first-person bow starts at 55% opacity and fades away near full draw, and the drawing hand fades before reaching the face. Lodged arrows leave their shafts visible, wobble briefly and play a positional wood/metal impact sound. Each shot immediately starts a 650 ms arrow-nocking animation without waiting for another reload request. A constrained 17-node bowstring flexes and rebounds on release. Arrow tips match the projectile position and punctures use the 0.035-unit arrowhead radius.

**Tri-shot** ammo changes the cylinder to a triangular prism: three rounds, 75 torso damage, slower 105-unit/second flight, 18-cell penetration, larger flash and slower recoil recovery. It costs 500 beans at GUNZ, or is available in duel loadouts and Admin ammo. Small rounds travel at 245 units/second. Each penetrated voxel reduces the remaining bullet damage by 13% and speed by 9%.

Other players' shots show a world-space muzzle flash and use distance-attenuated, directional HRTF audio. Muzzle messages use a validated offset from the rendered eye, re-anchored to the authoritative player position, rather than rejecting normal prediction latency as an invalid world-space pose. Rejected actions no longer tear down the session.

Local P2P integration preview: `node build-static.mjs`, then `node tests/preview-server.mjs` (localhost only, ephemeral in-memory directory). The browser connection check also tests a map change and 1v1 scoring/reset using two temporary peers; it never changes a real player's room.

The revised Dustyard uses exact mirrored geometry, chamfered end courts and can-height crates. Both spawns are concealed by full-height destructible cover. The shared movement controller steps over remnants up to 0.38 units, slides along walls, bridges holes smaller than the player footprint, and checks overhead clearance. Grounded camera height eases over steps without changing horizontal mouse response. Jumping requires a fresh Space press while grounded; holding it cannot add lift or repeatedly jump.


## Large arena and admin Laser ammo
Dustyard now spans 100.8 by 50.4 units: three times its previous width and length. Destructible cells remain 0.3 units, and platform/stair heights stay walkable. Spawn cover and both halves remain symmetric. Coplanar voxel faces are merged for rendering, with a tiled cell grid; holes and collision still use individual cells.

Unlock Admin, equip the revolver, and press **B** to choose **Laser**. It fires a short red beam with no recoil or muzzle flash, instantly cutting a wide tunnel through destructible cover and damaging cans along its path. Solid map boundaries stop the beam. Laser is excluded from the normal shop and round loadout choices; the authority requires a verified admin ammo grant. It uses the revolver's six-round cylinder and reload unless Infinite Ammo is enabled.
