import {API_BASE} from './runtime-config.js';
import {createRoomEngine} from './room-engine.mjs';

const ACTIONS=new Set(['input','fire','reload','resetWalls','pickup','equip','modify','buy','launch']);
const EVENTS=new Set(['state','wallState','wallDamage','wallReset','shot','impact','clayBreak']);
const LAN_ERROR='Could not connect directly. Both players must keep the game open on the same local network. Guest Wi-Fi or device isolation can block LAN connections.';

// The directory only carries presence and WebRTC signaling. Gameplay stays on
// the local network: no public STUN server or relay is used.
export async function directory(action,data={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(API_BASE+'/api/multiplayer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data}),signal:controller.signal,keepalive:action==='leave'||action==='adminLogout'});
  const body=await response.text();let result;
  try{result=body?JSON.parse(body):null;}catch{result=null;}
  if(!response.ok){const error=Error(result?.error||result?.message||body.slice(0,200)||'The player directory is unavailable.');error.status=response.status;error.code=result?.code;throw error;}
  return result;
 }catch(error){if(error.name==='AbortError')throw Error('The player directory timed out. Check your connection and try again.');throw error;}
 finally{clearTimeout(timeout);}
}

export function createLanClient({onEvent=()=>{},onDisconnect=()=>{},request=directory,RTC=globalThis.RTCPeerConnection,engineFactory=createRoomEngine,timing={}}={}){
 const delays={poll:1000,guestPoll:3000,connectingPoll:250,heartbeat:10000,members:5000,connect:20000,request:5000,disconnect:5000,...timing};
 let registration=null,engine=null,generation=0,transitioning=false,closed=false,starting=false,lastState=null,lastWalls=null,active=false,requestSequence=0;
 let tickTimer=null,pollTimer=null,heartbeatTimer=null,membersTimer=null,pollBusy=false,heartbeatBusy=false,membersBusy=false;
 let pollFailures=0,heartbeatFailures=0,memberFailures=0,lastHostMessage=0;
 let changingMembership=false,pollDone=Promise.resolve();
 const peers=new Map(),earlyIce=new Map(),requests=new Map();
 const isHost=()=>registration?.id===registration?.hostId;
 const ownPlayer=()=>lastState?.players?.find(player=>player.id===registration?.id)||null;
 const session=()=>registration?{...registration,room:registration.hostId,online:true,initialState:engine?engine.snapshot():lastState,wallState:engine?engine.wallSnapshot():lastWalls}:null;

 function notify(event,data){
  if(event==='state')lastState=data;
  if(event==='wallState')lastWalls=data.map(removed=>[...removed]);
  if(event==='wallReset'&&lastWalls)lastWalls=lastWalls.map(()=>[]);
  if(event==='wallDamage'&&lastWalls?.[data.wallId])lastWalls[data.wallId]=[...new Set([...lastWalls[data.wallId],...data.removed])];
  if(!transitioning&&!closed)onEvent(event,data);
 }
 function send(peer,message){
  if(peer.closed||peer.channel?.readyState!=='open')return false;
  // Slow/backgrounded peers must not create an unbounded send queue.
  if(peer.channel.bufferedAmount>1024*1024){dropPeer(peer,Error('LAN connection is too slow. Please rejoin.'));return false;}
  try{peer.channel.send(JSON.stringify(message));return true;}catch{return false;}
 }
 function broadcast(event,data){
  notify(event,data);
  for(const peer of peers.values())send(peer,{kind:'event',event,data});
 }
 function rejectRequests(error){for(const pending of requests.values()){clearTimeout(pending.timer);pending.reject(error);}requests.clear();}
 function destroyPeer(peer,error=Error('LAN connection closed.')){
  if(peer.closed)return;
  peer.closed=true;clearTimeout(peer.disconnectTimer);clearTimeout(peer.readyTimer);
  peer.rejectReady?.(error);peer.rejectReady=null;peer.resolveReady=null;
  if(peers.get(peer.id)===peer)peers.delete(peer.id);
  if(engine)engine.removePlayer(peer.id);
  try{peer.channel?.close();}catch{}
  try{peer.pc.close();}catch{}
 }
 function dropPeer(peer,error){
  if(peer.closed)return;
  const hostLink=peer.hostLink;destroyPeer(peer,error);
  if(hostLink){rejectRequests(error);if(!transitioning)disconnect(error.message);}
 }
 function stopRoom(){
  generation++;clearInterval(tickTimer);tickTimer=null;
  for(const peer of [...peers.values()]){if(!peer.hostLink)send(peer,{kind:'hostLeft'});destroyPeer(peer);}
  rejectRequests(Error('Changing games.'));earlyIce.clear();engine=null;lastState=null;lastWalls=null;
 }
 function stopLoops(){clearTimeout(pollTimer);clearTimeout(heartbeatTimer);clearTimeout(membersTimer);pollTimer=heartbeatTimer=membersTimer=null;}
 function close(){
  if(closed)return;
  closed=true;globalThis.removeEventListener?.('pagehide',close);stopLoops();stopRoom();const previous=registration;registration=null;
  if(previous)void request('leave',{token:previous.token}).catch(()=>{});
 }
 function disconnect(message){if(closed)return;close();onDisconnect(message);}
 function startHost(){
  engine=engineFactory({emit:broadcast});
  engine.addPlayer({id:registration.id,name:registration.name,powers:registration.powers,loadout:registration.loadout});
  lastWalls=engine.wallSnapshot();lastState=engine.snapshot();
  tickTimer=setInterval(()=>{if(engine&&!closed)engine.tick();},50);
 }
 function replaceRegistration(data){
  registration={...registration,...data};
  if(!registration.id||!registration.token||!registration.hostId||!registration.joinCode)throw Error('The player directory returned an incomplete session.');
 }
 async function start({name,targetId,adminToken}={}){
  if(registration)return session();
  if(starting)throw Error('A connection is already being started.');
  if(typeof RTC!=='function')throw Error('This browser does not support LAN multiplayer. Open the game in a current browser using HTTPS.');
  starting=true;closed=false;transitioning=true;
  try{
   const data=await request('register',{name});
   if(closed){if(data?.token)void request('leave',{token:data.token}).catch(()=>{});throw Error('Connection canceled.');}
   registration={name,...data};replaceRegistration({});startHost();transitioning=false;globalThis.addEventListener?.('pagehide',close);
   pollFailures=heartbeatFailures=memberFailures=0;schedulePoll(0);scheduleHeartbeat();scheduleMembers();
   if(targetId)await join({targetId,adminToken});
   return session();
  }catch(error){close();throw error;}finally{starting=false;transitioning=false;}
 }
 async function join({joinCode,targetId,adminToken}={}){
  if(!registration||closed)throw Error('Join the game before choosing a player.');
  if(transitioning)throw Error('A connection is already being started.');
  transitioning=true;changingMembership=true;clearTimeout(pollTimer);let version=generation,switched=false;
  try{
   // A poll drains its mailbox. Finish the old poll before changing membership
   // so it cannot consume the new host's answer under the old room generation.
   await pollDone;
   if(closed||version!==generation)throw Error('Connection canceled.');
   const data=await request('join',{token:registration.token,adminToken,...(targetId?{targetId}:{joinCode})});
   if(closed||version!==generation)throw Error('Connection canceled.');
   // Authorization, invalid codes and busy-host checks must not tear down a
   // working room. Joining somebody already in this room is also a no-op.
   if(data.hostId===registration.hostId){replaceRegistration(data);transitioning=false;return session();}
   stopRoom();version=generation;switched=true;
   replaceRegistration(data);changingMembership=false;schedulePoll(0);
   if(isHost())startHost();else await connectHost();
   if(closed||version!==generation)throw Error('Connection canceled.');
   transitioning=false;return session();
  }catch(error){
   // A failed join must not silently create another, separate game.
   if(switched&&!closed&&version===generation){
    close();
   }
   throw error;
  }finally{transitioning=false;changingMembership=false;schedulePoll(0);}
 }
 async function signal(targetId,message,version=generation){
  if(closed||version!==generation||!registration)return;
  return request('signal',{token:registration.token,targetId,message});
 }
 function makePeer(id,hostLink){
  const version=generation,pc=new RTC({iceServers:[]});
  const peer={id,pc,hostLink,closed:false,channel:null,ice:[],disconnectTimer:null,readyTimer:null,version};peers.set(id,peer);
  pc.onicecandidate=event=>{if(event.candidate&&!peer.closed)void signal(id,{type:'ice',candidate:event.candidate.toJSON?event.candidate.toJSON():event.candidate},version).catch(error=>dropPeer(peer,error));};
  pc.onconnectionstatechange=()=>{
   if(peer.closed)return;
   if(pc.connectionState==='failed'||pc.connectionState==='closed')dropPeer(peer,Error(hostLink?'The host disconnected. '+LAN_ERROR:'A player disconnected.'));
   else if(pc.connectionState==='disconnected'){
    if(!peer.disconnectTimer)peer.disconnectTimer=setTimeout(()=>dropPeer(peer,Error(hostLink?'Lost connection to the host. '+LAN_ERROR:'A player disconnected.')),delays.disconnect);
   }else{clearTimeout(peer.disconnectTimer);peer.disconnectTimer=null;}
  };
  return peer;
 }
 function attachChannel(peer,channel){
  if(peer.closed||peer.channel||channel.label!=='dustline'){channel.close();return;}
  peer.channel=channel;
  channel.onopen=()=>{
   if(peer.closed)return;
   if(!peer.hostLink){
    const player=peer.member;
    if(!player||!engine){dropPeer(peer,Error('Player membership expired.'));return;}
    try{
     engine.addPlayer({id:peer.id,name:player.name,powers:player.powers,loadout:player.loadout});
     clearTimeout(peer.readyTimer);send(peer,{kind:'welcome',state:engine.snapshot(),walls:engine.wallSnapshot()});
    }catch(error){dropPeer(peer,error);}
   }
  };
  channel.onmessage=event=>{
   if(peer.closed)return;
   const limit=peer.hostLink?1024*1024:8192;
   if(typeof event.data!=='string'||event.data.length>limit){dropPeer(peer,Error('Invalid LAN message.'));return;}
   let message;try{message=JSON.parse(event.data);}catch{return;}
   if(!message||typeof message!=='object')return;
   if(peer.hostLink)receiveHost(peer,message);else void receiveGuest(peer,message);
  };
  channel.onclose=()=>dropPeer(peer,Error(peer.hostLink?'The host left the game.':'A player left the game.'));
  channel.onerror=()=>dropPeer(peer,Error(LAN_ERROR));
 }
 function receiveHost(peer,message){
  lastHostMessage=Date.now();
  if(message.kind==='welcome'){
   if(!Array.isArray(message.state?.players)||!Array.isArray(message.walls)||!message.state.players.some(player=>player.id===registration?.id)){dropPeer(peer,Error('The host returned an invalid game.'));return;}
   lastState=message.state;lastWalls=message.walls;clearTimeout(peer.readyTimer);peer.resolveReady?.();peer.resolveReady=null;peer.rejectReady=null;
  }else if(message.kind==='event'&&EVENTS.has(message.event))notify(message.event,message.data);
  else if(message.kind==='reply'){
   const pending=requests.get(message.requestId);if(!pending)return;
   requests.delete(message.requestId);clearTimeout(pending.timer);
   if(message.error)pending.reject(Error(String(message.error).slice(0,300)));else pending.resolve(message.result??null);
  }else if(message.kind==='hostLeft')dropPeer(peer,Error('The host left the game. Choose another player to join.'));
 }
 async function receiveGuest(peer,message){
  if(peer.closed||!engine||typeof message.requestId!=='string'||message.requestId.length>64)return;
  const reply={kind:'reply',requestId:message.requestId};
  try{
   if(message.kind==='refreshPowers'){
    const now=Date.now();if(now-(peer.powerRefreshWindow||0)>5000){peer.powerRefreshWindow=now;peer.powerRefreshCount=0;}
    if((peer.powerRefreshCount=(peer.powerRefreshCount||0)+1)>8)throw Error('Please wait before refreshing admin powers again.');
    await refreshMembers();
    if(peer.closed||!engine)return;
    reply.result=engine.snapshot().players.find(player=>player.id===peer.id)||null;
   }else{
    if(message.kind!=='command'||!ACTIONS.has(message.action)||!message.data||typeof message.data!=='object'||Array.isArray(message.data))throw Error('Invalid game command.');
    // The sender identity comes from the authenticated signaling directory,
    // never from IDs or power flags included in a peer's command.
    reply.result=engine.command(peer.id,message.action,message.data)??null;
   }
  }catch(error){reply.error=error.message;}
  send(peer,reply);
 }
 async function connectHost(){
  const peer=makePeer(registration.hostId,true);lastHostMessage=Date.now();
  const ready=new Promise((resolve,reject)=>{peer.resolveReady=resolve;peer.rejectReady=reject;peer.readyTimer=setTimeout(()=>dropPeer(peer,Error(LAN_ERROR)),delays.connect);});
  // Attach a rejection handler immediately while the SDP exchange is pending.
  void ready.catch(()=>{});
  try{
   attachChannel(peer,peer.pc.createDataChannel('dustline'));
   await peer.pc.setLocalDescription(await peer.pc.createOffer());
   await signal(peer.id,{type:'offer',sdp:peer.pc.localDescription},peer.version);
   await ready;
  }catch(error){destroyPeer(peer,error);throw error;}
 }
 async function flushIce(peer){
  const queued=[...(earlyIce.get(peer.id)||[]),...peer.ice];earlyIce.delete(peer.id);peer.ice=[];
  for(const candidate of queued){if(peer.closed)return;try{await peer.pc.addIceCandidate(candidate);}catch{}}
 }
 async function receiveSignal({from,message},version){
  if(!registration||closed||version!==generation||typeof from!=='string'||!message)return;
  let peer=peers.get(from);
  if(message.type==='offer'){
   if(!isHost()||from===registration.id||!message.sdp)return;
   const result=await request('members',{token:registration.token});
   if(closed||version!==generation||!isHost())return;
   const member=result.players?.find(player=>player.id===from&&player.hostId===registration.id);
   if(!member)return;
   if(peer)destroyPeer(peer);
   peer=makePeer(from,false);peer.member=member;
   peer.readyTimer=setTimeout(()=>dropPeer(peer,Error(LAN_ERROR)),delays.connect);
   peer.pc.ondatachannel=event=>attachChannel(peer,event.channel);
   try{
    await peer.pc.setRemoteDescription(message.sdp);await flushIce(peer);
    await peer.pc.setLocalDescription(await peer.pc.createAnswer());
    await signal(from,{type:'answer',sdp:peer.pc.localDescription},version);
   }catch(error){destroyPeer(peer,error);}
  }else if(message.type==='answer'){
   if(!peer?.hostLink||!message.sdp)return;
   try{await peer.pc.setRemoteDescription(message.sdp);await flushIce(peer);}catch(error){dropPeer(peer,error);}
  }else if(message.type==='ice'&&message.candidate){
   if(peer?.pc.remoteDescription){try{await peer.pc.addIceCandidate(message.candidate);}catch{}}
   else{
    const queue=peer?peer.ice:earlyIce.get(from)||[];
    if(queue.length<64)queue.push(message.candidate);
    if(!peer&&earlyIce.size<16)earlyIce.set(from,queue);
   }
  }
 }
 function schedulePoll(delay=isHost()?delays.poll:delays.guestPoll){if(!closed&&registration&&!changingMembership){clearTimeout(pollTimer);pollTimer=setTimeout(poll,delay);}}
 async function poll(){
  if(closed||!registration||changingMembership)return;
  if(pollBusy){schedulePoll();return;}
  pollBusy=true;const version=generation;let finishPoll;pollDone=new Promise(resolve=>{finishPoll=resolve;});
  try{
   const result=await request('poll',{token:registration.token});
   if(closed||version!==generation)return;
   pollFailures=0;
   for(const command of result.commands||[])if(command.type==='resetCookie'&&typeof command.id==='string'){onEvent('resetCookie',{});if(!closed&&registration)await request('ackCookieReset',{token:registration.token,id:command.id});}
   for(const message of (result.signals||[]).slice(0,128))await receiveSignal(message,version);
  }catch(error){if(!closed&&version===generation&&++pollFailures>=3)disconnect('The player directory connection was lost. '+error.message);}
  finally{pollBusy=false;finishPoll();schedulePoll(transitioning?delays.connectingPoll:isHost()?delays.poll:delays.guestPoll);}
 }
 async function heartbeat(){
  if(!registration||closed)return null;
  const version=generation,data=await request('heartbeat',{token:registration.token,active,hp:ownPlayer()?.hp??100});
  if(closed||version!==generation)return null;
  if(data.hostId&&data.hostId!==registration.hostId){
   if(!transitioning)disconnect('The host is no longer available. Choose another player to join.');
   return null;
  }
  replaceRegistration(data);
  if(engine){engine.setPlayerPowers(registration.id,data.powers);const updated=engine.setPlayerLoadout(registration.id,data.loadout);lastState=engine.snapshot();return updated;}
  return ownPlayer();
 }
 function scheduleHeartbeat(){if(!closed&&registration){clearTimeout(heartbeatTimer);heartbeatTimer=setTimeout(runHeartbeat,delays.heartbeat);}}
 async function runHeartbeat(){
  if(heartbeatBusy||closed||!registration){scheduleHeartbeat();return;}
  heartbeatBusy=true;
  try{
   await heartbeat();heartbeatFailures=0;
   if(!isHost()&&!transitioning&&Date.now()-lastHostMessage>25000)disconnect('The host stopped responding. Keep the host game open, then rejoin.');
  }catch(error){if(!closed&&++heartbeatFailures>=3)disconnect('The player directory connection was lost. '+error.message);}
  finally{heartbeatBusy=false;scheduleHeartbeat();}
 }
 async function refreshMembers(){
  if(!registration||closed||!isHost()||!engine)return;
  const version=generation,result=await request('members',{token:registration.token});
  if(closed||version!==generation||!engine||!isHost())return;
  const members=new Map((result.players||[]).filter(player=>player.hostId===registration.id).map(player=>[player.id,player]));
  for(const peer of [...peers.values()]){
   const member=members.get(peer.id);if(!member){destroyPeer(peer,Error('Player membership expired.'));continue;}
   peer.member=member;if(peer.channel?.readyState==='open'){engine.setPlayerPowers(peer.id,member.powers);engine.setPlayerLoadout(peer.id,member.loadout);}
  }
  const own=members.get(registration.id);if(own){registration.powers=own.powers;engine.setPlayerPowers(own.id,own.powers);engine.setPlayerLoadout(own.id,own.loadout);}
  lastState=engine.snapshot();
 }
 function scheduleMembers(){if(!closed&&registration){clearTimeout(membersTimer);membersTimer=setTimeout(runMembers,delays.members);}}
 async function runMembers(){
  if(membersBusy||closed||!registration){scheduleMembers();return;}
  membersBusy=true;
  try{await refreshMembers();memberFailures=0;}catch(error){if(!closed&&isHost()&&++memberFailures>=3)disconnect('Player membership could not be verified. '+error.message);}
  finally{membersBusy=false;scheduleMembers();}
 }
 function askHost(message){
  const peer=peers.get(registration?.hostId);if(!peer||peer.closed||peer.channel?.readyState!=='open')return Promise.reject(Error('The host is not connected.'));
  const requestId=String(++requestSequence);
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{requests.delete(requestId);reject(Error('The host did not respond. Please rejoin.'));},delays.request);
   requests.set(requestId,{resolve,reject,timer});
   if(!send(peer,{...message,requestId})){requests.delete(requestId);clearTimeout(timer);reject(Error('The host connection was lost.'));}
  });
 }
 async function command(action,data={}){
  if(!registration||closed||transitioning)throw Error('The game is not connected.');
  if(!ACTIONS.has(action)||!data||typeof data!=='object'||Array.isArray(data)||JSON.stringify(data).length>4096)throw Error('Invalid game command.');
  if(action==='input')active=data.active===true;
  if(engine)return engine.command(registration.id,action,data)??null;
  return askHost({kind:'command',action,data});
 }
 async function refreshOwnPowers(){
  if(!registration||closed||transitioning)throw Error('Join a game first.');
  const updated=await heartbeat();
  if(closed)throw Error('The game connection was lost.');
  return engine?updated:askHost({kind:'refreshPowers'});
 }
 return {start,join,command,refreshOwnPowers,close,session};
}
