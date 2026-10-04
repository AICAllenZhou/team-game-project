import {API_BASE} from './runtime-config.js';
import {directory} from './lan-client.js';
import {clearUsernameCookie} from './saved-player.js';
const $=id=>document.getElementById(id);
const powerFields=[['no-recoil','noRecoil'],['infinite-ammo','infiniteAmmo'],['infinite-hp','infiniteHp'],['no-cooldown','noCooldown'],['full-auto','fullAuto']];
export function createMenu({join,getSession,changePowers,changeLoadout=()=>{},leave=()=>{},onAdminLock=()=>{},previewScare=()=>{}}){
 let adminToken=null,practiceAdmin=false,adminUntil=0,mode='checking',refreshTimer=null,busy=false,rememberName=true;
 try{const cookie=document.cookie.split('; ').find(c=>c.startsWith('dustline_username='));if(cookie)$('username').value=decodeURIComponent(cookie.slice(cookie.indexOf('=')+1));}catch{}
 function username(){
  const name=$('username').value.trim();
  $('username').setCustomValidity(name&&name.length<=16&&!/[\u0000-\u001f\u007f]/.test(name)?'':'Enter a username (1–16 characters).');
  if(!$('username').reportValidity())return null;
  if(rememberName)try{document.cookie='dustline_username='+encodeURIComponent(name)+'; Max-Age=31536000; Path=/; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');}catch{}
  return name;
 }
 $('username').addEventListener('input',()=>{rememberName=true;$('username').setCustomValidity('');});
 function message(text){$('menu-message').textContent=text;}
 function setMode(next){mode=next;$('connection-status').textContent='';sessionChanged();}
 function isAdmin(){return !!(adminToken||practiceAdmin)&&Date.now()<adminUntil;}
 async function admin(path,data={}){
  if(mode==='lan')return directory({login:'adminLogin',logout:'adminLogout',players:'players',powers:'adminPowers',loadout:'adminLoadout',resetCookie:'adminResetCookie'}[path],{adminToken,...data});
  const response=await fetch(API_BASE+'/api/admin/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminToken,...data})});
  if(!response.ok){const error=Error(await response.text()||'Admin request failed');error.status=response.status;throw error;}
  return response.status===204?null:response.json();
 }
 function powerState(){
  const s=getSession();$('power-controls').disabled=busy;$('all-weapons').disabled=busy;
  for(const [id,key] of powerFields)$(id).checked=!!s.powers?.[key];
 }
 async function enter(options,button,messageId='menu-message'){
  if(busy||mode==='checking')return false;
  if(options.targetId&&!isAdmin()){$(messageId).textContent='Unlock Admin first.';return false;}
  if(mode==='error'){
   $(messageId).textContent='Reconnecting…';setMode('checking');
   void checkConnection().then(()=>{$(messageId).textContent='';}).catch(()=>{setMode('error');$(messageId).textContent='Connection unavailable. Try Play again.';});return false;
  }
  const name=username();if(!name){close();return false;}
  busy=true;sessionChanged();button.disabled=true;$(messageId).textContent='';
  try{await join({name,adminToken,...options});sessionChanged();return true;}
  catch(e){$(messageId).textContent=e.message;return false;}
  finally{busy=false;button.disabled=false;sessionChanged();}
 }
 async function refresh(){
  if($('admin-panel').hidden||!isAdmin()||busy)return;powerState();
  if(!['online','lan'].includes(mode)){$('player-list').textContent='No players';return;}
  try{
   const {rooms}=await admin('players');$('player-list').replaceChildren();
   const players=rooms.flatMap(room=>room.players);
   if(!players.length){$('player-list').textContent='No players';return;}
   for(const p of players){
    const row=document.createElement('div');row.className='player-row';const label=document.createElement('span');
    label.textContent=p.name+(p.id===getSession().id?' (you)':'');row.append(label);
    if(p.id!==getSession().id){
     const actions=document.createElement('div');actions.className='player-actions';
     const joinButton=document.createElement('button');joinButton.className='secondary';joinButton.textContent='Join';joinButton.setAttribute('aria-label','Join '+p.name);
     joinButton.onclick=async()=>{if(await enter({targetId:p.id},joinButton,'admin-message'))close();};
     const reset=document.createElement('button');reset.className='secondary';reset.textContent=p.cookieResetPending?'Resetting…':'Reset cookie';reset.disabled=!!p.cookieResetPending;reset.setAttribute('aria-label','Reset cookie for '+p.name);
     reset.onclick=async()=>{
      if(!globalThis.confirm('Clear the saved username for '+p.name+'?'))return;
      reset.disabled=true;try{await admin('resetCookie',{targetId:p.id});reset.textContent='Resetting…';}
      catch(e){$('admin-message').textContent=e.message;reset.disabled=false;}
     };
     actions.append(joinButton,reset);row.append(actions);
    }
    $('player-list').append(row);
   }
  }catch(e){$('admin-message').textContent=e.message;if(e.status===403)lock();}
 }
 function close(){$('admin-panel').hidden=true;$('menu').hidden=false;clearInterval(refreshTimer);refreshTimer=null;}
 function lock(){adminToken=null;practiceAdmin=false;adminUntil=0;$('admin-login').hidden=false;$('admin-controls').hidden=true;clearInterval(refreshTimer);onAdminLock();}
 function unlocked(){$('admin-login').hidden=true;$('admin-controls').hidden=false;$('admin-message').textContent='';refresh();clearInterval(refreshTimer);refreshTimer=setInterval(refresh,4000);}
 $('admin-open').onclick=()=>{$('menu').hidden=true;$('admin-panel').hidden=false;if(isAdmin())unlocked();else{lock();$('admin-code').focus();}};
 $('admin-close').onclick=close;$('admin-refresh').onclick=refresh;
 $('admin-lock').onclick=async()=>{
  try{const s=getSession();if(s.started){const player=s.online?await admin('powers',{token:s.token,powers:{}}):null;await changePowers({},mode==='lan'?null:player);}if(adminToken)await admin('logout');}
  catch(e){$('admin-message').textContent=e.message;}finally{lock();}
 };
 $('admin-login').onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try{
   if(mode==='checking')throw Error('Try again in a moment.');
   if(mode==='error')throw Error('Connection unavailable. Try Play again.');
   if(mode==='practice'){if($('admin-code').value!=='0310')throw Error('Incorrect admin code');practiceAdmin=true;}
   else({adminToken}=await admin('login',{code:$('admin-code').value}));
   adminUntil=Date.now()+8*60*60*1000;$('admin-code').value='';unlocked();
  }catch(e){$('admin-message').textContent=e.message;}finally{button.disabled=false;}
 };
 $('power-controls').onchange=async()=>{
  const powers=Object.fromEntries(powerFields.map(([id,key])=>[key,$(id).checked]));busy=true;powerState();
  try{if(!isAdmin())throw Error('Unlock Admin first.');await ensureSession();const s=getSession();const player=s.online?await admin('powers',{token:s.token,powers}):null;await changePowers(powers,mode==='lan'?null:player);}
  catch(e){$('admin-message').textContent=e.message;}finally{busy=false;powerState();}
 };
 async function ensureSession(){
  if(getSession().started)return;
  const name=username();if(!name){close();throw Error('Enter your username first.');}
  await join({name,adminToken,stayInMenu:true});sessionChanged();
 }
 $('bean-scare-preview').onclick=()=>{if(isAdmin())previewScare();};
 async function loadout(data){
  if(!isAdmin())throw Error('Unlock Admin first.');
  await ensureSession();const s=getSession();
  const result=s.online?await admin('loadout',{token:s.token,...data}):null;
  return changeLoadout(data,mode==='lan'?null:result);
 }
 $('all-weapons').onclick=async()=>{busy=true;powerState();try{await loadout({allWeapons:true});}catch(e){$('admin-message').textContent=e.message;}finally{busy=false;powerState();}};
 $('join-form').onsubmit=async e=>{e.preventDefault();await enter({},$('play'));};
 $('leave-lobby').onclick=()=>{leave();sessionChanged();message('');};
 function sessionChanged(){const s=getSession();document.body.classList.toggle('has-session',s.started);$('username').disabled=s.started;$('leave-lobby').hidden=!s.online;$('play').disabled=busy||mode==='checking';$('play').textContent=s.started?'Resume':'Play';powerState();}
 async function checkConnection(){
  const r=await fetch(API_BASE+'/api/health',{signal:AbortSignal.timeout(10000)});
  if(r.ok&&(r.headers.get('content-type')||'').includes('application/json')&&(await r.json()).multiplayer){setMode('online');return;}
  if(![404,405].includes(r.status)||API_BASE)throw Error('Connection unavailable.');
  const lan=await fetch(API_BASE+'/api/multiplayer',{signal:AbortSignal.timeout(10000)});
  if(lan.ok&&(lan.headers.get('content-type')||'').includes('application/json')&&(await lan.json()).transport==='webrtc'){setMode('lan');return;}
  if([404,405].includes(lan.status)){setMode('practice');return;}
  if(lan.status===503&&(await lan.json().catch(()=>({}))).code==='NOT_CONFIGURED'){setMode('practice');return;}
  throw Error('Connection unavailable.');
 }
 sessionChanged();checkConnection().catch(()=>setMode('error'));
 return {message,setMode,mode:()=>mode,sessionChanged,close,isAdmin,loadout,
  resetCookie(){clearUsernameCookie(document,location.protocol);rememberName=false;}};
}
