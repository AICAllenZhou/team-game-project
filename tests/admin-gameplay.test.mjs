import test from 'node:test';
import assert from 'node:assert/strict';
import {adminLoadout,createAutoFire} from '../admin-gameplay.mjs';

test('ammo choices retain granted weapons and reject unknown types',()=>{
 const first=adminLoadout(null,{allWeapons:true},'1');
 const second=adminLoadout(first,{weapon:'shotgun',mod:'slug'},'2');
 assert.equal(second.hasShotgun,true);assert.equal(second.mods.shotgun,'slug');
 assert.throws(()=>adminLoadout(second,{weapon:'bad',mod:'standard'},'3'),/Invalid ammo/);
 assert.throws(()=>adminLoadout(second,{weapon:'revolver',mod:'slug'},'3'),/Invalid ammo/);
});

test('full auto requires held mouse, active gameplay and unlocked admin, and stops on release',()=>{
 const auto=createAutoFire(),state={active:true,unlocked:true,powers:{fullAuto:true}};
 assert.equal(auto.ready(0,state),false);auto.press();assert.equal(auto.ready(0,state),true);assert.equal(auto.ready(10,state),false);assert.equal(auto.ready(50,state),true);
 assert.equal(auto.ready(100,{...state,active:false}),false);assert.equal(auto.ready(100,{...state,unlocked:false}),false);assert.equal(auto.ready(100,{...state,powers:{}}),false);
 auto.release();assert.equal(auto.ready(100,state),false);auto.press();assert.equal(auto.ready(101,state),true);
});
