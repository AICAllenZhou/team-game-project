import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomEngine, ROOM_CAPACITY} from '../room-engine.mjs';
import {SHOTGUN_PICKUP} from '../weapons.mjs';

function fixture(spawns = [[10, 5], [10, -5]]) {
  let time = 1000;
  const randomValues = spawns.flatMap(([x, z]) => [x / 36 + .5, z / 36 + .5]);
  const events = [];
  const engine = createRoomEngine({now: () => time, random: () => randomValues.shift() ?? .5,
    emit: (type, data) => events.push({type, data})});
  const player = id => engine.snapshot().players.find(p => p.id === id);
  const advance = (milliseconds = 50) => {time += milliseconds; return engine.tick();};
  return {engine, events, player, advance};
}

function shot(engine, player, height = 1) {
  engine.command(player.id, 'fire', {muzzle: {x: player.x, y: player.y + height, z: player.z},
    direction: {x: 0, y: 0, z: -1}, shotId: 'test-shot'});
}

test('room membership is bounded and snapshots do not expose mutable player state', () => {
  const {engine, player} = fixture();
  assert.equal(engine.addPlayer({id: 'one', name: ' One '}).name, 'One');
  engine.addPlayer({id: 'two', name: 'Two'});
  assert.equal(engine.snapshot().players.length, 2);
  const state = engine.snapshot();
  state.players[0].hp = 0;
  state.players[0].mods.revolver = 'small';
  state.players[0].powers.infiniteAmmo = true;
  state.players[0].ownedAmmo.push('shotgun:slug');
  state.players[0].beans = 9999;
  assert.equal(player('one').hp, 100);
  assert.equal(player('one').mods.revolver, 'standard');
  assert.equal(player('one').powers.infiniteAmmo, false);
  assert.equal(player('one').beans, 0);
  assert.equal(player('one').ownedAmmo.includes('shotgun:slug'), false);
  assert.throws(() => engine.addPlayer({id: 'one', name: 'Other'}), {status: 409});
  assert.throws(() => engine.addPlayer({id: 'bad', name: ' '}), {status: 400});
  for (let i = 2; i < ROOM_CAPACITY; i++) engine.addPlayer({id: String(i), name: String(i)});
  assert.throws(() => engine.addPlayer({id: 'full', name: 'Full'}), {status: 409});
  assert.equal(engine.removePlayer('two'), true);
  assert.equal(engine.removePlayer('two'), false);
  assert.throws(() => engine.command('two', 'input', {}), {status: 401});
  engine.addPlayer({id: 'replacement', name: 'Replacement'});
  assert.equal(engine.snapshot().players.length, ROOM_CAPACITY);
  assert.throws(() => engine.command('one', 'powers', {infiniteHp: true}), {status: 404});
});

test('host projectiles travel before applying damage, penetration, rewards and respawns', () => {
  const {engine, events, player, advance} = fixture();
  engine.addPlayer({id: 'one', name: 'One'});
  engine.addPlayer({id: 'two', name: 'Two'});
  shot(engine, player('one'));
  assert.equal(player('two').hp, 100, 'firing does not apply instant hitscan damage');
  advance(50);
  assert.equal(player('two').hp, 100, 'the projectile has not reached the target yet');
  advance(50);
  assert.equal(player('two').hp, 50);
  assert.equal(player('one').ammo, 5);
  shot(engine, player('one'));
  assert.equal(player('two').hp, 50, 'fire rate blocks the second immediate shot');
  advance(140);
  shot(engine, player('one'));
  advance(100);
  assert.equal(player('two').hp, 0);
  assert.equal(player('two').deaths, 1);
  assert.equal(player('one').kills, 1);
  assert.equal(player('one').beans, 125);
  assert.equal(events.filter(e => e.type === 'shot').length, 2);
  const hit = events.find(e => e.type === 'impact' && e.data.hit === 'two').data;
  assert.equal(hit.penetrated, true);
  assert.ok(hit.exitPoint);
  assert.ok(hit.holeRadius > 0);
  advance(3000);
  assert.equal(player('two').hp, 100);
  assert.equal(player('two').deadUntil, 0);
  assert.equal(player('two').deaths, 1);

  const second = fixture();
  second.engine.addPlayer({id: 'one', name: 'One'});
  second.engine.addPlayer({id: 'two', name: 'Two'});
  second.engine.setPlayerPowers('two', {infiniteHp: true});
  second.engine.setPlayerPowers('one', {infiniteAmmo: true, noRecoil: true});
  shot(second.engine, second.player('one'), 1.6);
  second.advance(100);
  assert.equal(second.player('two').hp, 100);
  assert.equal(second.player('one').ammo, 6);
  assert.equal(second.player('one').powers.noRecoil, true);
  second.engine.setPlayerPowers('two', {});
  second.advance(140);
  shot(second.engine, second.player('one'), 1.6);
  second.advance(100);
  assert.equal(second.player('two').hp, 0);
  assert.equal(second.events.findLast(e => e.type === 'impact').data.headshot, true);
});

