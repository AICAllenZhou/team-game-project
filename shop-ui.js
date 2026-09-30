import {AMMO_STOCK,ownsAmmo} from './shop.mjs';
import {woodCanvas} from './shop-view.js';
export function createShopMenu({getPlayer,buy,onClose}){
 const panel=document.createElement('section');panel.id='ammo-shop';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','shop-title');
 panel.style.setProperty('--shop-wood',`url("${woodCanvas().toDataURL()}")`);document.body.append(panel);let busy=false,message='';
 function draw(){const p=getPlayer();panel.replaceChildren();
  const top=document.createElement('div');top.className='shop-heading';const title=document.createElement('h2');title.id='shop-title';title.textContent='GUNZ';
  const close=document.createElement('button');close.className='shop-close';close.textContent='×';close.setAttribute('aria-label','Close shop');close.disabled=busy;close.onclick=()=>api.close();top.append(title,close);panel.append(top);
  const balance=document.createElement('p');balance.className='shop-balance';balance.textContent=(p.beans||0).toLocaleString()+' BEANS';panel.append(balance);
  for(const weapon of ['revolver','shotgun']){
   const heading=document.createElement('h3');heading.textContent=weapon==='revolver'?'REVOLVER':'SHOTGUN';panel.append(heading);
   for(const item of AMMO_STOCK.filter(s=>s.weapon===weapon)){
    const owned=ownsAmmo(p,weapon,item.mod),equipped=(p.mods?.[weapon]||'standard')===item.mod,missing=weapon==='shotgun'&&!p.hasShotgun;
    const row=document.createElement('button');row.className='shop-item';row.disabled=busy||missing||equipped||(!owned&&(p.beans||0)<item.price);
    const label=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small'),price=document.createElement('span');
    name.textContent=item.name;detail.textContent=item.detail;label.append(name,detail);price.className='shop-price';price.textContent=missing?'Need shotgun':equipped?'Loaded':owned?'Equip':item.price+' beans';row.append(label,price);
    row.onclick=async()=>{if(busy)return;busy=true;message='';draw();try{const result=await buy(item);message=result.message;}catch(e){message=e.message;}finally{busy=false;if(!panel.hidden){draw();panel.querySelector('.shop-close').focus();}}};panel.append(row);
   }
  }
  const note=document.createElement('p');note.className='shop-note';note.textContent=message||'Buy once. Keep the ammo type.';note.setAttribute('role','status');panel.append(note);
 }
 const api={get opened(){return !panel.hidden;},open(){message='';panel.hidden=false;document.body.classList.add('shopping');draw();panel.querySelector('.shop-close').focus();},close(){if(busy)return;panel.hidden=true;document.body.classList.remove('shopping');onClose();},refresh(){if(!panel.hidden&&!busy)draw();}};
 panel.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();api.close();}if(e.code==='Tab'){const buttons=[...panel.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});return api;
}
