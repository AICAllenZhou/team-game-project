import {MAPS,duelSpawn} from './arena.mjs';
import {chargedArrow,BOW_CHARGE_MS} from './weapons.mjs';
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
    kills, deaths, reloadUntil, deadUntil, color, hasShotgun, hasBow, secondary, spawnSerial, chargeAt, mods, powers, beans, ownedAmmo} = player;
  return {id, name, x, y, z, yaw, pitch, gunYaw, gunPitch, hp, ammo, weapon,
    kills, deaths, reloadUntil, deadUntil, color, hasShotgun,hasBow,secondary,spawnSerial,chargeAt,
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
  let mapId='practice',mapRevision=null,mapChangedAt=0,epoch=0,round=1,phase='waiting',until=0;
  const scores=new Map(),bleeds=[];
  function resetPlayers(){
    let index=0;epoch++;bullets.length=0;bleeds.length=0;walls.reset();range.flights.length=0;
    for(const player of players.values()){
      Object.assign(player,mapId==='duel'?duelSpawn(index++):spawn(),{hp:100,deadUntil:0,reloadUntil:0,lastShot:-Infinity,input:{},chargeAt:null,spawnSerial:epoch});
      for(const weapon of Object.keys(WEAPONS))player.ammoByWeapon[weapon]=ammoProfile(weapon,player.mods).capacity;
      player.ammo=player.ammoByWeapon[player.weapon];
    }
    emit('wallReset',{mapId,walls:walls.snapshot()});
  }
  function intermission(){resetPlayers();phase=players.size===2?'intermission':'waiting';until=phase==='intermission'?now()+3000:0;}
  function setMap(config){
    if(!config?.revision||config.changedAt&&config.changedAt<mapChangedAt||config.revision===mapRevision||!Object.hasOwn(MAPS,config.id))return;
    mapRevision=config.revision;mapChangedAt=config.changedAt||mapChangedAt;mapId=config.id;walls.setMap(mapId);scores.clear();round=1;
    for(const p of players.values()){scores.set(p.id,0);if(mapId==='duel'){p.secondary='shotgun';p.hasShotgun=true;p.hasBow=false;}}
    intermission();emit('state',snapshot());
  }
  function finishRound(victim,shooter){
    if(mapId!=='duel'||phase!=='active')return;
    const winner=shooter?.id!==victim.id?shooter:[...players.values()].find(p=>p.id!==victim.id);
    if(winner)scores.set(winner.id,(scores.get(winner.id)||0)+1);
    phase='death';until=now()+1800;bleeds.length=0;
    for(const bullet of bullets)bullet.alive=false;
    for(const p of players.values()){p.input={};p.chargeAt=null;}
  }
  function damagePlayer(victim,damage,shooter){
    const killed=applyDamage(victim,damage,now());
    if(killed){if(shooter)shooter.kills++;if(players.has(victim.id))finishRound(victim,shooter);}
    return killed;
  }

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
      hp: 100, ammo: 6, weapon: 'revolver', hasShotgun: false,hasBow:false,secondary:'shotgun',spawnSerial:0,chargeAt:null,
      mods: {revolver: 'standard', shotgun: 'standard',bow:'standard'}, ammoByWeapon: {revolver: 6, shotgun: 2,bow:1},
      kills: 0, deaths: 0, reloadUntil: 0, deadUntil: 0, lastShot: 0, input: {},
      color: COLORS[players.size % COLORS.length]};
    setPowers(player, powers);
    applyAdminLoadout(player,loadout);
    players.set(id, player);scores.set(id,0);if(mapId==='duel'){player.hasShotgun=true;intermission();}
    return publicPlayer(player);
  }

  function removePlayer(id) {
    const removed=players.delete(id);scores.delete(id);if(mapId==='duel')intermission();return removed;
  }

  function setPlayerPowers(id, powers) {
    const player = requirePlayer(id);
    setPowers(player, powers);
    return publicPlayer(player);
  }
  function setPlayerLoadout(id,loadout){return publicPlayer(applyAdminLoadout(requirePlayer(id),loadout));}

  function snapshot() {
    return {time: now(),mapId,mapRevision,duel:mapId==='duel'?{phase,until,round,epoch,scores:Object.fromEntries(scores)}:null, players: [...players.values()].map(publicPlayer), cans:mapId==='duel'?[]:cans.map(can=>({...can})),
      clays: range.flights.map(flight => ({...flight}))};
  }

  function fire(player, data, time) {
    if (mapId==='duel'&&phase!=='active')return;
    if (player.hp <= 0 || player.reloadUntil || player.ammo < WEAPONS[player.weapon].cost) return;
    const ready = player.weapon === 'bow'? time-player.lastShot>=WEAPONS.bow.reload : player.weapon === 'shotgun'
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
    const profile = player.weapon==='bow'?chargedArrow(player.chargeAt==null?0:(time-player.chargeAt)/BOW_CHARGE_MS):ammoProfile(player.weapon, player.mods);player.chargeAt=null;
    if(player.weapon==='bow'&&!player.powers.infiniteAmmo)player.reloadUntil=time+WEAPONS.bow.reload;
    const rays = player.weapon === 'shotgun'
      ? shotgunPellets(origin, direction, data.barrelRight, shotId, discharge.barrel, profile)
      : [{origin, direction}];
    for (let index = 0; index < rays.length; index++) {
      bullets.push(launchProjectile(rays[index], profile, {shooter: player.id, weapon: player.weapon,
        shotId: player.weapon === 'shotgun' ? `${shotId}/${index}` : shotId,
        born: time, updatedAt: time}));
    }
    emit('shot', {id: player.id, weapon: player.weapon, bulletSize: profile.size, profile: {...profile},
      origin, direction,barrel:discharge.barrel, ...(player.weapon === 'shotgun' ? {pellets: rays} : {}), fan, shotId});
  }

  function command(id, action, data = {}) {
    const player = requirePlayer(id);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('Invalid game command');
    const time = now();
    switch (action) {
      case 'input': {
        const active = data.active === true && (mapId!=='duel'||phase==='active');
        if(!active)player.chargeAt=null;
        player.input = {x: active ? data.x : 0, z: active ? data.z : 0,
          yaw: data.yaw, pitch: data.pitch, jump: active && !!data.jump, active};
        player.gunYaw = Number.isFinite(data.gunYaw) ? data.gunYaw : player.yaw;
        player.gunPitch = Math.max(-1.35, Math.min(1.35,
          Number.isFinite(data.gunPitch) ? data.gunPitch : player.pitch));
        break;
      }
      case 'charge':
        if(player.weapon==='bow'&&player.hp>0&&!player.reloadUntil&&(mapId!=='duel'||phase==='active'))player.chargeAt=data.active===true?(player.chargeAt??time):null;
        break;
      case 'loadout':
        if(mapId!=='duel'||!['intermission','waiting'].includes(phase))throw failure('Choose your loadout between rounds.',409);
        if(!['shotgun','bow'].includes(data.secondary)||!Object.hasOwn(AMMO_MODS.revolver,data.revolver)||!Object.hasOwn(AMMO_MODS.shotgun,data.shotgun||'standard'))throw failure('Invalid loadout');
        player.secondary=data.secondary;player.hasShotgun=data.secondary==='shotgun';player.hasBow=data.secondary==='bow';
        player.mods={revolver:data.revolver,shotgun:data.shotgun||'standard',bow:'standard'};
        player.weapon=data.equip==='revolver'?'revolver':data.secondary;
        for(const weapon of Object.keys(WEAPONS))player.ammoByWeapon[weapon]=ammoProfile(weapon,player.mods).capacity;
        player.ammo=player.ammoByWeapon[player.weapon];player.reloadUntil=0;player.chargeAt=null;return publicPlayer(player);
      case 'leave':
        removePlayer(id);
        break;
      case 'resetWalls':
        if(mapId==='duel')throw failure('Arena resets between rounds.',403);
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
        if (mapId!=='duel'&&!player.hasShotgun && canPickUpShotgun(player, data.yaw, data.pitch)) {
          player.hasShotgun = true;
          player.ammoByWeapon[player.weapon] = player.ammo;
          player.weapon = 'shotgun';
          player.ammo = player.ammoByWeapon.shotgun;
        }
        break;
      case 'equip':
        if (!Object.hasOwn(WEAPONS, data.weapon)) throw failure('Invalid weapon');
        if ((data.weapon !== 'shotgun' || player.hasShotgun) && (data.weapon !== 'bow'||player.hasBow) && (mapId!=='duel'||data.weapon==='revolver'||data.weapon===player.secondary) && player.hp > 0 && !player.reloadUntil) {
          player.ammoByWeapon[player.weapon] = player.ammo;
          player.weapon = data.weapon;player.chargeAt=null;
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
    if(mapId==='duel'){if(phase==='death'&&time>=until){round++;intermission();}else if(phase==='intermission'&&time>=until){phase='active';until=0;}}
    respawnTrainingCans(cans,time);
    for (const broken of range.update(time)) emit('clayBreak', broken);
    for (const player of players.values()) {
      if (mapId!=='duel'&&player.deadUntil && time >= player.deadUntil) {
        Object.assign(player, spawn(), {hp: 100, ammo: ammoProfile(player.weapon, player.mods).capacity,
          ammoByWeapon: {revolver: ammoProfile('revolver', player.mods).capacity,
            shotgun: ammoProfile('shotgun', player.mods).capacity,bow:1}, deadUntil: 0, reloadUntil: 0});
      }
      if (player.reloadUntil && time >= player.reloadUntil) {
        player.ammo = ammoProfile(player.weapon, player.mods).capacity;
        player.ammoByWeapon[player.weapon] = player.ammo;
        player.reloadUntil = 0;
      }
      if (player.hp > 0 && (mapId!=='duel'||phase==='active')) {
        const old = {x: player.x,y:player.y, z: player.z};
        move(player, player.input, .05,{mapId});
        walls.collide(player, old);if(mapId==='duel'&&player.y<=-3.99)damagePlayer(player,100,null);
      }
    }
    for(let i=bleeds.length-1;i>=0;i--){
      const bleed=bleeds[i];if(!bleed)continue;const victim=players.get(bleed.target)||cans.find(c=>c.id===bleed.target);
      if(!victim||victim.hp<=0){bleeds.splice(i,1);continue;}
      if(time>=bleed.next){const killed=damagePlayer(victim,5,players.get(bleed.shooter));if(killed&&players.get(bleed.shooter))awardBeans(players.get(bleed.shooter),{hit:victim.id,killed:true});bleed.left--;bleed.next+=400;emit('bleed',{id:victim.id,damage:5,killed});if(killed||!bleed.left){const pos=bleeds.indexOf(bleed);if(pos>=0)bleeds.splice(pos,1);}}
    }
    for (let index = bullets.length - 1; index >= 0; index--) {
      const bullet = bullets[index];if(!bullet.alive){bullets.splice(index,1);continue;}
      const dt = Math.max(0, Math.min(.1, (time - bullet.updatedAt) / 1000));
      bullet.updatedAt = time;
      const clays = range.flights.map(flight => clayPose(flight, time));
      const targets = [...players.values()].filter(player => player.id !== bullet.shooter).concat(mapId==='duel'?[]:cans);
      for (const result of advanceProjectile(bullet, dt, targets, clays, walls)) {
        for (const change of result.wallChanges) emit('wallDamage', change);
        if (result.clayId) {
          const broken = range.breakClay(result.clayId, time, bullet.direction);
          if (broken) emit('clayBreak', broken);
        }
        const victim = players.get(result.hit)||cans.find(can=>can.id===result.hit);
        if (victim) {
          const shooter=players.get(bullet.shooter);
          result.killed=damagePlayer(victim,result.damage,shooter);
          if(bullet.profile.arrow&&!result.killed&&!victim.powers?.infiniteHp){
            const existing=bleeds.find(b=>b.target===victim.id);if(existing)Object.assign(existing,{left:3,next:time+400,shooter:bullet.shooter});
            else bleeds.push({target:victim.id,shooter:bullet.shooter,left:3,next:time+400});
          }
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

  return {addPlayer, removePlayer,setMap, setPlayerPowers,setPlayerLoadout, command, tick, snapshot,
    wallSnapshot: () => walls.snapshot()};
}
