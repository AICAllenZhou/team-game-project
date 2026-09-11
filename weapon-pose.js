// The weapon's frame sits at a fixed reach from the eye. Recoil rotates it
// around that anchor; aim, walking and reload never push it toward the camera.
export const WEAPON_REACH = .78;
export function placeWeapon(rig, {yaw = 0, pitch = 0, bob = 0, lean = 0, recoil = 0, reload = false}) {
  const horizontal = Math.max(-.32, Math.min(.32, yaw));
  const vertical = Math.max(-.25, Math.min(.25, pitch));
  rig.position.set(.29 - horizontal * .7, -.23 + vertical * .55 + bob * .4 - (reload ? .12 : 0), -.67);
  rig.position.setLength(WEAPON_REACH);
  rig.rotation.set(vertical + recoil * 1.5, horizontal, reload ? -.4 : lean * .16, 'YXZ');
}
