import {applyDamage, setPowers} from './combat.mjs';
import {createVoxelWalls} from './voxel-walls.mjs';
import {move, firingMode, resolveBarrelShot} from './simulation.mjs';
import {createSkeetRange, clayPose} from './skeet.mjs';
import {AMMO_MODS, ammoProfile, canPickUpShotgun, WEAPONS, shotgunPellets, SHOTGUN_INTERVAL, shotgunDischarge} from './weapons.mjs';
import {createWallet, canShop, ownsAmmo, purchaseAmmo, awardBeans} from './shop.mjs';
import {launchProjectile, advanceProjectile} from './projectile-physics.mjs';
import {createTrainingCans, respawnTrainingCans} from './training-cans.mjs';
import {applyAdminLoadout} from './admin-gameplay.mjs';

export const ROOM_CAPACITY = 2;
const COLORS = [0xc17a47, 0x658c91, 0x96799c, 0x879466];

function failure(message, status = 400) {
  return Object.assign(new Error(message), {status});
}

function publicPlayer(player) {
  const {id, name, x, y, z, yaw, pitch, gunYaw, gunPitch, hp, ammo, weapon,
    kills, deaths, reloadUntil, deadUntil, color, hasShotgun, mods, powers, beans, ownedAmmo} = player;
  return {id, name, x, y, z, yaw, pitch, gunYaw, gunPitch, hp, ammo, weapon,
    kills, deaths, reloadUntil, deadUntil, color, hasShotgun,
    mods: {...mods}, powers: {...powers}, beans, ownedAmmo: [...ownedAmmo],ammoByWeapon:{...player.ammoByWeapon}};
}

