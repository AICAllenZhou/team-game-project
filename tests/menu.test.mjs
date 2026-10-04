import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createMenu} from '../menu.js';

class Element {
  constructor(tagName='div',id='') {
    Object.assign(this,{tagName,id,value:'',disabled:false,hidden:false,checked:false,children:[],attributes:{},listeners:new Map(),validity:'',focused:false,_text:''});
    this.classList={values:new Set(),toggle:(name,on)=>{if(on)this.classList.values.add(name);else this.classList.values.delete(name);}};
  }
  get textContent() {return this._text;}
  set textContent(value) {this._text=value;this.children=[];}
  addEventListener(type,listener) {const listeners=this.listeners.get(type)||[];listeners.push(listener);this.listeners.set(type,listeners);}
  async dispatch(type,event={}) {for(const listener of this.listeners.get(type)||[])await listener(event);}
  setCustomValidity(message) {this.validity=message;}
  reportValidity() {return !this.validity;}
  setAttribute(name,value) {this.attributes[name]=value;}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children=[...children];this._text='';}
  focus() {this.focused=true;}
  requestSubmit(submitter) {this.submittedWith=submitter;this.submission=Promise.resolve(this.onsubmit({submitter,preventDefault(){}}));}
  find(predicate) {if(predicate(this))return this;for(const child of this.children){const found=child.find(predicate);if(found)return found;}return null;}
}

