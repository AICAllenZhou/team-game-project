import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SHOT_FILES} from '../weapon-audio.js';

test('recorded gunshots have an immediate transient, clean decay and playable PCM headers',async()=>{
 for(const file of SHOT_FILES){
  const wav=await readFile(new URL('../'+file,import.meta.url));
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
  let fmt,data;
  for(let offset=12;offset+8<=wav.length;){const size=wav.readUInt32LE(offset+4),id=wav.toString('ascii',offset,offset+4),chunk=wav.subarray(offset+8,offset+8+size);if(id==='fmt ')fmt=chunk;if(id==='data')data=chunk;offset+=8+size+(size%2);}
  assert.ok(fmt&&data);assert.equal(fmt.readUInt16LE(0),1);assert.equal(fmt.readUInt16LE(2),2);assert.equal(fmt.readUInt32LE(4),48000);assert.equal(fmt.readUInt16LE(14),16);
  const samples=Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768);
  const rms=(start,end)=>{const a=samples.slice(Math.floor(start*96000),Math.floor(end*96000));return Math.sqrt(a.reduce((sum,n)=>sum+n*n,0)/a.length);};
  assert.ok(Math.abs(samples.length/96000-.56)<.002);
  assert.ok(samples.every(n=>Math.abs(n)<.95),'no clipped PCM samples');
  assert.ok(rms(0,.08)>.025,'shot attack is not buried behind silence');
  assert.ok(rms(.35,.55)<rms(0,.08)*.3,'background and reflections decay');
  assert.ok(Math.abs(samples.at(-1))<.001,'tail ends cleanly');
 }
});
