import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {openBrowser} from './browser-driver.mjs';
const data=await readFile('.local/final-local/itinerary.pdf');
const server=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'application/pdf'});res.end(data);}).listen(0,'127.0.0.1');await once(server,'listening');
const browser=await openBrowser('.local/final-local/pdf-review');
try{await browser.viewport(1200,1100);await browser.command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/itinerary.pdf'});await new Promise(r=>setTimeout(r,2000));await browser.screenshot('pdf-opened');console.log('PDF opened in Chrome and captured.');}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
