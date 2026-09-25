export default function MealReviewNotice({choices=[]}) {
 if(!choices.length)return null;
 return <details className="trip-card mb-5"><summary className="trip-disclosure">Saved restaurants to review ({choices.length})</summary><p className="trip-muted mt-2">These meals are no longer in the updated schedule. Your restaurant choices are saved here; choose a suitable meal before adding them again.</p><ul className="mt-3 space-y-2">{choices.map(choice=><li key={choice.date+choice.place_id} className="text-sm">{choice.date} · {choice.name} <a className="trip-link ml-2" href={choice.maps_url} target="_blank" rel="noopener noreferrer">Open in Google Maps</a></li>)}</ul></details>;
}
