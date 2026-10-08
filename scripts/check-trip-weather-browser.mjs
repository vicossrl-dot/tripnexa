import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {preview} from 'vite';
import {chromium,expect} from '../website/node_modules/@playwright/test/index.mjs';

// Production UI with isolated API fixtures. No real users, providers or database writes.
const output=path.resolve('.local/trip-weather');await mkdir(output,{recursive:true});
const server=await preview({preview:{host:'127.0.0.1',port:5197,strictPort:false}});
const browser=await chromium.launch({channel:'chrome',headless:true});
const trip={id:'weather-fixture',name:'3 days in Kyoto',destination:'Kyoto',country:'Japan',start_date:'2026-10-07',end_date:'2026-10-09',timezone:'Asia/Tokyo',plan_status:'ready'};
const dates=['2026-10-07','2026-10-08','2026-10-09'];
const items=dates.map((date,index)=>({id:'visit-'+index,date,sort_order:index,step_type:'visit',title:['Kiyomizu-dera','Nijō Castle','Arashiyama Bamboo Grove'][index],start_time:'10:00',end_time:'11:30',duration_min:90,ticket_status:'free',lat:35,lng:135}));
const days=dates.map((date,index)=>({date,locationLabel:'Kyoto',kind:index===2?'typical':'forecast',source:index===2?'nasa_power':'met',symbol:index===2?undefined:index===0?'clearsky_day':'lightrain_day',temperature:{highC:18-index,lowC:10-index},precipitation:index===2?{dailyAverageMm:5.2}:{amountMm:1.2,coveredHours:18},wind:index===2?undefined:{speedKmh:12},updatedAt:'2026-10-07T00:00:00Z',climatePeriod:index===2?'January 2001 - December 2020':undefined}));
const report={fixture:true,checks:[],screenshots:[]};
const shot=async(page,name)=>{await page.waitForTimeout(400);await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});report.screenshots.push(name+'.png');};
const noOverflow=async page=>{
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const dialog=page.locator('.trip-weather-dialog');if(await dialog.count()){assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false);await expect(dialog).toBeVisible();const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=page.viewportSize().width,'Dialog fits the viewport');}
};
try {
 const page=await browser.newPage();const errors=[],requests=[];let weatherFailure=false;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),pathname=url.pathname;requests.push({path:pathname,method:route.request().method()});
  let data={};
  if(pathname==='/api/auth/me')data={id:'fixture-user',email:'weather@example.test',full_name:'Traveler',role:'USER'};
  else if(pathname==='/api/entities/Trip/weather-fixture')data=trip;
  else if(pathname.includes('/entities/PlaceSelection'))data=[];
  else if(pathname.endsWith('/itinerary'))data={items,dates,version:1,conflicts:[],unscheduledOptional:[],mealChoicesToReview:[]};
  else if(pathname.endsWith('/wallet'))data={items:[]};
  else if(pathname.endsWith('/weather')){if(weatherFailure)return route.fulfill({status:503,json:{error:'Weather unavailable'}});data={days};}
  else if(pathname.startsWith('/api/billing/'))data={premium:false,plan:'FREE',enabled:false};
  else if(pathname.includes('/tickets/'))data={ticketable:false,booking:{},providers:[]};
  else if(pathname==='/api/config')data={features:{},ai:false,places:false};
  await route.fulfill({json:data});
 });
 await page.route('https://**/*',route=>route.abort());
 const url=`http://127.0.0.1:${server.httpServer.address().port}/trip/weather-fixture/itinerary`;
 await page.setViewportSize({width:1440,height:1000});await page.goto(url);
 const chip=page.locator('.day-weather-chip').first();await expect(chip).toContainText('18° / 10°C');
 assert.equal(await page.locator('[data-itinerary-day] header .day-weather-chip').count(),3);
 assert.equal(await page.locator('.trip-day-selector .day-weather-chip').count(),0);
 assert.equal(await page.locator('.trip-day-selector').evaluate(el=>el.textContent.includes('Trip MapTrip Weather')),true);
 await noOverflow(page);await shot(page,'desktop-day-weather');
 await chip.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog')).toContainText('Day Weather');
 await expect(page.getByRole('dialog')).toContainText('MET Norway');await expect(page.getByRole('dialog')).toContainText('1.2 mm');assert(!await page.getByRole('dialog').textContent().then(text=>text.includes('%')));
 await page.getByRole('button',{name:'Fahrenheit',exact:true}).click();await expect(page.getByRole('button',{name:'Fahrenheit',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('Escape');await expect(chip).toBeFocused();await expect(chip).toContainText('64° / 50°F');
 await page.getByRole('button',{name:'Trip Weather',exact:true}).click();await expect(page.locator('.weather-overview-day')).toHaveCount(3);await expect(page.locator('.weather-overview-day').last()).toContainText('Typical weather');
 await page.getByRole('button',{name:'Celsius',exact:true}).click();await noOverflow(page);await shot(page,'trip-weather');
 await page.locator('.weather-overview-day').last().click();await expect(page.getByRole('dialog')).toContainText('Monthly climate averages, not a forecast');await expect(page.getByRole('dialog')).toContainText('5.2 mm/day');await expect(page.getByRole('dialog')).toContainText('NASA POWER');await shot(page,'typical-weather');
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));await noOverflow(page);await shot(page,'mobile-day-weather');
 await chip.click();await expect(page.getByRole('dialog')).toBeVisible();await noOverflow(page);
 await page.getByRole('button',{name:'Fahrenheit',exact:true}).click();await page.keyboard.press('Escape');await page.reload();await expect(chip).toContainText('64° / 50°F');
 await page.getByRole('button',{name:/Day 2 ·/}).click();await expect(page.locator('[data-itinerary-day]')).toHaveCount(1);await expect(page.locator('.day-weather-chip')).toContainText('63° / 48°F');
 await page.getByRole('button',{name:'All days',exact:true}).click();await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.evaluate(()=>scrollTo(0,0));
 assert.equal(requests.filter(req=>req.path.endsWith('/weather')).length,2,'Scrolling/day changes/unit changes must not fetch weather again');
 weatherFailure=true;await page.reload();await expect(chip).toContainText('Weather unavailable');await expect(page.getByRole('heading',{name:'3 days in Kyoto'})).toBeVisible();await chip.click();await expect(page.getByRole('dialog')).toContainText('You can continue using your itinerary.');await noOverflow(page);
 assert.equal(requests.filter(req=>req.method!=='GET').length,0,'Weather must not write data or consume credits');
 assert.deepEqual(errors,[]);
 report.checks=['1440px and 390px: integrated headers and dialogs, no page/dialog overflow','Forecast and Typical weather clearly differentiated','Day detail keyboard open/Escape/focus restore','Global C/F change, reload persistence and day filtering','One weather request per load; no scroll/unit/day-change requests','Provider failure leaves itinerary functional','Free-account UI; zero mutation requests; no browser exceptions'];
 console.log(report.checks.join('\n'));await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
} finally {await browser.close();server.httpServer.closeAllConnections();await new Promise(resolve=>server.httpServer.close(resolve));}
