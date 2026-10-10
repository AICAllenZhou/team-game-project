import {duelSpawn,DUEL_SCALE} from './arena.mjs';
import {probePeerConnection} from './peer-connection.mjs';
import {createLanClient,directory} from './lan-client.js';

const $=id=>document.getElementById(id);
let manualClient=null,manualBusy=false,automaticBusy=false,unloading=false,lastPlayers='';
const temporaryClients=new Set();
let temporaryAdminToken=null;

function status(id,message,kind=''){
 const element=$(id);element.textContent=message;element.className='status '+kind;
}
function buttons(){
 $('start-connection').disabled=manualBusy||automaticBusy||!!manualClient;
 $('leave-connection').disabled=manualBusy||!manualClient;
 $('check-username').disabled=manualBusy||!!manualClient;
 $('run-check').disabled=automaticBusy||manualBusy;
 $('check-admin-code').disabled=automaticBusy;
}
function players(state){
 const list=state?.players||[],signature=JSON.stringify(list.map(player=>[player.id,player.name,player.hp]));
 if(signature===lastPlayers)return;lastPlayers=signature;
 $('player-list').replaceChildren(...list.map(player=>{
  const item=document.createElement('li');item.textContent=player.name+' — '+player.hp+' HP';return item;
 }));
 $('room-members').hidden=!list.length;
}
function showManual(){
 const session=manualClient?.session();
 players(session?.initialState);buttons();
}
function leaveManual(message='Connection closed.'){
 const previous=manualClient;manualClient=null;previous?.close();showManual();status('manual-status',message);
}
$('start-form').addEventListener('submit',async event=>{
 event.preventDefault();if(manualBusy||automaticBusy||manualClient)return;
 const name=$('check-username').value.trim();if(!name)return;
 manualBusy=true;buttons();status('manual-status','Connecting…');
 const client=createLanClient({
  onEvent:(event,state)=>{if(event==='state'&&manualClient===client)players(state);},
  onDisconnect:message=>{if(manualClient===client){manualClient=null;showManual();status('manual-status',message,'error');}}
 });
 manualClient=client;
 try{await client.start({name});if(unloading)return;showManual();status('manual-status','Connected — three bean cans ready.','success');}
 catch(error){if(manualClient===client)manualClient=null;client.close();showManual();status('manual-status',error.message,'error');}
 finally{manualBusy=false;buttons();}
});
$('leave-connection').addEventListener('click',()=>leaveManual());

