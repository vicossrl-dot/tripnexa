import test from 'node:test';
import assert from 'node:assert/strict';
import {tripDates,daySummary,walletTitle,planState} from '../../src/lib/trip-presentation.js';
test('Overview represents every trip day, preserves saved dates and does not invent hotel stops from access buffers',()=>{
 const trip={start_date:'2026-10-01',end_date:'2026-10-05'};
 const plan={dates:['2026-10-01'],items:[{date:'2026-10-03',step_type:'access',title:'Arrival buffer'}]};
 const before=JSON.stringify({trip,plan});assert.deepEqual(tripDates(trip,plan),['2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05']);assert.equal(JSON.stringify({trip,plan}),before);
 assert(!daySummary(plan.items).includes('Hotel'));
 assert.deepEqual(tripDates({}),[]);assert.equal(planState(plan).label,'Itinerary ready');assert.equal(planState({...plan,stale:true}).label,'Changes pending');
});
test('Wallet uses factual semantic metadata and preserves filenames as the last fallback',()=>{
 assert.equal(walletTitle({category:'flight',title:'file.pdf',departure_airport:'RMO',arrival_airport:'BCN'}),'RMO → BCN');
 assert.equal(walletTitle({category:'document',title:'scan.jpg',attachments:[{document_type:'Passport'}]}),'Passport');
 assert.equal(walletTitle({category:'stay',title:'Garden Hotel'}),'Garden Hotel');
 assert.equal(walletTitle({category:'flight',title:'file.pdf'}),'file.pdf');
});
