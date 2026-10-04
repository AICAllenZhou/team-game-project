import test from 'node:test';
import assert from 'node:assert/strict';
import {createBeanScare} from '../bean-scare.js';
test('bean scare dismisses, expires, limits repeats, and survives unavailable audio',()=>{
 let time=0,expire,dismiss,sounds=0;const element={hidden:true};
 const scare=createBeanScare({element,closeButton:{addEventListener(type,fn){dismiss=fn;}},canShow:()=>true,now:()=>time,later:fn=>{expire=fn;return 1;},cancel:()=>{},playSound:()=>{sounds++;throw Error('No audio');}});
 assert.equal(scare.show(),true);assert.equal(element.hidden,false);assert.equal(sounds,1);
 assert.equal(scare.show(),false);dismiss();assert.equal(element.hidden,true);assert.equal(scare.show(),false);
 time=25000;assert.equal(scare.show(),true);expire();assert.equal(element.hidden,true);
});


test('scare is denied by default and checks admin access on every trigger',()=>{
 let admin=false,sounds=0;const element={hidden:true},options={element,closeButton:{addEventListener(){}},later:()=>1,cancel:()=>{},playSound:()=>sounds++};
 assert.equal(createBeanScare(options).show(),false);
 const scare=createBeanScare({...options,canShow:()=>admin});
 assert.equal(scare.show(),false);assert.equal(element.hidden,true);assert.equal(sounds,0);
 admin=true;assert.equal(scare.show(),true);assert.equal(sounds,1);
 admin=false;scare.hide();assert.equal(scare.show(),false);assert.equal(element.hidden,true);
});
