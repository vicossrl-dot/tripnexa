import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
export default function PrivateTravelFiles({ trip, stays = [] }) {
  useLocale();
  const files = [
    ['Arrival ticket', trip?.arrival_ticket_url], ['Departure ticket', trip?.departure_ticket_url],
    ...stays.filter(stay => stay.reservation_file_url).map(stay => [`Reservation: ${stay.title}`, stay.reservation_file_url]),
  ].filter(([, url]) => /^\/api\/uploads\/[a-f0-9-]{36}$/.test(url || ''));
  if (!files.length) return null;
  return <section className="rounded-xl border border-white/10 bg-neutral-950/80 p-4 text-white space-y-2">
    <h3 className="text-sm font-semibold">{t("ui.private.tickets.reservations.cd2b1bd")}</h3>
    <div className="flex flex-wrap gap-4">{files.map(([label, url], index) => <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-lime underline">{translateText(label)}{" "}{t("ui.view.download.cb29cd2")}</a>)}</div>
    <p className="text-xs text-white/50">{t("ui.only.you.can.access.these.files.they.are.not.included.in.public.s.f3349e6")}</p>
  </section>;
}
