import {ammoProfile} from './weapons.mjs';
export const MAX_HP=100;
export function shotDamage(weapon,mods,headshot=false){
 const profile=ammoProfile(weapon,mods);
 return headshot?profile.headDamage:profile.damage;
}
export function applyDamage(victim,amount,now){
 if(victim.hp<=0||victim.powers?.infiniteHp)return false;
 victim.hp=Math.max(0,victim.hp-amount);
 if(victim.hp>0)return false;
 victim.deaths=(victim.deaths||0)+1;victim.deadUntil=now+3000;victim.input={};
 return true;
}
export function setPowers(player,powers){
 player.powers={noRecoil:powers?.noRecoil===true,infiniteAmmo:powers?.infiniteAmmo===true,infiniteHp:powers?.infiniteHp===true};
 if(player.powers.infiniteHp){player.hp=MAX_HP;player.deadUntil=0;}
 if(player.powers.infiniteAmmo){
  player.reloadUntil=0;player.ammo=ammoProfile(player.weapon,player.mods).capacity;
  player.ammoByWeapon={revolver:ammoProfile('revolver',player.mods).capacity,shotgun:ammoProfile('shotgun',player.mods).capacity};
 }
 return player.powers;
}
