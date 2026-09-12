import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url),ref=process.argv[2]??'HEAD~1';
const baseline=execFileSync('git',['show',ref+':game.js'],{cwd:root,encoding:'utf8'}).replace("from './weapon-pose.js'","from './baseline-pose.js'");
const baselinePose=execFileSync('git',['show',ref+':weapon-pose.js'],{cwd:root,encoding:'utf8'});
const baselineCss=execFileSync('git',['show',ref+':style.css'],{cwd:root,encoding:'utf8'});
function instrument(source){return source.replace('onFrame:now=>frame(now)','onFrame:now=>benchmarkFrame(now)')
 .replace('locked=!!document.pointerLockElement','locked=true')
 .replace('if(!document.pointerLockElement||','if(false||')
 .replace("document.addEventListener('visibilitychange',()=>{if(document.hidden)document.exitPointerLock();syncActivity();});",'')
 .replace("window.addEventListener('focus',syncActivity);",'')
 .replace("window.addEventListener('blur',()=>{document.exitPointerLock();syncActivity(false);});",'')
 .replace('renderReady=true;frame(gameLoop.now());syncActivity();',`renderReady=true;
 const output=document.createElement('pre');output.id='benchmark';output.style='position:fixed;top:0;left:0;background:#000;color:#fff;padding:12px;z-index:100';document.body.append(output);document.getElementById('play').style.display='none';
 const samples=[],cpu=[],calls=[];let previous=0;
 renderer.info.autoReset=false;
 function benchmarkFrame(now){const start=performance.now();renderer.info.reset();lookYaw=.35*Math.sin(now/1600);lookPitch=-.13;focusHeld=true;
 if(now-lastShot>180){local.ammo=6;fire(true,now);}frame(now);
 if(now>2000){samples.push(now-previous);cpu.push(performance.now()-start);calls.push(renderer.info.render.calls);}previous=now;
 if(now>10000){gameLoop.stop();const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;const sorted=[...samples].sort((a,b)=>a-b);output.textContent=JSON.stringify({complete:true,hidden:document.hidden,focused:document.hasFocus(),frames:samples.length,fps:1000/mean(samples),p95FrameMs:sorted[Math.floor(sorted.length*.95)],cpuMs:mean(cpu),drawCalls:mean(calls),resolution:[renderer.domElement.width,renderer.domElement.height]},null,2);}
 else output.textContent='Benchmark running '+Math.round(now/1000)+' / 10 seconds';}
 gameLoop.start();`);}
http.createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/baseline-pose.js'){res.setHeader('Content-Type','text/javascript');return res.end(baselinePose);}
 if(path==='/baseline'||path==='/optimized'){res.setHeader('Content-Type','text/html');return res.end(`<html><head><link rel="stylesheet" href="/${path.slice(1)}.css"></head><body><canvas id="game"></canvas><div class="lens"></div><button id="play">Join</button><script type="module" src="${path}.js"></script></body></html>`);}
 if(path==='/baseline.css'){res.setHeader('Content-Type','text/css');return res.end(baselineCss);}
 if(path==='/optimized.css'){res.setHeader('Content-Type','text/css');return res.end(await readFile(new URL('style.css',root)));}
 if(path==='/baseline.js'||path==='/optimized.js'){res.setHeader('Content-Type','text/javascript');return res.end(instrument(path==='/baseline.js'?baseline:await readFile(new URL('game.js',root),'utf8')));}
 if(!/^\/(vendor\/(three.module|three.core)\.js|[a-z-]+\.(js|mjs))$/.test(path)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL(path.slice(1),root)));
 }catch(e){res.writeHead(500);res.end(e.message);}}).listen(3102,'127.0.0.1',()=>console.log('Performance comparison at http://localhost:3102/baseline'));
