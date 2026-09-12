import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeShotSamples} from '../weapon-audio.js';

test('shot audio has a strong transient, diffuse decay and no clipping at common sample rates',()=>{
 for(const rate of [44100,48000])for(const seed of [7,193,421,997]){
  const channels=makeShotSamples(rate,seed);
  const rms=(a,start,end)=>{let sum=0;for(let i=Math.floor(start*rate);i<Math.floor(end*rate);i++)sum+=a[i]**2;return Math.sqrt(sum/Math.floor((end-start)*rate));};
  for(const channel of channels){
   assert.equal(channel.length,Math.ceil(rate*.95));
   assert.ok(channel.every(n=>Number.isFinite(n)&&Math.abs(n)<=.901));
   assert.equal(Math.abs(channel[0]),0);assert.ok(Math.abs(channel.at(-1))<.00001);
   assert.ok(rms(channel,0,.05)>.1,'audible initial crack and punch');
   assert.ok(rms(channel,.4,.6)<rms(channel,0,.05)*.08,'tail fades well below the shot');
  }
  assert.notDeepEqual(channels[0].slice(rate*.2,rate*.3),channels[1].slice(rate*.2,rate*.3),'diffuse stereo tail');
 }
});
