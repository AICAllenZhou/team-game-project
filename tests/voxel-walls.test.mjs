import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoxelWalls,WALLS,CELL} from '../voxel-walls.mjs';
import {traceShot} from '../simulation.mjs';
const origin={x:12,y:1.47,z:-4.53},direction={x:1,y:0,z:0};
test('solid walls stop shots; repeated small chips make a genuine through-hole',()=>{
 const w=createVoxelWalls(),player={id:'behind',x:17,y:0,z:origin.z,hp:100};
 let hit=traceShot(origin,direction,[player],[],w);assert.equal(hit.surface,'voxel');assert.equal(hit.wallId,0);assert.equal(hit.hit,null);
 const first=w.damage(hit);assert.ok(first.length>1&&first.length<=7);
 hit=traceShot(origin,direction,[player],[],w);assert.equal(hit.surface,'voxel');assert.ok(hit.distance>3);
 w.damage(hit);hit=traceShot(origin,direction,[player],[],w);assert.equal(hit.hit,'behind');
 assert.equal(traceShot({...origin,z:origin.z+.7},direction,[],[],w).surface,'voxel');
});
test('holes synchronize idempotently and new worlds remain intact',()=>{
 const a=createVoxelWalls(),b=createVoxelWalls();const h=a.trace(origin,direction),removed=a.damage(h);b.apply(h.wallId,removed);const version=b.revision;b.apply(h.wallId,removed);assert.equal(b.revision,version);assert.deepEqual(a.snapshot(),b.snapshot());
 assert.ok(createVoxelWalls().trace(origin,direction).distance<a.trace(origin,direction).distance);
});
test('voxel traversal handles reverse rays, parallel misses and internal origins',()=>{
 const w=createVoxelWalls();assert.ok(w.trace({x:17,y:1,z:-5},{x:-1,y:0,z:0}));assert.equal(w.trace({x:12,y:5,z:-5},direction),null);
 assert.equal(w.trace({x:15.1,y:1,z:-5},direction).distance,0);
 const p={x:15.1,y:0,z:-5,vx:1,vz:0};w.collide(p,{x:14,z:-5});assert.equal(p.x,14);
});
