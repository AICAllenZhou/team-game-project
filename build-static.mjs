import {mkdir,copyFile,cp} from 'node:fs/promises';
const root=new URL('./',import.meta.url),out=new URL('./dist/',root);
await mkdir(out,{recursive:true});
for(const file of ['index.html','style.css','game.js','weapon-pose.js','simulation.mjs']){
  await copyFile(new URL(file,root),new URL(file,out));
}
await cp(new URL('vendor/',root),new URL('vendor/',out),{recursive:true});
console.log('Built DUSTLINE static practice mode in dist/');
