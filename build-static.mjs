import {mkdir,copyFile,cp,writeFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url),out=new URL('./dist/',root);
await mkdir(out,{recursive:true});
for(const file of ['bow-feedback.js','bow-string.mjs','peer-connection.mjs','arena.mjs','bow-view.js','duel-ui.js','play-start.js','bean-scare.js','admin-gameplay.mjs','saved-player.js','training-cans.mjs','connection-check.html','connection-check.js','lan-client.js','room-engine.mjs','shop.mjs','shop-view.js','shop-ui.js','can-wounds.js','can-physics.js','food-geometry.js','food-splats.js','projectile-physics.mjs','can-characters.js','bootstrap.js','combat.mjs','menu.js','runtime-config.js','voxel-walls.mjs','voxel-wall-view.js','index.html','style.css','game.js','game-loop.js','render-batches.js','weapon-pose.js','weapon-audio.js','simulation.mjs','skeet.mjs','skeet-view.js','weapons.mjs','shotgun-view.js','shell-physics.js']){
  await copyFile(new URL(file,root),new URL(file,out));
}
await cp(new URL('vendor/',root),new URL('vendor/',out),{recursive:true});
await cp(new URL('assets/',root),new URL('assets/',out),{recursive:true});
console.log('Built DUSTLINE browser game in dist/');

const apiBase=(process.env.MULTIPLAYER_URL||'').replace(/\/$/,'');
if(apiBase){const url=new URL(apiBase);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid MULTIPLAYER_URL');}
await writeFile(new URL('runtime-config.js',out),'export const API_BASE='+JSON.stringify(apiBase)+';\n');
