import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('admin authentication, presence, own powers, room joining, logout and input validation',async()=>{
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'3101',ADMIN_CODE:'0310',ALLOWED_ORIGINS:'https://team-game-project.vercel.app'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('server exited')));});
  async function post(path,body,status=200){const r=await fetch('http://localhost:3101/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,status,await (r.status===status?Promise.resolve(''):r.text()));return r.status===200?r.json():null;}
  async function state(token){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);try{const r=await fetch('http://localhost:3101/api/events?token='+token,{signal:controller.signal}),reader=r.body.getReader();let buffer='';while(true){const {value,done}=await reader.read();assert.equal(done,false);buffer+=new TextDecoder().decode(value);const match=buffer.match(/event: state\ndata: ([^\n]+)/);if(match)return JSON.parse(match[1]);}}finally{clearTimeout(timer);controller.abort();}}
  await post('join',{name:'   '},400);await post('join',{name:'a'.repeat(17)},400);await post('join',null,400);
  await post('admin/players',{},403);await post('admin/login',{code:'wrong'},403);
  const {adminToken}=await post('admin/login',{code:'0310'});
  const lanA=await post('join',{name:'WiFi A'}),lanB=await post('join',{name:'WiFi B'});
  assert.equal(lanA.room,lanB.room);assert.equal((await state(lanA.token)).players.length,2);
  await post('leave',{token:lanA.token},204);await post('leave',{token:lanB.token},204);
  const a=await post('join',{name:'Owner',room:'one',powers:{infiniteHp:true}}),b=await post('join',{name:'Friend',room:'two'});
  let mine=(await state(a.token)).players[0];assert.equal(mine.powers.infiniteHp,false);
  await post('admin/powers',{token:a.token,powers:{infiniteHp:true}},403);
  await post('input',{token:b.token,active:true},204);
  const list=await post('admin/players',{adminToken});assert.equal(list.rooms.length,2);assert.equal(list.rooms.find(r=>r.name==='two').players[0].active,true);assert.equal(JSON.stringify(list).includes(a.token),false);
  mine=await post('admin/powers',{token:a.token,adminToken,powers:{infiniteHp:true,infiniteAmmo:true,noRecoil:true}});assert.equal(mine.powers.noRecoil,true);
  for(let i=0;i<8;i++){await post('fire',{token:a.token,direction:{x:0,y:1,z:0}},204);await new Promise(r=>setTimeout(r,250));}
  assert.equal((await state(a.token)).players[0].ammo,6);
  assert.equal((await state(b.token)).players[0].powers.infiniteHp,false);
  await post('join',{name:'Owner',targetId:b.id,previousToken:a.token},403);
  const joined=await post('join',{name:'Owner',targetId:b.id,previousToken:a.token,adminToken});assert.equal(joined.room,'two');assert.equal((await state(joined.token)).players.length,2);
  assert.equal((await state(joined.token)).players.find(p=>p.id===joined.id).powers.infiniteAmmo,true);
  await post('input',{token:a.token},401);await post('join',{name:'Owner',targetId:'gone',adminToken},404);
  await post('admin/powers',{token:joined.token,adminToken,powers:{} });await post('fire',{token:joined.token,direction:{x:0,y:1,z:0}},204);assert.equal((await state(joined.token)).players.find(p=>p.id===joined.id).ammo,5);
  const allowed=await fetch('http://localhost:3101/api/health',{headers:{Origin:'https://team-game-project.vercel.app'}});assert.equal(allowed.status,200);assert.equal(allowed.headers.get('access-control-allow-origin'),'https://team-game-project.vercel.app');
  assert.equal((await fetch('http://localhost:3101/api/health',{headers:{Origin:'https://other.example'}})).status,403);
  await post('leave',{token:b.token},204);assert.equal((await post('admin/players',{adminToken})).rooms[0].players.length,1);
  await post('admin/logout',{adminToken},204);await post('admin/players',{adminToken},403);
 }finally{child.kill();}
});
