import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function openBrowser(output){
 await mkdir(output,{recursive:true});
 const child=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--user-data-dir='+path.resolve(output,'profile-'+Date.now()),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome startup timed out')),20000);child.once('error',reject);child.stderr.on('data',chunk=>{const match=chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
 const socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve);socket.addEventListener('error',reject);});
 const pending=new Map(),exceptions=[],listeners=new Map();let seq=0,session;
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data),p=pending.get(data.id);if(p){clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(Error(data.error.message)):p.resolve(data.result);}if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.text);for(const listener of listeners.get(data.method)||[])Promise.resolve().then(()=>listener(data.params)).catch(error=>exceptions.push(error.message));});
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser timeout: '+method));},180000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(session?{sessionId:session}:{})}));});
 const target=await command('Target.createTarget',{url:'about:blank'});session=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 for(const domain of ['Page','Runtime','Network'])await command(domain+'.enable');
 const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||'Browser evaluation failed');return r.result.value;};
 const wait=async(expression,timeout=18000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,200));}throw Error('Browser condition timed out: '+expression);};
 const text=value=>wait(`document.body.innerText.toLowerCase().includes(${JSON.stringify(value.toLowerCase())})`);
 const input=async(selector,value)=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing input');el.focus();const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await new Promise(r=>setTimeout(r,80));};
 const click=async(value,selector='button')=>{await new Promise(r=>setTimeout(r,400));const point=await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(value)});if(!el)throw Error('Missing control: '+${JSON.stringify(value)});if(${JSON.stringify(selector)}==='button'){el.click();return null;}el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);if(point){await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});}};
 const screenshot=async name=>{await new Promise(resolve=>setTimeout(resolve,500));const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));};
 const viewport=async(width,height=1000)=>command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
 const close=async()=>{await command('Browser.close').catch(()=>{});socket.close();child.kill();for(const p of pending.values())clearTimeout(p.timer);};
 const onEvent=(name,listener)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(listener);return()=>listeners.get(name).delete(listener);};
 return {command,evaluate,wait,text,input,click,screenshot,viewport,close,exceptions,onEvent};
}
