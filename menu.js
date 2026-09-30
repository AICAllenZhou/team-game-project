import {API_BASE} from './runtime-config.js';
const $=id=>document.getElementById(id);
export function createMenu({join,getSession,changePowers}){
 let adminToken=null,practiceAdmin=false,mode='checking',refreshTimer=null,busy=false;
 try{const cookie=document.cookie.split('; ').find(c=>c.startsWith('dustline_username='));if(cookie)$('username').value=decodeURIComponent(cookie.slice(cookie.indexOf('=')+1));}catch{}
 function username(){
  const name=$('username').value.trim();$('username').setCustomValidity(name&&!/[\u0000-\u001f\u007f]/.test(name)?'':'Enter a username (1–16 characters).');
  if(!$('username').reportValidity())return null;
  try{document.cookie='dustline_username='+encodeURIComponent(name)+'; Max-Age=31536000; Path=/; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');}catch{}
  return name;
 }
 $('username').addEventListener('input',()=>$('username').setCustomValidity(''));
 function message(text){$('menu-message').textContent=text;}
 function setMode(next){mode=next;$('connection-status').textContent=next==='practice'?'Solo practice':'';}
 async function admin(path,data={}){
  const response=await fetch(API_BASE+'/api/admin/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminToken,...data})});
  if(!response.ok){const error=Error(await response.text()||'Admin request failed');error.status=response.status;throw error;}
  return response.status===204?null:response.json();
 }
 function powerState(){const s=getSession();$('power-controls').disabled=!s.started||busy;const powers=s.powers||{};for(const [id,key] of [['no-recoil','noRecoil'],['infinite-ammo','infiniteAmmo'],['infinite-hp','infiniteHp']])$(id).checked=!!powers[key];}
 async function refresh(){
  if($('admin-panel').hidden||(!adminToken&&!practiceAdmin))return;
  powerState();
  if(mode==='practice'){$('player-list').textContent='No players connected.';return;}
  try{
   const {rooms}=await admin('players');$('player-list').replaceChildren();
   if(!rooms.length){$('player-list').textContent='No players online yet.';return;}
   for(const room of rooms){
    const title=document.createElement('h4');title.textContent=room.players.length+' / 12 players';$('player-list').append(title);
    for(const p of room.players){
     const row=document.createElement('div');row.className='player-row';const label=document.createElement('span');
     label.textContent=p.name+(p.id===getSession().id?' (you)':'')+' · '+(p.hp<=0?'Respawning':p.active?'Playing':'In menu');row.append(label);
     if(p.id!==getSession().id){const button=document.createElement('button');button.className='secondary';button.textContent='Join';button.onclick=async()=>{
      const name=username();if(!name){close();return;}button.disabled=true;
      try{await join({name,room:room.name,targetId:p.id,adminToken});close();}catch(e){$('admin-message').textContent=e.message;}finally{button.disabled=false;}
     };row.append(button);}
     $('player-list').append(row);
    }
   }
  }catch(e){$('admin-message').textContent=e.message;if(e.status===403)lock();}
 }
 function close(){$('admin-panel').hidden=true;$('menu').hidden=false;clearInterval(refreshTimer);refreshTimer=null;}
 function lock(){adminToken=null;practiceAdmin=false;$('admin-login').hidden=false;$('admin-controls').hidden=true;clearInterval(refreshTimer);}
 function unlocked(){ $('admin-login').hidden=true;$('admin-controls').hidden=false;$('admin-message').textContent=getSession().started?'':'Join a game to enable your powers.';refresh();clearInterval(refreshTimer);refreshTimer=setInterval(refresh,4000);}
 $('admin-open').onclick=()=>{$('menu').hidden=true;$('admin-panel').hidden=false;if(adminToken||practiceAdmin)unlocked();else $('admin-code').focus();};
 $('admin-close').onclick=close;
 $('admin-refresh').onclick=refresh;
 $('admin-lock').onclick=async()=>{try{if(adminToken)await admin('logout');}catch{}lock();$('admin-message').textContent='Panel locked.';};
 $('admin-login').onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try{
   if(mode==='error')throw Error('The server is unavailable. Refresh to reconnect.');
   if(mode==='checking')throw Error('Wait for the server connection check.');
   if(mode==='practice'){if($('admin-code').value!=='0310')throw Error('Incorrect admin code');practiceAdmin=true;}
   else({adminToken}=await admin('login',{code:$('admin-code').value}));
   $('admin-code').value='';unlocked();
  }catch(e){$('admin-message').textContent=e.message;}finally{button.disabled=false;}
 };
 $('power-controls').onchange=async()=>{
  busy=true;$('power-controls').disabled=true;
  const powers={noRecoil:$('no-recoil').checked,infiniteAmmo:$('infinite-ammo').checked,infiniteHp:$('infinite-hp').checked};
  try{const s=getSession();const player=s.online?await admin('powers',{token:s.token,powers}):null;changePowers(powers,player);$('admin-message').textContent='';}
  catch(e){$('admin-message').textContent=e.message;}finally{busy=false;powerState();}
 };
 $('join-form').onsubmit=async e=>{e.preventDefault();const name=username();if(!name)return;try{await join({name,adminToken});}catch(e){message(e.message);}};
 // A missing endpoint is expected on a static practice deployment. Network/server errors remain visible.
 fetch(API_BASE+'/api/health').then(async r=>{
  if(r.status===404||r.status===405){if(API_BASE)throw Error('Multiplayer server endpoint is unavailable.');setMode('practice');}
  else if(r.ok&&(r.headers.get('content-type')||'').includes('application/json')&&(await r.json()).multiplayer)setMode('online');
  else throw Error('Multiplayer server is unavailable.');
 }).catch(e=>{message(e.message);setMode('error');$('connection-status').textContent='Unable to connect. Refresh to try again.';}).finally(()=>$('play').disabled=mode==='error');
 return {message,setMode,mode:()=>mode,sessionChanged(){const s=getSession();document.body.classList.toggle('has-session',s.started);$('username').disabled=s.started;$('play').textContent=s.started?'Resume':'Join';powerState();},close};
}
