export function ticketable(context,override='AUTO'){
 if(override==='NEVER')return false;if(override==='ALWAYS')return true;
 const category=String(context.category||'').toLowerCase().replaceAll('_',' ');
 if(/restaurant|hotel|airport|neighbou?rhood|street|park/.test(category)&&!/theme park|amusement park/.test(category))return false;
 return ['entry','guided_tour','zone','package'].includes(context.ticket_type)||/museum|gallery|aquarium|zoo|amusement|theme park|monument|observation|historic|attraction|experience|tour|cruise|landmark/.test(category);
}
