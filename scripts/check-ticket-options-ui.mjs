import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {openBrowser} from './browser-driver.mjs';

// Isolated browser fixture: no database writes or real booking/provider requests.
const fixture = `<html><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import TicketOptions from '/src/components/itinerary/TicketOptions.jsx';
import '/src/index.css';
import '/src/styles/trip-experience.css';
window.fetch=async()=>new Response(JSON.stringify({ticketable:true,booking:{},context:{name:'Pantheon',city:'Rome',country:'Italy'},providers:[{provider:'klook',name:'Klook',description:'Tickets, tours & experiences',url:'https://example.com'}],disclosure:'Some links are affiliate links.'}),{headers:{'Content-Type':'application/json'}});
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(TicketOptions,{item:{id:'fixture'},trip:{id:'fixture'}})));
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:5189,strictPort:false},plugins:[{name:'ticket-ui-fixture',configureServer(vite){vite.middlewares.use('/ticket-ui-check',async(req,res,next)=>{if(req.url!=='/'){next();return;}res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/ticket-ui-check',fixture));});}}]});
await server.listen();
const browser=await openBrowser('.local/ticket-options-ui');
const luminance=rgb=>{const values=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
try {
 await browser.command('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/ticket-ui-check`});
 await browser.text('Tickets & tours');
 await browser.click('Tickets & tours');
 await browser.wait('!!document.querySelector(".ticket-options-modal")');
 // Exercise field styles also for input/textarea; the current booking form only has a select.
 await browser.evaluate(`(()=>{const form=document.querySelector('.ticket-options-modal select').parentElement;for(const tag of ['input','textarea']){const el=document.createElement(tag);el.placeholder='Booking reference';el.style.width='100%';form.append(el);} })()`);
 for(const width of [1440,768,390,360]) {
  await browser.viewport(width,900);
  await browser.input('.ticket-options-modal input','Ticket ABC123');
  await browser.input('.ticket-options-modal textarea','Booking notes');
  const result=await browser.evaluate(`(()=>{const modal=document.querySelector('.ticket-options-modal');const controls=[...modal.querySelectorAll('.trip-button,input,select,textarea')];const wallet=controls.find(el=>el.textContent.trim()==='Add your ticket to Travel Wallet');const sample=el=>{const s=getComputedStyle(el);return {text:s.color,background:s.backgroundColor,label:el.value||el.textContent.trim(),placeholder:getComputedStyle(el,'::placeholder').color};};wallet.style.transition='none';const active=sample(wallet);wallet.disabled=true;const disabled=sample(wallet);wallet.disabled=false;return {overflow:modal.scrollWidth>modal.clientWidth||document.documentElement.scrollWidth>innerWidth,controls:controls.map(sample),active,disabled,select:modal.querySelector('select').value,input:modal.querySelector('input').value,textarea:modal.querySelector('textarea').value};})()`);
  assert.equal(result.overflow,false,`Overflow at ${width}px`);
  assert.equal(result.select,'other');
  assert.equal(result.input,'Ticket ABC123');
  assert.equal(result.textarea,'Booking notes');
  for(const control of result.controls)assert(contrast(control.text,control.background)>=4.5,`Text contrast at ${width}px: ${control.label}`);
  for(const control of result.controls.filter(c=>c.label==='Ticket ABC123'||c.label==='Booking notes'))assert(contrast(control.placeholder,control.background)>=4.5);
  assert.notEqual(result.active.background,result.disabled.background);
  assert(contrast(result.disabled.text,result.disabled.background)>=4.5);
  await browser.screenshot(`tickets-${width}`);
  console.log(`${width}px: no overflow; text, placeholders, selected value, active/disabled labels pass contrast checks.`);
 }
 assert.deepEqual(browser.exceptions,[]);
} catch(error) {console.error(error);process.exitCode=1;} finally {await browser.close();server.httpServer.closeAllConnections();await server.close();}


