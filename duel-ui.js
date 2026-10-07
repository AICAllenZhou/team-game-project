import {AMMO_MODS} from './weapons.mjs';
export function createDuelUI({choose,resume}){
 const score=document.createElement('div');score.id='duel-score';score.hidden=true;document.body.append(score);
 const panel=document.createElement('section');panel.id='duel-loadout';panel.className='panel';panel.hidden=true;
 panel.innerHTML='<h2>Next round</h2><p id="round-countdown"></p><label>Revolver ammo<select id="duel-revolver"></select></label><label>Second weapon<select id="duel-secondary"><option value="shotgun">Sawed-off shotgun</option><option value="bow">Bow</option></select></label><label id="duel-shell-label">Shotgun shells<select id="duel-shells"></select></label><button id="duel-ready">Ready</button><p id="duel-message" role="status"></p>';
 document.body.append(panel);
 const get=id=>panel.querySelector('#'+id);let epoch=-1,closed=false,current=null;
 for(const [id,weapon] of [['duel-revolver','revolver'],['duel-shells','shotgun']])for(const [mod,profile] of Object.entries(AMMO_MODS[weapon])){const option=document.createElement('option');option.value=mod;option.textContent=profile.label;get(id).append(option);}
 async function submit(){try{get('duel-message').textContent='';await choose({secondary:get('duel-secondary').value,revolver:get('duel-revolver').value,shotgun:get('duel-shells').value});}catch(e){get('duel-message').textContent=e.message;}}
 for(const id of ['duel-revolver','duel-secondary','duel-shells'])get(id).onchange=()=>{get('duel-shell-label').hidden=get('duel-secondary').value==='bow';void submit();};
 get('duel-ready').onclick=()=>{closed=true;panel.hidden=true;document.body.classList.remove('choosing-loadout');resume();};
 function update(state,id,time){
  current=state;const duel=state.duel;score.hidden=!duel;
  if(!duel){panel.hidden=true;document.body.classList.remove('choosing-loadout');epoch=-1;return;}
  const seconds=Math.max(0,Math.ceil((duel.until-time)/1000));
  score.textContent=state.players.map(p=>p.name+' '+(duel.scores[p.id]||0)).join('   :   ')+' · '+(duel.phase==='active'?'Round '+duel.round:duel.phase==='waiting'?'Waiting for opponent':duel.phase==='death'?'Round over':'Starts in '+seconds);
  const choosing=['intermission','waiting'].includes(duel.phase);
  if(epoch!==duel.epoch){epoch=duel.epoch;closed=false;const me=state.players.find(p=>p.id===id);get('duel-revolver').value=me?.mods.revolver||'standard';get('duel-secondary').value=me?.secondary||'shotgun';get('duel-shells').value=me?.mods.shotgun||'standard';get('duel-shell-label').hidden=get('duel-secondary').value==='bow';}
  const visible=choosing&&!closed;if(visible&&panel.hidden)document.exitPointerLock();panel.hidden=!visible;document.body.classList.toggle('choosing-loadout',visible);
  get('round-countdown').textContent=duel.phase==='waiting'?'Choose your loadout':seconds+' seconds';
 }
 return {update,get open(){return !panel.hidden;}};
}
