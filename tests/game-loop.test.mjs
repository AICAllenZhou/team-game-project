import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameLoop} from '../game-loop.js';

function harness(onFrame){
 let wall=0,next=0;const queue=new Map(),frames=[];
 const loop=createGameLoop({onFrame:time=>{frames.push(time);onFrame?.(loop);},wallNow:()=>wall,
  requestFrame:callback=>{queue.set(++next,callback);return next;},cancelFrame:id=>queue.delete(id)});
 return {loop,frames,queue,advance(ms){wall+=ms;},tick(){const callbacks=[...queue.values()];queue.clear();for(const callback of callbacks)callback();}};
}
test('starts paused and has no animation polling before Join or after pause',()=>{
 const h=harness();assert.equal(h.loop.running,false);assert.equal(h.queue.size,0);
 h.loop.start();h.loop.start();assert.equal(h.queue.size,1);
 h.advance(16);h.tick();assert.deepEqual(h.frames,[16]);assert.equal(h.queue.size,1);
 h.loop.stop();h.loop.stop();assert.equal(h.queue.size,0);
 h.advance(60000);h.tick();assert.deepEqual(h.frames,[16]);assert.equal(h.loop.now(),16);
});
test('resume excludes paused wall time from movement and reload/effect deadlines',()=>{
 const h=harness();h.loop.start();h.advance(100);h.tick();const reloadDeadline=h.loop.now()+1800;
 h.loop.stop();h.advance(300000);h.loop.start();h.advance(16);h.tick();
 assert.deepEqual(h.frames,[100,116]);assert.equal(reloadDeadline-h.loop.now(),1784);
 h.advance(1784);h.tick();assert.equal(h.loop.now(),reloadDeadline);
});
test('repeated focus changes never create multiple render loops',()=>{
 const h=harness();for(let i=0;i<20;i++){h.loop.start();h.loop.start();h.advance(10);h.tick();h.loop.stop();h.advance(1000);}
 assert.equal(h.frames.length,20);assert.equal(h.loop.now(),200);assert.equal(h.queue.size,0);
 h.loop.start();assert.equal(h.queue.size,1);
});
test('a pause during a frame prevents scheduling another frame',()=>{
 const h=harness(loop=>loop.stop());h.loop.start();h.advance(16);h.tick();
 assert.equal(h.frames.length,1);assert.equal(h.loop.running,false);assert.equal(h.queue.size,0);
});
