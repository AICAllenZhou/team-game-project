import {test} from 'node:test';import assert from 'node:assert/strict';import {move,rayHit} from '../simulation.mjs';
test('movement speed is capped including diagonals and arena edges',()=>{const p={x:0,y:0,z:0,vy:0,yaw:0};move(p,{x:1,z:1},1);assert.ok(Math.abs(Math.hypot(p.x,p.z)-4.5)<1e-9);p.x=27;move(p,{x:100},1);assert.equal(p.x,27);});
test('capsule hit test distinguishes hits, misses, and targets behind shooter',()=>{const o={x:0,y:1.5,z:0},d={x:0,y:0,z:-1};assert.ok(rayHit(o,d,{x:0,y:0,z:-10})<10);assert.equal(rayHit(o,d,{x:2,y:0,z:-10}),Infinity);assert.equal(rayHit(o,d,{x:0,y:0,z:10}),Infinity);});
test('jump returns to base plate',()=>{const p={x:0,y:0,z:0,vy:0,yaw:0};move(p,{jump:true},.05);assert.ok(p.y>0);for(let i=0;i<40;i++)move(p,{},.05);assert.equal(p.y,0);});
