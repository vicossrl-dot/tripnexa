// Offline product-demo responses only. No imports from the application's runtime.
import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {renderPdf} from '../server/itinerary-pdf.js';

export async function loadRomeOverviewDemo(output){
 const {trip,dates,items}=JSON.parse(await readFile(path.join(output,'rome-demo-trip.json'),'utf8'));
 const essentials=JSON.parse(await readFile(path.join(output,'rome-demo-snapshot.json'),'utf8'));
 const at=(id,date,title,step_type,start_time,end_time,extra={})=>({id,trip_id:trip.id,date,title,step_type,start_time,end_time,...extra});
 const meals={monti:{name:'La Taverna dei Fori Imperiali',category:'Italian',address:'Via della Madonna dei Monti, Rome',lat:41.894,lng:12.489},lunch:{name:'Tonnarello',category:'Roman / Italian',address:'Via della Paglia, Trastevere, Rome',lat:41.889,lng:12.4704}};
 for(const item of items)if(meals[item.id])item.meal_choice=JSON.stringify({...meals[item.id],maps_url:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(meals[item.id].name+' Rome')});
 items.splice(1,0,at('walk-monti',dates[0],'Walk to Monti', 'transport','12:30','12:45',{route_origin:'Colosseum & Roman Forum',route_destination:'La Taverna dei Fori Imperiali',route_mode:'walk',route_duration_min:15}));
 items.splice(4,0,at('metro-vatican',dates[1],'Metro to the Vatican','transport','12:30','13:00',{route_origin:'Pantheon & Piazza Navona',route_destination:'Vatican Museums',route_mode:'transit',route_duration_min:30}));
 // An urban transfer has saved Termini coordinates. The airport stays explicitly unmapped.
 const transfer=items.find(item=>item.id==='transfer');transfer.lat=41.9009;transfer.lng=12.502;
 const hotel={id:'rome-hotel',trip_id:trip.id,category:'stay',title:'Palazzo Navona Hotel',address:'Largo della Sapienza, Rome',date:dates[0],end_date:dates[2],lat:41.8974,lng:12.474,booking_status:'confirmed',attachments:[{id:'stay-copy',original_name:'Rome-Hotel-Booking.pdf',label:'Hotel booking',mime:'application/pdf',file_url:'/__demo/travel-document.pdf'}]};
 items.unshift(at('walk-hotel',dates[0],'Walk from your hotel','transport','09:35','10:00',{route_origin:hotel.title,route_destination:'Colosseum & Roman Forum',route_mode:'walk',route_duration_min:25}));
 const ticket={id:'rome-colosseum-ticket',trip_id:trip.id,category:'place',title:'Colosseum & Roman Forum',date:dates[0],time:'10:00',booking_status:'confirmed',selection_id:'rome-colosseum',attachments:[{id:'ticket-copy',original_name:'Rome-Colosseum-Visit.pdf',label:'Colosseum visit details',mime:'application/pdf',file_url:'/__demo/travel-document.pdf'}]};
 items.find(item=>item.id==='colosseum').selection_id='rome-colosseum';
 const wallet=[{id:'rome-flight',trip_id:trip.id,category:'flight',title:'New York → Rome',departure_airport:'JFK',arrival_airport:'FCO',departure_datetime:'2026-10-15T19:00',arrival_datetime:'2026-10-16T09:00',booking_status:'confirmed',attachments:[{id:'flight-copy',original_name:'Rome-Flight-Itinerary.pdf',label:'Flight itinerary',mime:'application/pdf',file_url:'/__demo/travel-document.pdf'}]},hotel,ticket,{...ticket,id:'rome-vatican-ticket',title:'Vatican Museums',date:dates[1],time:'14:00',selection_id:null,attachments:[{...ticket.attachments[0],id:'vatican-copy',label:'Vatican visit details',original_name:'Vatican-Visit.pdf'}]}];
 const weather=dates.map(date=>({date,locationLabel:'Rome, Italy',kind:'typical',symbol:'sun',temperature:{highC:22,lowC:13},climatePeriod:'October · typical seasonal conditions'}));
 const state={ownerId:'demo-account',trip,items,tripItems:[hotel],places:[],bookings:[]};
 const plan={version:1,status:'ready',dates,items,warnings:[],validation:{warnings:[]}};
 const ticketPath=path.join(output,'rome-demo-travel-document.pdf');
 // Export prepared saved data through the real renderers, then reuse it on every recording.
 try{await stat(ticketPath);}catch{await writeFile(ticketPath,await renderPdf('<html><head><style>@page{size:A4;margin:25mm}body{font:16px Arial;color:#292c2b}.brand{font-size:28px;font-weight:bold}h1{font:36px Georgia}.box{background:#fff3ec;border:1px solid #ffc7b0;border-radius:12px;padding:24px;margin:30px 0}</style></head><body><p class="brand">TripNexa.</p><p>ROME · YOUR VISIT PLAN</p><h1>Colosseum & Roman Forum</h1><div class="box"><p>16 October 2026</p><p>10:00 – 12:30</p><p>Piazza del Colosseo, Rome, Italy</p></div><p>Personal travel copy · keep your visit details together.</p><p>This travel plan is not an admission ticket.</p></body></html>'));}
 return {trip,dates,items,essentials,wallet,weather,state,plan,document:await readFile(ticketPath)};
}

