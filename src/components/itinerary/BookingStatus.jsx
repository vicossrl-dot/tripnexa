import { Link } from 'react-router-dom';
import { relatedWalletItems } from '@/lib/wallet-links';

export default function BookingStatus({item,tripId,walletItems=[],selections=[]}) {
  const ticket=relatedWalletItems(item,walletItems,selections)[0];
  if(ticket)return <div className="text-sm"><span className="text-emerald-300">Ticket added</span> · <Link className="trip-link" to={`/trip/${tripId}/wallet?item=${encodeURIComponent(ticket.id)}`}>View ticket</Link></div>;
  if(item.ticket_status==='purchased')return <p className="text-sm text-emerald-300">Booking confirmed</p>;
  if(item.ticket_status==='free')return <p className="text-sm text-white/60">No ticket required</p>;
  return <div className="text-sm space-y-1"><p className="text-white/60">{item.ticket_status==='needed'?'Booking needed':'Ticket requirements to verify'}</p>{item.booking?<a href={item.booking.url} rel="sponsored noopener noreferrer" target="_blank" className="trip-link">{item.booking.label || 'Book / Buy ticket'} →</a>:<p className="text-xs text-white/50">Check the official venue for tickets.</p>}</div>;
}
