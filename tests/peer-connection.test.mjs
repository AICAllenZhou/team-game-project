import test from 'node:test';
import assert from 'node:assert/strict';
import {peerConfiguration,whenChannelOpen,probePeerConnection} from '../peer-connection.mjs';

test('peer discovery has STUN and no relay server',()=>{
 const config=peerConfiguration();assert.equal(config.iceTransportPolicy,'all');
 assert.deepEqual(config.iceServers,[{urls:'stun:stun.l.google.com:19302'}]);
});

test('channel ready callback runs once even when open precedes listener attachment',async()=>{
 let count=0;const channel={readyState:'open'};whenChannelOpen(channel,()=>count++);
 channel.onopen();await Promise.resolve();assert.equal(count,1);
 const connecting={readyState:'connecting'};whenChannelOpen(connecting,()=>count++);
 await Promise.resolve();assert.equal(count,1);connecting.onopen();assert.equal(count,2);
});

test('public probe reports unsupported browsers and closes peers on timeout',async()=>{
 await assert.rejects(probePeerConnection({RTC:null}),/does not support/);
 const peers=[];
 class RTC{
  constructor(){peers.push(this);}
  createDataChannel(){return {readyState:'connecting'};}
  async createOffer(){return {type:'offer',sdp:'probe'};}
  async createAnswer(){return {type:'answer',sdp:'probe'};}
  async setLocalDescription(value){this.localDescription=value;}
  async setRemoteDescription(value){this.remoteDescription=value;}
  close(){this.closed=true;}
 }
 await assert.rejects(probePeerConnection({RTC,timeout:10}),/timed out/);
 assert.equal(peers.length,2);assert.ok(peers.every(peer=>peer.closed));
});
