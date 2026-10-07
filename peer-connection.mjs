// STUN discovers a direct route; there is deliberately no TURN/gameplay relay.
export function peerConfiguration(){return {iceServers:[{urls:'stun:stun.l.google.com:19302'}],iceTransportPolicy:'all'};}

export function whenChannelOpen(channel,callback){
 let opened=false;
 const open=()=>{if(opened)return;opened=true;callback();};
 channel.onopen=open;
 if(channel.readyState==='open')queueMicrotask(open);
}

// A local two-peer round trip, without joining a player or granting admin access.
export async function probePeerConnection({RTC=globalThis.RTCPeerConnection,timeout=12000}={}){
 if(typeof RTC!=='function')throw Error('This browser does not support WebRTC.');
 const peers=[new RTC(peerConfiguration()),new RTC(peerConfiguration())],queued=[[],[]];
 let finished=false,timer,resolve,reject;
 const received=new Promise((yes,no)=>{resolve=yes;reject=no;});void received.catch(()=>{});
 const fail=error=>{if(!finished)reject(error);};
 try{
  peers.forEach((peer,index)=>{peer.onicecandidate=event=>{
   if(!event.candidate||finished)return;const target=1-index;
   if(peers[target].remoteDescription)void peers[target].addIceCandidate(event.candidate).catch(fail);
   else queued[target].push(event.candidate);
  };});
  peers[1].ondatachannel=event=>{const channel=event.channel;channel.onmessage=message=>{if(message.data==='dustline-ping')channel.send('dustline-pong');};};
  const channel=peers[0].createDataChannel('dustline-probe');
  channel.onmessage=message=>{if(message.data==='dustline-pong')resolve({transport:'webrtc',roundTrip:true});};
  whenChannelOpen(channel,()=>channel.send('dustline-ping'));
  timer=setTimeout(()=>fail(Error('Direct P2P is blocked or timed out in this browser.')),timeout);
  const exchange=async()=>{
   await peers[0].setLocalDescription(await peers[0].createOffer());
   await peers[1].setRemoteDescription(peers[0].localDescription);
   for(const candidate of queued[1])await peers[1].addIceCandidate(candidate);queued[1]=[];
   await peers[1].setLocalDescription(await peers[1].createAnswer());
   await peers[0].setRemoteDescription(peers[1].localDescription);
   for(const candidate of queued[0])await peers[0].addIceCandidate(candidate);queued[0]=[];
   return received;
  };
  return await Promise.race([exchange(),received]);
 }finally{finished=true;clearTimeout(timer);for(const peer of peers)peer.close();}
}
