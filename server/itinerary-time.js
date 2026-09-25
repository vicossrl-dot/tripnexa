// Destination-local calendar arithmetic. These values are wall-clock datetimes, not UTC instants.
export function localMinute(value) {
  if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value||''))return null;
  const n=Date.parse(value+':00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,16)===value?n/60000:null;
}
export const localStamp=n=>new Date(n*60000).toISOString().slice(0,16);
export function eventInterval(item) {
  const start=localMinute(`${item.date}T${item.start_time}`);
  const consistent=item.start_datetime===`${item.date}T${item.start_time}`&&item.end_datetime?.slice(11)===item.end_time;
  let end=localMinute(consistent?item.end_datetime:`${item.date}T${item.end_time}`);
  if(!consistent&&item.end_time==='24:00')end=localMinute(item.date+'T00:00')+1440;
  if(!consistent&&start!==null&&end!==null&&end<start)end+=1440;
  return {start,end};
}
export function datedEvent(tripId,type,title,start,end,extra={}) {
  return {trip_id:tripId,date:localStamp(start).slice(0,10),step_type:type,title,start_datetime:localStamp(start),end_datetime:localStamp(end),start_time:localStamp(start).slice(11),end_time:localStamp(end).slice(11),duration_min:end-start,source_status:'estimated',...extra};
}
