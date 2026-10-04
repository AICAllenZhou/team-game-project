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
async function waitUntil(condition,checkFailure){
 const deadline=Date.now()+5000;
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
  };
  const deadline=new Promise((_,reject)=>{deadlineTimer=setTimeout(()=>{failure=Error('The connection check timed out. Check the network and try again.');closeTemporary();reject(failure);},45000);});
  await Promise.race([run(),deadline]);
  status('automatic-status','Passed — admin joining, bean cans and game updates verified.','success');
 }catch(error){status('automatic-status','Check failed: '+error.message,'error');}
 finally{
  code='';finished=true;clearTimeout(deadlineTimer);closeTemporary();await logoutTemporary();
  checkpoint('Temporary connections closed.');automaticBusy=false;buttons();
 }
});
window.addEventListener('pagehide',()=>{unloading=true;manualClient?.close();closeTemporary();void logoutTemporary();});
