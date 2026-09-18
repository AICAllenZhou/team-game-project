// The weapon's frame sits at a fixed reach from the eye. Recoil rotates it
// around that anchor; aim, walking and reload never push it toward the camera.
export const WEAPON_REACH = .78;
export function placeWeapon(rig, {yaw = 0, pitch = 0, bob = 0, lean = 0, recoil = 0, reload = false, shotgun = false, focus = 0}) {
  const horizontal = Math.max(-.85, Math.min(.85, yaw));
  const vertical = Math.max(-.65, Math.min(.65, pitch));
  rig.position.set(-horizontal * .45, -.23 + (shotgun ? .10*focus : 0) + vertical * .4 + bob * .4 - (reload ? .12 : 0), -.67);
  rig.position.setLength(WEAPON_REACH);
  rig.rotation.set(vertical + recoil * 1.5, horizontal, reload ? -.4 : lean * .16, 'YXZ');
}

// Camera sensitivity depends only on RMB, never on where the hand is pointing.
// Transferring overflow to the camera made identical mouse motion accelerate
// as the hand reached its limit, which felt like a jolt.
export function freeAimInput(state, dx, dy, focus) {
  const limitX=.28+.28*focus,limitY=.2+.18*focus,speed=.6*(1-.7*focus),handShare=1-(.18-.12*focus),x=dx*.0018,y=dy*.0018;
  // This runs at mouse polling frequency; avoid temporary arrays per event.
  state.freeX=Math.max(-limitX,Math.min(limitX,state.freeX+x*handShare));
  state.freeY=Math.max(-limitY,Math.min(limitY,state.freeY+y*handShare));
  state.lookYaw-=x*speed;state.lookPitch-=y*speed;
  state.lookPitch=Math.max(-1.35,Math.min(1.35,state.lookPitch));
}

export function followAim(state,dt){
  // Mouse distance directly determines head rotation, without acceleration,
  // a speed cap or a spring continuing to turn after the mouse stops.
  state.yaw=state.lookYaw;state.pitch=state.lookPitch;
  // Follow LOCAL offsets, not a wrapped world angle. Even repeated full turns
  // cannot strand the barrel facing backwards or swap the side it lags toward.
  // Exact exponential response to a linearly moving target. A fixed 35 ms
  // time constant gives the same follow at 30, 60 and 144 Hz.
  const tau=.035,decay=Math.exp(-dt/tau);
  const targetX=-state.freeX,targetY=-state.freeY,startX=-(state.previousFreeX??state.freeX),startY=-(state.previousFreeY??state.freeY);
  const speedX=dt>0?(targetX-startX)/dt:0,speedY=dt>0?(targetY-startY)/dt:0;
  state.handYaw=targetX-speedX*tau+(state.handYaw-startX+speedX*tau)*decay;
  state.handPitch=targetY-speedY*tau+(state.handPitch-startY+speedY*tau)*decay;
  state.previousFreeX=state.freeX;state.previousFreeY=state.freeY;
}

export function stepRecoil(s,dt){
  // Substeps keep the wrist spring stable on both slow and fast displays.
  const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
  for(let i=0;i<steps;i++){s.velocity+=(-155*s.angle-16*s.velocity)*h;s.angle+=s.velocity*h;}
}

export function kickRecoil(s,fan=false){const multiplier=fan?1.12:1;s.velocity=Math.min(27,s.velocity+17*multiplier);s.angle=Math.min(1.1,s.angle+.11*multiplier);}

export function captureBarrelRay(gun){
 const muzzle=gun.userData.muzzleObject??gun;muzzle.updateWorldMatrix(true,false);
 const origin=muzzle.localToWorld(gun.position.clone().set(0,.025,gun.userData.muzzleZ??-.52));
 const direction=gun.position.clone().set(0,0,-1).transformDirection(muzzle.matrixWorld);
 return {origin,direction};
}
