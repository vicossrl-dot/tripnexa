import { t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { Link } from 'react-router-dom';
import { relatedWalletItems } from '@/lib/wallet-links';
import { CheckCircle2, Ticket, ExternalLink, CircleHelp } from 'lucide-react';

export default function BookingStatus({item,tripId,walletItems=[],selections=[]}) {
  useLocale();
  const ticket=relatedWalletItems(item,walletItems,selections)[0];
  if(ticket)return <div className="booking-status"><span className="booking-status-badge saved"><CheckCircle2 size={14}/>{t("ui.ticket.added.9f4273a")}</span><Link className="booking-ticket-action" to={`/trip/${tripId}/wallet?item=${encodeURIComponent(ticket.id)}`}><Ticket size={15}/>{t("ui.view.ticket.631ad74")}</Link></div>;
  if(item.ticket_status==='purchased')return <span className="booking-status-badge saved"><CheckCircle2 size={14}/>{t("ui.booking.confirmed.32629c7")}</span>;
  if(item.ticket_status==='free')return <span className="booking-status-badge">{t("ui.no.ticket.required.025f226")}</span>;
  return <div className="booking-status"><span className="booking-status-badge"><CircleHelp size={14}/>{item.ticket_status==='needed'?t("ui.booking.needed.5fe9755"):t("ui.ticket.requirements.to.verify.6d90162")}</span>{item.booking?<a href={item.booking.url} rel="sponsored noopener noreferrer" target="_blank" className="booking-ticket-action">{item.booking.label || t("ui.book.buy.ticket.645f677")}<ExternalLink size={14}/></a>:<p className="booking-status-hint">{t("ui.check.the.official.venue.for.tickets.b933838")}</p>}</div>;
}
