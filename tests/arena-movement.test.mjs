import test from 'node:test';
import assert from 'node:assert/strict';
import {arenaBlocks,duelSpawn,DUEL_BOUNDS,DUEL_CELL,DUEL_SOLIDS,DUEL_FLOOR} from '../arena.mjs';
import {createVoxelWalls} from '../voxel-walls.mjs';
import {move,traceShot} from '../simulation.mjs';
const near=(a,b,e=.005)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function fixture(blocks,map='practice'){
 const world=createVoxelWalls(map);world.walls.splice(0,world.walls.length,...blocks.map(b=>({...b,cell:b.cell||.3,cells:new Uint8Array(b.nx*b.ny*b.nz).fill(1)})));return world;
}
function step(world,p,input,dt=.05){const old={...p};move(p,{yaw:0,...input},dt,{mapId:world.mapId});world.collide(p,old);}
const player=()=>({x:0,y:0,z:0,vx:0,vy:0,vz:0,yaw:0});
test('spawn cover hides the entire opponent from both eye positions',()=>{
 const w=createVoxelWalls('duel');
 for(const side of [0,1]){
  const a=duelSpawn(side),b=duelSpawn(1-side),eye={x:a.x,y:a.y+1.5,z:a.z};
  for(const y of [.1,.9,1.8,2.05])for(const z of [-.42,0,.42]){
   const d={x:b.x-eye.x,y:b.y+y-eye.y,z:b.z+z-eye.z},length=Math.hypot(d.x,d.y,d.z);for(const k of ['x','y','z'])d[k]/=length;
   const hit=w.trace(eye,d,length);assert.ok(hit&&hit.distance<3.1,'Opponent exposed at spawn');
  }
 }
});
test('arena cover and platforms are rotationally symmetric and fit exact bounds',()=>{
 const boxes=arenaBlocks(),key=w=>[w.x,w.y,w.z,w.nx,w.ny,w.nz].map(n=>Math.round(n*1000)/1000).join(','),keys=new Set(boxes.map(key));
 for(const w of boxes){assert.ok(keys.has(key({...w,x:-w.x-w.nx*w.cell,z:-w.z-w.nz*w.cell})),`Asymmetric box ${key(w)}`);assert.ok(w.x>=-DUEL_BOUNDS.x-.001&&w.x+w.nx*w.cell<=DUEL_BOUNDS.x+.001);}
 const cover=boxes.filter(w=>w.color===0xe08a36);assert.equal(cover.length,10);assert.ok(boxes.every(w=>w.y===0));
 for(const w of boxes){const opposite=boxes.find(other=>key(other)===key({...w,x:-w.x-w.nx*w.cell,z:-w.z-w.nz*w.cell}));assert.deepEqual(w.profile.heights,[...opposite.profile.heights].reverse(),'Mirrored ramp and barrier cells match exactly');}
});
test('single floor remnants are stepped over at server and render rates',()=>{
 for(const cell of [.14,.15,.3])for(const hz of [20,60,144]){
  const w=fixture([{x:1,y:0,z:-cell/2,nx:1,ny:1,nz:1,cell}]),p=player();let highest=0;
  for(let i=0;i<hz;i++){step(w,p,{x:1},1/hz);highest=Math.max(highest,p.y);}
  assert.ok(p.x>4,`${cell} voxel blocked movement at ${hz} Hz`);near(highest,cell);near(p.y,0);
 }
});
test('continuous low rubble and staircases can be walked without jumping',()=>{
 const w=fixture([0,1,2].map(i=>({x:1+i*.6,y:0,z:-.6,nx:2,ny:i+1,nz:4}))),p=player();
 let top=0;for(let i=0;i<25;i++){step(w,p,{x:1});top=Math.max(top,p.y);}assert.ok(p.x>4.5);near(top,.9);
});
test('tall walls stop the normal component but allow sliding',()=>{
 for(const hz of [20,60,144]){
  const w=fixture([{x:1,y:0,z:-3,nx:1,ny:10,nz:30}]),p=player();
  for(let i=0;i<hz;i++)step(w,p,{x:1,z:1},1/hz);
  assert.ok(p.x>.71&&p.x<.73);assert.ok(p.z>2.8);assert.equal(p.vx,0);assert.ok(p.vz>3);
 }
});
test('high ledges and low ceilings cannot be auto-climbed',()=>{
 for(const blocks of [
  [{x:1,y:0,z:-.6,nx:2,ny:2,nz:4}],
  [{x:1,y:0,z:-.6,nx:2,ny:1,nz:4},{x:1,y:2,z:-.6,nx:2,ny:1,nz:4}]
 ]){
  const w=fixture(blocks),p=player();for(let i=0;i<20;i++)step(w,p,{x:1});assert.ok(p.x<.73);near(p.y,0);
 }
});
test('tiny platform holes retain support but larger holes fall to the permanent floor',()=>{
 const w=fixture([{x:-1.5,y:1.2,z:-1.5,nx:10,ny:1,nz:10}],'duel'),p={...player(),y:1.5},floor=w.walls[0];
 p.x=p.z=.15;floor.cells[5*10+5]=0;
 for(let i=0;i<20;i++)step(w,p,{});near(p.y,1.5);
 for(let z=4;z<=6;z++)for(let x=4;x<=6;x++)floor.cells[z*10+x]=0;
 for(let i=0;i<20;i++)step(w,p,{});near(p.y,DUEL_FLOOR);
});
test('jumping under an overhang cannot pass through it',()=>{
 const w=fixture([{x:-.6,y:2.1,z:-.6,nx:4,ny:1,nz:4}]),p=player();let peak=0;
 for(let i=0;i<20;i++){step(w,p,{jump:i===0});peak=Math.max(peak,p.y);}assert.ok(peak<=.301);near(p.y,0);
});
test('swept movement cannot tunnel through a thin intact wall',()=>{
 const w=fixture([{x:1,y:0,z:-1.5,nx:1,ny:10,nz:10}]),p={...player(),x:4,vx:4};w.collide(p,{x:0,y:0,z:0});assert.ok(p.x<.73);
});
test('both spawns have two clear flank routes and can ascend the central ramp',()=>{
 for(const index of [0,1])for(const hz of [20,60,144])for(const flank of [-1,1]){
  const w=createVoxelWalls('duel'),p=duelSpawn(index),side=index===0?-1:1;
  const route=[[side*13.5,flank*3.3],[side*8.7,flank*3.3],[side*8.7,0],[0,0],[side*8.7,0],[side*8.7,flank*3.3],[side*13.5,flank*3.3],[side*13.5,0]];
  let peak=0;
  for(const [x,z] of route){
   let reached=false;
   for(let i=0;i<hz*5;i++){
    const dx=x-p.x,dz=z-p.z;if(Math.hypot(dx,dz)<.12){reached=true;p.vx=p.vz=0;break;}
    const length=Math.max(.6,Math.hypot(dx,dz));step(w,p,{x:dx/length,z:dz/length},1/hz);peak=Math.max(peak,p.y);
   }
   assert.ok(reached,`Spawn ${index} stuck at ${p.x},${p.y},${p.z} heading to ${x},${z}`);
  }near(p.y,0);near(peak,2.4);
 }
});

