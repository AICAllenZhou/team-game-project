import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePlay} from '../play-start.js';

test('mouse capture starts synchronously before audio and never waits for audio',async()=>{
 const calls=[];const capture=preparePlay({captureMouse(){calls.push('capture');},startAudio(){calls.push('audio');return {ready:new Promise(()=>{}),resume:()=>new Promise(()=>{})};}});
 assert.deepEqual(calls,['capture','audio']);assert.equal(await capture,null);
});
test('audio failures do not block Play and rejected mouse capture can be retried',async()=>{
 const denied=Error('Click again');assert.equal(await preparePlay({captureMouse:()=>Promise.reject(denied),startAudio:()=>{throw Error('Audio unavailable');}}),denied);
 assert.equal(await preparePlay({captureMouse:()=>{},startAudio:()=>({ready:Promise.reject(Error('Missing file')),resume:()=>Promise.reject(Error('Autoplay blocked'))})}),null);
});
test('admin preparation keeps the menu open without requesting mouse capture',async()=>{
 let captures=0;await preparePlay({stayInMenu:true,captureMouse:()=>captures++,startAudio:()=>null});assert.equal(captures,0);
});