test('ammo modifications, reloads and shotgun ownership remain authoritative', () => {
  const {engine, player, advance} = fixture([[SHOTGUN_PICKUP.x, SHOTGUN_PICKUP.z + 1]]);
  engine.addPlayer({id: 'one', name: 'One'});
  engine.command('one', 'equip', {weapon: 'shotgun'});
  assert.equal(player('one').weapon, 'revolver');
  assert.throws(() => engine.command('one', 'modify', {mod: 'small'}), {status: 403});
  shot(engine, player('one'));
  engine.command('one', 'reload');
  assert.ok(player('one').reloadUntil > 0);
  advance(1800);
  assert.equal(player('one').ammo, 6);
  assert.equal(player('one').reloadUntil, 0);

  const collector = player('one');
  const dx = SHOTGUN_PICKUP.x - .35 - collector.x;
  const dz = SHOTGUN_PICKUP.z - collector.z;
  engine.command('one', 'pickup', {yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(SHOTGUN_PICKUP.y - collector.y - 1.5, Math.hypot(dx, dz))});
  assert.equal(player('one').weapon, 'shotgun');
  assert.equal(player('one').hasShotgun, true);
  assert.throws(() => engine.command('one', 'modify', {mod: 'slug'}), {status: 403});
  engine.command('one', 'fire', {both: true, direction: {x: 0, y: 1, z: 0}});
  assert.equal(player('one').ammo, 0);
  engine.command('one', 'reload');
  engine.command('one', 'equip', {weapon: 'revolver'});
  assert.equal(player('one').weapon, 'shotgun', 'switching cannot interrupt a reload');
  engine.setPlayerPowers('one', {infiniteAmmo: true});
  assert.equal(player('one').reloadUntil, 0);
  assert.equal(player('one').ammo, 2);
  advance(180);
  engine.command('one', 'fire', {both: true, direction: {x: 0, y: 1, z: 0}});
  assert.equal(player('one').ammo, 2);
  assert.throws(() => engine.command('one', 'modify', {mod: 'invalid'}), {status: 403});
});

test('inactive players stop, clay cooldowns are shared and snapshots are emitted', () => {
  const {engine, player, advance, events} = fixture();
  engine.addPlayer({id: 'one', name: 'One'});
  engine.addPlayer({id: 'two', name: 'Two'});
  const start = player('one').x;
  engine.command('one', 'input', {x: 1, z: 0, active: true, yaw: 0});
  for (let i = 0; i < 10; i++) advance();
  assert.ok(player('one').x > start + 1);
  engine.command('one', 'input', {x: 1, z: 0, active: false, yaw: 0});
  for (let i = 0; i < 30; i++) advance();
  const stopped = player('one').x;
  for (let i = 0; i < 10; i++) advance();
  assert.ok(Math.abs(player('one').x - stopped) < .0001);
  engine.command('one', 'launch');
  engine.command('two', 'launch');
  assert.equal(engine.snapshot().clays.length, 1);
  advance(700);
  engine.command('two', 'launch');
  assert.equal(engine.snapshot().clays.length, 2);
  advance(5000);
  assert.equal(engine.snapshot().clays.length, 0);
  assert.equal(events.filter(e => e.type === 'clayBreak').length, 2);
  assert.equal(events.at(-1).type, 'state');
});

test('wall damage and beans are applied only when a projectile arrives', () => {
  const {engine, events, advance, player} = fixture([[13, -4]]);
  engine.addPlayer({id: 'one', name: 'One'});
  engine.command('one', 'fire', {muzzle: {x: 13, y: 1.5, z: -4},
    direction: {x: 1, y: 0, z: 0}});
  assert.deepEqual(engine.wallSnapshot(), [[], [], []]);
  advance();
  assert.ok(events.some(e => e.type === 'wallDamage'));
  assert.ok(engine.wallSnapshot()[0].length > 0);
  assert.equal(player('one').beans, engine.wallSnapshot()[0].length);
  engine.command('one', 'resetWalls');
  assert.deepEqual(engine.wallSnapshot(), [[], [], []]);
  assert.equal(events.at(-1).type, 'wallReset');
});

