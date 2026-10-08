import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect} from '../website/node_modules/@playwright/test/index.mjs';
import {mapFixture} from '../server/tests/interactive-maps-fixture.mjs';

assert.match(process.env.MYSQL_TEST_DATABASE||'',/_test$/,'Use a separate test database.');
const output=path.resolve('.local/essentials-repair');await mkdir(output,{recursive:true});
const fixture=await mapFixture();
const {snapshot}=await import('../server/itinerary-service.js'),{transaction}=await import('../server/db.js');
const {refreshEssentials}=await import('../server/premium-travel/essentials.js'),{config}=await import('../server/config.js');
const originalFetch=globalThis.fetch,requests=[];
config.aiKey='essentials-fixture-not-a-real-key';config.aiModel='fixture-model';
// Exercise the existing real HTTP refresh route/provider wrapper with fixture responses only.
globalThis.fetch=async(url,options)=>{
 const address=String(url);
 if(address==='https://api.openai.com/v1/responses'){
  const body=JSON.parse(options.body);requests.push(body);await new Promise(resolve=>setTimeout(resolve,250));
  const sections=body.tools?[]:[
   {key:'power',facts:[{text:'Check your charger and pack a suitable plug adapter.'}]},
   {key:'connectivity',facts:[{text:'Check device compatibility before choosing a local SIM or eSIM.'}]},
   {key:'customs',facts:[{text:'Follow local hosts when deciding whether to leave a tip.'}]},
   {key:'rules',facts:[{text:'Keep your voice low on public transport.'}]},
   {key:'water',facts:[{text:'Carry a reusable bottle and tissues.'}]},
   {key:'critical',facts:[{text:'Keep a digital copy of your itinerary.'}]},
   {key:'emergency',facts:[{text:'Call 119 for help.'}]},
   {key:'entryDocuments',facts:[{text:'No visa needed.'}]}
  ];
  return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({sections})}]}]}),{headers:{'Content-Type':'application/json'}});
 }
 if(address.startsWith(fixture.origin+'/'))return originalFetch(url,options);
 throw Error('External calls are disabled in the Essentials fixture.');
};
let browser;
try{
 const paid=fixture.paidSingle;
 await fixture.pool.execute('UPDATE trips SET name=?,destination=?,country=?,currency=?,timezone=? WHERE id=? AND owner_id=?',['Kyoto essentials review','Kyoto','Japan','JPY','Asia/Tokyo',paid.trip.id,paid.id]);
 const state={...await transaction(db=>snapshot(db,paid.trip.id,paid.id)),ownerId:paid.id};
 const checkedAt=new Date(Date.now()-360001).toISOString();
 await refreshEssentials(state,'AL',{now:Date.parse(checkedAt),retrieve:async()=>({status:'ready',sections:[
  {key:'transport',facts:[{text:'Fixture-only transport summary from a simulated tourism authority.',sourceUrl:'https://www.japan.travel/en/plan/',sourceType:'official',evidenceType:'page',checkedAt}]},
  {key:'power',facts:[{text:'Fixture-only plug reference from a simulated standards organization.',sourceUrl:'https://www.iec.ch/world-plugs',sourceType:'trusted',evidenceType:'page',checkedAt}]},
  {key:'customs',facts:[{text:'Follow local hosts when deciding whether to leave a tip.',sourceType:'ai_general',sourceUrl:null}]}
 ]})});
 const itemBefore=JSON.stringify(state.items);
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://**/*',route=>route.abort());
 const [name,value]=paid.cookie.split('=');await page.context().addCookies([{name,value,url:fixture.origin}]);
 await page.goto(fixture.origin);await page.evaluate(()=>localStorage.setItem('tripnexa.passport-country','AL'));
 const open=async()=>{await page.getByRole('button',{name:'View essentials',exact:true}).click();await expect(page.locator('.essentials-country h3')).toHaveText('Japan travel essentials');};
 const noOverflow=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const dialog=page.locator('.premium-trip-dialog');assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false);const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=page.viewportSize().width);};
 const section=title=>page.locator('.essentials-sections details').filter({has:page.locator('summary',{hasText:title})});
 await page.goto(`${fixture.origin}/trip/${paid.trip.id}`);await open();
 await expect(page.locator('.passport-country select')).toHaveValue('AL');await expect(page.locator('.passport-country span')).toHaveText('Choose passport country');
 await expect(page.getByRole('dialog')).toContainText('Saved trip currency: JPY');await section('Time zone').locator('summary').click();await expect(section('Time zone')).toContainText('Saved trip timezone: Asia/Tokyo');
 await section('Local transport').locator('summary').click();await section('Power & plugs').locator('summary').click();await section('Tipping & local customs').locator('summary').click();
 await expect(section('Local transport').getByRole('link',{name:'Official source'})).toBeVisible();await expect(section('Power & plugs').getByRole('link',{name:'Trusted source'})).toBeVisible();await expect(section('Tipping & local customs').locator('.essentials-provenance')).toHaveText('AI general guidance');
 await expect(section('Entry & documents')).toContainText('Current verified information was not available.');assert.equal(await section('Entry & documents').locator('a').count(),0);
 await noOverflow();await page.screenshot({path:path.join(output,'desktop-essentials.png'),animations:'disabled'});
 assert.equal(requests.length,0,'Opening a saved panel does not generate AI');
 await page.getByRole('button',{name:'Refresh essentials',exact:true}).click();await expect(page.getByRole('button',{name:'Checking travel information…'})).toBeVisible();await expect(page.getByRole('dialog')).toContainText('Travel essentials updated.');
 assert.equal(requests.length,3);assert.equal(requests.filter(body=>body.tools).length,2);assert.equal(JSON.parse(requests[1].input).travelerPassportCountry,'AL');
 assert(!JSON.stringify(requests).includes(paid.email));assert(!JSON.stringify(requests).includes(paid.id));
 await expect(section('Power & plugs')).toContainText('Fixture-only plug reference');await expect(section('Local transport')).toContainText('Fixture-only transport summary');
 const emergency=section('Emergency numbers');await emergency.locator('summary').click();await expect(emergency).toContainText('Current verified information was not available.');await expect(emergency).not.toContainText('119');
 assert.equal(await section('Entry & documents').locator('.essentials-provenance').count(),0);assert.equal(await emergency.locator('.essentials-provenance').count(),0);
 assert.equal(await page.locator('.essentials-provenance').first().locator('..').locator('a').count(),0,'AI guidance has no fake citation');
 await page.keyboard.press('Escape');await page.reload();await open();assert.equal(requests.length,3);await expect(page.locator('.passport-country select')).toHaveValue('AL');
 await page.setViewportSize({width:390,height:844});await section('Power & plugs').locator('summary').click();await section('Connectivity / SIM / eSIM').locator('summary').click();await section('Local transport').locator('summary').click();await noOverflow();await expect(page.locator('.passport-country span')).toBeVisible();await page.screenshot({path:path.join(output,'mobile-essentials.png'),animations:'disabled'});
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 const after=await transaction(db=>snapshot(db,paid.trip.id,paid.id));assert.equal(JSON.stringify(after.items),itemBefore);assert.deepEqual(errors,[]);
 const report={fixture:true,testDatabase:process.env.MYSQL_TEST_DATABASE,viewports:[1440,390],checks:['Albania selection remembered; Choose passport country always visible','Official/trusted/AI labels and saved JPY/Asia-Tokyo data','Actual refresh route, grouped retrieval and success/progress copy','High-risk entry/emergency unverified; no memory claims or fake AI links','Same-context official/trusted facts retained after simulated retrieval failure','No AI generation on open/reload; no overflow/browser errors/itinerary edits'],screenshots:['desktop-essentials.png','mobile-essentials.png'],liveAiCalls:0};
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();globalThis.fetch=originalFetch;await fixture.close();}
