import test from 'node:test';
import assert from 'node:assert/strict';
import {woundRim} from '../can-wounds.js';

test('jagged flaps form one connected annulus with an open center',()=>{
 for(const exit of [false,true]){
  const rim=woundRim(.075,false,exit),indices=rim.index.array,positions=rim.attributes.position,neighbors=new Map(),edges=new Map();
  for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){
   const a=indices[i+j],b=indices[i+(j+1)%3],key=[a,b].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);
   if(!neighbors.has(a))neighbors.set(a,new Set());neighbors.get(a).add(b);
   if(!neighbors.has(b))neighbors.set(b,new Set());neighbors.get(b).add(a);
  }
  const seen=new Set(),queue=[0];while(queue.length){const vertex=queue.pop();if(seen.has(vertex))continue;seen.add(vertex);queue.push(...neighbors.get(vertex));}
  assert.equal(seen.size,positions.count);assert.ok([...edges.values()].every(count=>count<=2));
  assert.equal(positions.count-edges.size+indices.length/3,0);
  for(let i=0;i<positions.count;i++)assert.ok(Math.hypot(positions.getX(i),positions.getY(i))>.05);
  assert.ok(exit?positions.getZ(0)>.03:positions.getZ(0)<-.01);
 }
});