function harness(t,{lanStatus=200,lanBody={multiplayer:true,transport:'webrtc'},cookie='',rooms=[],autoStart=false}={}) {
  const ids=['username','join-form','menu-message','connection-status','play','power-controls','no-recoil','infinite-ammo','infinite-hp','admin-panel','player-list','admin-message','menu','admin-login','admin-controls','admin-code','admin-open','admin-close','admin-refresh','admin-lock','your-code','player-code','lobby-entry','lobby-code','join-lobby','leave-lobby','all-weapons','bean-scare-preview','no-cooldown','full-auto'];
  const elements=new Map(ids.map(id=>[id,new Element('div',id)]));
  const element=id=>elements.get(id);
  element('admin-panel').hidden=true;element('admin-controls').hidden=true;element('your-code').hidden=true;
  let storedCookie=cookie;const cookieWrites=[],calls=[],joins=[],intervals=new Map();let intervalId=0;
  let session={started:false,online:false,powers:{}},scares=0;
  const document={body:new Element('body'),getElementById:element,createElement:tag=>new Element(tag),get cookie(){return storedCookie;},set cookie(value){cookieWrites.push(value);storedCookie=value.split(';')[0];}};
  const originals=new Map(['document','location','fetch','setInterval','clearInterval','confirm'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.defineProperties(globalThis,{
    confirm:{value:()=>true,writable:true,configurable:true},
    document:{value:document,writable:true,configurable:true},
    location:{value:{protocol:'https:'},writable:true,configurable:true},
    setInterval:{value:callback=>{intervals.set(++intervalId,callback);return intervalId;},writable:true,configurable:true},
    clearInterval:{value:id=>intervals.delete(id),writable:true,configurable:true},
    fetch:{value:async(url,options={})=>{
      const payload=options.body?JSON.parse(options.body):null;calls.push({url,payload});
      const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
      if(url==='/api/health')return response({error:'Not found'},404);
      if(url==='/api/multiplayer'&&!payload)return response(lanBody,lanStatus);
      if(url==='/api/multiplayer'&&['adminLogin','adminLogout'].includes(payload.action))return response({adminToken:'verified-admin-token'});
      if(url==='/api/multiplayer'&&payload.action==='players')return response({rooms});
      if(url==='/api/multiplayer'&&['adminResetCookie','adminLoadout','adminPowers'].includes(payload.action))return response({ok:true});
      throw Error('Unexpected request: '+url+' '+JSON.stringify(payload));
    },writable:true,configurable:true},
  });
  const menu=createMenu({join:async options=>{joins.push(options);if(autoStart)session={started:true,online:true,id:'me',token:'created-token',powers:{}};},getSession:()=>session,changePowers:async()=>{},previewScare:()=>scares++});
  t.after(()=>{menu.close();for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  return {menu,element,document,joins,calls,cookieWrites,get scares(){return scares;},async ready(){for(let n=0;menu.mode()==='checking'&&n<20;n++)await nextTurn();assert.notEqual(menu.mode(),'checking');},async flush(){await nextTurn();},setSession(value){session={...session,...value};menu.sessionChanged();},async submit(id='play'){await element('join-form').onsubmit({submitter:element(id),preventDefault(){}});}};
}

test('Play and Resume have no codes or connection instructions',async t=>{
 const app=harness(t);await app.ready();assert.equal(app.menu.mode(),'lan');assert.equal(app.element('connection-status').textContent,'');
 app.element('username').value='Player';await app.submit();assert.deepEqual(app.joins,[{name:'Player',adminToken:null}]);
 app.setSession({started:true,online:true,id:'me'});assert.equal(app.element('play').textContent,'Resume');assert.equal(app.element('username').disabled,true);
});

test('admin joins and resets the selected player from the same row and grants own weapons',async t=>{
 const app=harness(t,{rooms:[{players:[{id:'other',name:'Friend'}]}]});await app.ready();app.element('username').value='Owner';
 app.setSession({started:true,online:true,id:'me',token:'own-token'});
 app.element('admin-open').onclick();app.element('admin-code').value='0310';
 await app.element('admin-login').onsubmit({submitter:new Element('button'),preventDefault(){}});await app.flush();assert.equal(app.menu.isAdmin(),true);
 const list=app.element('player-list');
 await list.find(e=>e.attributes['aria-label']==='Reset cookie for Friend').onclick();
 assert.deepEqual(app.calls.at(-1).payload,{action:'adminResetCookie',adminToken:'verified-admin-token',targetId:'other'});
 await app.element('all-weapons').onclick();assert.equal(app.calls.at(-1).payload.action,'adminLoadout');assert.equal(app.calls.at(-1).payload.token,'own-token');
 app.element('no-cooldown').checked=true;app.element('full-auto').checked=true;await app.element('power-controls').onchange();
 assert.equal(app.calls.at(-1).payload.powers.noCooldown,true);assert.equal(app.calls.at(-1).payload.powers.fullAuto,true);
 await list.find(e=>e.attributes['aria-label']==='Join Friend').onclick();assert.deepEqual(app.joins,[{name:'Owner',adminToken:'verified-admin-token',targetId:'other'}]);
});

test('unconfigured directory retains practice Play without extra instructions',async t=>{
 const app=harness(t,{lanStatus:503,lanBody:{code:'NOT_CONFIGURED'}});await app.ready();assert.equal(app.menu.mode(),'practice');
 app.element('username').value='Solo';await app.submit();assert.equal(app.joins[0].name,'Solo');assert.equal(app.element('menu-message').textContent,'');
});

test('remote reset clears only the username and Resume does not recreate the cookie',async t=>{
 const app=harness(t,{cookie:'dustline_username=Saved'});await app.ready();app.menu.resetCookie();assert.equal(app.cookieWrites[0],'dustline_username=; Max-Age=0; Path=/; SameSite=Lax; Secure');
 await app.submit();assert.equal(app.cookieWrites.length,1);assert.equal(app.joins[0].name,'Saved');
 app.element('username').value='New';await app.element('username').dispatch('input');await app.submit();assert.equal(app.cookieWrites.length,2);
});

test('username cookie is remembered, validated, and renewed securely on HTTPS',async t=>{
  const app=harness(t,{cookie:'other=value; dustline_username=Saved%20Player'});await app.ready();assert.equal(app.element('username').value,'Saved Player');
  await app.submit('play');assert.equal(app.joins[0].name,'Saved Player');assert.equal(app.cookieWrites[0],'dustline_username=Saved%20Player; Max-Age=31536000; Path=/; SameSite=Lax; Secure');
  app.element('username').value=' ';await app.submit('play');assert.equal(app.joins.length,1);assert.match(app.element('username').validity,/Enter a username/);
  app.element('username').value='New Name';await app.element('username').dispatch('input');assert.equal(app.element('username').validity,'');await app.submit('play');assert.equal(app.joins[1].name,'New Name');
});


test('an unlocked admin can grant weapons or powers before pressing Play',async t=>{
 const app=harness(t,{autoStart:true});await app.ready();app.element('username').value='Owner';app.element('admin-open').onclick();app.element('admin-code').value='0310';
 await app.element('admin-login').onsubmit({submitter:new Element('button'),preventDefault(){}});await app.flush();
 assert.equal(app.element('all-weapons').disabled,false);assert.equal(app.element('power-controls').disabled,false);
 await app.element('all-weapons').onclick();assert.deepEqual(app.joins,[{name:'Owner',adminToken:'verified-admin-token',stayInMenu:true}]);
 assert.equal(app.calls.at(-1).payload.action,'adminLoadout');assert.equal(app.calls.at(-1).payload.token,'created-token');
 app.element('infinite-ammo').checked=true;await app.element('power-controls').onchange();assert.equal(app.joins.length,1);assert.equal(app.calls.at(-1).payload.powers.infiniteAmmo,true);
});


test('Play cannot enter solo practice while LAN detection is still pending',async t=>{
 const app=harness(t);app.element('username').value='Early player';app.menu.sessionChanged();
 assert.equal(app.element('play').disabled,true);await app.submit();assert.equal(app.joins.length,0);
 await app.ready();assert.equal(app.element('play').disabled,false);await app.submit();assert.equal(app.joins.length,1);assert.equal(app.menu.mode(),'lan');
});

test('connection failures retry detection instead of silently starting solo',async t=>{
 const app=harness(t,{lanStatus:503,lanBody:{error:'Temporary outage'}});await app.ready();app.element('username').value='Player';
 assert.equal(app.menu.mode(),'error');await app.submit();assert.equal(app.joins.length,0);
 await app.flush();assert.match(app.element('menu-message').textContent,/Connection unavailable/);assert.equal(app.calls.filter(call=>call.url==='/api/health').length,2);
 app.element('admin-open').onclick();app.element('admin-code').value='0310';await app.element('admin-login').onsubmit({submitter:new Element('button'),preventDefault(){}});assert.equal(app.menu.isAdmin(),false);
});

test('jumpscare and stale player Join buttons require an unlocked admin',async t=>{
 const app=harness(t,{rooms:[{players:[{id:'other',name:'Friend'}]}]});await app.ready();app.element('username').value='Owner';
 app.element('bean-scare-preview').onclick();assert.equal(app.scares,0);
 app.element('admin-open').onclick();app.element('admin-code').value='0310';
 await app.element('admin-login').onsubmit({submitter:new Element('button'),preventDefault(){}});await app.flush();
 app.element('bean-scare-preview').onclick();assert.equal(app.scares,1);
 const staleJoin=app.element('player-list').find(e=>e.attributes['aria-label']==='Join Friend');
 await app.element('admin-lock').onclick();app.element('bean-scare-preview').onclick();assert.equal(app.scares,1);
 await staleJoin.onclick();assert.equal(app.joins.length,0);assert.match(app.element('admin-message').textContent,/Unlock Admin/);
});