test('reference arena uses player-sized cover, half-sized cells and an indestructible floor',()=>{
 near(DUEL_BOUNDS.x*2,31.2);near(DUEL_BOUNDS.z*2,21.6);near(duelSpawn(0).x,-13.5);
 const blocks=arenaBlocks();assert.ok(blocks.every(b=>b.cell===.15));assert.equal(DUEL_CELL,.15);
 assert.equal(DUEL_SOLIDS.length,5);const floor=DUEL_SOLIDS[0];near(floor.y+floor.h/2,0);
 assert.ok(blocks.every(b=>b.y>=0),'Floor is not included in destructible blocks');
 const w=createVoxelWalls('duel');for(const b of w.walls)b.cells.fill(0);
 const p=duelSpawn(0);for(let i=0;i<30;i++)step(w,p,{});near(p.y,0);near(w.floorAt(0,0),0);
});

test('ramp voxel profiles and untouched snapshots survive damage and reset',()=>{
 const w=createVoxelWalls('duel'),before=w.walls.map(b=>b.cells.slice());assert.ok(w.snapshot().every(indices=>indices.length===0));
 const ramp=w.walls.find(b=>b.profile?.axis==='x');assert.ok(ramp.cells.some(c=>!c));
 const hit=w.trace({x:0,y:5,z:0},{x:0,y:-1,z:0});assert.ok(hit);const removed=w.damage(hit,2);assert.ok(removed.length>0);assert.equal(w.snapshot().flat().length,removed.length);
 w.reset();assert.ok(w.snapshot().every(indices=>indices.length===0));for(let i=0;i<before.length;i++)assert.deepEqual(w.walls[i].cells,before[i]);
});


test('floor and perimeter stop shots without entering the destruction grid',()=>{
 const world=createVoxelWalls('duel');
 for(const [origin,direction,axis,expected] of [
  [{x:-13.5,y:1.5,z:0},{x:0,y:-1,z:0},'y',0],
  [{x:0,y:4,z:0},{x:1,y:0,z:0},'x',DUEL_BOUNDS.x],
  [{x:0,y:4,z:0},{x:0,y:0,z:-1},'z',-DUEL_BOUNDS.z]
 ]){const hit=traceShot(origin,direction,[],[],world);assert.equal(hit.surface,'world');assert.equal(hit.wallId,undefined);near(hit.point[axis],expected);assert.deepEqual(world.damage(hit,8),[]);}
 assert.ok(world.snapshot().every(cells=>cells.length===0));
});
