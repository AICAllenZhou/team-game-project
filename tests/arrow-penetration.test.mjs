import test from 'node:test';
import assert from 'node:assert/strict';
import {chargedArrow} from '../weapons.mjs';
import {launchProjectile,advanceProjectile,advanceVisualProjectile} from '../projectile-physics.mjs';
import {createVoxelWalls} from '../voxel-walls.mjs';

test('more draw drills more blocks and can continue through multiple cans',()=>{
 const ray={origin:{x:14,y:1,z:-5},direction:{x:1,y:0,z:0}},counts=[];
 for(const charge of [0,.1,.25,1]){
  const walls=createVoxelWalls(),p=launchProjectile(ray,chargedArrow(charge),{weapon:'bow'}),hits=advanceProjectile(p,.2,[],[],walls);
  counts.push(hits.reduce((n,h)=>n+h.wallChanges.reduce((n,c)=>n+c.removed.length,0),0));
 }
 assert.deepEqual(counts,[0,1,3,4]);
 for(const dt of [.01,.05]){
  const p=launchProjectile({origin:{x:10,y:1.25,z:8},direction:{x:0,y:0,z:-1}},chargedArrow(1),{weapon:'bow'}),cans=[{id:'a',x:10,y:0,z:3,hp:100},{id:'b',x:10,y:0,z:0,hp:100}],hits=[];
  for(let t=0;t<.15;t+=dt)hits.push(...advanceProjectile(p,dt,cans,[],null));
  assert.deepEqual(hits.map(h=>h.hit),['a','b']);assert.equal(hits[0].damage,100);assert.equal(hits[1].damage,90);
  assert.ok(hits.every(h=>h.exitPoint&&h.penetrated&&!h.stopped&&!h.stuck));assert.equal(p.penetration,8);assert.equal(p.alive,true);
 }
});
test('penetrating arrow headshots stay lethal while body hits lose energy through cover',()=>{
 for(const y of [1,1.7]){
  const walls=createVoxelWalls(),p=launchProjectile({origin:{x:14,y,z:-5},direction:{x:1,y:0,z:0}},chargedArrow(1),{weapon:'bow'}),target={id:'can',x:17,y:0,z:-5,hp:100};
  const hit=advanceProjectile(p,.1,[target],[],walls).find(h=>h.hit);
  assert.ok(hit?.exitPoint);assert.equal(hit.headshot,y===1.7);assert.equal(hit.damage,y===1.7?100:100*.94**4);
 }
});
test('penetration does not reset velocity on the next gravity step and solid boundaries still stop it',()=>{
 const walls=createVoxelWalls(),p=launchProjectile({origin:{x:14,y:1,z:-5},direction:{x:1,y:0,z:0}},chargedArrow(1),{weapon:'bow'});
 advanceProjectile(p,.05,[],[],walls);const vx=p.direction.x*p.speed;assert.ok(vx<90);
 advanceProjectile(p,.01,[],[],walls);assert.ok(Math.abs(p.direction.x*p.speed-vx)<1e-8);
 const boundary=launchProjectile({origin:{x:0,y:.1,z:27},direction:{x:0,y:0,z:1}},chargedArrow(1),{weapon:'bow'}),hit=advanceProjectile(boundary,.05,[],[],null)[0];
 assert.equal(hit.surface,'world');assert.equal(hit.stuck,true);assert.equal(boundary.alive,false);assert.equal(hit.embedDepth,.36);
});
test('arrows have a longer travel budget without speeding up quick shots to full-draw speed',()=>{
 const p=launchProjectile({origin:{x:10,y:50,z:0},direction:{x:1,y:0,z:0}},chargedArrow(1),{weapon:'bow'});
 assert.equal(p.remaining,120);advanceVisualProjectile(p,.8);assert.equal(p.alive,true);assert.ok(p.position.x>80);
 assert.ok(chargedArrow(0).speed<chargedArrow(1).speed*.5);
});
