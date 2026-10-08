import { t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { Link } from 'react-router-dom';
import { MapPin, BedDouble, Plane, Compass } from 'lucide-react';

export default function MissingDetailsList({validation,tripId,onGoToStep=null}) {
  useLocale();
  const render=(issues,required)=>{
    if(!issues.length)return null;
    const groups=new Map();
    issues.forEach(issue=>{const key=issue.recordId||issue.recordType;const group=groups.get(key)||{...issue,fields:[]};group.fields.push(issue.fieldLabel);groups.set(key,group);});
    return <section className="trip-card space-y-4">
      <div><h3 className="font-semibold">{required?t("ui.required.before.calculation.37adfa8"):t("ui.optional.improvements.d84e7e6")} <span className="text-white/50">({groups.size})</span></h3><p className="trip-muted mt-1">{required?t("ui.complete.these.details.to.build.your.schedule.4a12ca8"):t("ui.your.plan.can.be.generated.now.these.details.help.make.it.more.pr.ffbf505")}</p></div>
      {[...groups.values()].map((issue,index)=>{const Icon={stay:BedDouble,flight:Plane,place:MapPin}[issue.recordType]||Compass;
        const to=issue.recordType!=='trip'&&issue.recordId&&issue.stepIndex!==3?t("ui.trip.value.wallet.item.value.388027e", {v0: tripId, v1: issue.recordId}):t("ui.trip.value.plan.step.value.86b2029", {v0: tripId, v1: issue.stepIndex??0});
        return <div key={index} className="flex items-start gap-3 border-t border-white/10 pt-4"><Icon size={19} className="text-lime shrink-0 mt-1"/><div className="min-w-0 flex-1"><p className="trip-eyebrow">{issue.recordType==='stay'?t("ui.hotel.509b3c4"):issue.recordType}</p><p className="font-medium break-words mt-1">{issue.recordName}</p><p className="trip-muted mt-1">{t("ui.missing.6be36ca")}{" "}{issue.fields.join(', ').toLowerCase()}</p></div>{onGoToStep&&issue.recordType==='trip'?<button className="trip-button secondary" onClick={()=>onGoToStep(issue.stepIndex)}>{t("ui.complete.143b270")}</button>:<Link className="trip-button secondary" to={to}>{t("ui.complete.143b270")}</Link>}</div>;})}
    </section>;
  };
  return <div className="space-y-3" data-missing-details>{render(validation.essential,true)}{validation.optional.length>0&&<details open={validation.optional.length<=3}><summary className="trip-disclosure">{t("ui.details.to.complete.ed3727f")}{" "}<span className="text-white/50">· {validation.optional.length}{" "}{t("ui.optional.ec91fdd")}</span></summary><div className="mt-3">{render(validation.optional,false)}</div></details>}</div>;
}