function checkpoint(label){const item=document.createElement('li');item.textContent=label;item.dataset.done='true';$('check-results').append(item);}
function assert(condition,message){if(!condition)throw Error(message);}
async function waitUntil(condition,checkFailure,timeout=5000){
 const deadline=Date.now()+timeout;
 while(!condition()){
  checkFailure();if(Date.now()>deadline)throw Error('The connected player did not receive a game update.');
  await new Promise(resolve=>setTimeout(resolve,40));
 }
 checkFailure();
}
function closeTemporary(){for(const client of temporaryClients)client.close();temporaryClients.clear();}
async function logoutTemporary(){
 const adminToken=temporaryAdminToken;temporaryAdminToken=null;
 if(adminToken)await directory('adminLogout',{adminToken}).catch(()=>{});
}
$('automatic-form').addEventListener('submit',async event=>{
 event.preventDefault();if(automaticBusy||manualBusy)return;
 let code=$('check-admin-code').value; if(!code)return;
 $('check-admin-code').value='';automaticBusy=true;buttons();$('check-results').replaceChildren();
 status('automatic-status','Unlocking the admin connection check…');
 let failure=null,finished=false,deadlineTimer;
 const checkFailure=()=>{if(unloading||finished)throw Error('Connection check canceled.');if(failure)throw failure;};
 const makeClient=()=>{
  const client=createLanClient({onDisconnect:message=>{if(!finished)failure=Error(message);}});
  temporaryClients.add(client);return client;
 };
 try{
  const admin=await directory('adminLogin',{code});code='';temporaryAdminToken=admin.adminToken;
  checkFailure();checkpoint('Admin access verified.');
  const run=async()=>{
   const host=makeClient(),guest=makeClient();
   status('automatic-status','Registering two temporary players…');
   const first=await host.start({name:'Lobby Check A'});checkFailure();
   await guest.start({name:'Lobby Check B'});checkFailure();
   let blocked=false;
   try{await guest.join({targetId:first.id});}catch(error){if(error.status===403)blocked=true;else throw error;}
   assert(blocked,'Joining another player must require admin access.');
   checkpoint('Only admins can join another player.');
   status('automatic-status','Connecting the admin to the player…');
   const joined=await guest.join({targetId:first.id,adminToken:temporaryAdminToken});checkFailure();
   const second=joined;
   assert(joined.hostId===first.id&&joined.lobbyCode===first.lobbyCode,'Players did not join the same lobby.');
   assert(joined.initialState?.players?.length===2,'Both players were not present in the same game.');
   assert(joined.initialState.cans?.length===3,'The shared bean cans are missing.');
   checkpoint('Admin joined directly; both players see all three cans.');
   await guest.command('input',{active:false,x:0,z:0,yaw:.321,pitch:0,gunYaw:.321,gunPitch:0});checkFailure();
   await guest.command('reload');checkFailure();
   await waitUntil(()=>Math.abs((guest.session()?.initialState?.players?.find(player=>player.id===second.id)?.yaw??Infinity)-.321)<.00001,checkFailure);
   assert(Math.abs((host.session()?.initialState?.players?.find(player=>player.id===second.id)?.yaw??Infinity)-.321)<.00001,'The host did not apply the joined player’s input.');
   checkpoint('Game commands and live state updates reached both players.');
   await directory('adminMap',{token:second.token,adminToken:temporaryAdminToken,mapId:'duel'});
   await guest.refreshOwnPowers();
   await waitUntil(()=>guest.session()?.initialState?.duel?.phase==='intermission',checkFailure);
   await host.command('loadout',{secondary:'bow',revolver:'heavy',equip:'revolver'});
   await guest.command('loadout',{secondary:'bow',revolver:'small'});
   await waitUntil(()=>guest.session()?.initialState?.duel?.phase==='active',checkFailure);
   // Spawn cover deliberately blocks the opening sightline. Walk into the lane.
   await Promise.all([host.command('input',{active:true,x:0,z:1,yaw:0}),guest.command('input',{active:true,x:0,z:1,yaw:0})]);
   await waitUntil(()=>guest.session()?.initialState?.players.every(p=>p.z>=2.1*DUEL_SCALE),checkFailure);
   await Promise.all([host.command('input',{active:true,x:1,z:0,yaw:0}),guest.command('input',{active:true,x:-1,z:0,yaw:0})]);
   await waitUntil(()=>guest.session()?.initialState?.players.every(p=>Math.abs(p.x)<20),checkFailure,15000);
   await Promise.all([host.command('input',{active:false}),guest.command('input',{active:false})]);
   const stoppedAt=guest.session().initialState.time;
   await waitUntil(()=>guest.session()?.initialState?.time>=stoppedAt+600,checkFailure);
   const shot={muzzleOffset:{x:1,y:-.5,z:0},direction:{x:1,y:0,z:0}};
   await host.command('fire',{...shot,shotId:'check-heavy-1'});
   await waitUntil(()=>guest.session()?.initialState?.players.find(p=>p.id===second.id)?.hp===25,checkFailure);
   await host.command('fire',{...shot,shotId:'check-heavy-2'});
   await waitUntil(()=>guest.session()?.initialState?.duel?.phase==='death',checkFailure);
   assert(guest.session().initialState.duel.scores[first.id]===1,'The round score did not synchronize.');
   checkpoint('Admin changed the shared map; heavy rounds and 1v1 scoring synchronized.');
   await waitUntil(()=>guest.session()?.initialState?.duel?.phase==='intermission',checkFailure);
   const next=guest.session().initialState;
   assert(next.players.every(p=>p.hp===100),'Round respawn did not restore both players.');
   assert(next.players[0].x===duelSpawn(0).x&&next.players[1].x===duelSpawn(1).x,'Round spawns are not at opposite ends.');
   assert(guest.session().wallState.every(removed=>removed.length===0),'Arena damage was not reset.');
   checkpoint('Map reset, opposite spawns and three-second loadout intermission verified.');
  };
  const deadline=new Promise((_,reject)=>{deadlineTimer=setTimeout(()=>{failure=Error('The connection check timed out. Check the network and try again.');closeTemporary();reject(failure);},75000);});
  await Promise.race([run(),deadline]);
  status('automatic-status','Passed — joining, map selection, combat, 1v1 scores and resets verified.','success');
 }catch(error){status('automatic-status','Check failed: '+error.message,'error');}
 finally{
  code='';finished=true;clearTimeout(deadlineTimer);closeTemporary();await logoutTemporary();
  checkpoint('Temporary connections closed.');automaticBusy=false;buttons();
 }
});
window.addEventListener('pagehide',()=>{unloading=true;manualClient?.close();closeTemporary();void logoutTemporary();});

$('test-p2p').onclick=async()=>{
 const button=$('test-p2p');button.disabled=true;status('p2p-status','Connecting two local WebRTC peers…');
 try{await probePeerConnection();status('p2p-status','Passed — direct WebRTC data travelled between two local peers.','success');}
 catch(error){status('p2p-status',error.message,'error');}finally{button.disabled=false;}
};
