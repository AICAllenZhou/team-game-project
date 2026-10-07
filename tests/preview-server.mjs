import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHandler} from '../api/multiplayer.mjs';
import {MemoryStore} from './memory-store.mjs';
const handler=createHandler(new MemoryStore(Date.now));
const base=new URL('../dist/',import.meta.url);
http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/api/multiplayer')return handler(req,res);
 if(path.startsWith('/api/')){res.writeHead(404);res.end();return;}
 const file=new URL(path==='/'?'index.html':'.'+path,base);
 if(!file.href.startsWith(base.href)){res.writeHead(403);res.end();return;}
 try{const data=await readFile(file);res.setHeader('Content-Type',path.endsWith('.css')?'text/css':path.endsWith('.wav')?'audio/wav':path==='/'||path.endsWith('.html')?'text/html':'text/javascript');res.setHeader('Cache-Control','no-store');res.end(data);}catch{res.writeHead(404);res.end();}
}).listen(3117,'127.0.0.1',()=>console.log('P2P preview http://127.0.0.1:3117'));
