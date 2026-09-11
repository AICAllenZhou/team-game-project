# Team Game Project

A collaborative game project.

## DUSTLINE prototype

A medium-paced, low-poly Wild West FPS built with HTML, CSS, JavaScript and Three.js. Includes a flat base plate, bean cowboys with sphere hands, low-poly revolvers, hip-fire only, a wide helmet/bodycam-style view, six-round cylinders, 1.8-second reloads, health, three-second respawns and a scoreboard. Movement is 4.5 units/second; three hits eliminate a player. No aiming-down-sights mode.

### Run multiplayer

Install Node.js 22 or newer, then run `node server.mjs` and open `http://localhost:3000`. No package installation or build is needed. Players on the same network can open `http://YOUR-LAN-IP:3000` and enter the same room name. Each room supports 12 players. To play over the internet, deploy this Node server to a host supporting long-lived HTTP/SSE connections and share its HTTPS URL. Allow the server port through your firewall only as needed.

Controls: WASD move, mouse look, left click fire, R reload, Space jump, Tab scoreboard, Esc pause/release mouse. Desktop keyboard/mouse and WebGL are required. Click Enter again if the browser requires a second gesture to capture the mouse.

The Node server owns movement, ammunition, fire rate, hit detection and respawns. This is an early prototype: no accounts, persistence, matchmaking, lag compensation or production anti-abuse protections. The arena is intentionally an open base plate for the team's later map/environment work.

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
