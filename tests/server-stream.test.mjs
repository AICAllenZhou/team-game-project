import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {sendServerEvent} from '../server-stream.mjs';
class SlowStream extends EventEmitter{
 destroyed=false;writableEnded=false;writableNeedDrain=false;writes=[];
 write(text){this.writes.push(text);this.writableNeedDrain=true;return false;}
 drain(){this.writableNeedDrain=false;this.emit('drain');}
 events(){return this.writes.map(text=>{const [,event,data]=text.match(/event: ([^\n]+)\ndata: ([^\n]+)/);return {event,data:JSON.parse(data)};});}
}

test('slow Node SSE reader keeps complete wall changes and latest state without an unbounded burst queue',()=>{
 const stream=new SlowStream();sendServerEvent(stream,'shot',{id:'first'});
 for(let i=0;i<10000;i++){
  sendServerEvent(stream,'shot',{id:i});sendServerEvent(stream,'impact',{id:i});
  sendServerEvent(stream,'state',{sequence:i});
  sendServerEvent(stream,'wallDamage',{wallId:i%2,removed:[i%200]});
 }
 assert.equal(stream.writes.length,1,'Backpressure stops writes before buffering thousands of cosmetic events');
 for(let i=0;i<5;i++)stream.drain();
 const events=stream.events();assert.equal(events.length,4);assert.equal(events.at(-1).event,'state');assert.equal(events.at(-1).data.sequence,9999);
 for(const wallId of [0,1])assert.deepEqual(events.find(e=>e.event==='wallDamage'&&e.data.wallId===wallId).data.removed,Array.from({length:100},(_,i)=>i*2+wallId));
 assert.equal(stream.destroyed,false);assert.equal(stream.writableEnded,false,'Congestion never kicks the session');
});

test('SSE wall reset supersedes older queued destruction while preserving new damage and control updates',()=>{
 const stream=new SlowStream();sendServerEvent(stream,'state',{sequence:0});
 sendServerEvent(stream,'wallDamage',{wallId:0,removed:[1,2,3]});
 sendServerEvent(stream,'resetCookie',{id:'admin-request'});
 sendServerEvent(stream,'wallReset',{});
 sendServerEvent(stream,'wallDamage',{wallId:0,removed:[4,5]});
 sendServerEvent(stream,'state',{sequence:1});
 for(let i=0;i<6;i++)stream.drain();
 const events=stream.events().slice(1);
 assert.equal(events[0].event,'wallReset');assert.deepEqual(events[1],{event:'wallDamage',data:{wallId:0,removed:[4,5]}});
 assert.ok(events.some(e=>e.event==='resetCookie'&&e.data.id==='admin-request'));assert.equal(events.at(-1).data.sequence,1);
});

test('closed SSE streams are ignored safely',()=>{
 const stream=new SlowStream();stream.destroyed=true;sendServerEvent(stream,'state',{});assert.equal(stream.writes.length,0);
});
