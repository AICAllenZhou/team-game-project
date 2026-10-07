import {AMMO_MODS,ammoProfile} from './weapons.mjs';

export function adminLoadout(previous,data,revision){
 const result={revision,hasShotgun:previous?.hasShotgun===true,hasBow:previous?.hasBow===true,mods:{...previous?.mods}};
 if(data.allWeapons===true)result.hasShotgun=result.hasBow=true;
 if(data.weapon!==undefined||data.mod!==undefined){
  if(!Object.hasOwn(AMMO_MODS,data.weapon)||!Object.hasOwn(AMMO_MODS[data.weapon],data.mod))throw Error('Invalid ammo');
  result.mods[data.weapon]=data.mod;
 }
 return result;
}

// Apply only directory-verified updates. Repeated presence refreshes must not refill ammo.
export function applyAdminLoadout(player,loadout){
 if(!loadout?.revision||player.adminLoadoutRevision===loadout.revision)return player;
 player.adminLoadoutRevision=loadout.revision;
 if(loadout.hasShotgun)player.hasShotgun=true;if(loadout.hasBow){player.hasBow=true;player.ammoByWeapon.bow??=1;}
 for(const [weapon,mod] of Object.entries(loadout.mods||{})){
  if(!Object.hasOwn(AMMO_MODS,weapon)||!Object.hasOwn(AMMO_MODS[weapon],mod))continue;
  player.mods={...player.mods,[weapon]:mod};
  player.ownedAmmo=[...new Set([...(player.ownedAmmo||[]),weapon+':'+mod])];
  player.ammoByWeapon={...player.ammoByWeapon,[weapon]:ammoProfile(weapon,player.mods).capacity};
  if(player.weapon===weapon){player.ammo=player.ammoByWeapon[weapon];player.reloadUntil=0;}
 }
 return player;
}

export function createAutoFire(){
 let held=false,next=0;
 return {press(){held=true;next=0;},release(){held=false;next=0;},
  ready(now,{active,unlocked,powers}){
   if(!held||!active||!unlocked||!powers?.fullAuto)return false;
   if(now<next)return false;next=now+50;return true;
  }};
}
