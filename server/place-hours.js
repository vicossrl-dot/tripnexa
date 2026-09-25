// Google regular opening periods use local weekday/time, not UTC instants.
export function openingWindows(facts,date){
 if(!facts)return null;
 if(['CLOSED_PERMANENTLY','CLOSED_TEMPORARILY'].includes(facts.businessStatus))return [];
 const periods=facts.regularOpeningHours?.periods;
 if(!Array.isArray(periods))return null;
 const point=p=>p&&Number.isInteger(p.day)&&p.day>=0&&p.day<=6&&Number.isInteger(p.hour)&&p.hour>=0&&p.hour<24&&Number.isInteger(p.minute??0)&&(p.minute??0)>=0&&(p.minute??0)<60?p.day*1440+p.hour*60+(p.minute??0):null;
 const weekday=new Date(date+'T12:00:00Z').getUTCDay(),base=weekday*1440,windows=[];
 for(const period of periods){
  const start=point(period.open),finish=point(period.close);
  if(start===0&&!period.close)return [{start:0,end:1440}];
  if(start===null||finish===null)return null;
  const end=finish<=start?finish+10080:finish;
  for(const offset of [-10080,0,10080]){const a=Math.max(0,start+offset-base),b=Math.min(1440,end+offset-base);if(b>a)windows.push({start:a,end:b});}
 }
 return windows.sort((a,b)=>a.start-b.start);
}
export function openingStart(facts,date,earliest,duration){
 const windows=openingWindows(facts,date);if(windows===null)return earliest;
 for(const window of windows){const start=Math.max(window.start,earliest);if(start+duration<=window.end)return start;}
 return null;
}
export function hoursNote(facts){return facts?.businessStatus==='CLOSED_TEMPORARILY'?'This place is temporarily closed. Please verify before visiting.':facts?.regularOpeningHours?'Regular opening hours checked with Google Maps. Check holiday exceptions before visiting.':'Opening hours not verified.';}
