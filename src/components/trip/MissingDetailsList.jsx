import { Link } from 'react-router-dom';
import { MapPin, BedDouble, Plane, Compass } from 'lucide-react';

export default function MissingDetailsList({validation,tripId,onGoToStep=null}) {
  const render=(issues,required)=>{
    if(!issues.length)return null;
    const groups=new Map();
    issues.forEach(issue=>{const key=issue.recordId||issue.recordType;const group=groups.get(key)||{...issue,fields:[]};group.fields.push(issue.fieldLabel);groups.set(key,group);});
    return <section className="trip-card space-y-4">
      <div><h3 className="font-semibold">{required?'Required before calculation':'Optional improvements'} <span className="text-white/50">({groups.size})</span></h3><p className="trip-muted mt-1">{required?'Complete these details to build your schedule.':'Your plan can be generated now. These details help make it more precise.'}</p></div>
      {[...groups.values()].map((issue,index)=>{const Icon={stay:BedDouble,flight:Plane,place:MapPin}[issue.recordType]||Compass;
        const to=issue.recordType!=='trip'&&issue.recordId&&issue.stepIndex!==3?`/trip/${tripId}/wallet?item=${issue.recordId}`:`/trip/${tripId}/plan?step=${issue.stepIndex??0}`;
        return <div key={index} className="flex items-start gap-3 border-t border-white/10 pt-4"><Icon size={19} className="text-lime shrink-0 mt-1"/><div className="min-w-0 flex-1"><p className="trip-eyebrow">{issue.recordType==='stay'?'Hotel':issue.recordType}</p><p className="font-medium break-words mt-1">{issue.recordName}</p><p className="trip-muted mt-1">Missing {issue.fields.join(', ').toLowerCase()}</p></div>{onGoToStep&&issue.recordType==='trip'?<button className="trip-button secondary" onClick={()=>onGoToStep(issue.stepIndex)}>Complete</button>:<Link className="trip-button secondary" to={to}>Complete</Link>}</div>;})}
    </section>;
  };
  return <div className="space-y-3" data-missing-details>{render(validation.essential,true)}{validation.optional.length>0&&<details open={validation.optional.length<=3}><summary className="trip-disclosure">Details to complete <span className="text-white/50">· {validation.optional.length} optional</span></summary><div className="mt-3">{render(validation.optional,false)}</div></details>}</div>;
}
