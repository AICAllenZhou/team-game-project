import {createMenu} from './menu.js';

// Keep the menu usable and explain the problem if 3D initialization fails.
import('./game.js').catch(error=>{
 console.error(error);
 const message=/WebGL|context/i.test(error.message)
  ? 'This browser cannot start WebGL. Enable hardware acceleration or open the game in a browser with WebGL support.'
  : 'The game could not load. Refresh the page to try again.';
 const menu=createMenu({
  join:async()=>{throw Error(message);},
  getSession:()=>({started:false,online:false}),
  changePowers:()=>{},
 });
 menu.message(message);
});
