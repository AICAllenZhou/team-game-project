import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {traceShot} from '../simulation.mjs';
test('multiplayer shares room state, isolates rooms, enforces ammo and reload',async()=>{
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'3099'},stdio:['ignore','pipe','pipe']});
 const controllers=[];
 try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('server exited')));});
 const post=async(path,body)=>{const r=await fetch('http://localhost:3099/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok);return r.status===204?null:r.json();};
 const a=await post('join',{name:'A',room:'test'}),b=await post('join',{name:'B',room:'test'}),c=await post('join',{name:'C',room:'other'});
 async function state(token){const controller=new AbortController();controllers.push(controller);const timer=setTimeout(()=>controller.abort(),3000);try{const r=await fetch('http://localhost:3099/api/events?token='+token,{signal:controller.signal});const reader=r.body.getReader();let text='';while(true){const {value,done}=await reader.read();if(done)throw Error('Stream ended');text+=new TextDecoder().decode(value);const match=text.match(/event: state\ndata: ([^\n]+)/);if(match)return JSON.parse(match[1]);}}finally{clearTimeout(timer);controller.abort();}}
 assert.equal((await state(a.token)).players.length,2);assert.equal((await state(c.token)).players.length,1);
 await post('fire',{token:a.token});await post('fire',{token:a.token});let s=await state(a.token);assert.equal(s.players.find(p=>p.id===a.id).ammo,5);
 await post('reload',{token:a.token});await post('fire',{token:a.token});s=await state(a.token);assert.ok(s.players.find(p=>p.id===a.id).reloadUntil>0);assert.equal(s.players.find(p=>p.id===a.id).ammo,5);
 await new Promise(r=>setTimeout(r,1900));s=await state(a.token);assert.equal(s.players.find(p=>p.id===a.id).ammo,6);
 // A real SSE shot confirmation must identify the floor and echo the visual
 // shot id, so the predicted round produces exactly one authoritative marker.
 const player=s.players.find(p=>p.id===a.id),direction={x:0,y:-1,z:0};
 const offset=[{x:-1,y:0,z:0},{x:0,y:0,z:0},{x:1,y:0,z:0}].find(o=>Math.abs(traceShot({x:player.x+o.x,y:1.5,z:player.z},direction).point.y+.01)<1e-8);
 assert.ok(offset);
 const shotController=new AbortController();controllers.push(shotController);const shotTimer=setTimeout(()=>shotController.abort(),3000);
 try{
 const stream=await fetch('http://localhost:3099/api/events?token='+a.token,{signal:shotController.signal});
 await post('fire',{token:a.token,shotId:'floor-check',gunYaw:0,gunPitch:-Math.PI/2,muzzleOffset:offset});
 const reader=stream.body.getReader();let buffer='',shot;
 while(!shot){const {value,done}=await reader.read();assert.equal(done,false);buffer+=new TextDecoder().decode(value);const match=buffer.match(/event: shot\ndata: ([^\n]+)/);if(match)shot=JSON.parse(match[1]);}
 assert.equal(shot.shotId,'floor-check');assert.equal(shot.surface,'world');assert.equal(shot.hit,null);assert.ok(Math.abs(shot.point.y+.01)<1e-8);assert.equal(shot.normal.y,1);
 }finally{clearTimeout(shotTimer);shotController.abort();}
 assert.equal((await fetch('http://localhost:3099/.git/config')).status,404);
 }finally{controllers.forEach(c=>c.abort());child.kill();}
});