// A room has one authority: either the Node server or its hosting browser.
// Authentication and peer liveness belong to the transport. In particular,
// setPlayerPowers must only be called after that transport verifies admin access.
export function createRoomEngine({emit = () => {}, now = Date.now, random = Math.random} = {}) {
  const players = new Map();
  const range = createSkeetRange();
  const walls = createVoxelWalls();
  const bullets = [];
  const cans = createTrainingCans();
  const spawn = () => {
    let x, z;
    do {
      x = (random() - .5) * 36;
      z = (random() - .5) * 36;
    } while (x > -17 && x < -9 && z > 0 && z < 7);
    return {x, z, y: 0, vy: 0, vx: 0, vz: 0};
  };

  function requirePlayer(id) {
    const player = players.get(id);
    if (!player) throw failure('That player is no longer in this game', 401);
    return player;
  }

  function addPlayer({id = globalThis.crypto.randomUUID(), name, powers,loadout} = {}) {
    if (typeof id !== 'string' || !id || id.length > 128) throw failure('Invalid player ID');
    if (players.has(id)) throw failure('That player is already in this game', 409);
    name = typeof name === 'string' ? name.trim() : '';
    if (!name || name.length > 16 || /[\u0000-\u001f\u007f]/.test(name)) {
      throw failure('Enter a username (1–16 characters)');
    }
    if (players.size >= ROOM_CAPACITY) throw failure('Lobby full (2 players)', 409);
    const player = {id, name, ...spawn(), ...createWallet(), yaw: 0, pitch: 0, gunYaw: 0, gunPitch: 0,
      hp: 100, ammo: 6, weapon: 'revolver', hasShotgun: false,
      mods: {revolver: 'standard', shotgun: 'standard'}, ammoByWeapon: {revolver: 6, shotgun: 2},
      kills: 0, deaths: 0, reloadUntil: 0, deadUntil: 0, lastShot: 0, input: {},
      color: COLORS[players.size % COLORS.length]};
    setPowers(player, powers);
    applyAdminLoadout(player,loadout);
    players.set(id, player);
    return publicPlayer(player);
  }

  function removePlayer(id) {
    return players.delete(id);
  }

  function setPlayerPowers(id, powers) {
    const player = requirePlayer(id);
    setPowers(player, powers);
    return publicPlayer(player);
  }
  function setPlayerLoadout(id,loadout){return publicPlayer(applyAdminLoadout(requirePlayer(id),loadout));}

  function snapshot() {
    return {time: now(), players: [...players.values()].map(publicPlayer), cans:cans.map(can=>({...can})),
      clays: range.flights.map(flight => ({...flight}))};
  }

  function fire(player, data, time) {
    if (player.hp <= 0 || player.reloadUntil || player.ammo < WEAPONS[player.weapon].cost) return;
    const ready = player.weapon === 'shotgun'
      ? time - player.lastShot >= SHOTGUN_INTERVAL
      : firingMode(time, player.lastShot, data.fan).ready;
    if (!ready&&!player.powers.noCooldown) return;
    const ray = resolveBarrelShot(player, data);
    if (!ray) throw failure('Invalid muzzle pose');
    const fan = player.weapon === 'revolver' && firingMode(time, player.lastShot, data.fan).fan;
    if (Number.isFinite(data.gunYaw)) player.gunYaw = data.gunYaw;
    if (Number.isFinite(data.gunPitch)) {
      player.gunPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, data.gunPitch));
    }
    const discharge = player.weapon === 'shotgun'
      ? shotgunDischarge(player.ammo, data.both === true) : {cost: 1};
    player.lastShot = time;
    if (!player.powers.infiniteAmmo) player.ammo -= discharge.cost;
    player.ammoByWeapon[player.weapon] = player.ammo;

    const {origin, direction} = ray;
    const shotId = typeof data.shotId === 'string' ? data.shotId.slice(0, 64) : '';
    const profile = ammoProfile(player.weapon, player.mods);
    const rays = player.weapon === 'shotgun'
      ? shotgunPellets(origin, direction, data.barrelRight, shotId, discharge.barrel, profile)
      : [{origin, direction}];
    for (let index = 0; index < rays.length; index++) {
      bullets.push(launchProjectile(rays[index], profile, {shooter: player.id, weapon: player.weapon,
        shotId: player.weapon === 'shotgun' ? `${shotId}/${index}` : shotId,
        born: time, updatedAt: time}));
    }
    emit('shot', {id: player.id, weapon: player.weapon, bulletSize: profile.size, profile: {...profile},
      origin, direction, ...(player.weapon === 'shotgun' ? {pellets: rays} : {}), fan, shotId});
  }

  function command(id, action, data = {}) {
    const player = requirePlayer(id);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('Invalid game command');
    const time = now();
    switch (action) {
      case 'input': {
        const active = data.active === true;
        player.input = {x: active ? data.x : 0, z: active ? data.z : 0,
          yaw: data.yaw, pitch: data.pitch, jump: active && !!data.jump, active};
        player.gunYaw = Number.isFinite(data.gunYaw) ? data.gunYaw : player.yaw;
        player.gunPitch = Math.max(-1.35, Math.min(1.35,
          Number.isFinite(data.gunPitch) ? data.gunPitch : player.pitch));
        break;
      }
      case 'leave':
        removePlayer(id);
        break;
      case 'resetWalls':
        walls.reset();
        emit('wallReset', {});
        break;
      case 'modify':
        if (!canShop(player) || !ownsAmmo(player, player.weapon, data.mod)
            || !Object.hasOwn(AMMO_MODS[player.weapon], data.mod)) {
          throw failure('Buy ammo at GUNZ.', 403);
        }
        purchaseAmmo(player, player.weapon, data.mod);
        return publicPlayer(player);
      case 'buy':
      case 'shop': {
        const result = purchaseAmmo(player, data.weapon, data.mod, data.yaw, data.pitch);
        if (!result.ok) throw failure(result.message, 403);
        return {player: {...publicPlayer(player), ammoByWeapon: {...player.ammoByWeapon}},
          message: result.message, time};
      }
      case 'launch':
        if (player.hp > 0) range.launch(time, random);
        break;
      case 'pickup':
        if (!player.hasShotgun && canPickUpShotgun(player, data.yaw, data.pitch)) {
          player.hasShotgun = true;
          player.ammoByWeapon[player.weapon] = player.ammo;
          player.weapon = 'shotgun';
          player.ammo = player.ammoByWeapon.shotgun;
        }
        break;
      case 'equip':
        if (!Object.hasOwn(WEAPONS, data.weapon)) throw failure('Invalid weapon');
        if ((data.weapon !== 'shotgun' || player.hasShotgun) && player.hp > 0 && !player.reloadUntil) {
          player.ammoByWeapon[player.weapon] = player.ammo;
          player.weapon = data.weapon;
          player.ammo = player.ammoByWeapon[player.weapon];
        }
        break;
      case 'reload':
        if (!player.powers.infiniteAmmo && player.hp > 0 && !player.reloadUntil
            && player.ammo < ammoProfile(player.weapon, player.mods).capacity) {
          player.reloadUntil = time + WEAPONS[player.weapon].reload;
        }
        break;
      case 'fire':
        fire(player, data, time);
        break;
      default:
        throw failure('Unknown game command', 404);
    }
    return null;
  }

  function tick() {
    const time = now();
    respawnTrainingCans(cans,time);
    for (const broken of range.update(time)) emit('clayBreak', broken);
    for (const player of players.values()) {
      if (player.deadUntil && time >= player.deadUntil) {
        Object.assign(player, spawn(), {hp: 100, ammo: ammoProfile(player.weapon, player.mods).capacity,
          ammoByWeapon: {revolver: ammoProfile('revolver', player.mods).capacity,
            shotgun: ammoProfile('shotgun', player.mods).capacity}, deadUntil: 0, reloadUntil: 0});
      }
      if (player.reloadUntil && time >= player.reloadUntil) {
        player.ammo = ammoProfile(player.weapon, player.mods).capacity;
        player.ammoByWeapon[player.weapon] = player.ammo;
        player.reloadUntil = 0;
      }
      if (player.hp > 0) {
        const old = {x: player.x, z: player.z};
        move(player, player.input, .05);
        walls.collide(player, old);
      }
    }
    for (let index = bullets.length - 1; index >= 0; index--) {
      const bullet = bullets[index];
      const dt = Math.max(0, Math.min(.1, (time - bullet.updatedAt) / 1000));
      bullet.updatedAt = time;
      const clays = range.flights.map(flight => clayPose(flight, time));
      const targets = [...players.values()].filter(player => player.id !== bullet.shooter).concat(cans);
      for (const result of advanceProjectile(bullet, dt, targets, clays, walls)) {
        for (const change of result.wallChanges) emit('wallDamage', change);
        if (result.clayId) {
          const broken = range.breakClay(result.clayId, time, bullet.direction);
          if (broken) emit('clayBreak', broken);
        }
        const victim = players.get(result.hit)||cans.find(can=>can.id===result.hit);
        if (victim) {
          const damage = result.headshot ? bullet.profile.headDamage : bullet.profile.damage;
          const killed = applyDamage(victim, damage, time);
          const shooter = players.get(bullet.shooter);
          if (killed && shooter) shooter.kills++;
          result.killed = killed;
        }
        const earner = players.get(bullet.shooter);
        if (earner) awardBeans(earner, result);
        emit('impact', result);
      }
      if (!bullet.alive) bullets.splice(index, 1);
    }
    const state = snapshot();
    emit('state', state);
    return state;
  }

  return {addPlayer, removePlayer, setPlayerPowers,setPlayerLoadout, command, tick, snapshot,
    wallSnapshot: () => walls.snapshot()};
}
