import test from 'node:test';
import assert from 'node:assert/strict';
import {createSkeetRange,clayPose,clayHit,stepClayShard,LAUNCHER,CLAY_HALF_HEIGHT,LAUNCH_COOLDOWN,MAX_CLAYS} from '../skeet.mjs';
import {traceShot} from '../simulation.mjs';

test('launch is manual, throws away from spawn and bounds the small random variation',()=>{
 const range=createSkeetRange();assert.equal(range.flights.length,0);range.update(5000);assert.equal(range.flights.length,0);
 for(const random of [()=>0,()=>.5,()=>1]){const flight=createSkeetRange().launch(0,random);assert.ok(flight.vz< -5);assert.ok(Math.abs(flight.vx)<.41);assert.ok(Math.abs(flight.vy-8.6)<=.300000001);assert.equal(flight.x,LAUNCHER.x);}
 range.launch(6000);assert.equal(range.launch(6001),null);assert.equal(range.flights.length,1);
 for(let i=1;i<MAX_CLAYS;i++)range.launch(6000+i*LAUNCH_COOLDOWN);
 assert.equal(range.launch(10000),null);assert.equal(range.flights.length,MAX_CLAYS);
});
test('flight uses a consistent ballistic arc and exact floor-impact location at any frame rate',()=>{
 const range=createSkeetRange(),flight=range.launch(1000,()=>.5);
 const start=clayPose(flight,1000),rising=clayPose(flight,1500),falling=clayPose(flight,2500);
 assert.ok(rising.y>start.y&&rising.vy>0);assert.ok(falling.vy<0);assert.ok(falling.z<rising.z);
 const early=createSkeetRange(),late=createSkeetRange();early.launch(0,()=>.5);late.launch(0,()=>.5);
 const a=early.update(2000)[0],b=late.update(9000)[0];assert.ok(a);assert.deepEqual(a,b);assert.ok(Math.abs(a.y-CLAY_HALF_HEIGHT)<1e-8);
 assert.equal(early.update(10000).length,0);
});
test('clay collision follows its thin tilted surface and respects foreground occlusion',()=>{
 const clay={id:'clay-test',x:2,y:3,z:-2},origin={x:2,y:3,z:4},direction={x:0,y:0,z:-1};
 assert.ok(Number.isFinite(clayHit(origin,direction,clay)));
 assert.equal(clayHit({...origin,x:2.6},direction,clay),Infinity);
 assert.equal(traceShot(origin,direction,[],[clay]).clayId,clay.id);
 const hidden={id:'hidden',x:0,y:1.6,z:-3};assert.equal(traceShot({x:0,y:1.6,z:8},direction,[],[hidden]).clayId,null);
 const ground={id:'below',x:7,y:-2,z:8};assert.equal(traceShot({x:7,y:2,z:8},{x:0,y:-1,z:0},[],[ground]).surface,'world');
});
test('a shattered clay is removed once and fragments inherit momentum then settle',()=>{
 const range=createSkeetRange(),flight=range.launch(0,()=>.5),pose=clayPose(flight,500);
 const broken=range.breakClay(flight.id,500,{x:0,y:0,z:-1});assert.equal(broken.vz,pose.vz);assert.equal(range.flights.length,0);assert.equal(range.breakClay(flight.id,500),null);
 const shard={x:0,y:2,z:0,vx:1,vy:0,vz:-4,rx:0,ry:0,rz:0,wx:2,wy:3,wz:1};
 const low={...shard},high={...shard};for(let i=0;i<90;i++)stepClayShard(low,1/30);for(let i=0;i<180;i++)stepClayShard(high,1/60);
 assert.ok(Math.abs(low.x-high.x)<1e-6);assert.ok(low.y>=.025);assert.ok(low.z<0);assert.ok(Math.abs(low.vz)<.1);
});
