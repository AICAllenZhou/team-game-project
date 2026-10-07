import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SHOT_FILES,createWeaponAudio} from '../weapon-audio.js';

test('recorded gunshots have an immediate transient, clean decay and playable PCM headers',async()=>{
 const clips=[];
 for(const file of SHOT_FILES){
  const wav=await readFile(new URL('../'+file,import.meta.url));
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
  let fmt,data;
  for(let offset=12;offset+8<=wav.length;){const size=wav.readUInt32LE(offset+4),id=wav.toString('ascii',offset,offset+4),chunk=wav.subarray(offset+8,offset+8+size);if(id==='fmt ')fmt=chunk;if(id==='data')data=chunk;offset+=8+size+(size%2);}
  assert.ok(fmt&&data);assert.equal(fmt.readUInt16LE(0),1);assert.equal(fmt.readUInt16LE(2),2);assert.equal(fmt.readUInt32LE(4),48000);assert.equal(fmt.readUInt16LE(14),16);
  const samples=Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768);
  clips.push(samples);
  const rms=(start,end)=>{const a=samples.slice(Math.floor(start*96000),Math.floor(end*96000));return Math.sqrt(a.reduce((sum,n)=>sum+n*n,0)/a.length);};
  assert.ok(Math.abs(samples.length/96000-1.2)<.002);
  assert.ok(samples.every(n=>Math.abs(n)<.95),'no clipped PCM samples');
  assert.ok(rms(0,.08)>.025,'shot attack is not buried behind silence');
  assert.ok(rms(.9,1.1)<rms(0,.08)*.3,'long tail decays');
  assert.ok(rms(.2,.45)>.003,'body lasts beyond the initial crack');
  assert.ok(Math.abs(samples.at(-1))<.001,'tail ends cleanly');
 }
 // Six rapid shots must fit in the mixer without a compressor crushing them.
 const stride=Math.round(.125*96000),mix=new Float64Array(stride*5+clips[0].length);
 for(let shot=0;shot<6;shot++){const clip=clips[shot%clips.length];for(let i=0;i<clip.length;i++)mix[shot*stride+i]+=clip[i]*.85;}
 assert.ok(mix.every(n=>Math.abs(n)<1),'fan-fire overlap retains output headroom');
});


test('remote gunshots use directional distance attenuation while local shots stay dry',async t=>{
 const previousAudio=globalThis.AudioContext,previousFetch=globalThis.fetch,nodes=[],sources=[];
 const param=()=>({value:0});
 class Node{constructor(){this.connections=[];}connect(node){this.connections.push(node);}disconnect(){}}
 class Context{
  constructor(){this.state='running';this.sampleRate=48000;this.destination={};this.listener=Object.fromEntries(['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ'].map(k=>[k,param()]));nodes.push(this);}
  createGain(){const n=new Node();n.gain=param();return n;}
  createPanner(){const n=new Node();n.positionX=param();n.positionY=param();n.positionZ=param();nodes.push(n);return n;}
  createBufferSource(){const n=new Node();n.playbackRate=param();n.start=()=>{};n.stop=()=>n.onended?.();sources.push(n);return n;}
  resume(){return Promise.resolve();}suspend(){return Promise.resolve();}decodeAudioData(){return Promise.resolve({});}
 }
 globalThis.AudioContext=Context;globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
 t.after(()=>{globalThis.AudioContext=previousAudio;globalThis.fetch=previousFetch;});
 const audio=createWeaponAudio();await audio.ready;audio.listener({x:2,y:1.5,z:3},{x:0,y:0,z:-1});
 audio.play(1);assert.equal(nodes.length,1);
 audio.play(.82,{x:10,y:2,z:0});const pan=nodes[1];assert.equal(pan.panningModel,'HRTF');assert.equal(pan.distanceModel,'inverse');assert.equal(pan.positionX.value,10);assert.ok(pan.rolloffFactor>0);assert.equal(sources[1].playbackRate.value,.82);assert.equal(nodes[0].listener.forwardZ.value,-1);
 await audio.pause();assert.equal(sources[1].connections.length,1);
});
