import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomEngine,IMPACTS_PER_WINDOW} from '../room-engine.mjs';
import {createVoxelWalls} from '../voxel-walls.mjs';
import {shotgunPellets} from '../weapons.mjs';
import {launchProjectile,advanceProjectile} from '../projectile-physics.mjs';

function fixture(){
 let time=10000;const events=[],spawns=[13,-4,10,5].map(v=>v/36+.5);
 const engine=createRoomEngine({now:()=>time,random:()=>spawns.shift()??.5,emit:(type,data)=>events.push({type,data})});
 engine.addPlayer({id:'admin',name:'Admin',powers:{infiniteAmmo:true,noCooldown:true,fullAuto:true}});
 engine.addPlayer({id:'guest',name:'Guest'});
 engine.setPlayerLoadout('admin',{revision:'birdshot',hasShotgun:true,mods:{shotgun:'birdshot'}});
 engine.command('admin','equip',{weapon:'shotgun'});
 return {engine,events,step(){time+=50;engine.tick();},player(id='admin'){return engine.snapshot().players.find(p=>p.id===id);}};
}
function fire(f,shotId,direction={x:1,y:0,z:0}){
 const p=f.player();f.engine.command('admin','fire',{shotId,both:true,muzzle:{x:p.x,y:p.y+1.5,z:p.z},direction,barrelRight:{x:0,y:0,z:1}});
 return f.events.findLast(e=>e.type==='shot').data;
}

test('birdshot uses a compact seed packet and preserves every authoritative pellet and changed cell',()=>{
 const f=fixture(),shot=fire(f,'all-160');
 assert.equal(shot.profile.pellets,80);assert.equal(shot.barrel,2);assert.equal(shot.pellets,undefined);
 assert.ok(JSON.stringify(shot).length<1000,'Shot does not transmit 160 origin/direction objects');
 const rays=shotgunPellets(shot.origin,shot.direction,shot.barrelRight,shot.shotId,shot.barrel,shot.profile);
 assert.equal(rays.length,160);
 const expected=createVoxelWalls();
 for(let i=rays.length-1;i>=0;i--)advanceProjectile(launchProjectile(rays[i],shot.profile,{weapon:'shotgun'}),.05,[],[],expected);
 f.step();
 assert.deepEqual(f.engine.wallSnapshot(),expected.snapshot(),'Every seeded pellet contributes damage, even when cosmetic impacts are sampled');
 const updates=f.events.filter(e=>e.type==='wallDamage');assert.ok(updates.length>0);
 assert.equal(new Set(updates.map(e=>e.data.wallId)).size,updates.length,'At most one update per wall in a simulation tick');
 const remote=createVoxelWalls();for(const update of updates)remote.apply(update.data.wallId,update.data.removed);
 assert.deepEqual(remote.snapshot(),expected.snapshot(),'Batched updates retain every removed cell for the other player');
 assert.equal(f.player().beans,expected.snapshot().flat().length);
 assert.ok(f.events.filter(e=>e.type==='impact').length<=IMPACTS_PER_WINDOW);
 assert.ok(f.events.filter(e=>e.type==='impact').every(e=>e.data.wallChanges.length===0));
});

test('sustained no-cooldown double birdshot stays bounded without dropping shots or movement input',()=>{
 const f=fixture();let shots=0,totalBytes=0,largestTick=0;
 // Three double shots every host tick exceeds the 20 Hz admin automatic rate.
 // The second half aims into open air, exercising the live-projectile queue.
 for(let tick=0;tick<120;tick++){
  f.events.length=0;
  f.engine.command('guest','input',{active:true,x:1,z:0,yaw:0});
  for(let shot=0;shot<3;shot++)fire(f,`${tick}-${shot}`,tick<60?{x:1,y:0,z:0}:{x:0,y:1,z:0});
  f.step();shots+=f.events.filter(e=>e.type==='shot').length;
  const cosmetic=f.events.filter(e=>e.type==='impact');assert.ok(cosmetic.length<=IMPACTS_PER_WINDOW);
  const changed=f.events.filter(e=>e.type==='wallDamage');assert.equal(new Set(changed.map(e=>e.data.wallId)).size,changed.length);
  const bytes=JSON.stringify(f.events).length;largestTick=Math.max(largestTick,bytes);totalBytes+=bytes;
  assert.ok(f.player('guest').x>10,'Guest movement input is applied while firing');
 }
 assert.equal(shots,360,'All 360 double shots are accepted, simulating 57,600 pellets');
 assert.equal(f.engine.snapshot().players.length,2);assert.ok(f.player('guest').x>15,'Guest movement continues throughout the burst');
 assert.ok(largestTick<30000,`Worst tick payload ${largestTick} bytes`);
 assert.ok(totalBytes<1500000,`Six-second traffic ${totalBytes} bytes`);
 f.engine.command('guest','input',{active:false});
 for(let i=0;i<40;i++)f.step();
 const stopped=f.player('guest').x;for(let i=0;i<10;i++)f.step();
 assert.ok(Math.abs(f.player('guest').x-stopped)<1e-6,'Release input stops movement after the burst');
 f.engine.command('admin','resetWalls');assert.ok(f.engine.wallSnapshot().every(cells=>cells.length===0));
 f.events.length=0;f.step();assert.ok(!f.events.some(e=>e.type==='wallDamage'),'A reset cannot receive stale queued destruction');
});

test('collision sweeps query only the distance a pellet can actually cover this tick',()=>{
 const limits=[],walls={mapId:'duel',trace(origin,direction,max){limits.push(max);return null;}};
 const projectile=launchProjectile({origin:{x:0,y:20,z:0},direction:{x:1,y:0,z:0}},{speed:220,range:70,damage:2,headDamage:2,penetration:1},{weapon:'shotgun'});
 advanceProjectile(projectile,.05,[],[],walls);
 assert.equal(projectile.position.x,11);assert.ok(limits.length>0);assert.ok(limits.every(limit=>limit<=11+1e-7));
});

test('bow release can match the last displayed charge but cannot exceed authoritative draw time',()=>{
 const f=fixture();f.engine.setPlayerLoadout('admin',{revision:'bow',hasBow:true});f.engine.command('admin','equip',{weapon:'bow'});
 f.engine.command('admin','charge',{active:true});for(let i=0;i<12;i++)f.step();
 f.engine.command('admin','fire',{direction:{x:0,y:1,z:0},charge:.4});
 assert.equal(f.events.findLast(e=>e.type==='shot').data.profile.charge,.4);
 f.engine.command('admin','charge',{active:true});f.step();
 f.engine.command('admin','fire',{direction:{x:0,y:1,z:0},charge:1});
 assert.ok(f.events.findLast(e=>e.type==='shot').data.profile.charge<.05,'Claiming full draw cannot boost charge');
});


test('a target exactly at the swept segment end is hit in that tick',()=>{
 const projectile=launchProjectile({origin:{x:0,y:20,z:0},direction:{x:1,y:0,z:0}},{speed:220,range:70,damage:2,headDamage:2,penetration:1},{weapon:'shotgun'});
 const hits=advanceProjectile(projectile,.05,[{id:'edge',x:11.42,y:19.1,z:0,hp:100}],[],null);
 assert.equal(hits[0]?.hit,'edge');assert.equal(projectile.alive,false);
});