test('the shop requires counter access and returns authoritative wallet and ammo state', () => {
  const {engine, player, advance} = fixture([[-13, 8]]);
  engine.addPlayer({id: 'one', name: 'One'});
  assert.throws(() => engine.command('one', 'buy', {weapon: 'revolver', mod: 'standard'}),
    {status: 403, message: 'Come up to the counter.'});
  engine.command('one', 'input', {x: 0, z: -1, active: true, yaw: 0, pitch: 0});
  for (let i = 0; i < 16; i++) advance();
  engine.command('one', 'input', {x: 0, z: 0, active: false, yaw: 0, pitch: 0});
  for (let i = 0; i < 10; i++) advance();
  engine.command('one', 'fire', {direction: {x: 0, y: 1, z: 0}});
  assert.equal(player('one').ammo, 5);
  const bought = engine.command('one', 'buy', {weapon: 'revolver', mod: 'standard', yaw: 0, pitch: 0});
  assert.equal(bought.message, 'Loaded.');
  assert.equal(bought.player.ammoByWeapon.revolver, 6);
  assert.equal(bought.player.beans, 0);
  assert.equal(bought.time, engine.snapshot().time);
  assert.throws(() => engine.command('one', 'buy', {weapon: 'revolver', mod: 'small', beans: 9999}),
    {status: 403, message: 'Not enough beans.'});
  assert.throws(() => engine.command('one', 'modify', {mod: 'small'}), {status: 403});
  assert.equal(engine.command('one', 'modify', {mod: 'standard'}).ammo, 6);
  const viaAlias = engine.command('one', 'shop', {weapon: 'revolver', mod: 'standard'});
  viaAlias.player.ownedAmmo.push('revolver:small');
  viaAlias.player.ammoByWeapon.revolver = 100;
  assert.equal(player('one').ownedAmmo.includes('revolver:small'), false);
  assert.equal(player('one').ammo, 6);
});

test('spawning avoids the shop interior', () => {
  const {engine} = fixture([[-13, 4], [10, 5]]);
  const player = engine.addPlayer({id: 'one', name: 'One'});
  assert.equal(player.x, 10);
  assert.ok(Math.abs(player.z - 5) < 1e-9);
});


test('the original three cans stay in a two-player lobby with shared damage, bean rewards and respawns',()=>{
 const {engine,player,advance,events}=fixture([[-5,-8],[10,5]]);
 engine.addPlayer({id:'host',name:'Host'});engine.addPlayer({id:'guest',name:'Guest'});
 const cans=()=>engine.snapshot().cans;
 assert.deepEqual(cans().map(p=>[p.id,p.x,p.z]),[['dummy-0',-5,-12],['dummy-1',0,-9],['dummy-2',5,-12]]);
 assert.throws(()=>engine.addPlayer({id:'third',name:'Third'}),{status:409});
 shot(engine,player('host'));advance(50);assert.equal(cans()[0].hp,50);
 advance(200);shot(engine,player('host'));advance(50);assert.equal(cans()[0].hp,0);
 assert.equal(player('host').beans,125);assert.equal(player('guest').beans,0);
 assert.equal(events.findLast(e=>e.type==='impact').data.hit,'dummy-0');
 assert.equal(events.findLast(e=>e.type==='impact').data.killed,true);
 advance(3000);assert.equal(cans()[0].hp,100);assert.equal(cans().length,3);
 const snapshot=cans();snapshot[0].hp=0;assert.equal(cans()[0].hp,100);
});

test('admin loadout grants weapons and ammo without spending beans or refilling on every heartbeat',()=>{
 const {engine,player}=fixture();engine.addPlayer({id:'admin',name:'Admin'});
 assert.throws(()=>engine.command('admin','loadout',{allWeapons:true}),{status:404});
 engine.command('admin','input',{active:false,loadout:{hasShotgun:true},powers:{noCooldown:true}});assert.equal(player('admin').hasShotgun,false);
 const loadout={revision:'one',hasShotgun:true,mods:{revolver:'small',shotgun:'slug'}};
 engine.setPlayerLoadout('admin',loadout);assert.equal(player('admin').hasShotgun,true);assert.equal(player('admin').mods.shotgun,'slug');assert.equal(player('admin').beans,0);
 const initial=player('admin').ammo;shot(engine,player('admin'));engine.setPlayerLoadout('admin',loadout);assert.equal(player('admin').ammo,initial-1);
 assert.ok(player('admin').ownedAmmo.includes('revolver:small'));assert.equal(engine.snapshot().cans.length,3);
});

test('no cooldown bypasses timing for both guns but still requires ammo and completed reloads',()=>{
 for(const weapon of ['revolver','shotgun']){
  const {engine,player,events}=fixture();engine.addPlayer({id:'admin',name:'Admin'});
  engine.setPlayerLoadout('admin',{revision:'one',hasShotgun:true,mods:{}});engine.command('admin','equip',{weapon});
  shot(engine,player('admin'));shot(engine,player('admin'));assert.equal(events.filter(e=>e.type==='shot').length,1);
  engine.setPlayerPowers('admin',{noCooldown:true,fullAuto:true});shot(engine,player('admin'));assert.equal(events.filter(e=>e.type==='shot').length,2);
  engine.command('admin','reload');shot(engine,player('admin'));assert.equal(events.filter(e=>e.type==='shot').length,2);
  engine.setPlayerPowers('admin',{noCooldown:true,infiniteAmmo:true});shot(engine,player('admin'));shot(engine,player('admin'));assert.equal(events.filter(e=>e.type==='shot').length,4);
 }
});
