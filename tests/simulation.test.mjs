import {test} from 'node:test';import assert from 'node:assert/strict';import {move,rayHit,traceShot,projectileProgress,predictionCorrection,settlePrediction} from '../simulation.mjs';
test('movement speed is capped including diagonals and arena edges',()=>{const p={x:0,y:0,z:0,vy:0,yaw:0};move(p,{x:1,z:1},1);assert.ok(Math.abs(Math.hypot(p.x,p.z)-4.5)<1e-9);p.x=27;move(p,{x:100},1);assert.equal(p.x,27);});
test('capsule hit test distinguishes hits, misses, and targets behind shooter',()=>{const o={x:0,y:1.5,z:0},d={x:0,y:0,z:-1};assert.ok(rayHit(o,d,{x:0,y:0,z:-10})<10);assert.equal(rayHit(o,d,{x:2,y:0,z:-10}),Infinity);assert.equal(rayHit(o,d,{x:0,y:0,z:10}),Infinity);});
test('jump returns to base plate',()=>{const p={x:0,y:0,z:0,vy:0,yaw:0};move(p,{jump:true},.05);assert.ok(p.y>0);for(let i=0;i<40;i++)move(p,{},.05);assert.equal(p.y,0);});
test('center targets stop shots from either side and reject misses',async()=>{
 const {TRAINING_TARGETS,targetHit}=await import('../simulation.mjs');const t=TRAINING_TARGETS[1];
 assert.ok(targetHit({x:0,y:1.6,z:8},{x:0,y:0,z:-1},t)<8);
 assert.ok(targetHit({x:0,y:1.6,z:-8},{x:0,y:0,z:1},t)<8);
 assert.equal(targetHit({x:2,y:1.6,z:8},{x:0,y:0,z:-1},t),Infinity);
});

test('floor impact reports its world point and upward surface normal',()=>{
 const r=traceShot({x:7,y:1.5,z:8},{x:0,y:-1,z:0});
 assert.equal(r.surface,'world');assert.ok(Math.abs(r.point.y+.01)<1e-9);assert.equal(r.point.x,7);assert.equal(r.point.z,8);assert.deepEqual(r.normal,{x:0,y:1,z:0});
});
test('sky misses do not create impacts and world surfaces block players',()=>{
 assert.equal(traceShot({x:7,y:1.5,z:8},{x:0,y:1,z:0}).surface,null);
 const r=traceShot({x:7,y:1.5,z:8},{x:0,y:-1,z:0},[{id:'below-floor',hp:100,x:7,y:-4,z:8}]);
 assert.equal(r.hit,null);assert.equal(r.surface,'world');
 const target=traceShot({x:0,y:1.6,z:8},{x:0,y:0,z:-1},[{id:'behind-target',hp:100,x:0,y:0,z:-4}]);
 assert.equal(target.targetId,'target-1');assert.equal(target.hit,null);
});
test('visible flight is frame-rate independent and close shots remain visible',()=>{
 assert.equal(projectileProgress(16,.05),.5);assert.equal(projectileProgress(16,.1),1);
 assert.ok(projectileProgress(1,1/60)<1);assert.equal(projectileProgress(1,.05),1);
 for(const hz of [30,60,144]){let elapsed=0;for(let i=0;i<hz;i++)elapsed+=1/hz;assert.equal(projectileProgress(70,elapsed),1);}
});
test('packet timing jitter does not pull the walking player back',()=>{
 const p={x:0,y:0,z:0,vy:0,yaw:0};
 for(let i=0;i<60;i++){move(p,{z:-1},1/60);const error=predictionCorrection(p,{x:p.x,z:p.z+.225});settlePrediction(p,error,1/60);}
 assert.ok(Math.abs(p.z+4.5)<1e-8);
 const before=p.x,error=predictionCorrection(p,{x:4,z:p.z});settlePrediction(p,error,1/60);assert.ok(p.x>before&&p.x-before<=.75/60+1e-9);
});

test('crossing the reconciliation threshold does not switch on a sudden correction',()=>{
 const p={x:0,z:0},below=predictionCorrection(p,{x:.299,z:0}),above=predictionCorrection(p,{x:.301,z:0});
 assert.equal(below.x,0);settlePrediction(p,above,1/60);assert.ok(p.x>=0&&p.x<.00001);
});
