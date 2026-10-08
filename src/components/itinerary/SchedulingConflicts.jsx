import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { TriangleAlert } from 'lucide-react';

export default function SchedulingConflicts({conflicts}) {
  useLocale();
  if (!conflicts?.length) return null;
  return <section className="scheduling-conflicts" aria-label={t("ui.scheduling.conflicts.fcb77a3")}>
    <h3><TriangleAlert size={19} aria-hidden="true"/>{t("ui.scheduling.conflicts.fcb77a3")}</h3>
    <ul>{conflicts.map((conflict,index)=><li key={index}><strong>{conflict.place}</strong>{conflict.date&&<span> · {conflict.date}</span>}<p>{translateText(conflict.reason)}</p></li>)}</ul>
    <p className="conflict-alternatives">{t("ui.try.another.time.or.transport.option.extend.a.daily.window.or.adj.3027c8a")}</p>
  </section>;
}
